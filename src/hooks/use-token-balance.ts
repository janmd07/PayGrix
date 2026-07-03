"use client";

import { useState, useEffect, useCallback } from "react";
import { createPublicClient, http, erc20Abi, formatUnits } from "viem";

const TOKEN_ADDRESSES = {
  USDC: "0x3600000000000000000000000000000000000000" as const,
  EURC: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as const,
};

export function useTokenBalance(tokenSymbol: "USDC" | "EURC", address?: `0x${string}`) {
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

      const balanceWei = await client.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      });

      const balanceStr = formatUnits(balanceWei, 6);
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
