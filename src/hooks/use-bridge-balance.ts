"use client";

import { useState, useEffect, useCallback } from "react";
import { createPublicClient, http, erc20Abi, formatUnits } from "viem";
import { safeArcReadContract } from "@/lib/arc-read-infra";

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

export function useBridgeBalance(chain: string, address?: `0x${string}`) {
  const [balance, setBalance] = useState<string>("0.00");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const symbol = "USDC";

  const refreshBalance = useCallback(async (forceRefresh = false) => {
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
      let balanceWei = BigInt(0);

      if (chain === "Arc Testnet") {
        balanceWei = await safeArcReadContract<bigint>({
          address: config.usdc,
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
              address: config.usdc,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [address],
            });
            readSuccess = true;
            break;
          } catch (err) {
            console.warn(`[useBridgeBalance] RPC read failed for ${chain} on ${rpcUrl}:`, err);
            lastErr = err;
          }
        }

        if (!readSuccess) {
          throw lastErr || new Error(`All RPC endpoints failed for ${chain}`);
        }
      }

      // USDC has 6 decimals on these chains
      const balanceStr = formatUnits(balanceWei, 6);
      setBalance(balanceStr);
    } catch (err) {
      console.error("Error reading USDC balance across RPC endpoints:", err);
      // Do not overwrite an existing valid balance with 0.00 when all RPCs fail
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

