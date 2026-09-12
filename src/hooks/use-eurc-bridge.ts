"use client";

import { useState, useCallback } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import {
  createPublicClient,
  createWalletClient,
  custom,
  encodePacked,
  erc20Abi,
  http,
  parseUnits,
  zeroAddress,
} from "viem";
import { baseSepolia } from "viem/chains";
import {
  resolveEurcBridgeRoute,
  isEurcSupportedRoute,
  IRIS_SANDBOX_BASE,
  EURC_TOKEN_MANAGER,
} from "@/config/bridge-assets";
import { clearArcReadCache, sanitizeExecutionError } from "@/lib/arc-read-infra";
import { arcPublicClient } from "@/lib/arc-client";

export type BridgeStatus =
  | "idle"
  | "preparing"
  | "waiting-wallet"
  | "bridging"
  | "completed"
  | "failed";

export interface BridgeStep {
  name: string;
  txHash?: string;
}

export interface EurcBridgeResult {
  state: "success" | "failed";
  error?: string;
  steps: BridgeStep[];
}

const arcTestnetChain = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.arc.network/"] },
  },
} as const;

const cctsServiceAbi = [
  {
    name: "resolveTokenManager",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "bytes32" }],
    outputs: [{ name: "tokenManager", type: "address" }],
  },
  {
    name: "crossChainTransfer",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "tokenId", type: "bytes32" },
      { name: "amount", type: "uint256" },
      { name: "destinationDomain", type: "uint32" },
      { name: "destinationAddress", type: "bytes" },
      { name: "destinationCaller", type: "bytes32" },
      { name: "minFinalityThreshold", type: "uint32" },
      {
        name: "claim",
        type: "tuple",
        components: [
          { name: "signedQuote", type: "bytes" },
          { name: "refundAddress", type: "address" },
        ],
      },
      { name: "autoExecuteHookData", type: "bool" },
      { name: "hookData", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

const messageTransmitterAbi = [
  {
    name: "receiveMessage",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "message", type: "bytes" },
      { name: "attestation", type: "bytes" },
    ],
    outputs: [{ name: "success", type: "bool" }],
  },
] as const;

const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

export interface IrisMessageItem {
  attestation?: string;
  message?: string;
  status: string;
  forwardState?: string;
  destinationMintTxHash?: string;
  forwardTxHash?: string;
}

interface IrisMessageResponse {
  messages?: IrisMessageItem[];
}

