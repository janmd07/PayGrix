"use client";

import { useState, useEffect, useCallback } from "react";
import { formatUnits } from "viem";
import { fetchArcMainnetTokenBalanceDeduped } from "@/lib/arc-mainnet-client";
import {
  fetchBaseTokenBalanceDeduped,
  fetchBaseNativeBalanceDeduped,
  fetchBaseMainnetTokenBalanceDeduped,
} from "@/lib/base-client";
import { SWAP_CHAINS, SupportedSwapChain } from "@/config/swap-config";

export function useTokenBalance(
  tokenSymbol: "USDC" | "EURC" | "cirBTC" | "ETH",
  address?: `0x${string}`,
  network: SupportedSwapChain = "ArcMainnet"
) {
  const [balance, setBalance] = useState<string>("0.00");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const refreshBalance = useCallback(async () => {
    if (!address) {
      setBalance("0.00");
      setIsLoading(false);
      return;
    }

    // ETH only exists on Base Sepolia in swap
    if ((network === "ArcMainnet" || network === "BaseMainnet") && tokenSymbol === "ETH") {
      setBalance("0.00");
      setIsLoading(false);
      return;
    }

    const tokenConfig = SWAP_CHAINS[network]?.tokens[tokenSymbol];
    if (!tokenConfig) {
      setBalance("0.00");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      let balanceWei: bigint;
      if (network === "Base" && tokenSymbol === "ETH") {
        balanceWei = await fetchBaseNativeBalanceDeduped(address);
      } else if (network === "Base") {
        balanceWei = await fetchBaseTokenBalanceDeduped(tokenConfig.address, address);
      } else if (network === "BaseMainnet") {
        balanceWei = await fetchBaseMainnetTokenBalanceDeduped(tokenConfig.address, address);
      } else if (network === "ArcMainnet") {
        balanceWei = await fetchArcMainnetTokenBalanceDeduped(tokenConfig.address, address);
      } else {
        balanceWei = BigInt(0);
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

