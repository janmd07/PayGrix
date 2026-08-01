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

export function usePoolData(userAddress?: `0x${string}`, isArcTestnet?: boolean) {
  const [poolData, setPoolData] = useState<PoolData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const refreshPoolData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // 1. Get token0 and token1 addresses
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

      // 2. Get reserves
      const [res0, res1] = await arcPublicClient.readContract({
        address: PAIR_ADDRESS,
        abi: PAIR_ABI,
        functionName: "getReserves"
      });

      // 3. Get total supply of LP tokens
      const supply = await arcPublicClient.readContract({
        address: PAIR_ADDRESS,
        abi: PAIR_ABI,
        functionName: "totalSupply"
      });

      // 4. Get user's LP balance if connected and on correct network
      let lpBalance = BigInt(0);
      if (userAddress && isArcTestnet) {
        lpBalance = await arcPublicClient.readContract({
          address: PAIR_ADDRESS,
          abi: PAIR_ABI,
          functionName: "balanceOf",
          args: [userAddress]
        });
      }

      // Format values (6 decimals for USDC/EURC, 18 decimals for LP tokens)
      const reserve0Str = formatUnits(res0, 6);
      const reserve1Str = formatUnits(res1, 6);
      const totalSupplyStr = formatUnits(supply, 18);
      const userLPBalanceStr = formatUnits(lpBalance, 18);

      const supplyNum = parseFloat(totalSupplyStr);
      const userLPNum = parseFloat(userLPBalanceStr);
      const share = supplyNum > 0 ? userLPNum / supplyNum : 0;

      const underlyingUSDCStr = (parseFloat(reserve0Str) * share).toFixed(6);
      const underlyingEURCStr = (parseFloat(reserve1Str) * share).toFixed(6);

      setPoolData({
        reserve0: reserve0Str,
        reserve1: reserve1Str,
        totalSupply: totalSupplyStr,
        userLPBalance: userLPBalanceStr,
        userPoolShare: share,
        underlyingUSDC: underlyingUSDCStr,
        underlyingEURC: underlyingEURCStr,
        token0Address: token0,
        token1Address: token1
      });
    } catch (err: unknown) {
      console.error("Error fetching pool data:", err);
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(errMsg || "Failed to load pool data from blockchain");
    } finally {
      setIsLoading(false);
    }
  }, [userAddress, isArcTestnet]);

  useEffect(() => {
    refreshPoolData();
  }, [refreshPoolData]);

  return {
    poolData,
    isLoading,
    error,
    refreshPoolData
  };
}
