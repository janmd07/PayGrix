"use client";

import { useState, useEffect, useCallback } from "react";
import { createPublicClient, http, erc20Abi, formatUnits } from "viem";

const CHAIN_CONFIGS: Record<string, { rpc: string; usdc: `0x${string}` }> = {
  "Arc Testnet": {
    rpc: "https://rpc.testnet.arc.network",
    usdc: "0x3600000000000000000000000000000000000000",
  },
  "Base Sepolia": {
    rpc: "https://sepolia.base.org",
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  },
  "Arbitrum Sepolia": {
    rpc: "https://sepolia-rollup.arbitrum.io/rpc",
    usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
  },
};

export function useBridgeBalance(chain: string, address?: `0x${string}`) {
  const [balance, setBalance] = useState<string>("0.00");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const symbol = "USDC";

  const refreshBalance = useCallback(async () => {
    if (!address) {
      setBalance("0.00");
      setIsLoading(false);
      return;
    }

    const config = CHAIN_CONFIGS[chain];
    if (!config) {
      setBalance("0.00");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const client = createPublicClient({
        transport: http(config.rpc),
      });

      // Implement retry to gracefully handle strict RPC rate limits
      let balanceWei = BigInt(0);
      const retries = 5;
      let delay = 600;

      for (let i = 0; i < retries; i++) {
        try {
          balanceWei = await client.readContract({
            address: config.usdc,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [address],
          });
          break;
        } catch (err) {
          const errMsg = (err as { message?: string }).message || "";
          const errCode = (err as { code?: number }).code;
          const isRateLimit = errMsg.includes("request limit reached") || errCode === -32011 || errMsg.includes("429");
          if (isRateLimit && i < retries - 1) {
            await new Promise((resolve) => setTimeout(resolve, delay));
            delay += 400; // incremental delay to backoff
          } else {
            throw err;
          }
        }
      }

      // USDC has 6 decimals on these chains
      const balanceStr = formatUnits(balanceWei, 6);
      setBalance(balanceStr);
    } catch (err) {
      console.error("Error reading USDC balance:", err);
      setBalance("0.00");
    } finally {
      setIsLoading(false);
    }
  }, [chain, address]);

  useEffect(() => {
    refreshBalance();
  }, [chain, address, refreshBalance]);

  return {
    balance,
    symbol,
    isLoading,
    refreshBalance,
  };
}

