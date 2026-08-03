"use client";

import { useState, useEffect, useCallback } from "react";
import { formatUnits, createPublicClient, http, erc20Abi } from "viem";
import { arcTestnet } from "../config/arc-testnet";

const PAIR_ADDRESS = "0xf9d04BDdA9C857C9440ac9eD6EbB9118686Ef7b2";
const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const EURC_ADDRESS = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";

const PAIR_ABI = [
  {
    inputs: [],
    name: "getReserves",
    outputs: [
      { internalType: "uint112", name: "_reserve0", type: "uint112" },
      { internalType: "uint112", name: "_reserve1", type: "uint112" },
      { internalType: "uint32", name: "_blockTimestampLast", type: "uint32" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "totalSupply",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ internalType: "address", name: "owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
] as const;

export interface PoolData {
  reserve0: string;
  reserve1: string;
  totalSupply: string;
  userLPBalance: string;
  totalSupplyRaw: string;
  userLPBalanceRaw: string;
  userPoolShare: number;
  underlyingUSDC: string;
  underlyingEURC: string;
  token0Address: string;
  token1Address: string;
  walletUSDCBalance: string;
  walletEURCBalance: string;
}

// Instantiate a client dedicated to the Pool page with batching disabled
const poolPublicClient = createPublicClient({
  chain: arcTestnet,
  transport: http("/api/arc-rpc", {
    batch: false,
  }),
});

// Module-scoped cache and in-flight request tracking
const poolDataCache = new Map<string, { value: PoolData; timestamp: number }>();
const inFlightPoolDataRequest = new Map<string, Promise<PoolData>>();
const CACHE_TTL_MS = 15000; // 15 seconds

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function executePoolFetch(userAddress?: `0x${string}`, isArcTestnet?: boolean): Promise<PoolData> {
  const maxRetries = 1;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // 1. Fetch reserves
      const [res0, res1] = await poolPublicClient.readContract({
        address: PAIR_ADDRESS,
        abi: PAIR_ABI,
        functionName: "getReserves"
      });

      // Sequential spacing
      await sleep(100);

      // 2. Fetch total supply
      const supply = await poolPublicClient.readContract({
        address: PAIR_ADDRESS,
        abi: PAIR_ABI,
        functionName: "totalSupply"
      });

      // 3. Fetch LP balance only if wallet is connected
      let lpBalance = BigInt(0);
      if (userAddress && isArcTestnet) {
        await sleep(100);
        lpBalance = await poolPublicClient.readContract({
          address: PAIR_ADDRESS,
          abi: PAIR_ABI,
          functionName: "balanceOf",
          args: [userAddress]
        });
      }

      // 4. Fetch USDC balance if wallet is connected
      let usdcBalance = BigInt(0);
      if (userAddress && isArcTestnet) {
        await sleep(100);
        usdcBalance = await poolPublicClient.readContract({
          address: USDC_ADDRESS,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [userAddress]
        });
      }

      // 5. Fetch EURC balance if wallet is connected
      let eurcBalance = BigInt(0);
      if (userAddress && isArcTestnet) {
        await sleep(100);
        eurcBalance = await poolPublicClient.readContract({
          address: EURC_ADDRESS,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [userAddress]
        });
      }

      // Format decimals
      const reserve0Str = formatUnits(res0, 6);
      const reserve1Str = formatUnits(res1, 6);
      const totalSupplyStr = formatUnits(supply, 18);
      const userLPBalanceStr = formatUnits(lpBalance, 18);
      const usdcBalanceStr = formatUnits(usdcBalance, 6);
      const eurcBalanceStr = formatUnits(eurcBalance, 6);

      const supplyNum = parseFloat(totalSupplyStr);
      const userLPNum = parseFloat(userLPBalanceStr);
      const share = supplyNum > 0 ? userLPNum / supplyNum : 0;

      const underlyingUSDCStr = (parseFloat(reserve0Str) * share).toFixed(6);
      const underlyingEURCStr = (parseFloat(reserve1Str) * share).toFixed(6);

      return {
        reserve0: reserve0Str,
        reserve1: reserve1Str,
        totalSupply: totalSupplyStr,
        userLPBalance: userLPBalanceStr,
        totalSupplyRaw: supply.toString(),
        userLPBalanceRaw: lpBalance.toString(),
        userPoolShare: share,
        underlyingUSDC: underlyingUSDCStr,
        underlyingEURC: underlyingEURCStr,
        token0Address: "0x3600000000000000000000000000000000000000",
        token1Address: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
        walletUSDCBalance: usdcBalanceStr,
        walletEURCBalance: eurcBalanceStr
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const is429 = errMsg.includes("429") || 
                    errMsg.toLowerCase().includes("request limit reached") || 
                    errMsg.toLowerCase().includes("rate limit") ||
                    errMsg.toLowerCase().includes("busy");

      if (is429 && attempt < maxRetries) {
        // Wait 3 seconds before retrying exactly once
        await sleep(3000);
      } else {
        break;
      }
    }
  }

  throw new Error("Arc Testnet RPC is temporarily busy. Please try again shortly.");
}

export async function fetchPoolDataDeduped(
  userAddress?: `0x${string}`,
  isArcTestnet?: boolean,
  forceRefresh?: boolean
): Promise<PoolData> {
  const now = Date.now();
  const cacheKey = `${userAddress?.toLowerCase() || "none"}:${isArcTestnet ? "arc" : "other"}`;

  if (forceRefresh) {
    // Clear client cache and trigger clear cache on the server route
    poolDataCache.delete(cacheKey);
    await fetch("/api/arc-rpc", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bypass-cache": "true",
      },
      body: JSON.stringify({ jsonrpc: "2.0", method: "clear_cache", id: 999 }),
    }).catch(() => {});
  } else {
    const cached = poolDataCache.get(cacheKey);
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      return cached.value;
    }
  }

  let promise = inFlightPoolDataRequest.get(cacheKey);
  if (!promise) {
    promise = (async () => {
      try {
        const data = await executePoolFetch(userAddress, isArcTestnet);
        poolDataCache.set(cacheKey, { value: data, timestamp: Date.now() });
        return data;
      } catch (err) {
        poolDataCache.delete(cacheKey);
        throw err;
      }
    })().finally(() => {
      inFlightPoolDataRequest.delete(cacheKey);
    });
    inFlightPoolDataRequest.set(cacheKey, promise);
  }

  return promise;
}