export function useEurcBridge() {
  const [status, setStatus] = useState<BridgeStatus>("idle");
  const [sourceTxHash, setSourceTxHash] = useState<string>("");
  const [destTxHash, setDestTxHash] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const { address, connector, isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  const resetStatus = useCallback(() => {
    setStatus("idle");
    setSourceTxHash("");
    setDestTxHash("");
    setError(null);
  }, []);

  const bridgeEURC = useCallback(
    async (
      amount: string,
      fromChain: string,
      toChain: string
    ): Promise<EurcBridgeResult | undefined> => {
      if (!amount || parseFloat(amount) <= 0) return;

      setError(null);
      setSourceTxHash("");
      setDestTxHash("");
      setStatus("preparing");

      const steps: BridgeStep[] = [];

      try {
        if (!isConnected || !address || !connector) {
          throw new Error("Wallet not connected");
        }

        if (!isEurcSupportedRoute(fromChain, toChain)) {
          throw new Error(
            `Unsupported EURC route: ${fromChain} -> ${toChain}. Supported EURC routes are Base Sepolia <-> Arc Testnet.`
          );
        }

        const route = resolveEurcBridgeRoute(fromChain, toChain);
        const parsedAmount = parseUnits(amount, 6);

        // 1. Network check & switch
        const currentChainId = chainId;
        if (currentChainId !== route.sourceChainId) {
          setStatus("waiting-wallet");
          try {
            await switchChainAsync({ chainId: route.sourceChainId });
          } catch {
            throw new Error(
              `Please switch your wallet to ${route.sourceChain} (Chain ID: ${route.sourceChainId}) to initiate transfer.`
            );
          }
        }

        const provider = (await connector.getProvider()) as { request: (...args: unknown[]) => Promise<unknown> };
        if (!provider) {
          throw new Error("Failed to get wallet provider from connector.");
        }

        const sourceViemChain =
          route.sourceChainId === 84532 ? baseSepolia : arcTestnetChain;
        const sourcePublic =
          route.sourceChainId === 5042002
            ? arcPublicClient
            : createPublicClient({
                chain: sourceViemChain,
                transport: http(route.sourceRpcUrl),
              });

        const sourceWallet = createWalletClient({
          account: address,
          chain: sourceViemChain,
          transport: custom(provider),
        });

        const destViemChain =
          route.destinationChainId === 84532 ? baseSepolia : arcTestnetChain;
        const destPublic =
          route.destinationChainId === 5042002
            ? arcPublicClient
            : createPublicClient({
                chain: destViemChain,
                transport: http(route.destRpcUrl),
              });

        // 2. Pre-transfer balance verification
        const sourceBalance = await sourcePublic.readContract({
          address: route.sourceEURC,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
        });

        if (sourceBalance < parsedAmount) {
          throw new Error(
            `Insufficient EURC balance on ${route.sourceChain}. Required: ${amount} EURC.`
          );
        }

        const destBalanceBefore = await destPublic.readContract({
          address: route.destinationEURC,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
        });

        // 3. Spender Verification via CCTS
        const resolvedManager = await sourcePublic.readContract({
          address: route.cctsAddress,
          abi: cctsServiceAbi,
          functionName: "resolveTokenManager",
          args: [route.tokenId],
        });

        if (
          resolvedManager.toLowerCase() !== EURC_TOKEN_MANAGER.toLowerCase()
        ) {
          throw new Error(
            `Security validation failed: TokenManager mismatch. Expected ${EURC_TOKEN_MANAGER}, got ${resolvedManager}`
          );
        }

        // 4. Allowance Check & Approval
        const currentAllowance = await sourcePublic.readContract({
          address: route.sourceEURC,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, EURC_TOKEN_MANAGER],
        });

        if (currentAllowance < parsedAmount) {
          setStatus("waiting-wallet");
          console.log(
            `Approving ${amount} EURC to TokenManager ${EURC_TOKEN_MANAGER}...`
          );

          const approveTx = await sourceWallet.writeContract({
            address: route.sourceEURC,
            abi: erc20Abi,
            functionName: "approve",
            args: [EURC_TOKEN_MANAGER, parsedAmount],
          });

          steps.push({ name: "approve", txHash: approveTx });
          setStatus("bridging");
          await sourcePublic.waitForTransactionReceipt({ hash: approveTx });
        }

        // 5. Fetch Fresh Iris CCTPx Quote
        setStatus("preparing");
        const quoteUrl = `${IRIS_SANDBOX_BASE}/v2/quote/cctpx/${route.tokenId}/${route.sourceDomain}/${route.destinationDomain}`;
        const quoteRes = await fetch(quoteUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: parsedAmount.toString(),
            feeToken: zeroAddress,
            requests: [
              { type: "PRE_FINALITY" },
              {
                type: "FORWARD",
                params: {
                  msgType: "TransferMessage",
                  destinationAddress: address,
                },
              },
            ],
          }),
        });

        if (!quoteRes.ok) {
          throw new Error(
            `Iris quote request failed (${quoteRes.status}): ${await quoteRes.text()}`
          );
        }

        const quoteData = await quoteRes.json();
        if (!quoteData?.signedQuote) {
          throw new Error("Iris returned an invalid or unsigned quote.");
        }

        const feeTotalAmount = BigInt(quoteData.feeTotalAmount || "0");

        // 6. Execute crossChainTransfer
        setStatus("waiting-wallet");
        const destinationAddressPacked = encodePacked(["address"], [address]);

        const claim = {
          signedQuote: quoteData.signedQuote as `0x${string}`,
          refundAddress: zeroAddress,
        };

        const burnTx = await sourceWallet.writeContract({
          address: route.cctsAddress,
          abi: cctsServiceAbi,
          functionName: "crossChainTransfer",
          args: [
            route.tokenId,
            parsedAmount,
            route.destinationDomain,
            destinationAddressPacked,
            ZERO_BYTES32,
            1000,
            claim,
            false,
            "0x",
          ],
          value: feeTotalAmount,
        });

        setSourceTxHash(burnTx);
        steps.push({ name: "burn", txHash: burnTx });
        setStatus("bridging");

        await sourcePublic.waitForTransactionReceipt({ hash: burnTx });
        clearArcReadCache(`arc:${route.sourceEURC}`);
        clearArcReadCache(`arc:${route.destinationEURC}`);

        // 7. Poll Iris for Attestation & Forwarding
        const irisMsgUrl = `${IRIS_SANDBOX_BASE}/v2/messages/${route.sourceDomain}?transactionHash=${burnTx}`;
        let completedMsg: IrisMessageItem | null = null;

        const maxPollAttempts = 35;
        for (let attempt = 1; attempt <= maxPollAttempts; attempt++) {
          try {
            const res = await fetch(irisMsgUrl);
            if (res.ok) {
              const data = (await res.json()) as IrisMessageResponse;
              const msg = data.messages?.[0];
              if (msg && msg.status === "complete") {
                completedMsg = msg;
                break;
              }
            }
          } catch {
            // Ignore transient network errors
          }
          await new Promise((r) => setTimeout(r, 5000));
        }

        if (!completedMsg || !completedMsg.attestation) {
          throw new Error(
            "Timed out waiting for Iris attestation completion. Please check explorer with source hash: " +
              burnTx
          );
        }

        // 8. Confirm Destination Mint (Forwarded or Direct)
        const destinationTx =
          completedMsg.destinationMintTxHash || completedMsg.forwardTxHash;

        if (completedMsg.forwardState === "COMPLETE" && destinationTx) {
          setDestTxHash(destinationTx);
          steps.push({ name: "mint", txHash: destinationTx });
        } else {
          // Poll destination balance to detect forwarder completion
          let forwarded = false;
          for (let check = 1; check <= 12; check++) {
            const destBalanceCurrent = await destPublic.readContract({
              address: route.destinationEURC,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [address],
            });

            if (destBalanceCurrent >= destBalanceBefore + parsedAmount) {
              forwarded = true;
              break;
            }
            await new Promise((r) => setTimeout(r, 4000));
          }

          if (forwarded) {
            steps.push({ name: "mint", txHash: burnTx });
          } else {
            // Fallback: Direct mint via destination MessageTransmitterV2
            setStatus("waiting-wallet");
            try {
              await switchChainAsync({ chainId: route.destinationChainId });
            } catch {
              throw new Error(
                `Switch wallet to ${route.destinationChain} (Chain ID: ${route.destinationChainId}) to complete direct mint.`
              );
            }

            const destWallet = createWalletClient({
              account: address,
              chain: destViemChain,
              transport: custom(provider),
            });

            const mintTx = await destWallet.writeContract({
              address: route.destMessageTransmitter,
              abi: messageTransmitterAbi,
              functionName: "receiveMessage",
              args: [
                completedMsg.message as `0x${string}`,
                completedMsg.attestation as `0x${string}`,
              ],
            });

            setDestTxHash(mintTx);
            steps.push({ name: "mint", txHash: mintTx });
            setStatus("bridging");
            await destPublic.waitForTransactionReceipt({ hash: mintTx });
          }
        }

        setStatus("completed");
        clearArcReadCache(`arc:${route.sourceEURC}`);
        clearArcReadCache(`arc:${route.destinationEURC}`);

        return {
          state: "success",
          steps,
        };
      } catch (err: unknown) {
        console.error("EURC bridge execution error:", err);
        const errMsg = sanitizeExecutionError(err);
        setError(errMsg);
        setStatus("failed");
        return {
          state: "failed",
          error: errMsg,
          steps,
        };
      }
    },
    [address, chainId, connector, isConnected, switchChainAsync]
  );

  return {
    status,
    sourceTxHash,
    destTxHash,
    error,
    bridgeEURC,
    resetStatus,
  };
}
