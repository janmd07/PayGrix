"use client";
 
import { useState, useEffect, useCallback } from "react";
import { formatUnits, erc20Abi, Address } from "viem";
import { safeArcReadContract, sanitizeArcError } from "@/lib/arc-read-infra";
 
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
 
/**
 * Fetches reserves, supply, and wallet balances using the centralized read infra.
 */
async function fetchPoolData(
  userAddress?: Address,
  isArcTestnet?: boolean,
  forceRefresh?: boolean
): Promise<PoolData> {
  try {
    // 1. Reserves
    const reservesPromise = safeArcReadContract<readonly [bigint, bigint, number]>({
      address: PAIR_ADDRESS,
      abi: PAIR_ABI,
      functionName: "getReserves",
    }, { cachePolicy: "shared", forceRefresh });
 
    // 2. Total Supply
    const supplyPromise = safeArcReadContract<bigint>({
      address: PAIR_ADDRESS,
      abi: PAIR_ABI,
      functionName: "totalSupply",
    }, { cachePolicy: "shared", forceRefresh });
 
    // 3. User LP Balance
    let lpBalancePromise = Promise.resolve(BigInt(0));
    if (userAddress && isArcTestnet) {
      lpBalancePromise = safeArcReadContract<bigint>({
        address: PAIR_ADDRESS,
        abi: PAIR_ABI,
        functionName: "balanceOf",
        args: [userAddress],
      }, { cachePolicy: "wallet", forceRefresh });
    }
 
    // 4. User USDC Balance
    let usdcBalancePromise = Promise.resolve(BigInt(0));
    if (userAddress && isArcTestnet) {
      usdcBalancePromise = safeArcReadContract<bigint>({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [userAddress],
      }, { cachePolicy: "wallet", forceRefresh });
    }
 
    // 5. User EURC Balance
    let eurcBalancePromise = Promise.resolve(BigInt(0));
    if (userAddress && isArcTestnet) {
      eurcBalancePromise = safeArcReadContract<bigint>({
        address: EURC_ADDRESS,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [userAddress],
      }, { cachePolicy: "wallet", forceRefresh });
    }
 
    const [reserves, supply, lpBalance, usdcBalance, eurcBalance] = await Promise.all([
      reservesPromise,
      supplyPromise,
      lpBalancePromise,
      usdcBalancePromise,
      eurcBalancePromise,
    ]);
 
    const [res0, res1] = reserves;
 
    // Format balances
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
      token0Address: USDC_ADDRESS,
      token1Address: EURC_ADDRESS,
      walletUSDCBalance: usdcBalanceStr,
      walletEURCBalance: eurcBalanceStr,
    };
  } catch (err) {
    throw new Error(sanitizeArcError(err));
  }
}
 
export function usePoolData(userAddress?: Address, isArcTestnet?: boolean) {
  const [poolData, setPoolData] = useState<PoolData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
 
  const refreshPoolData = useCallback(async () => {
    if (isLoading) return;
 
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchPoolData(userAddress, isArcTestnet, true);
      setPoolData(data);
    } catch (err: unknown) {
      console.error("Error refreshing pool data:", err);
      setError(err instanceof Error ? err.message : "Failed to load pool data.");
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
        const data = await fetchPoolData(userAddress, isArcTestnet, false);
        if (isMounted) {
          setPoolData(data);
        }
      } catch (err: unknown) {
        if (isMounted) {
          console.error("Error fetching pool data:", err);
          setError(err instanceof Error ? err.message : "Failed to load pool data.");
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
    refreshPoolData,
  };
}
