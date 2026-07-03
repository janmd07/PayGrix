"use client";

import { useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import { ArcTestnet } from "@circle-fin/app-kit/chains";
import { EIP1193Provider, createPublicClient, http, erc20Abi, parseUnits } from "viem";

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
  tokenIn: "USDC" | "EURC";
  tokenOut: "USDC" | "EURC";
  amountIn: string;
  amountOut: string;
  txHash: string;
  timestamp: string;
}

const TOKEN_ADDRESSES = {
  USDC: "0x3600000000000000000000000000000000000000" as const,
  EURC: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as const,
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

  const getSwapEstimate = useCallback(async (amountIn: string, tokenIn: "USDC" | "EURC", tokenOut: "USDC" | "EURC") => {
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
      const rawAmount = parseUnits(amountIn, 6).toString();

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
      const estOutputStr = (parseFloat(data.quote.estimatedAmount) / 1000000).toString();
      const minOutputStr = (parseFloat(data.quote.minAmount) / 1000000).toString();

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

  const executeSwap = useCallback(async (amountIn: string, tokenIn: "USDC" | "EURC", tokenOut: "USDC" | "EURC") => {
    if (!amountIn || parseFloat(amountIn) <= 0) return null;
    setError(null);
    setTxHash("");
    setStatus("waiting-wallet");

    if (!isConnected || !connector || !address) {
      setError("Wallet not connected");
      setStatus("failed");
      return null;
    }

    // Safety Requirement 3: Check spender address in chain configuration
    const adapterAddress = ArcTestnet.kitContracts?.adapter;
    if (!adapterAddress) {
      setError("Adapter contract address configuration is missing on Arc Testnet.");
      setStatus("failed");
      return null;
    }

    try {
      const tokenInAddress = TOKEN_ADDRESSES[tokenIn];
      const tokenOutAddress = TOKEN_ADDRESSES[tokenOut];
      const rawAmount = parseUnits(amountIn, 6);

      const provider = (await connector.getProvider()) as EIP1193Provider;
      const adapter = await createViemAdapterFromProvider({ provider });

      // Step 1: Check Allowance & Approve if necessary
      setStatus("approving");
      const client = createPublicClient({
        transport: http("https://rpc.testnet.arc.network"),
      });

      const currentAllowance = await client.readContract({
        address: tokenInAddress,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, adapterAddress],
      });

      if (currentAllowance < rawAmount) {
        const preparedApprove = await adapter.prepareAction(
          "token.approve",
          {
            delegate: adapterAddress,
            amount: rawAmount,
            tokenAddress: tokenInAddress,
          },
          { chain: ArcTestnet }
        );
        const approveTx = await preparedApprove.execute();
        console.log("Token approval submitted:", approveTx);

        // Wait for approval confirmation
        await client.waitForTransactionReceipt({ hash: approveTx as `0x${string}` });
      }

      // Step 2: Build transaction details from server proxy
      setStatus("waiting-wallet");
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

      // Step 3: Parse and execute swap action via client adapter
      setStatus("swapping");
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
        instructions: (buildData.transaction.executionParams.instructions as InstructionItem[]).map((ins: InstructionItem) => ({
          target: ins.target,
          data: ins.data,
          value: BigInt(ins.value),
          tokenIn: ins.tokenIn,
          amountToApprove: BigInt(ins.amountToApprove),
          tokenOut: ins.tokenOut,
          minTokenOut: BigInt(ins.minTokenOut),
        })),
        tokens: buildData.transaction.executionParams.tokens as { token: string; beneficiary: string }[],
        execId: BigInt(buildData.transaction.executionParams.execId as string),
        deadline: BigInt(buildData.transaction.executionParams.deadline as string),
        metadata: buildData.transaction.executionParams.metadata as string,
      };

      const signature = buildData.transaction.signature;
      const inputAmount = BigInt(buildData.amount);

      const tokenInputs = [
        {
          permitType: 0, // PermitType.NONE
          token: tokenInAddress as `0x${string}`,
          amount: inputAmount,
          permitCalldata: "0x" as `0x${string}`,
        },
      ];

      const preparedSwap = await adapter.prepareAction(
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

      const swapTx = await preparedSwap.execute();
      console.log("Swap transaction submitted:", swapTx);
      setTxHash(swapTx);

      // Step 4: Poll status proxy route until completed
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
              amountOut: (parseFloat(buildData.estimatedAmount) / 1000000).toString(),
            };
          } else if (statusRes.ok && statusData.status === "FAILED") {
            throw new Error("On-chain swap execution failed.");
          }
        } catch (err) {
          console.warn("Error polling swap status:", err);
        }
      }

      setStatus("completed");
      return {
        txHash: swapTx,
        amountOut: (parseFloat(buildData.estimatedAmount) / 1000000).toString(),
      };
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
