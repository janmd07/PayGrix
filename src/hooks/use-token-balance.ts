"use client";

import { useState, useEffect, useCallback } from "react";
import { createPublicClient, http, erc20Abi, formatUnits } from "viem";

const TOKEN_ADDRESSES = {
  USDC: "0x3600000000000000000000000000000000000000" as const,
  EURC: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as const,
  cirBTC: "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF" as const,
};

export function useTokenBalance(tokenSymbol: "USDC" | "EURC" | "cirBTC", address?: `0x${string}`) {
  const [balance, setBalance] = useState<string>("0.00");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const refreshBalance = useCallback(async () => {
    if (!address) {
      setBalance("0.00");
      setIsLoading(false);
      return;
    }

    const tokenAddress = TOKEN_ADDRESSES[tokenSymbol];
    setIsLoading(true);
    try {
      const client = createPublicClient({
        transport: http("https://rpc.testnet.arc.network"),
      });

      // Implement retry to gracefully handle strict RPC rate limits
      let balanceWei = BigInt(0);
      const retries = 5;
      let delay = 600;

      for (let i = 0; i < retries; i++) {
        try {
          balanceWei = await client.readContract({
            address: tokenAddress,
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

      const decimals = tokenSymbol === "cirBTC" ? 8 : 6;
      const balanceStr = formatUnits(balanceWei, decimals);
      setBalance(balanceStr);
    } catch (err) {
      console.error(`Error reading ${tokenSymbol} balance:`, err);
      setBalance("0.00");
    } finally {
      setIsLoading(false);
    }
  }, [tokenSymbol, address]);

  useEffect(() => {
    refreshBalance();
  }, [tokenSymbol, address, refreshBalance]);

  return {
    balance,
    isLoading,
    refreshBalance,
  };
}
