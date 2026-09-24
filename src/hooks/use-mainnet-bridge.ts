"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import {
  createPublicClient,
  erc20Abi,
  formatUnits,
  http,
  parseUnits,
} from "viem";
import { arcMainnet } from "@/config/arc-mainnet";
import { base } from "viem/chains";
import {
  getChainByDomain,
  MainnetChainKey,
  MAINNET_CHAINS,
  resolveMainnetCctpRoute,
} from "@/config/cctp-mainnet";
import {
  assertCorrelatedSourceAndIrisMessages,
  calculateExpectedMintIncrement,
  CCTP_V2_DEFAULT_MAX_FEE,
  CCTP_V2_EMPTY_BYTES32,
  CCTP_V2_STANDARD_FINALITY_THRESHOLD,
  checkDestinationNonceConsumed,
  decodeCctpMessage,
  encodeDepositForBurnCalldata,
  extractMessageFromReceiptLogs,
  fetchSourceBurnDetails,
  MainnetBridgeStage,
  MainnetBridgeTransferStatus,
  padAddressToBytes32,
  pollCircleIrisAttestation,
  messageTransmitterV2Abi,
  validateDecodedMessage,
  verifyAllowance,
  verifyCctpDeploymentBytecode,
  verifyDestinationBalance,
  verifyDestinationCompletionEvidence,
} from "@/lib/cctp-mainnet-engine";

export interface MainnetBridgeTransferRecord {
  id: string;
  sourceChain: MainnetChainKey;
  destinationChain: MainnetChainKey;
  amount: string;
  senderAddress: string;
  recipientAddress: string;
  burnTxHash: string;
  mintTxHash?: string;
  status: MainnetBridgeTransferStatus;
  timestamp: string;
  createdAt?: string;
  updatedAt?: string;
  sourceDomain?: number;
  destinationDomain?: number;
  messageHex?: string;
  attestationHex?: string;
  finalizedNonce?: string;
  feeExecuted?: string;
  error?: string;
}

export const arcMainnetPublicClient = createPublicClient({
  chain: arcMainnet,
  transport: http(MAINNET_CHAINS["Arc Mainnet"].rpcUrl, { timeout: 15_000 }),
});

export const baseMainnetPublicClient = createPublicClient({
  chain: base,
  transport: http(MAINNET_CHAINS["Base Mainnet"].rpcUrl, { timeout: 15_000 }),
});

export function getPublicClientForChain(chain: MainnetChainKey) {
  if (chain === "Arc Mainnet") return arcMainnetPublicClient;
  if (chain === "Base Mainnet") return baseMainnetPublicClient;
  return createPublicClient({
    transport: http(MAINNET_CHAINS[chain].rpcUrl, { timeout: 15_000 }),
  });
}

