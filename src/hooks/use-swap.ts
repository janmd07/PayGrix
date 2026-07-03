"use client";

import { useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import { ArcTestnet } from "@circle-fin/app-kit/chains";
import { EIP1193Provider } from "viem";

export type SwapStatus =
  | "idle"
  | "estimating"
  | "waiting-wallet"
  | "swapping"
  | "completed"
  | "failed";

export interface SwapHistoryItem {
  id: string;
  tokenIn: "USDC" | "EURC";
  tokenOut: "USDC" | "EURC";
  amountIn: string;
  amountOut: string;
  txHash: string;
  timestamp: string;
}

export function useSwap() {
  const [status, setStatus] = useState<SwapStatus>("idle");
  const [estimate, setEstimate] = useState<{
    estimatedOutput: string;
    stopLimit: string;
    fees?: ReadonlyArray<{
      token: string;
      amount: string | null;
      type: 'provider' | 'swap' | 'gas' | 'developer';
    }>;
  } | null>(null);
  const [txHash, setTxHash] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const { connector, isConnected } = useAccount();

  const getSwapEstimate = useCallback(async (amountIn: string, tokenIn: "USDC" | "EURC", tokenOut: "USDC" | "EURC") => {
    if (!amountIn || parseFloat(amountIn) <= 0) return null;
    setError(null);
    setEstimate(null);
    setStatus("estimating");

    if (!isConnected || !connector) {
      setError("Wallet not connected");
      setStatus("failed");
      return null;
    }

    try {
      const kit = new AppKit();
      const provider = (await connector.getProvider()) as EIP1193Provider;
      const adapter = await createViemAdapterFromProvider({ provider });

      const res = await kit.estimateSwap({
        from: { adapter, chain: ArcTestnet },
        tokenIn,
        tokenOut,
        amountIn,
        config: {
          slippageBps: 100, // 1% slippage
        }
      });

      const est = {
        estimatedOutput: res.estimatedOutput.amount, // human-readable string
        stopLimit: res.stopLimit.amount, // human-readable string
        fees: res.fees,
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
  }, [connector, isConnected]);

  const executeSwap = useCallback(async (amountIn: string, tokenIn: "USDC" | "EURC", tokenOut: "USDC" | "EURC") => {
    if (!amountIn || parseFloat(amountIn) <= 0) return null;
    setError(null);
    setTxHash("");
    setStatus("waiting-wallet");

    if (!isConnected || !connector) {
      setError("Wallet not connected");
      setStatus("failed");
      return null;
    }

    try {
      const kit = new AppKit();
      const provider = (await connector.getProvider()) as EIP1193Provider;
      const adapter = await createViemAdapterFromProvider({ provider });

      setStatus("swapping");
      const result = await kit.swap({
        from: { adapter, chain: ArcTestnet },
        tokenIn,
        tokenOut,
        amountIn,
        config: {
          slippageBps: 100, // 1% slippage
          allowanceStrategy: "approve", // Explicitly use approve/permit
        }
      });

      console.log("Swap completed:", result);
      setTxHash(result.txHash);
      setStatus("completed");
      return result;
    } catch (err) {
      console.error("Execute swap error:", err);
      const errMsg = err instanceof Error ? err.message : "An unexpected error occurred during the swap.";
      if (errMsg.includes("rejected") || errMsg.includes("User rejected")) {
        setError("User rejected the transaction");
      } else {
        setError(errMsg);
      }
      setStatus("failed");
      return null;
    }
  }, [connector, isConnected]);

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
