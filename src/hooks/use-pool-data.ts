"use client";

import { useState, useEffect, useCallback } from "react";
import { formatUnits, erc20Abi, Address } from "viem";
import { safeArcReadContract, sanitizeArcError } from "@/lib/arc-read-infra";
import { POOL_CHAINS, SupportedPoolChain } from "@/config/pool-config";
import { fetchBaseTokenBalanceDeduped } from "@/lib/base-client";

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
  isDeployed?: boolean;
}

/**
 * Fetches reserves, supply, and wallet balances using the appropriate network client.
 */
async function fetchPoolData(
  chain: SupportedPoolChain = "Arc",
  userAddress?: Address,
  isWalletOnSelectedChain?: boolean,
  forceRefresh?: boolean
): Promise<PoolData> {
  const chainConfig = POOL_CHAINS[chain];

  // If contracts are not deployed yet on this network (e.g. Base Sepolia)
  if (!chainConfig.isDeployed || !chainConfig.pairAddress) {
    let walletUsdc = "0.00";
    let walletEurc = "0.00";

    if (userAddress) {
      try {
        const [rawUsdc, rawEurc] = await Promise.all([
          fetchBaseTokenBalanceDeduped(chainConfig.tokens.USDC.address as `0x${string}`, userAddress as `0x${string}`).catch(() => BigInt(0)),
          fetchBaseTokenBalanceDeduped(chainConfig.tokens.EURC.address as `0x${string}`, userAddress as `0x${string}`).catch(() => BigInt(0)),
        ]);
        walletUsdc = formatUnits(rawUsdc, chainConfig.tokens.USDC.decimals);
        walletEurc = formatUnits(rawEurc, chainConfig.tokens.EURC.decimals);
      } catch {
        walletUsdc = "0.00";
        walletEurc = "0.00";
      }
    }

    return {
      reserve0: "0.00",
      reserve1: "0.00",
      totalSupply: "0.00",
      userLPBalance: "0.00",
      totalSupplyRaw: "0",
      userLPBalanceRaw: "0",
      userPoolShare: 0,
      underlyingUSDC: "0.00",
      underlyingEURC: "0.00",
      token0Address: chainConfig.tokens.USDC.address,
      token1Address: chainConfig.tokens.EURC.address,
      walletUSDCBalance: walletUsdc,
      walletEURCBalance: walletEurc,
      isDeployed: false,
    };
  }

  // Deployed network (Arc Testnet)
  try {
    const pairAddress = chainConfig.pairAddress;
    const usdcAddress = chainConfig.tokens.USDC.address;
    const eurcAddress = chainConfig.tokens.EURC.address;

    // 1. Reserves
    const reservesPromise = safeArcReadContract<readonly [bigint, bigint, number]>({
      address: pairAddress,
      abi: PAIR_ABI,
      functionName: "getReserves",
    }, { cachePolicy: "shared", forceRefresh });

    // 2. Total Supply
    const supplyPromise = safeArcReadContract<bigint>({
      address: pairAddress,
      abi: PAIR_ABI,
      functionName: "totalSupply",
    }, { cachePolicy: "shared", forceRefresh });

    // 3. User LP Balance
    let lpBalancePromise = Promise.resolve(BigInt(0));
    if (userAddress && isWalletOnSelectedChain) {
      lpBalancePromise = safeArcReadContract<bigint>({
        address: pairAddress,
        abi: PAIR_ABI,
        functionName: "balanceOf",
        args: [userAddress],
      }, { cachePolicy: "wallet", forceRefresh });
    }

    // 4. User USDC Balance
    let usdcBalancePromise = Promise.resolve(BigInt(0));
    if (userAddress && isWalletOnSelectedChain) {
      usdcBalancePromise = safeArcReadContract<bigint>({
        address: usdcAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [userAddress],
      }, { cachePolicy: "wallet", forceRefresh });
    }

    // 5. User EURC Balance
    let eurcBalancePromise = Promise.resolve(BigInt(0));
    if (userAddress && isWalletOnSelectedChain) {
      eurcBalancePromise = safeArcReadContract<bigint>({
        address: eurcAddress,
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

    const reserve0Str = formatUnits(res0, chainConfig.tokens.USDC.decimals);
    const reserve1Str = formatUnits(res1, chainConfig.tokens.EURC.decimals);
    const totalSupplyStr = formatUnits(supply, 18);
    const userLPBalanceStr = formatUnits(lpBalance, 18);
    const usdcBalanceStr = formatUnits(usdcBalance, chainConfig.tokens.USDC.decimals);
    const eurcBalanceStr = formatUnits(eurcBalance, chainConfig.tokens.EURC.decimals);

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
      token0Address: usdcAddress,
      token1Address: eurcAddress,
      walletUSDCBalance: usdcBalanceStr,
      walletEURCBalance: eurcBalanceStr,
      isDeployed: true,
    };
  } catch (err) {
    throw new Error(sanitizeArcError(err));
  }
}

export function usePoolData(
  selectedChain: SupportedPoolChain = "Arc",
  userAddress?: Address,
  isWalletOnSelectedChain?: boolean
) {
  const [poolData, setPoolData] = useState<PoolData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const refreshPoolData = useCallback(async () => {
    if (isLoading) return;

    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchPoolData(selectedChain, userAddress, isWalletOnSelectedChain, true);
      setPoolData(data);
    } catch (err: unknown) {
      console.error("Error refreshing pool data:", err);
      setError(err instanceof Error ? err.message : "Failed to load pool data.");
    } finally {
      setIsLoading(false);
    }
  }, [selectedChain, userAddress, isWalletOnSelectedChain, isLoading]);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchPoolData(selectedChain, userAddress, isWalletOnSelectedChain, false);
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
  }, [selectedChain, userAddress, isWalletOnSelectedChain]);

  return {
    poolData,
    isLoading,
    error,
    refreshPoolData,
  };
}
