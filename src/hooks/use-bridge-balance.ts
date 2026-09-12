"use client";

import { useState, useEffect, useCallback } from "react";
import { createPublicClient, http, erc20Abi, formatUnits } from "viem";
import { safeArcReadContract } from "@/lib/arc-read-infra";

import { BridgeAsset, EURC_CHAIN_CONFIG } from "@/config/bridge-assets";

const CHAIN_CONFIGS: Record<string, { rpc: string | string[]; usdc: `0x${string}` }> = {
  "Arc Testnet": {
    rpc: "https://rpc.testnet.arc.network",
    usdc: "0x3600000000000000000000000000000000000000",
  },
  "Base Sepolia": {
    rpc: [
      "https://base-sepolia.drpc.org",
      "https://base-sepolia-rpc.publicnode.com",
      "https://sepolia.base.org",
    ],
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  },
  "Arbitrum Sepolia": {
    rpc: "https://sepolia-rollup.arbitrum.io/rpc",
    usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
  },
};

export function useBridgeBalance(
  chain: string,
  address?: `0x${string}`,
  asset: BridgeAsset = "USDC"
) {
  const [balance, setBalance] = useState<string>("0.00");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const symbol = asset;

  const refreshBalance = useCallback(async (forceRefresh = false) => {
    if (!address) {
      setBalance("0.00");
      setIsLoading(false);
      return;
    }

    // EURC only exists on Arc Testnet and Base Sepolia in Phase 3
    if (asset === "EURC" && chain !== "Arc Testnet" && chain !== "Base Sepolia") {
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

    const tokenAddress: `0x${string}` =
      asset === "EURC"
        ? EURC_CHAIN_CONFIG[chain as "Base Sepolia" | "Arc Testnet"].eurc
        : config.usdc;

    setIsLoading(true);
    try {
      let balanceWei = BigInt(0);

      if (chain === "Arc Testnet") {
        balanceWei = await safeArcReadContract<bigint>({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
        }, { cachePolicy: "wallet", forceRefresh });
      } else {
        const rpcList = Array.isArray(config.rpc) ? config.rpc : [config.rpc];
        let readSuccess = false;
        let lastErr: unknown = null;

        for (const rpcUrl of rpcList) {
          try {
            const client = createPublicClient({
              transport: http(rpcUrl, { timeout: 10_000 }),
            });
            balanceWei = await client.readContract({
              address: tokenAddress,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [address],
            });
            readSuccess = true;
            break;
          } catch (err) {
            console.warn(`[useBridgeBalance] RPC read failed for ${chain} (${asset}) on ${rpcUrl}:`, err);
            lastErr = err;
          }
        }

        if (!readSuccess) {
          throw lastErr || new Error(`All RPC endpoints failed for ${chain}`);
        }
      }

      // Both USDC and EURC have 6 decimals on these chains
      const balanceStr = formatUnits(balanceWei, 6);
      setBalance(balanceStr);
    } catch (err) {
      console.error(`Error reading ${asset} balance across RPC endpoints:`, err);
    } finally {
      setIsLoading(false);
    }
  }, [chain, address, asset]);

  useEffect(() => {
    refreshBalance();
  }, [chain, address, asset, refreshBalance]);

  return {
    balance,
    symbol,
    isLoading,
    refreshBalance,
  };
}

