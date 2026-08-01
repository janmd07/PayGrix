"use client";

import { useState, useEffect, useCallback } from "react";
import { formatUnits } from "viem";
import { arcPublicClient } from "@/lib/arc-client";

const PAIR_ADDRESS = "0xf9d04BDdA9C857C9440ac9eD6EbB9118686Ef7b2";

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
  },
  {
    inputs: [],
    name: "token0",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "token1",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function"
  }
] as const;

export interface PoolData {
  reserve0: string;
  reserve1: string;
  totalSupply: string;
  userLPBalance: string;
  userPoolShare: number;
  underlyingUSDC: string;
  underlyingEURC: string;
  token0Address: string;
  token1Address: string;
}

// Module-scoped cache and in-flight request tracking
const poolDataCache = new Map<string, { value: PoolData; timestamp: number }>();
const inFlightPoolDataRequest = new Map<string, Promise<PoolData>>();
const CACHE_TTL_MS = 15000; // 15 seconds

async function executePoolFetch(userAddress?: `0x${string}`, isArcTestnet?: boolean): Promise<PoolData> {
  let lastError: unknown;
  const maxRetries = 1;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Fetch token addresses
      const token0 = await arcPublicClient.readContract({
        address: PAIR_ADDRESS,
        abi: PAIR_ABI,
        functionName: "token0"
      });
      const token1 = await arcPublicClient.readContract({
        address: PAIR_ADDRESS,
        abi: PAIR_ABI,
        functionName: "token1"
      });

      // Fetch reserves
      const [res0, res1] = await arcPublicClient.readContract({
        address: PAIR_ADDRESS,
        abi: PAIR_ABI,
        functionName: "getReserves"
      });

      // Fetch total supply
      const supply = await arcPublicClient.readContract({
        address: PAIR_ADDRESS,
        abi: PAIR_ABI,
        functionName: "totalSupply"
      });

      // Fetch LP balance
      let lpBalance = BigInt(0);
      if (userAddress && isArcTestnet) {
        lpBalance = await arcPublicClient.readContract({
          address: PAIR_ADDRESS,
          abi: PAIR_ABI,
          functionName: "balanceOf",
          args: [userAddress]
        });
      }

      // Format decimals
      const reserve0Str = formatUnits(res0, 6);
      const reserve1Str = formatUnits(res1, 6);
      const totalSupplyStr = formatUnits(supply, 18);
      const userLPBalanceStr = formatUnits(lpBalance, 18);

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
        userPoolShare: share,
        underlyingUSDC: underlyingUSDCStr,
        underlyingEURC: underlyingEURCStr,
        token0Address: token0,
        token1Address: token1
      };
    } catch (err: unknown) {
      lastError = err;
      const errMsg = err instanceof Error ? err.message : String(err);
      const is429 = errMsg.includes("request limit reached") || errMsg.includes("429") || errMsg.includes("rate limit");

      if (is429 && attempt < maxRetries) {
        // Delay 2 seconds before retrying
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } else {
        break;
      }
    }
  }

  throw lastError;
}

export async function fetchPoolDataDeduped(
  userAddress?: `0x${string}`,
  isArcTestnet?: boolean,
  forceRefresh?: boolean
): Promise<PoolData> {
  const now = Date.now();
  const cacheKey = `${userAddress?.toLowerCase() || "none"}:${isArcTestnet ? "arc" : "other"}`;

  if (!forceRefresh) {
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
      const errMsg = err instanceof Error ? err.message : String(err);
      const is429 = errMsg.includes("request limit reached") || errMsg.includes("429") || errMsg.includes("rate limit");
      if (is429) {
        setError("Arc Testnet RPC is temporarily busy. Please try again shortly.");
      } else {
        setError("Failed to load pool data from blockchain. Please try again shortly.");
      }
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
          const errMsg = err instanceof Error ? err.message : String(err);
          const is429 = errMsg.includes("request limit reached") || errMsg.includes("429") || errMsg.includes("rate limit");
          if (is429) {
            setError("Arc Testnet RPC is temporarily busy. Please try again shortly.");
          } else {
            setError("Failed to load pool data from blockchain. Please try again shortly.");
          }
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
