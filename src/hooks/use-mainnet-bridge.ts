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
  isForwardingSupportedRoute,
  CCTP_FORWARD_HOOK_DATA,
  CCTP_V2_FAST_FINALITY_THRESHOLD,
  CIRCLE_IRIS_PRODUCTION_API,
  getDestinationConfigByDomain,
} from "@/config/cctp-mainnet";
import {
  assertCorrelatedSourceAndIrisMessages,
  toEvmAddress,
  calculateExpectedMintIncrement,
  CCTP_V2_DEFAULT_MAX_FEE,
  CCTP_V2_EMPTY_BYTES32,
  CCTP_V2_STANDARD_FINALITY_THRESHOLD,
  checkDestinationNonceConsumed,
  decodeCctpMessage,
  encodeDepositForBurnCalldata,
  encodeDepositForBurnWithHookCalldata,
  ensureDestinationNetwork,
  parseChainId,
  MinimalEIP1193Provider,
  extractMessageFromReceiptLogs,
  fetchCctpForwardingFee,
  fetchSourceBurnDetails,
  MainnetBridgeStage,
  MainnetBridgeTransferStatus,
  padAddressToBytes32,
  pollCircleForwardingStatus,
  pollCircleIrisAttestation,
  messageTransmitterV2Abi,
  validateDecodedMessage,
  verifyAllowance,
  verifyCctpDeploymentBytecode,
  verifyDestinationBalance,
  verifyDestinationCompletionEvidence,
  CircleForwardingState,
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
  isForwarded?: boolean;
  forwardState?: CircleForwardingState;
  forwardTxHash?: string;
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

  const [forwardState, setForwardState] = useState<CircleForwardingState | undefined>(undefined);
  const [forwardTxHash, setForwardTxHash] = useState<string | undefined>(undefined);
  const [isForwarded, setIsForwarded] = useState<boolean>(false);

  const bridgeInFlightRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const operationIdRef = useRef(0);
  const addressRef = useRef(address);
  addressRef.current = address;
  const chainIdRef = useRef(chainId);
  chainIdRef.current = chainId;
  const isClaimSwitchingNetworkRef = useRef(false);
  const expectedDestinationChainIdRef = useRef<number | null>(null);

  // Authoritative active transfer check (excludes Completed/Failed and already minted/forwarded records)
  const isRecordActive = useCallback((r: MainnetBridgeTransferRecord): boolean => {
    if (r.status === "Completed" || r.status === "Failed") return false;
    if (r.forwardState === "COMPLETE" || Boolean(r.mintTxHash)) return false;
    return (
      r.status === "Pending" ||
      r.status === "Attesting" ||
      r.status === "Forwarding" ||
      r.status === "ReadyToClaim" ||
      r.status === "Minting" ||
      r.status === "ReconciliationRequired"
    );
  }, []);

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
        setPendingTransfers(list.filter(isRecordActive));
      } else {
        setPendingTransfers([]);
      }
    } catch {
      setPendingTransfers([]);
    }
  }, [address, isRecordActive]);

  // Authoritative on-chain reconciliation of pending transfers
  const reconcileWalletTransfers = useCallback(
    async (targetAddress?: string) => {
      const activeAddr = (targetAddress || addressRef.current)?.toLowerCase();
      if (!activeAddr) return;

      try {
        const key = `paygrix_mainnet_bridge_transfers_${activeAddr}`;
        const existing = localStorage.getItem(key);
        if (!existing) return;

        const list: MainnetBridgeTransferRecord[] = JSON.parse(existing);
        const candidates = list.filter(isRecordActive);
        if (candidates.length === 0) return;

        let hasUpdates = false;
        const updatedList = [...list];

        for (const record of candidates) {
          // Do not reconcile a transfer actively running in memory in current session
          if (
            bridgeInFlightRef.current &&
            record.burnTxHash &&
            burnTxHash &&
            record.burnTxHash.toLowerCase() === burnTxHash.toLowerCase()
          ) {
            continue;
          }

          try {
            const srcChain = record.sourceChain;
            const dstChain = record.destinationChain;
            const dstCfg = MAINNET_CHAINS[dstChain];
            const dstClient = getPublicClientForChain(dstChain);

            let nonceBytes32 = record.finalizedNonce as `0x${string}` | undefined;
            let messageHex = record.messageHex as `0x${string}` | undefined;
            const attestationHex = record.attestationHex;

            // 1. If messageHex exists, decode nonce
            if (messageHex && !nonceBytes32) {
              try {
                const dec = decodeCctpMessage(messageHex);
                if (dec.nonceBytes32 && dec.nonceBytes32 !== CCTP_V2_EMPTY_BYTES32) {
                  nonceBytes32 = dec.nonceBytes32;
                }
              } catch {}
            }

            // 2. If no non-zero nonce, check source receipt
            const isNonZeroNonce =
              nonceBytes32 &&
              nonceBytes32 !== CCTP_V2_EMPTY_BYTES32 &&
              nonceBytes32 !== "0x0000000000000000000000000000000000000000000000000000000000000000";

            if (!isNonZeroNonce && record.burnTxHash) {
              try {
                const srcClient = getPublicClientForChain(srcChain);
                const receipt = await srcClient.getTransactionReceipt({
                  hash: record.burnTxHash as `0x${string}`,
                });
                if (receipt.status === "reverted") {
                  const idx = updatedList.findIndex((r) => r.id === record.id);
                  if (idx !== -1) {
                    updatedList[idx] = {
                      ...updatedList[idx],
                      status: "Failed",
                      updatedAt: new Date().toISOString(),
                      error: "Source burn transaction reverted",
                    };
                    hasUpdates = true;
                  }
                  continue;
                }
                const srcCfg = MAINNET_CHAINS[srcChain];
                const msg = extractMessageFromReceiptLogs(receipt, srcCfg?.messageTransmitterV2);
                if (msg) {
                  messageHex = msg;
                  const dec = decodeCctpMessage(msg);
                  if (dec.nonceBytes32 && dec.nonceBytes32 !== CCTP_V2_EMPTY_BYTES32) {
                    nonceBytes32 = dec.nonceBytes32;
                  }
                }
              } catch {}
            }

            // 3. If non-zero nonce, check destination consumption
            if (
              nonceBytes32 &&
              nonceBytes32 !== CCTP_V2_EMPTY_BYTES32 &&
              nonceBytes32 !== "0x0000000000000000000000000000000000000000000000000000000000000000" &&
              dstCfg?.messageTransmitterV2
            ) {
              const isConsumed = await checkDestinationNonceConsumed({
                destinationPublicClient: dstClient,
                destinationMessageTransmitter: dstCfg.messageTransmitterV2,
                nonceBytes32,
              });

              if (isConsumed) {
                const idx = updatedList.findIndex((r) => r.id === record.id);
                if (idx !== -1) {
                  updatedList[idx] = {
                    ...updatedList[idx],
                    status: "Completed",
                    finalizedNonce: nonceBytes32,
                    messageHex: messageHex || updatedList[idx].messageHex,
                    attestationHex: attestationHex || updatedList[idx].attestationHex,
                    updatedAt: new Date().toISOString(),
                  };
                  hasUpdates = true;
                }
                continue;
              }
            }

            // 4. Query Circle Iris for finalized eventNonce and attestation
            if (record.burnTxHash) {
              try {
                const srcCfg = MAINNET_CHAINS[srcChain];
                const srcDom = srcCfg?.domain ?? (srcChain === "Arc Mainnet" ? 26 : 6);
                const irisUrl = `${CIRCLE_IRIS_PRODUCTION_API}/v2/messages/${srcDom}?transactionHash=${record.burnTxHash}`;
                const res = await fetch(irisUrl);
                if (res.ok) {
                  const irisData = await res.json();
                  const irisMsg = irisData.messages?.[0];
                  if (irisMsg?.status === "complete" && irisMsg?.attestation) {
                    const dec = decodeCctpMessage(irisMsg.message);
                    const nBytes = (irisMsg.eventNonce as `0x${string}`) || dec.nonceBytes32;

                    let consumedWithRecovered = false;
                    if (
                      nBytes &&
                      nBytes !== CCTP_V2_EMPTY_BYTES32 &&
                      nBytes !== "0x0000000000000000000000000000000000000000000000000000000000000000" &&
                      dstCfg?.messageTransmitterV2
                    ) {
                      consumedWithRecovered = await checkDestinationNonceConsumed({
                        destinationPublicClient: dstClient,
                        destinationMessageTransmitter: dstCfg.messageTransmitterV2,
                        nonceBytes32: nBytes,
                      });
                    }

                    const idx = updatedList.findIndex((r) => r.id === record.id);
                    if (idx !== -1) {
                      const newStatus: MainnetBridgeTransferStatus = consumedWithRecovered
                        ? "Completed"
                        : "ReadyToClaim";
                      if (
                        updatedList[idx].status !== newStatus ||
                        updatedList[idx].finalizedNonce !== nBytes ||
                        updatedList[idx].attestationHex !== irisMsg.attestation
                      ) {
                        updatedList[idx] = {
                          ...updatedList[idx],
                          status: newStatus,
                          messageHex: irisMsg.message,
                          attestationHex: irisMsg.attestation,
                          finalizedNonce: nBytes,
                          updatedAt: new Date().toISOString(),
                        };
                        hasUpdates = true;
                      }
                    }
                  }
                }
              } catch {}
            }
          } catch {}
        }

        if (hasUpdates) {
          if (addressRef.current?.toLowerCase() === activeAddr) {
            localStorage.setItem(key, JSON.stringify(updatedList));
            setPendingTransfers(updatedList.filter(isRecordActive));
          }
        }
      } catch {}
    },
    [burnTxHash, isRecordActive]
  );

  useEffect(() => {
    loadWalletTransfers();
    if (address) {
      reconcileWalletTransfers(address);
    }
  }, [address, loadWalletTransfers, reconcileWalletTransfers]);

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
      setForwardState(undefined);
      setForwardTxHash(undefined);
      setIsForwarded(false);
      setError(null);

      // 3. Clear balance cache if disconnected
      if (!address) {
        setSourceBalance("0.00");
        setDestBalance("0.00");
      }

      loadWalletTransfers();
      if (address) {
        reconcileWalletTransfers(address);
      }
      prevAddressRef.current = address;
    }
  }, [address, loadWalletTransfers, reconcileWalletTransfers]);

  // Track unexpected chainId change during execution
  const prevChainIdRef = useRef<number | undefined>(chainId);
  useEffect(() => {
    if (prevChainIdRef.current !== chainId) {
      // If this switch is the expected destination network switch for an active claim operation, permit it
      if (
        isClaimSwitchingNetworkRef.current &&
        expectedDestinationChainIdRef.current !== null &&
        chainId === expectedDestinationChainIdRef.current
      ) {
        prevChainIdRef.current = chainId;
        return;
      }

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
    setForwardState(undefined);
    setForwardTxHash(undefined);
    setIsForwarded(false);
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

        const isForwarding = isForwardingSupportedRoute(route.sourceDomain, route.destinationDomain);
        let depositCalldata: `0x${string}`;
        let expectedMaxFee: bigint = CCTP_V2_DEFAULT_MAX_FEE;
        let expectedMinFinalityThreshold: number = CCTP_V2_STANDARD_FINALITY_THRESHOLD;
        let expectedHookData: `0x${string}` | undefined = undefined;

        if (isForwarding) {
          setIsForwarded(true);
          setForwardState("PENDING");

          // Dynamic fee calculation from Circle Iris API (no arbitrary fallback)
          const feeQuote = await fetchCctpForwardingFee({
            sourceDomain: route.sourceDomain,
            destinationDomain: route.destinationDomain,
            amount: parsedAmount,
            signal: abortController.signal,
          });

          expectedMaxFee = feeQuote.maxFee;
          expectedMinFinalityThreshold = CCTP_V2_FAST_FINALITY_THRESHOLD;
          expectedHookData = CCTP_FORWARD_HOOK_DATA;

          depositCalldata = encodeDepositForBurnWithHookCalldata({
            amount: parsedAmount,
            destinationDomain: route.destinationDomain,
            mintRecipientBytes32: recipientBytes32,
            burnToken: route.sourceUsdc,
            destinationCaller: CCTP_V2_EMPTY_BYTES32,
            maxFee: feeQuote.maxFee,
            minFinalityThreshold: CCTP_V2_FAST_FINALITY_THRESHOLD,
            hookData: CCTP_FORWARD_HOOK_DATA,
          });
        } else {
          setIsForwarded(false);
          setForwardState(undefined);
          setForwardTxHash(undefined);

          depositCalldata = encodeDepositForBurnCalldata({
            amount: parsedAmount,
            destinationDomain: route.destinationDomain,
            mintRecipientBytes32: recipientBytes32,
            burnToken: route.sourceUsdc,
            destinationCaller: CCTP_V2_EMPTY_BYTES32,
            maxFee: CCTP_V2_DEFAULT_MAX_FEE,
            minFinalityThreshold: CCTP_V2_STANDARD_FINALITY_THRESHOLD,
          });
        }

        // 5. Deposit For Burn
        setStatus("burning");

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

        // Record pending transfer (wallet-scoped) immediately after source submission
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
          isForwarded: isForwarding,
          forwardState: isForwarding ? "PENDING" : undefined,
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
          expectedMinFinalityThreshold,
          expectedHookData,
          expectedMaxFee,
        });

        if (isStale()) return false;

        // 7. Attestation & Completion verification
        if (isForwarding) {
          setStatus("forwarding");
          setForwardState("PENDING");

          const forwardRes = await pollCircleForwardingStatus({
            sourceDomain: route.sourceDomain,
            transactionHash: rawBurnTx,
            expectedMessageHex: extractedMessage,
            signal: abortController.signal,
          });

          if (isStale()) return false;

          setAttestationHex(forwardRes.attestation);
          setForwardState(forwardRes.forwardState);
          if (forwardRes.forwardTxHash) {
            setForwardTxHash(forwardRes.forwardTxHash);
          }

          const finalizedMsg =
            forwardRes.message && forwardRes.message !== "0x"
              ? forwardRes.message
              : extractedMessage;
          setMessageHex(finalizedMsg);

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
              mintTxHash: forwardRes.forwardTxHash as `0x${string}` | undefined,
              destBalanceBefore: undefined,
              expectedNonce: finalizedDecoded.nonce,
              expectedNonceBytes32: finalizedNonce,
              expectedSourceDomain: route.sourceDomain,
              expectedDestinationMessageTransmitter: route.destinationMessageTransmitter,
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
                mintTxHash: forwardRes.forwardTxHash,
                status: "Completed",
                timestamp: new Date().toLocaleString(),
                updatedAt: new Date().toISOString(),
                sourceDomain: route.sourceDomain,
                destinationDomain: route.destinationDomain,
                messageHex: finalizedMsg,
                attestationHex: forwardRes.attestation,
                finalizedNonce,
                isForwarded: true,
                forwardState: "COMPLETE",
                forwardTxHash: forwardRes.forwardTxHash,
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
                mintTxHash: forwardRes.forwardTxHash,
                status: "ReconciliationRequired",
                timestamp: new Date().toLocaleString(),
                updatedAt: new Date().toISOString(),
                sourceDomain: route.sourceDomain,
                destinationDomain: route.destinationDomain,
                messageHex: finalizedMsg,
                attestationHex: forwardRes.attestation,
                finalizedNonce,
                isForwarded: true,
                forwardState: forwardRes.forwardState,
                forwardTxHash: forwardRes.forwardTxHash,
              });
              setStatus("ReconciliationRequired");
              refreshBalances(sourceChain, destinationChain);
              return true;
            }
          }

          // If relayer delayed or failed, fall back safely to ReadyToClaim ONLY if receiveMessage simulation succeeds!
          let simulationPassed = true;
          const simClient = destinationClient as { simulateContract?: (args: unknown) => Promise<unknown> } | null | undefined;
          if (simClient && typeof simClient.simulateContract === "function") {
            try {
              await simClient.simulateContract({
                address: route.destinationMessageTransmitter,
                abi: messageTransmitterV2Abi,
                functionName: "receiveMessage",
                args: [finalizedMsg, forwardRes.attestation],
              });
            } catch (simErr: unknown) {
              simulationPassed = false;
              const errMsg = simErr instanceof Error ? simErr.message : String(simErr);
              console.warn("[CCTP Mainnet] Preflight receiveMessage simulation failed on destination:", errMsg);
            }
          }

          const fallbackStatus = simulationPassed ? "ReadyToClaim" : "ReconciliationRequired";
          saveTransferRecord({
            id: rawBurnTx,
            sourceChain,
            destinationChain,
            amount,
            senderAddress: address,
            recipientAddress,
            burnTxHash: rawBurnTx,
            status: fallbackStatus,
            timestamp: new Date().toLocaleString(),
            updatedAt: new Date().toISOString(),
            sourceDomain: route.sourceDomain,
            destinationDomain: route.destinationDomain,
            messageHex: finalizedMsg,
            attestationHex: forwardRes.attestation,
            finalizedNonce,
            isForwarded: true,
            forwardState: forwardRes.forwardState,
            forwardTxHash: forwardRes.forwardTxHash,
          });

          setStatus(fallbackStatus);
          refreshBalances(sourceChain, destinationChain);
          return true;
        } else {
          // Standard Arc -> Base path (100% untouched behavior)
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
        }
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
        const decodedSource = decodeCctpMessage(details.extractedMessageHex);
        const isForwarding =
          isForwardingSupportedRoute(details.sourceDomain, details.destinationDomain) &&
          Boolean(decodedSource.hookData && decodedSource.hookData.toLowerCase().startsWith("0x636374702d666f7277617264"));
        let irisMsg = details.extractedMessageHex;
        let irisAttest = "";
        let recForwardState: CircleForwardingState | undefined = undefined;
        let recForwardTxHash: string | undefined = undefined;

        if (isForwarding) {
          setStatus("forwarding");
          const forwardRes = await pollCircleForwardingStatus({
            sourceDomain: details.sourceDomain,
            transactionHash: details.burnTxHash,
            expectedMessageHex: details.extractedMessageHex,
            signal: abortController.signal,
          });

          if (isStale()) return false;
          irisMsg =
            forwardRes.message && forwardRes.message !== "0x"
              ? forwardRes.message
              : details.extractedMessageHex;
          irisAttest = forwardRes.attestation;
          recForwardState = forwardRes.forwardState;
          recForwardTxHash = forwardRes.forwardTxHash;
        } else {
          // Standard Arc -> Base recovery
          const attestationRes = await pollCircleIrisAttestation({
            sourceDomain: details.sourceDomain,
            transactionHash: details.burnTxHash,
            expectedMessageHex: details.extractedMessageHex,
            signal: abortController.signal,
          });

          if (isStale()) return false;
          irisMsg =
            attestationRes.message && attestationRes.message !== "0x"
              ? attestationRes.message
              : details.extractedMessageHex;
          irisAttest = attestationRes.attestation;
        }

        if (irisMsg && irisMsg !== "0x") {
          assertCorrelatedSourceAndIrisMessages({
            sourceMessageHex: details.extractedMessageHex,
            irisMessageHex: irisMsg,
          });
        }

        const finalizedDecoded = decodeCctpMessage(irisMsg);
        const finalizedNonce =
          finalizedDecoded.nonceBytes32 ||
          (await import("viem")).pad(
            (await import("viem")).toHex(finalizedDecoded.nonce),
            { size: 32 }
          );

        setMessageHex(irisMsg);
        setAttestationHex(irisAttest);

        // 3. Destination nonce consumption check
        const destClient = getPublicClientForChain(details.destinationChain);
        const isConsumed = await checkDestinationNonceConsumed({
          destinationPublicClient: destClient,
          destinationMessageTransmitter: details.destinationMessageTransmitter,
          nonceBytes32: finalizedNonce,
        });

        if (isStale()) return false;

        const effectiveMintTx =
          recForwardTxHash ||
          pendingTransfers.find(
            (r) => r.burnTxHash?.toLowerCase() === details.burnTxHash.toLowerCase()
          )?.mintTxHash;

        if (isConsumed) {
          const evidence = await verifyDestinationCompletionEvidence({
            destinationPublicClient: destClient,
            destinationUsdc: details.destinationUsdcAddress,
            recipientAddress: details.recipientAddress,
            expectedAmount: details.amount,
            mintTxHash: effectiveMintTx as `0x${string}` | undefined,
            destBalanceBefore: undefined,
            expectedNonce: finalizedDecoded.nonce,
            expectedNonceBytes32: finalizedNonce,
            expectedSourceDomain: details.sourceDomain,
            expectedDestinationMessageTransmitter: details.destinationMessageTransmitter,
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
              mintTxHash: effectiveMintTx,
              status: "Completed",
              timestamp: new Date().toLocaleString(),
              updatedAt: new Date().toISOString(),
              messageHex: irisMsg,
              attestationHex: irisAttest,
              finalizedNonce,
              isForwarded: isForwarding,
              forwardState: isForwarding ? "COMPLETE" : undefined,
              forwardTxHash: recForwardTxHash,
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
              mintTxHash: effectiveMintTx,
              status: "ReconciliationRequired",
              timestamp: new Date().toLocaleString(),
              updatedAt: new Date().toISOString(),
              messageHex: irisMsg,
              attestationHex: irisAttest,
              finalizedNonce,
              isForwarded: isForwarding,
              forwardState: recForwardState,
              forwardTxHash: recForwardTxHash,
            });
            setStatus("ReconciliationRequired");
            refreshBalances(details.sourceChain, details.destinationChain);
            return true;
          }
        }

        // 4. Preflight simulate receiveMessage before transitioning to ReadyToClaim
        let simulationPassed = true;
        const simClientRecovery = destClient as { simulateContract?: (args: unknown) => Promise<unknown> } | null | undefined;
        if (simClientRecovery && typeof simClientRecovery.simulateContract === "function") {
          try {
            await simClientRecovery.simulateContract({
              address: details.destinationMessageTransmitter,
              abi: messageTransmitterV2Abi,
              functionName: "receiveMessage",
              args: [irisMsg as `0x${string}`, irisAttest as `0x${string}`],
            });
          } catch (simErr: unknown) {
            simulationPassed = false;
            const errMsg = simErr instanceof Error ? simErr.message : String(simErr);
            console.warn("[CCTP Mainnet] Preflight receiveMessage simulation failed during recovery:", errMsg);
          }
        }

        const recoveryStatus = simulationPassed ? "ReadyToClaim" : "ReconciliationRequired";
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
          status: recoveryStatus,
          timestamp: new Date().toLocaleString(),
          updatedAt: new Date().toISOString(),
          messageHex: irisMsg,
          attestationHex: irisAttest,
          finalizedNonce,
          isForwarded: isForwarding,
          forwardState: recForwardState,
          forwardTxHash: recForwardTxHash,
        });

        setStatus(recoveryStatus);
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

        // Authoritative destination resolution:
        // CCTP destinationDomain in the message is authoritative
        const destConfig = getDestinationConfigByDomain(decoded.destinationDomain);
        if (!destConfig) {
          throw new Error(`Unsupported CCTP destination domain: ${decoded.destinationDomain}`);
        }
        const destinationChain = destConfig.chainKey;
        const targetChainId = destConfig.chainId;

        // Authoritative source resolution
        const srcConfig = getDestinationConfigByDomain(decoded.sourceDomain);
        const sourceChain =
          srcConfig?.chainKey ||
          getChainByDomain(decoded.sourceDomain) ||
          targetRecord?.sourceChain ||
          params?.sourceChain;

        if (!sourceChain) {
          throw new Error("Unable to resolve source chain for destination mint.");
        }

        const route = resolveMainnetCctpRoute(sourceChain, destinationChain);
        const destPublic = getPublicClientForChain(destinationChain);
        const rawRecipient =
          targetRecord?.recipientAddress ||
          decoded.mintRecipientAddress ||
          decoded.mintRecipient ||
          address ||
          "";
        const targetRecipient = toEvmAddress(rawRecipient);

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
            expectedNonce: decoded.nonce,
            expectedNonceBytes32: finalizedNonce,
            expectedSourceDomain: route.sourceDomain,
            expectedDestinationMessageTransmitter: route.destinationMessageTransmitter,
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

        // 2. Ensure wallet is on destination chain BEFORE simulating or preparing receiveMessage
        const provider = (await connector.getProvider()) as MinimalEIP1193Provider;

        isClaimSwitchingNetworkRef.current = true;
        expectedDestinationChainIdRef.current = targetChainId;

        const networkResult = await ensureDestinationNetwork({
          provider,
          destConfig,
          switchChainAsync,
        });

        isClaimSwitchingNetworkRef.current = false;
        expectedDestinationChainIdRef.current = null;

        if (!networkResult.success) {
          bridgeInFlightRef.current = false;
          if (networkResult.rejected) {
            setError(
              networkResult.error ||
                `Please switch your wallet to ${destConfig.name} (Chain ID: ${destConfig.chainId}) to claim this transfer.`
            );
            // Maintain ReadyToClaim stage so user can retry claim
            setStatus("ReadyToClaim");
            return false;
          }
          throw new Error(networkResult.error || `Failed to switch network to ${destConfig.name}`);
        }

        if (isStale()) {
          bridgeInFlightRef.current = false;
          return false;
        }

        // 3. Re-read and rigorously verify current chain ID directly from provider
        let verifiedChainHex: unknown;
        try {
          verifiedChainHex = await provider.request({ method: "eth_chainId" });
        } catch {
          throw new Error("Failed to query wallet chain ID after network switch.");
        }
        const verifiedChainId = parseChainId(verifiedChainHex);

        if (verifiedChainId !== targetChainId) {
          bridgeInFlightRef.current = false;
          throw new Error(
            `Wallet chain ID verification failed. Current: ${verifiedChainId ?? "unknown"}, expected: ${destConfig.name} (${targetChainId}). Transaction aborted.`
          );
        }

        // Re-read accounts to ensure account didn't change
        try {
          const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
          if (accounts && accounts[0] && accounts[0].toLowerCase() !== currentWallet) {
            bridgeInFlightRef.current = false;
            return false;
          }
        } catch {}

        if (isStale()) {
          bridgeInFlightRef.current = false;
          return false;
        }

        // 4. Snapshot destination balance before mint
        const destBalanceBefore = (await destPublic.readContract({
          address: route.destinationUsdc,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [targetRecipient],
        })) as bigint;

        if (isStale()) {
          bridgeInFlightRef.current = false;
          return false;
        }

        const calldata = (await import("viem")).encodeFunctionData({
          abi: messageTransmitterV2Abi,
          functionName: "receiveMessage",
          args: [targetMsgHex, targetAttestHex],
        });

        // 5. Pre-flight read-only simulation
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

        if (isStale()) {
          bridgeInFlightRef.current = false;
          return false;
        }

        // Final chain verification right before eth_sendTransaction
        const preSendHex = await provider.request({ method: "eth_chainId" });
        if (parseChainId(preSendHex) !== targetChainId) {
          bridgeInFlightRef.current = false;
          throw new Error(
            `Network switch detected before transaction submission. Expected ${destConfig.name} (${targetChainId}). Aborted for safety.`
          );
        }

        setStatus("minting");

        // 6. Submit receiveMessage
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

        // 7. Verify destination balance increment delta
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
        isClaimSwitchingNetworkRef.current = false;
        expectedDestinationChainIdRef.current = null;
        if (isStale()) return false;
        const msg = err instanceof Error ? err.message : "Destination mint failed.";
        setError(msg);
        setStatus("failed");
        return false;
      } finally {
        isClaimSwitchingNetworkRef.current = false;
        expectedDestinationChainIdRef.current = null;
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
    isForwarded,
    forwardState,
    forwardTxHash,
    refreshBalances,
    resetBridgeState,
    startSourceBridgeFlow,
    resumeExistingTransfer,
    completeDestinationMint,
    reconcileWalletTransfers,
  };
}
