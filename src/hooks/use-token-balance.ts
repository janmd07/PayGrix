"use client";

import { useState, useEffect, useCallback } from "react";
import { formatUnits } from "viem";
import { fetchTokenBalanceDeduped } from "@/lib/arc-client";

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
      const balanceWei = await fetchTokenBalanceDeduped(tokenAddress, address);
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
