"use client";

import { useCallback, useRef, useState } from "react";
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
  MainnetChainKey,
  MAINNET_CHAINS,
  resolveMainnetCctpRoute,
} from "@/config/cctp-mainnet";
import {
  CCTP_V2_DEFAULT_MAX_FEE,
  CCTP_V2_EMPTY_BYTES32,
  CCTP_V2_STANDARD_FINALITY_THRESHOLD,
  decodeCctpMessage,
  encodeDepositForBurnCalldata,
  extractMessageFromReceiptLogs,
  MainnetBridgeStage,
  padAddressToBytes32,
  pollCircleIrisAttestation,
  messageTransmitterV2Abi,
  validateDecodedMessage,
  verifyCctpDeploymentBytecode,
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
  status: "Completed" | "Pending" | "Failed";
  timestamp: string;
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

  const bridgeInFlightRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const addressRef = useRef(address);
  addressRef.current = address;
  const chainIdRef = useRef(chainId);
  chainIdRef.current = chainId;

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
    setStatus("idle");
    setApprovalTxHash("");
    setBurnTxHash("");
    setMintTxHash("");
    setAttestationHex("");
    setMessageHex("");
    setError(null);
  }, []);

  // Save history
  const saveTransferRecord = useCallback((record: MainnetBridgeTransferRecord) => {
    try {
      const key = "paygrix_mainnet_bridge_transfers";
      const existing = localStorage.getItem(key);
      const list: MainnetBridgeTransferRecord[] = existing ? JSON.parse(existing) : [];
      const updated = [record, ...list.filter((r) => r.id !== record.id)];
      localStorage.setItem(key, JSON.stringify(updated));
    } catch {
      // ignore
    }
  }, []);

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

          setApprovalTxHash(rawApproveTx);

          const approveReceipt = await sourcePublic.waitForTransactionReceipt({
            hash: rawApproveTx,
            timeout: 60000,
          });

          if (approveReceipt.status !== "success") {
            throw new Error("USDC approval transaction reverted on-chain.");
          }

          const updatedAllowance = (await sourcePublic.readContract({
            address: route.sourceUsdc,
            abi: erc20Abi,
            functionName: "allowance",
            args: [address, route.sourceTokenMessenger],
          })) as bigint;

          if (updatedAllowance < parsedAmount) {
            throw new Error("USDC allowance verification failed after approval.");
          }
        }

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

        setBurnTxHash(rawBurnTx);

        // Record pending transfer
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

        if (burnReceipt.status !== "success") {
          throw new Error("depositForBurn transaction reverted on source chain.");
        }

        // 6. Extract MessageSent log
        const extractedMessage = extractMessageFromReceiptLogs(burnReceipt);
        setMessageHex(extractedMessage);

        const decoded = decodeCctpMessage(extractedMessage);
        validateDecodedMessage({
          decoded,
          expectedSourceDomain: route.sourceDomain,
          expectedDestinationDomain: route.destinationDomain,
          expectedAmount: parsedAmount,
          expectedBurnToken: route.sourceUsdc,
          expectedMintRecipientBytes32: recipientBytes32,
        });

        // 7. Poll Circle Production Iris API
        setStatus("attesting");

        const attestationRes = await pollCircleIrisAttestation({
          sourceDomain: route.sourceDomain,
          transactionHash: rawBurnTx,
          signal: abortController.signal,
        });

        setAttestationHex(attestationRes.attestation);
        if (attestationRes.message && attestationRes.message !== "0x") {
          setMessageHex(attestationRes.message);
        }

        // Ready for destination mint
        setStatus("waiting-destination-wallet");
        refreshBalances(sourceChain, destinationChain);
        return true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Source bridge failed.";
        setError(msg);
        setStatus("failed");
        return false;
      } finally {
        bridgeInFlightRef.current = false;
        abortControllerRef.current = null;
      }
    },
    [address, connector, isConnected, refreshBalances, saveTransferRecord, switchChainAsync]
  );

  // Step 2: Complete Destination Mint (Switch Wallet + receiveMessage + verify)
  const completeDestinationMint = useCallback(
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

      if (!isConnected || !connector || !address || !recipientAddress) {
        setError("Wallet not connected.");
        setStatus("failed");
        return false;
      }

      if (!messageHex || !attestationHex) {
        setError("Missing CCTP message or attestation to submit destination mint.");
        setStatus("failed");
        return false;
      }

      bridgeInFlightRef.current = true;
      setError(null);

      try {
        const route = resolveMainnetCctpRoute(sourceChain, destinationChain);
        const parsedAmount = parseUnits(amount, 6);
        const destPublic = getPublicClientForChain(destinationChain);

        // 1. Snapshot destination balance before mint
        const destBalanceBefore = (await destPublic.readContract({
          address: route.destinationUsdc,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [recipientAddress],
        })) as bigint;

        // 2. Ensure wallet is on destination chain
        if (chainIdRef.current !== route.destinationConfig.chainId) {
          try {
            await switchChainAsync({ chainId: route.destinationConfig.chainId });
          } catch {
            throw new Error(
              `Please switch your wallet to ${destinationChain} (Chain ID: ${route.destinationConfig.chainId}) to complete the mint.`
            );
          }
        }

        const provider = (await connector.getProvider()) as {
          request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
        };

        setStatus("minting");

        // 3. Submit receiveMessage
        const rawMintTx = (await provider.request({
          method: "eth_sendTransaction",
          params: [
            {
              from: address,
              to: route.destinationMessageTransmitter,
              data: (await import("viem")).encodeFunctionData({
                abi: messageTransmitterV2Abi,
                functionName: "receiveMessage",
                args: [
                  messageHex as `0x${string}`,
                  attestationHex as `0x${string}`,
                ],
              }),
            },
          ],
        })) as `0x${string}`;

        setMintTxHash(rawMintTx);

        const mintReceipt = await destPublic.waitForTransactionReceipt({
          hash: rawMintTx,
          timeout: 120000,
        });

        if (mintReceipt.status !== "success") {
          throw new Error("receiveMessage transaction reverted on destination chain.");
        }

        // 4. Verify destination balance increment
        setStatus("verifying");

        const destBalanceAfter = (await destPublic.readContract({
          address: route.destinationUsdc,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [recipientAddress],
        })) as bigint;

        if (destBalanceAfter < destBalanceBefore + parsedAmount) {
          throw new Error(
            `Destination balance verification failed. Expected at least ${destBalanceBefore + parsedAmount}, got ${destBalanceAfter}.`
          );
        }

        // Update transfer record
        saveTransferRecord({
          id: burnTxHash || rawMintTx,
          sourceChain,
          destinationChain,
          amount,
          senderAddress: address,
          recipientAddress,
          burnTxHash,
          mintTxHash: rawMintTx,
          status: "Completed",
          timestamp: new Date().toLocaleString(),
        });

        setStatus("complete");
        refreshBalances(sourceChain, destinationChain);
        return true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Destination mint failed.";
        setError(msg);
        setStatus("failed");
        return false;
      } finally {
        bridgeInFlightRef.current = false;
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
    refreshBalances,
    resetBridgeState,
    startSourceBridgeFlow,
    completeDestinationMint,
  };
}
