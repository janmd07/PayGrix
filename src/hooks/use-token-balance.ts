"use client";

import { useState, useEffect, useCallback } from "react";
import { formatUnits } from "viem";
import { fetchTokenBalanceDeduped } from "@/lib/arc-client";
import { fetchBaseTokenBalanceDeduped } from "@/lib/base-client";
import { SWAP_CHAINS, SupportedSwapChain } from "@/config/swap-config";

export function useTokenBalance(
  tokenSymbol: "USDC" | "EURC" | "cirBTC",
  address?: `0x${string}`,
  network: SupportedSwapChain = "Arc"
) {
  const [balance, setBalance] = useState<string>("0.00");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const refreshBalance = useCallback(async () => {
    if (!address) {
      setBalance("0.00");
      setIsLoading(false);
      return;
    }

    // cirBTC only exists on Arc Testnet
    if (network === "Base" && tokenSymbol === "cirBTC") {
      setBalance("0.00");
      setIsLoading(false);
      return;
    }

    const tokenConfig = SWAP_CHAINS[network].tokens[tokenSymbol];
    if (!tokenConfig) {
      setBalance("0.00");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      let balanceWei: bigint;
      if (network === "Base") {
        balanceWei = await fetchBaseTokenBalanceDeduped(tokenConfig.address, address);
      } else {
        balanceWei = await fetchTokenBalanceDeduped(tokenConfig.address, address);
      }
      const decimals = tokenConfig.decimals;
      const balanceStr = formatUnits(balanceWei, decimals);
      setBalance(balanceStr);
    } catch (err) {
      console.error(`Error reading ${tokenSymbol} balance on ${network}:`, err);
      setBalance("0.00");
    } finally {
      setIsLoading(false);
    }
  }, [tokenSymbol, address, network]);

  useEffect(() => {
    refreshBalance();
  }, [tokenSymbol, address, network, refreshBalance]);

  return {
    balance,
    isLoading,
    refreshBalance,
  };
}