export function usePoolData(userAddress?: `0x${string}`, isArcTestnet?: boolean) {
  const [poolData, setPoolData] = useState<PoolData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const refreshPoolData = useCallback(async () => {
    if (isLoading) return;

    const cacheKey = `${userAddress?.toLowerCase() || "none"}:${isArcTestnet ? "arc" : "other"}`;
    poolDataCache.delete(cacheKey);

    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchPoolDataDeduped(userAddress, isArcTestnet, true);
      setPoolData(data);
    } catch (err: unknown) {
      console.error("Error refreshing pool data:", err);
      setError(err instanceof Error ? err.message : "Failed to load pool data from blockchain. Please try again shortly.");
    } finally {
      setIsLoading(false);
    }
  }, [userAddress, isArcTestnet, isLoading]);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchPoolDataDeduped(userAddress, isArcTestnet, false);
        if (isMounted) {
          setPoolData(data);
        }
      } catch (err: unknown) {
        if (isMounted) {
          console.error("Error fetching pool data:", err);
          setError(err instanceof Error ? err.message : "Failed to load pool data from blockchain. Please try again shortly.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    load();

    return () => {
      isMounted = false;
    };
  }, [userAddress, isArcTestnet]);

  return {
    poolData,
    isLoading,
    error,
    refreshPoolData
  };
}