export function useMainnetBridge() {
  const { address, connector, isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  const [status, setStatus] = useState<MainnetBridgeStage>("idle");
  const [approvalTxHash, setApprovalTxHash] = useState<string>("");
  const [burnTxHash, setBurnTxHash] = useState<string>("");
  const [mintTxHash, setMintTxHash] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const [attestationHex, setAttestationHex] = useState<string>("");
  const [messageHex, setMessageHex] = useState<string>("");

  const [sourceBalance, setSourceBalance] = useState<string>("0.00");
  const [destBalance, setDestBalance] = useState<string>("0.00");
  const [isLoadingBalance, setIsLoadingBalance] = useState<boolean>(false);
  const [pendingTransfers, setPendingTransfers] = useState<MainnetBridgeTransferRecord[]>([]);

  const bridgeInFlightRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const operationIdRef = useRef(0);
  const addressRef = useRef(address);
  addressRef.current = address;
  const chainIdRef = useRef(chainId);
  chainIdRef.current = chainId;

  // Load wallet-scoped transfers
  const loadWalletTransfers = useCallback(() => {
    if (!address) {
      setPendingTransfers([]);
      return;
    }
    try {
      const key = `paygrix_mainnet_bridge_transfers_${address.toLowerCase()}`;
      const existing = localStorage.getItem(key);
      if (existing) {
        const list: MainnetBridgeTransferRecord[] = JSON.parse(existing);
        setPendingTransfers(
          list.filter(
            (r) =>
              r.status === "Pending" ||
              r.status === "Attesting" ||
              r.status === "ReadyToClaim" ||
              r.status === "Minting" ||
              r.status === "ReconciliationRequired"
          )
        );
      } else {
        setPendingTransfers([]);
      }
    } catch {
      setPendingTransfers([]);
    }
  }, [address]);

  useEffect(() => {
    loadWalletTransfers();
  }, [loadWalletTransfers]);

  // Track previous account to isolate multi-user state on accountsChanged
  const prevAddressRef = useRef<string | undefined>(address);
  useEffect(() => {
    if (prevAddressRef.current !== address) {
      // 1. Invalidate active async requests
      operationIdRef.current++;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      bridgeInFlightRef.current = false;

      // 2. Reset all active bridge state for the new connected wallet
      setStatus("idle");
      setApprovalTxHash("");
      setBurnTxHash("");
      setMintTxHash("");
      setAttestationHex("");
      setMessageHex("");
      setError(null);

      // 3. Clear balance cache if disconnected
      if (!address) {
        setSourceBalance("0.00");
        setDestBalance("0.00");
      }

      loadWalletTransfers();
      prevAddressRef.current = address;
    }
  }, [address, loadWalletTransfers]);

  // Track unexpected chainId change during execution
  const prevChainIdRef = useRef<number | undefined>(chainId);
  useEffect(() => {
    if (prevChainIdRef.current !== chainId) {
      if (
        bridgeInFlightRef.current &&
        status !== "ReadyToClaim" &&
        status !== "minting" &&
        status !== "ReconciliationRequired"
      ) {
        operationIdRef.current++;
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
        bridgeInFlightRef.current = false;
        setStatus("failed");
        setError("Network switch detected during bridge execution. Operation aborted for safety.");
      }
      prevChainIdRef.current = chainId;
    }
  }, [chainId, status]);

  // Read balances
  const refreshBalances = useCallback(
    async (sourceChain: MainnetChainKey, destChain: MainnetChainKey) => {
      if (!address) {
        setSourceBalance("0.00");
        setDestBalance("0.00");
        return;
      }
      setIsLoadingBalance(true);
      try {
        const srcCfg = MAINNET_CHAINS[sourceChain];
        const dstCfg = MAINNET_CHAINS[destChain];

        const srcClient = getPublicClientForChain(sourceChain);
        const dstClient = getPublicClientForChain(destChain);

        const [sBal, dBal] = await Promise.all([
          srcClient
            .readContract({
              address: srcCfg.nativeUsdc,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [address],
            })
            .catch(() => BigInt(0)),
          dstClient
            .readContract({
              address: dstCfg.nativeUsdc,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [address],
            })
            .catch(() => BigInt(0)),
        ]);

        setSourceBalance(formatUnits(sBal as bigint, 6));
        setDestBalance(formatUnits(dBal as bigint, 6));
      } catch (err) {
        console.warn("[Mainnet Bridge] Error fetching balances:", err);
      } finally {
        setIsLoadingBalance(false);
      }
    },
    [address]
  );

  // Reset state
  const resetBridgeState = useCallback(() => {
    operationIdRef.current++;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    bridgeInFlightRef.current = false;
    setStatus("idle");
    setApprovalTxHash("");
    setBurnTxHash("");
    setMintTxHash("");
    setAttestationHex("");
    setMessageHex("");
    setError(null);
  }, []);

  // Save history (strictly wallet-scoped)
  const saveTransferRecord = useCallback(
    (record: MainnetBridgeTransferRecord) => {
      const walletAddr = record.senderAddress || address;
      if (!walletAddr) return;
      try {
        const key = `paygrix_mainnet_bridge_transfers_${walletAddr.toLowerCase()}`;
        const existing = localStorage.getItem(key);
        const list: MainnetBridgeTransferRecord[] = existing ? JSON.parse(existing) : [];
        const updated = [
          record,
          ...list.filter((r) => r.id !== record.id && r.burnTxHash !== record.burnTxHash),
        ];
        localStorage.setItem(key, JSON.stringify(updated));
        loadWalletTransfers();
      } catch {
        // ignore
      }
    },
    [address, loadWalletTransfers]
  );

  // Step 1: Start Bridge Source Flow (Approve + Burn + Poll Attestation)
  const startSourceBridgeFlow = useCallback(
    async (params: {
      sourceChain: MainnetChainKey;
      destinationChain: MainnetChainKey;
      amount: string;
      recipientAddress?: `0x${string}`;
    }): Promise<boolean> => {
      const {
        sourceChain,
        destinationChain,
        amount,
        recipientAddress = address,
      } = params;

      if (!isConnected || !connector || !address) {
        setError("Wallet not connected.");
        setStatus("failed");
        return false;
      }

      if (!recipientAddress) {
        setError("Recipient address is required.");
        setStatus("failed");
        return false;
      }

      if (bridgeInFlightRef.current) {
        console.warn("[Mainnet Bridge] Bridge already in flight.");
        return false;
      }

      const opId = ++operationIdRef.current;
      const currentWallet = address.toLowerCase();
      const isStale = () =>
        opId !== operationIdRef.current ||
        addressRef.current?.toLowerCase() !== currentWallet;

      bridgeInFlightRef.current = true;
      setError(null);
      setApprovalTxHash("");
      setBurnTxHash("");
      setMintTxHash("");
      setAttestationHex("");
      setMessageHex("");

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const route = resolveMainnetCctpRoute(sourceChain, destinationChain);
        if (!route.enabled) {
          throw new Error(
            route.disabledReason ||
              `Route ${sourceChain} -> ${destinationChain} is disabled.`
          );
        }

        const parsedAmount = parseUnits(amount, 6);
        const recipientBytes32 = padAddressToBytes32(recipientAddress);

        const provider = (await connector.getProvider()) as {
          request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
        };
        if (!provider || typeof provider.request !== "function") {
          throw new Error("Wallet provider not available.");
        }

        // 1. Verify correct network on source
        if (chainIdRef.current !== route.sourceConfig.chainId) {
          try {
            await switchChainAsync({ chainId: route.sourceConfig.chainId });
          } catch {
            throw new Error(
              `Please switch your wallet to ${sourceChain} (Chain ID: ${route.sourceConfig.chainId}) to initiate the bridge.`
            );
          }
        }

        if (isStale()) return false;

        const sourcePublic = getPublicClientForChain(sourceChain);
        const destPublic = getPublicClientForChain(destinationChain);

        // 2. On-chain deployment checks
        const [srcCheck, dstCheck] = await Promise.all([
          verifyCctpDeploymentBytecode({
            client: sourcePublic,
            tokenMessengerAddress: route.sourceTokenMessenger,
            usdcAddress: route.sourceUsdc,
          }),
          verifyCctpDeploymentBytecode({
            client: destPublic,
            messageTransmitterAddress: route.destinationMessageTransmitter,
            usdcAddress: route.destinationUsdc,
          }),
        ]);

        if (isStale()) return false;

        if (!srcCheck.tokenMessengerOk || !srcCheck.usdcOk) {
          throw new Error(
            `Contract verification failed on ${sourceChain}: TokenMessenger or USDC code not found.`
          );
        }
        if (!dstCheck.messageTransmitterOk || !dstCheck.usdcOk) {
          throw new Error(
            `Contract verification failed on ${destinationChain}: MessageTransmitter or USDC code not found.`
          );
        }

        // 3. Balance verification
        const srcBalanceRaw = (await sourcePublic.readContract({
          address: route.sourceUsdc,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
        })) as bigint;

        if (srcBalanceRaw < parsedAmount) {
          throw new Error(
            `Insufficient USDC balance on ${sourceChain}. Required: ${amount} USDC.`
          );
        }

        // 4. Allowance Check & Approve
        const currentAllowance = (await sourcePublic.readContract({
          address: route.sourceUsdc,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, route.sourceTokenMessenger],
        })) as bigint;

        if (currentAllowance < parsedAmount) {
          if (isStale()) return false;
          setStatus("approving");

          const rawApproveTx = (await provider.request({
            method: "eth_sendTransaction",
            params: [
              {
                from: address,
                to: route.sourceUsdc,
                data: (await import("viem")).encodeFunctionData({
                  abi: erc20Abi,
                  functionName: "approve",
                  args: [route.sourceTokenMessenger, parsedAmount],
                }),
              },
            ],
          })) as `0x${string}`;

          if (isStale()) return false;
          setApprovalTxHash(rawApproveTx);

          const approveReceipt = await sourcePublic.waitForTransactionReceipt({
            hash: rawApproveTx,
            timeout: 60000,
          });

          if (isStale()) return false;
          if (approveReceipt.status !== "success") {
            throw new Error("USDC approval transaction reverted on-chain.");
          }

          await verifyAllowance({
            sourcePublicClient: sourcePublic,
            sourceUsdc: route.sourceUsdc,
            ownerAddress: address,
            spenderAddress: route.sourceTokenMessenger,
            requiredAmount: parsedAmount,
            approveReceipt,
            signal: abortController.signal,
            isStale,
          });
        }

        if (isStale()) return false;

        // 5. Deposit For Burn
        setStatus("burning");

        const depositCalldata = encodeDepositForBurnCalldata({
          amount: parsedAmount,
          destinationDomain: route.destinationDomain,
          mintRecipientBytes32: recipientBytes32,
          burnToken: route.sourceUsdc,
          destinationCaller: CCTP_V2_EMPTY_BYTES32,
          maxFee: CCTP_V2_DEFAULT_MAX_FEE,
          minFinalityThreshold: CCTP_V2_STANDARD_FINALITY_THRESHOLD,
        });

        const rawBurnTx = (await provider.request({
          method: "eth_sendTransaction",
          params: [
            {
              from: address,
              to: route.sourceTokenMessenger,
              data: depositCalldata,
            },
          ],
        })) as `0x${string}`;

        if (isStale()) return false;
        setBurnTxHash(rawBurnTx);

        // Record pending transfer (wallet-scoped)
        saveTransferRecord({
          id: rawBurnTx,
          sourceChain,
          destinationChain,
          amount,
          senderAddress: address,
          recipientAddress,
          burnTxHash: rawBurnTx,
          status: "Pending",
          timestamp: new Date().toLocaleString(),
        });

        const burnReceipt = await sourcePublic.waitForTransactionReceipt({
          hash: rawBurnTx,
          timeout: 120000,
        });

        if (isStale()) return false;
        if (burnReceipt.status !== "success") {
          throw new Error("depositForBurn transaction reverted on source chain.");
        }

        // 6. Extract and validate MessageSent log from transmitter
        const extractedMessage = extractMessageFromReceiptLogs(
          burnReceipt,
          route.sourceConfig?.messageTransmitterV2
        );
        setMessageHex(extractedMessage);

        const decoded = decodeCctpMessage(extractedMessage);
        validateDecodedMessage({
          decoded,
          expectedSourceDomain: route.sourceDomain,
          expectedDestinationDomain: route.destinationDomain,
          expectedAmount: parsedAmount,
          expectedBurnToken: route.sourceUsdc,
          expectedMintRecipientBytes32: recipientBytes32,
          expectedSenderBytes32: padAddressToBytes32(route.sourceTokenMessenger),
          expectedMessageSenderBytes32: padAddressToBytes32(address),
          expectedDestinationCallerBytes32: CCTP_V2_EMPTY_BYTES32,
        });

        if (isStale()) return false;

        // 7. Poll Circle Production Iris API
        setStatus("attesting");

        const attestationRes = await pollCircleIrisAttestation({
          sourceDomain: route.sourceDomain,
          transactionHash: rawBurnTx,
          expectedMessageHex: extractedMessage,
          signal: abortController.signal,
        });

        if (isStale()) return false;

        setAttestationHex(attestationRes.attestation);
        if (attestationRes.message && attestationRes.message !== "0x") {
          assertCorrelatedSourceAndIrisMessages({
            sourceMessageHex: extractedMessage,
            irisMessageHex: attestationRes.message,
          });
          setMessageHex(attestationRes.message);
        }

        const finalizedMsg =
          attestationRes.message && attestationRes.message !== "0x"
            ? attestationRes.message
            : extractedMessage;
        const finalizedDecoded = decodeCctpMessage(finalizedMsg);
        const finalizedNonce =
          finalizedDecoded.nonceBytes32 ||
          (await import("viem")).pad(
            (await import("viem")).toHex(finalizedDecoded.nonce),
            { size: 32 }
          );

        const destinationClient = getPublicClientForChain(destinationChain);
        const isConsumed = await checkDestinationNonceConsumed({
          destinationPublicClient: destinationClient,
          destinationMessageTransmitter: route.destinationMessageTransmitter,
          nonceBytes32: finalizedNonce,
        });

        if (isConsumed) {
          const evidence = await verifyDestinationCompletionEvidence({
            destinationPublicClient: destinationClient,
            destinationUsdc: route.destinationUsdc,
            recipientAddress,
            expectedAmount: (await import("viem")).parseUnits(amount, 6),
            mintTxHash: undefined,
            destBalanceBefore: undefined,
          });

          if (evidence.verified) {
            saveTransferRecord({
              id: rawBurnTx,
              sourceChain,
              destinationChain,
              amount,
              senderAddress: address,
              recipientAddress,
              burnTxHash: rawBurnTx,
              status: "Completed",
              timestamp: new Date().toLocaleString(),
              updatedAt: new Date().toISOString(),
              sourceDomain: route.sourceDomain,
              destinationDomain: route.destinationDomain,
              messageHex: finalizedMsg,
              attestationHex: attestationRes.attestation,
              finalizedNonce,
            });
            setStatus("complete");
            refreshBalances(sourceChain, destinationChain);
            return true;
          } else {
            saveTransferRecord({
              id: rawBurnTx,
              sourceChain,
              destinationChain,
              amount,
              senderAddress: address,
              recipientAddress,
              burnTxHash: rawBurnTx,
              status: "ReconciliationRequired",
              timestamp: new Date().toLocaleString(),
              updatedAt: new Date().toISOString(),
              sourceDomain: route.sourceDomain,
              destinationDomain: route.destinationDomain,
              messageHex: finalizedMsg,
              attestationHex: attestationRes.attestation,
              finalizedNonce,
            });
            setStatus("ReconciliationRequired");
            refreshBalances(sourceChain, destinationChain);
            return true;
          }
        }

        saveTransferRecord({
          id: rawBurnTx,
          sourceChain,
          destinationChain,
          amount,
          senderAddress: address,
          recipientAddress,
          burnTxHash: rawBurnTx,
          status: "ReadyToClaim",
          timestamp: new Date().toLocaleString(),
          updatedAt: new Date().toISOString(),
          sourceDomain: route.sourceDomain,
          destinationDomain: route.destinationDomain,
          messageHex: finalizedMsg,
          attestationHex: attestationRes.attestation,
          finalizedNonce,
        });

        setStatus("ReadyToClaim");
        refreshBalances(sourceChain, destinationChain);
        return true;
      } catch (err: unknown) {
        if (isStale()) return false;
        const msg = err instanceof Error ? err.message : "Source bridge failed.";
        setError(msg);
        setStatus("failed");
        return false;
      } finally {
        if (!isStale()) {
          bridgeInFlightRef.current = false;
          abortControllerRef.current = null;
        }
      }
    },
    [address, connector, isConnected, refreshBalances, saveTransferRecord, switchChainAsync]
  );

  // Step 2: Resume Existing Transfer (Generic Recovery)
  // STRUCTURALLY INCAPABLE of calling approve() or depositForBurn() or receiveMessage()
  const resumeExistingTransfer = useCallback(
    async (burnTx: string): Promise<boolean> => {
      if (!burnTx || !/^0x[0-9a-fA-F]{64}$/.test(burnTx)) {
        setError("Invalid transaction hash format. Expected a 66-character 0x-prefixed hex string.");
        return false;
      }

      const opId = ++operationIdRef.current;
      const currentWallet = address?.toLowerCase();
      const isStale = () =>
        opId !== operationIdRef.current ||
        (Boolean(currentWallet) && addressRef.current?.toLowerCase() !== currentWallet);

      bridgeInFlightRef.current = true;
      setError(null);
      setStatus("attesting");

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        // 1. Authoritative source burn discovery
        const details = await fetchSourceBurnDetails({
          burnTxHash: burnTx,
          candidatePublicClients: {
            "Base Mainnet": baseMainnetPublicClient,
            "Arc Mainnet": arcMainnetPublicClient,
          },
        });

        if (isStale()) return false;

        setBurnTxHash(details.burnTxHash);

        // Record transfer discovered in Attesting
        saveTransferRecord({
          id: details.burnTxHash,
          sourceChain: details.sourceChain,
          destinationChain: details.destinationChain,
          sourceDomain: details.sourceDomain,
          destinationDomain: details.destinationDomain,
          amount: details.amountFormatted,
          senderAddress: details.senderAddress,
          recipientAddress: details.recipientAddress,
          burnTxHash: details.burnTxHash,
          status: "Attesting",
          timestamp: new Date().toLocaleString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messageHex: details.extractedMessageHex,
        });

        // 2. Iris attestation polling & correlation
        const attestationRes = await pollCircleIrisAttestation({
          sourceDomain: details.sourceDomain,
          transactionHash: details.burnTxHash,
          expectedMessageHex: details.extractedMessageHex,
          signal: abortController.signal,
        });

        if (isStale()) return false;

        assertCorrelatedSourceAndIrisMessages({
          sourceMessageHex: details.extractedMessageHex,
          irisMessageHex: attestationRes.message,
        });

        const finalizedDecoded = decodeCctpMessage(attestationRes.message);
        const finalizedNonce =
          finalizedDecoded.nonceBytes32 ||
          (await import("viem")).pad(
            (await import("viem")).toHex(finalizedDecoded.nonce),
            { size: 32 }
          );

        setMessageHex(attestationRes.message);
        setAttestationHex(attestationRes.attestation);

        // 3. Destination nonce consumption check
        const destClient = getPublicClientForChain(details.destinationChain);
        const isConsumed = await checkDestinationNonceConsumed({
          destinationPublicClient: destClient,
          destinationMessageTransmitter: details.destinationMessageTransmitter,
          nonceBytes32: finalizedNonce,
        });

        if (isStale()) return false;

        if (isConsumed) {
          const existingRecord = pendingTransfers.find(
            (r) => r.burnTxHash?.toLowerCase() === details.burnTxHash.toLowerCase()
          );

          const evidence = await verifyDestinationCompletionEvidence({
            destinationPublicClient: destClient,
            destinationUsdc: details.destinationUsdcAddress,
            recipientAddress: details.recipientAddress,
            expectedAmount: details.amount,
            mintTxHash: existingRecord?.mintTxHash as `0x${string}` | undefined,
            destBalanceBefore: undefined,
          });

          if (evidence.verified) {
            saveTransferRecord({
              id: details.burnTxHash,
              sourceChain: details.sourceChain,
              destinationChain: details.destinationChain,
              sourceDomain: details.sourceDomain,
              destinationDomain: details.destinationDomain,
              amount: details.amountFormatted,
              senderAddress: details.senderAddress,
              recipientAddress: details.recipientAddress,
              burnTxHash: details.burnTxHash,
              mintTxHash: existingRecord?.mintTxHash,
              status: "Completed",
              timestamp: new Date().toLocaleString(),
              updatedAt: new Date().toISOString(),
              messageHex: attestationRes.message,
              attestationHex: attestationRes.attestation,
              finalizedNonce,
            });
            setStatus("complete");
            refreshBalances(details.sourceChain, details.destinationChain);
            return true;
          } else {
            saveTransferRecord({
              id: details.burnTxHash,
              sourceChain: details.sourceChain,
              destinationChain: details.destinationChain,
              sourceDomain: details.sourceDomain,
              destinationDomain: details.destinationDomain,
              amount: details.amountFormatted,
              senderAddress: details.senderAddress,
              recipientAddress: details.recipientAddress,
              burnTxHash: details.burnTxHash,
              mintTxHash: existingRecord?.mintTxHash,
              status: "ReconciliationRequired",
              timestamp: new Date().toLocaleString(),
              updatedAt: new Date().toISOString(),
              messageHex: attestationRes.message,
              attestationHex: attestationRes.attestation,
              finalizedNonce,
            });
            setStatus("ReconciliationRequired");
            refreshBalances(details.sourceChain, details.destinationChain);
            return true;
          }
        }

        // 4. Transition to ReadyToClaim and STOP
        saveTransferRecord({
          id: details.burnTxHash,
          sourceChain: details.sourceChain,
          destinationChain: details.destinationChain,
          sourceDomain: details.sourceDomain,
          destinationDomain: details.destinationDomain,
          amount: details.amountFormatted,
          senderAddress: details.senderAddress,
          recipientAddress: details.recipientAddress,
          burnTxHash: details.burnTxHash,
          status: "ReadyToClaim",
          timestamp: new Date().toLocaleString(),
          updatedAt: new Date().toISOString(),
          messageHex: attestationRes.message,
          attestationHex: attestationRes.attestation,
          finalizedNonce,
        });

        setStatus("ReadyToClaim");
        refreshBalances(details.sourceChain, details.destinationChain);
        return true;
      } catch (err: unknown) {
        if (isStale()) return false;
        const msg = err instanceof Error ? err.message : "Recovery failed.";
        setError(msg);
        setStatus("failed");
        return false;
      } finally {
        if (!isStale()) {
          bridgeInFlightRef.current = false;
          abortControllerRef.current = null;
        }
      }
    },
    [address, pendingTransfers, refreshBalances, saveTransferRecord]
  );

  // Step 3: Complete Destination Mint (Switch Wallet + Simulation + receiveMessage + verify)
  const completeDestinationMint = useCallback(
    async (params?: {
      sourceChain?: MainnetChainKey;
      destinationChain?: MainnetChainKey;
      amount?: string;
      recipientAddress?: `0x${string}`;
      transferRecord?: MainnetBridgeTransferRecord;
    }): Promise<boolean> => {
      const targetRecord = params?.transferRecord;
      const targetMsgHex = (targetRecord?.messageHex || messageHex) as `0x${string}`;
      const targetAttestHex = (targetRecord?.attestationHex || attestationHex) as `0x${string}`;

      if (!isConnected || !connector || !address) {
        setError("Wallet not connected.");
        setStatus("failed");
        return false;
      }

      if (!targetMsgHex || !targetAttestHex || targetMsgHex === "0x" || targetAttestHex === "0x") {
        setError("Missing CCTP message or attestation to submit destination mint.");
        setStatus("failed");
        return false;
      }

      const opId = ++operationIdRef.current;
      const currentWallet = address.toLowerCase();
      const isStale = () =>
        opId !== operationIdRef.current ||
        addressRef.current?.toLowerCase() !== currentWallet;

      bridgeInFlightRef.current = true;
      setError(null);

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const decoded = decodeCctpMessage(targetMsgHex);
        const sourceChain =
          targetRecord?.sourceChain ||
          params?.sourceChain ||
          getChainByDomain(decoded.sourceDomain);
        const destinationChain =
          targetRecord?.destinationChain ||
          params?.destinationChain ||
          getChainByDomain(decoded.destinationDomain);

        if (!sourceChain || !destinationChain) {
          throw new Error("Unable to resolve source or destination chain for destination mint.");
        }

        const route = resolveMainnetCctpRoute(sourceChain, destinationChain);
        const destPublic = getPublicClientForChain(destinationChain);
        const targetRecipient = (decoded.mintRecipient || targetRecord?.recipientAddress || address) as `0x${string}`;

        // 1. Nonce safety check: Ensure destination nonce is not consumed
        const finalizedNonce =
          decoded.nonceBytes32 ||
          (await import("viem")).pad(
            (await import("viem")).toHex(decoded.nonce),
            { size: 32 }
          );

        const isAlreadyConsumed = await checkDestinationNonceConsumed({
          destinationPublicClient: destPublic,
          destinationMessageTransmitter: route.destinationMessageTransmitter,
          nonceBytes32: finalizedNonce,
        });

        if (isAlreadyConsumed) {
          const evidence = await verifyDestinationCompletionEvidence({
            destinationPublicClient: destPublic,
            destinationUsdc: route.destinationUsdc,
            recipientAddress: targetRecipient,
            expectedAmount: decoded.amount,
            mintTxHash: targetRecord?.mintTxHash as `0x${string}` | undefined,
            destBalanceBefore: undefined,
          });

          if (evidence.verified) {
            saveTransferRecord({
              id: targetRecord?.id || burnTxHash || targetMsgHex,
              sourceChain,
              destinationChain,
              amount: targetRecord?.amount || formatUnits(decoded.amount, 6),
              senderAddress: targetRecord?.senderAddress || address,
              recipientAddress: targetRecipient,
              burnTxHash: targetRecord?.burnTxHash || burnTxHash,
              mintTxHash: targetRecord?.mintTxHash,
              status: "Completed",
              timestamp: new Date().toLocaleString(),
              updatedAt: new Date().toISOString(),
              messageHex: targetMsgHex,
              attestationHex: targetAttestHex,
              finalizedNonce,
            });
            setStatus("complete");
            refreshBalances(sourceChain, destinationChain);
            return true;
          } else {
            saveTransferRecord({
              id: targetRecord?.id || burnTxHash || targetMsgHex,
              sourceChain,
              destinationChain,
              amount: targetRecord?.amount || formatUnits(decoded.amount, 6),
              senderAddress: targetRecord?.senderAddress || address,
              recipientAddress: targetRecipient,
              burnTxHash: targetRecord?.burnTxHash || burnTxHash,
              mintTxHash: targetRecord?.mintTxHash,
              status: "ReconciliationRequired",
              timestamp: new Date().toLocaleString(),
              updatedAt: new Date().toISOString(),
              messageHex: targetMsgHex,
              attestationHex: targetAttestHex,
              finalizedNonce,
            });
            setStatus("ReconciliationRequired");
            refreshBalances(sourceChain, destinationChain);
            return true;
          }
        }

        // 2. Snapshot destination balance before mint
        const destBalanceBefore = (await destPublic.readContract({
          address: route.destinationUsdc,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [targetRecipient],
        })) as bigint;

        if (isStale()) return false;

        // 3. Ensure wallet is on destination chain
        if (chainIdRef.current !== route.destinationConfig.chainId) {
          try {
            await switchChainAsync({ chainId: route.destinationConfig.chainId });
          } catch {
            throw new Error(
              `Please switch your wallet to ${destinationChain} (Chain ID: ${route.destinationConfig.chainId}) to complete the mint.`
            );
          }
        }

        if (isStale()) return false;

        const calldata = (await import("viem")).encodeFunctionData({
          abi: messageTransmitterV2Abi,
          functionName: "receiveMessage",
          args: [targetMsgHex, targetAttestHex],
        });

        // 4. Pre-flight read-only simulation
        try {
          await destPublic.call({
            to: route.destinationMessageTransmitter,
            data: calldata,
            account: address,
          });
        } catch (simErr: unknown) {
          const simMsg = simErr instanceof Error ? simErr.message : String(simErr);
          throw new Error(`receiveMessage pre-flight simulation failed: ${simMsg}`);
        }

        if (isStale()) return false;

        const provider = (await connector.getProvider()) as {
          request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
        };

        setStatus("minting");

        // 5. Submit receiveMessage
        const rawMintTx = (await provider.request({
          method: "eth_sendTransaction",
          params: [
            {
              from: address,
              to: route.destinationMessageTransmitter,
              data: calldata,
            },
          ],
        })) as `0x${string}`;

        if (isStale()) return false;
        setMintTxHash(rawMintTx);

        const mintReceipt = await destPublic.waitForTransactionReceipt({
          hash: rawMintTx,
          timeout: 120000,
        });

        if (isStale()) return false;
        if (mintReceipt.status !== "success") {
          throw new Error("receiveMessage transaction reverted on destination chain.");
        }

        // 6. Verify destination balance increment delta
        setStatus("verifying");

        const expectedMintIncrement = calculateExpectedMintIncrement(targetMsgHex);

        await verifyDestinationBalance({
          destinationPublicClient: destPublic,
          destinationUsdc: route.destinationUsdc,
          recipientAddress: targetRecipient,
          destBalanceBefore,
          expectedMintIncrement,
          mintReceipt,
          signal: abortController.signal,
          isStale,
        });

        if (isStale()) return false;

        // Persist Completed state
        saveTransferRecord({
          id: targetRecord?.id || burnTxHash || rawMintTx,
          sourceChain,
          destinationChain,
          amount: targetRecord?.amount || formatUnits(decoded.amount, 6),
          senderAddress: targetRecord?.senderAddress || address,
          recipientAddress: targetRecipient,
          burnTxHash: targetRecord?.burnTxHash || burnTxHash,
          mintTxHash: rawMintTx,
          status: "Completed",
          timestamp: new Date().toLocaleString(),
          updatedAt: new Date().toISOString(),
          messageHex: targetMsgHex,
          attestationHex: targetAttestHex,
          finalizedNonce,
        });

        setStatus("complete");
        refreshBalances(sourceChain, destinationChain);
        return true;
      } catch (err: unknown) {
        if (isStale()) return false;
        const msg = err instanceof Error ? err.message : "Destination mint failed.";
        setError(msg);
        setStatus("failed");
        return false;
      } finally {
        if (!isStale()) {
          bridgeInFlightRef.current = false;
          abortControllerRef.current = null;
        }
      }
    },
    [address, attestationHex, burnTxHash, connector, isConnected, messageHex, refreshBalances, saveTransferRecord, switchChainAsync]
  );

  return {
    status,
    approvalTxHash,
    burnTxHash,
    mintTxHash,
    attestationHex,
    messageHex,
    sourceBalance,
    destBalance,
    isLoadingBalance,
    error,
    pendingTransfers,
    refreshBalances,
    resetBridgeState,
    startSourceBridgeFlow,
    resumeExistingTransfer,
    completeDestinationMint,
  };
}
