"use client";

import { useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import { ArcTestnet } from "@circle-fin/app-kit/chains";
import { EIP1193Provider, erc20Abi, parseUnits, createPublicClient, http } from "viem";
import { arcPublicClient, clearBalanceCache } from "@/lib/arc-client";
import { sanitizeExecutionError } from "@/lib/arc-read-infra";

export type SwapStatus =
  | "idle"
  | "estimating"
  | "waiting-wallet"
  | "approving"
  | "swapping"
  | "completed"
  | "failed";

export interface SwapHistoryItem {
  id: string;
  tokenIn: "USDC" | "EURC" | "cirBTC";
  tokenOut: "USDC" | "EURC" | "cirBTC";
  amountIn: string;
  amountOut: string;
  txHash: string;
  timestamp: string;
}

const TOKEN_ADDRESSES = {
  USDC: "0x3600000000000000000000000000000000000000" as const,
  EURC: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as const,
  cirBTC: "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF" as const,
};

export function useSwap() {
  const [status, setStatus] = useState<SwapStatus>("idle");
  const [estimate, setEstimate] = useState<{
    estimatedOutput: string;
    stopLimit: string;
    fees?: ReadonlyArray<{
      token: string;
      amount: string | null;
      type: "provider" | "swap" | "gas" | "developer";
    }>;
  } | null>(null);
  const [txHash, setTxHash] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const { address, connector, isConnected } = useAccount();

  const getSwapEstimate = useCallback(async (amountIn: string, tokenIn: "USDC" | "EURC" | "cirBTC", tokenOut: "USDC" | "EURC" | "cirBTC") => {
    if (!amountIn || parseFloat(amountIn) <= 0) return null;
    setError(null);
    setEstimate(null);
    setStatus("estimating");

    if (!isConnected || !connector || !address) {
      setError("Wallet not connected");
      setStatus("failed");
      return null;
    }

    try {
      const tokenInAddress = TOKEN_ADDRESSES[tokenIn];
      const tokenOutAddress = TOKEN_ADDRESSES[tokenOut];
      const decimalsIn = tokenIn === "cirBTC" ? 8 : 6;
      const decimalsOut = tokenOut === "cirBTC" ? 8 : 6;
      const rawAmount = parseUnits(amountIn, decimalsIn).toString();

      // Query server-side proxy endpoint
      const queryParams = new URLSearchParams({
        tokenInAddress,
        tokenInChain: "Arc_Testnet",
        tokenOutAddress,
        tokenOutChain: "Arc_Testnet",
        fromAddress: address,
        toAddress: address,
        amount: rawAmount,
        slippageBps: "100", // 1%
      });

      const res = await fetch(`/api/swap/estimate?${queryParams.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch estimate from server proxy.");
      }

      // Convert raw output units (stringified bigints) to human-readable strings
      const estOutputStr = (parseFloat(data.quote.estimatedAmount) / Math.pow(10, decimalsOut)).toString();
      const minOutputStr = (parseFloat(data.quote.minAmount) / Math.pow(10, decimalsOut)).toString();

      // Transform raw service fees response
      interface FeeItem {
        token: string;
        amount: string | null;
        type: "provider" | "swap" | "gas" | "developer";
      }

      const fees = data.fees ? (data.fees as FeeItem[]).map((f: FeeItem) => ({
        token: f.token,
        amount: f.amount,
        type: f.type,
      })) : undefined;

      const est = {
        estimatedOutput: estOutputStr,
        stopLimit: minOutputStr,
        fees,
      };

      setEstimate(est);
      setStatus("idle");
      return est;
    } catch (err) {
      console.error("Estimate swap error:", err);
      const errMsg = err instanceof Error ? err.message : "Failed to estimate swap.";
      setError(errMsg);
      setStatus("failed");
      return null;
    }
  }, [address, connector, isConnected]);

  const executeSwap = useCallback(async (amountIn: string, tokenIn: "USDC" | "EURC" | "cirBTC", tokenOut: "USDC" | "EURC" | "cirBTC") => {
    if (!amountIn || parseFloat(amountIn) <= 0) return null;
    setError(null);
    setTxHash("");
    setStatus("waiting-wallet");

    if (!isConnected || !connector || !address) {
      setError("Wallet not connected");
      setStatus("failed");
      return null;
    }

    // Spender address: PayGrixArcRouter on Arc Testnet
    const adapterAddress = "0xB2A97BAABaB64B389948bebB58D639a654ABac89" as const;
    if (!adapterAddress) {
      setError("Adapter contract address configuration is missing on Arc Testnet.");
      setStatus("failed");
      return null;
    }

    try {
      const tokenInAddress = TOKEN_ADDRESSES[tokenIn];
      const tokenOutAddress = TOKEN_ADDRESSES[tokenOut];
      const decimalsIn = tokenIn === "cirBTC" ? 8 : 6;
      const decimalsOut = tokenOut === "cirBTC" ? 8 : 6;
      const rawAmount = parseUnits(amountIn, decimalsIn);

      const provider = (await connector.getProvider()) as EIP1193Provider;

      // Safe diagnostic logging & pre-execution network verification
      let providerChainId: number | null = null;

      console.log('[SWAP DIAGNOSTIC] provider.request START method="eth_chainId"', {
        stage: "provider-request-eth_chainId-start",
      });
      try {
        const hexChainId = (await provider.request({ method: "eth_chainId" })) as string;
        providerChainId = parseInt(hexChainId, 16);
        console.log('[SWAP DIAGNOSTIC] provider.request SUCCESS method="eth_chainId"', {
          stage: "provider-request-eth_chainId-success",
          chainId: providerChainId,
        });
      } catch (err) {
        const errObj = err as { name?: string; message?: string; code?: number; cause?: unknown };
        console.error('[SWAP DIAGNOSTIC] provider.request ERROR method="eth_chainId"', {
          stage: "provider-request-eth_chainId-error",
          errorName: errObj.name || "ProviderError",
          errorMessage: errObj.message || String(err),
          errorCode: errObj.code,
          sanitizedCause: errObj.cause ? (typeof errObj.cause === "object" ? JSON.stringify(errObj.cause) : String(errObj.cause)) : undefined,
        });
      }

      console.log("[SWAP DIAGNOSTIC] Pre-execution info:", {
        walletAddress: address,
        connectorName: connector.name,
        providerChainId,
        arcAdapterAddress: adapterAddress,
        stage: "verifying-network",
      });

      // Ensure connected wallet provider is on Arc Testnet (5042002)
      if (providerChainId !== 5042002) {
        console.log('[SWAP DIAGNOSTIC] provider.request START method="wallet_switchEthereumChain"', {
          stage: "provider-request-wallet_switchEthereumChain-start",
          chainId: providerChainId,
        });
        try {
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: "0x4cef52" }],
          });
          console.log('[SWAP DIAGNOSTIC] provider.request SUCCESS method="wallet_switchEthereumChain"', {
            stage: "provider-request-wallet_switchEthereumChain-success",
            chainId: 5042002,
          });
        } catch (switchErr: unknown) {
          const errObj = switchErr as { code?: number; message?: string; name?: string; cause?: unknown };
          console.error('[SWAP DIAGNOSTIC] provider.request ERROR method="wallet_switchEthereumChain"', {
            stage: "provider-request-wallet_switchEthereumChain-error",
            chainId: providerChainId,
            errorName: errObj.name || "SwitchChainError",
            errorMessage: errObj.message || String(switchErr),
            errorCode: errObj.code,
            sanitizedCause: errObj.cause ? (typeof errObj.cause === "object" ? JSON.stringify(errObj.cause) : String(errObj.cause)) : undefined,
          });

          if (errObj.code === 4902 || errObj.message?.includes("Unrecognized chain")) {
            console.log('[SWAP DIAGNOSTIC] provider.request START method="wallet_addEthereumChain"', {
              stage: "provider-request-wallet_addEthereumChain-start",
            });
            await provider.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: "0x4cef52",
                  chainName: "Arc Testnet",
                  nativeCurrency: {
                    name: "Arc Testnet Ether",
                    symbol: "ETH",
                    decimals: 18,
                  },
                  rpcUrls: ["https://rpc.testnet.arc.network"],
                  blockExplorerUrls: ["https://testnet.arcscan.app"],
                },
              ],
            });
            console.log('[SWAP DIAGNOSTIC] provider.request SUCCESS method="wallet_addEthereumChain"', {
              stage: "provider-request-wallet_addEthereumChain-success",
            });
          } else {
            throw switchErr;
          }
        }
      }

      console.log("[SWAP DIAGNOSTIC] Creating Viem adapter from provider...");
      const adapter = await createViemAdapterFromProvider({
        provider,
        getPublicClient: ({ chain }) => {
          if (chain.id === 5042002) {
            return arcPublicClient;
          }
          return createPublicClient({
            chain,
            transport: http(),
          });
        },
      });

      // Step 1: Check Allowance & Approve if necessary
      setStatus("approving");
      console.log("[SWAP DIAGNOSTIC] Stage: checking allowance");
      const client = arcPublicClient;

      const currentAllowance = await client.readContract({
        address: tokenInAddress,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, adapterAddress],
      });

      if (currentAllowance < rawAmount) {
        console.log("[SWAP DIAGNOSTIC] Stage: preparing token approval");
        const preparedApprove = await adapter.prepareAction(
          "token.approve",
          {
            delegate: adapterAddress,
            amount: rawAmount,
            tokenAddress: tokenInAddress,
          },
          { chain: ArcTestnet }
        );
        console.log("[SWAP DIAGNOSTIC] Stage: executing token approval");
        const approveTx = await preparedApprove.execute();
        console.log("[SWAP DIAGNOSTIC] Token approval submitted:", approveTx);

        // Wait for approval confirmation with Arc Testnet public client
        await client.waitForTransactionReceipt({ hash: approveTx as `0x${string}` });
      }

      // Step 2: Build transaction details from server proxy
      setStatus("waiting-wallet");
      console.log("[SWAP DIAGNOSTIC] Stage: building swap transaction parameters");
      const buildRes = await fetch("/api/swap/build", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tokenInAddress,
          tokenInChain: "Arc_Testnet",
          tokenOutAddress,
          tokenOutChain: "Arc_Testnet",
          fromAddress: address,
          toAddress: address,
          amount: rawAmount.toString(),
          slippageBps: 100, // 1%
        }),
      });

      const buildData = await buildRes.json();
      if (!buildRes.ok) {
        throw new Error(buildData.error || "Failed to build transaction parameters from server.");
      }

      const rawExecParams = buildData?.transaction?.executionParams || buildData?.transaction?.executeParams;
      if (!rawExecParams || !buildData?.transaction?.signature) {
        console.error("[SWAP DIAGNOSTIC] Build API returned invalid response shape:", {
          stage: "build-response-validation",
          keys: buildData?.transaction ? Object.keys(buildData.transaction) : [],
        });
        throw new Error("Invalid build response structure received from server proxy.");
      }

      // Step 3: Parse and execute swap action
      setStatus("swapping");
      console.log("[SWAP DIAGNOSTIC] Stage: preparing swap action");

      const targetAddress = buildData?.transaction?.to || buildData?.transaction?.routerAddress || adapterAddress;
      const swapCalldata = buildData?.transaction?.data || buildData?.transaction?.executionParams?.instructions?.[0]?.data;
      const isDirectRouterSwap = targetAddress.toLowerCase() === adapterAddress.toLowerCase();

      let swapTx: string;

      if (isDirectRouterSwap && swapCalldata) {
        console.log("[SWAP DIAGNOSTIC] Executing direct EVM swap transaction on PayGrixArcRouter:", {
          to: targetAddress,
          from: address,
        });

        const txHashResult = (await provider.request({
          method: "eth_sendTransaction",
          params: [
            {
              from: address,
              to: targetAddress,
              data: swapCalldata,
              value: "0x0",
            },
          ],
        })) as string;

        swapTx = txHashResult;
        setTxHash(swapTx);

        // Wait for on-chain receipt confirmation on Arc Testnet
        const receipt = await client.waitForTransactionReceipt({ hash: swapTx as `0x${string}` });
        if (receipt.status === "reverted") {
          throw new Error("On-chain swap transaction reverted.");
        }

        setStatus("completed");
        return {
          txHash: swapTx,
          amountOut: (parseFloat(buildData.estimatedAmount) / Math.pow(10, decimalsOut)).toString(),
        };
      } else {
        // Fallback: Circle SDK path for Circle relayer swaps
        interface InstructionItem {
          target: string;
          data: string;
          value: string;
          tokenIn: string;
          amountToApprove: string;
          tokenOut: string;
          minTokenOut: string;
        }

        const executeParams = {
          instructions: (rawExecParams.instructions as InstructionItem[]).map((ins: InstructionItem) => ({
            target: ins.target,
            data: ins.data,
            value: BigInt(ins.value ?? "0"),
            tokenIn: ins.tokenIn,
            amountToApprove: BigInt(ins.amountToApprove ?? "0"),
            tokenOut: ins.tokenOut,
            minTokenOut: BigInt(ins.minTokenOut ?? "0"),
          })),
          tokens: rawExecParams.tokens as { token: string; beneficiary: string }[],
          execId: BigInt(rawExecParams.execId as string),
          deadline: BigInt(rawExecParams.deadline as string),
          metadata: rawExecParams.metadata as string,
        };

        const signature = buildData.transaction.signature;
        const inputAmount = BigInt(buildData.amount || rawAmount.toString());

        const tokenInputs = [
          {
            permitType: 0, // PermitType.NONE
            token: tokenInAddress as `0x${string}`,
            amount: inputAmount,
            permitCalldata: "0x" as `0x${string}`,
          },
        ];

        console.log("[SWAP DIAGNOSTIC] Stage: adapter.prepareAction('swap.execute') - START", {
          stage: "prepareAction-swap.execute-start",
          chainId: providerChainId,
          adapterAddress,
        });

        let preparedSwap;
        try {
          preparedSwap = await adapter.prepareAction(
            "swap.execute",
            {
              executeParams,
              tokenInputs,
              signature,
              inputAmount,
              tokenInAddress,
            },
            { chain: ArcTestnet }
          );
        } catch (prepErr: unknown) {
          console.error("[SWAP DIAGNOSTIC] Stage: adapter.prepareAction('swap.execute') - ERROR", prepErr);
          throw prepErr;
        }

        swapTx = (await preparedSwap.execute()) as string;
        setTxHash(swapTx);
      }

      // Step 4: Poll status proxy route until completed
      console.log("[SWAP DIAGNOSTIC] Stage: polling swap status");
      let isDone = false;
      const startTime = Date.now();
      const timeout = 60000; // 60s

      while (!isDone && Date.now() - startTime < timeout) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        try {
          const statusRes = await fetch(`/api/swap/execute-status?txHash=${swapTx}&chain=Arc_Testnet`);
          const statusData = await statusRes.json();

          if (statusRes.ok && statusData.status === "DONE") {
            isDone = true;
            setStatus("completed");
            return {
              txHash: swapTx,
              amountOut: (parseFloat(buildData.estimatedAmount) / Math.pow(10, decimalsOut)).toString(),
            };
          } else if (statusRes.ok && statusData.status === "FAILED") {
            throw new Error("On-chain swap execution failed.");
          }
        } catch (err) {
          console.warn("[SWAP DIAGNOSTIC] Error polling swap status:", err);
        }
      }

      setStatus("completed");
      return {
        txHash: swapTx,
        amountOut: (parseFloat(buildData.estimatedAmount) / Math.pow(10, decimalsOut)).toString(),
      };
    } catch (err) {
      const sanitizedError = {
        name: err instanceof Error ? err.name : "UnknownError",
        message: err instanceof Error ? err.message : String(err),
        cause: err instanceof Error && err.cause ? (typeof err.cause === "object" ? JSON.stringify(err.cause) : String(err.cause)) : undefined,
      };

      console.error("[SWAP DIAGNOSTIC] Execute swap error details:", {
        walletAddress: address,
        connectorName: connector?.name,
        arcAdapterAddress: ArcTestnet.kitContracts?.adapter,
        error: sanitizedError,
      });

      setError(sanitizeExecutionError(err));
      setStatus("failed");
      return null;
    } finally {
      clearBalanceCache();
    }
  }, [address, connector, isConnected]);

  const resetSwapState = useCallback(() => {
    setStatus("idle");
    setEstimate(null);
    setTxHash("");
    setError(null);
  }, []);

  return {
    status,
    estimate,
    txHash,
    error,
    getSwapEstimate,
    executeSwap,
    resetSwapState,
  };
}
