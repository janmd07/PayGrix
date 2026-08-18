"use client";

import { useState, useEffect, useCallback } from "react";
import { formatUnits, Address } from "viem";
import { safeArcReadContract, sanitizeArcError } from "@/lib/arc-read-infra";

export const PAYGRIX_LENDING_ADDRESS: Address = "0x5662977d74e8f460d85F0c0499297B05C68c6111";
export const USDC_ADDRESS: Address = "0x3600000000000000000000000000000000000000";

export const PAYGRIX_LENDING_ABI = [
  {
    inputs: [],
    name: "poolLiquidity",
    outputs: [{ internalType: "uint256", name: "availableUsdc", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalOutstandingDebt",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "user", type: "address" }],
    name: "getPosition",
    outputs: [
      { internalType: "uint256", name: "collateral", type: "uint256" },
      { internalType: "uint256", name: "debt", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "user", type: "address" }],
    name: "maxBorrow",
    outputs: [{ internalType: "uint256", name: "maxUsdcBorrow", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "user", type: "address" }],
    name: "healthFactor",
    outputs: [{ internalType: "uint256", name: "hfBps", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "user", type: "address" }],
    name: "availableCollateral",
    outputs: [{ internalType: "uint256", name: "withdrawableCirBtc", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "collateralPrice",
    outputs: [{ internalType: "uint256", name: "priceUsdcPerBtc", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "paused",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "owner",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "amount", type: "uint256" }],
    name: "fundPool",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export const USDC_ABI = [
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "owner", type: "address" },
      { internalType: "address", name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "spender", type: "address" },
      { internalType: "uint256", name: "value", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export interface LendingOnChainData {
  poolLiquidity: string;
  poolLiquidityRaw: bigint;
  totalOutstandingDebt: string;
  totalOutstandingDebtRaw: bigint;
  isPaused: boolean;
  collateralPrice: string;
  collateralPriceRaw: bigint;
  userCollateral: string;
  userCollateralRaw: bigint;
  userDebt: string;
  userDebtRaw: bigint;
  userMaxBorrow: string;
  userMaxBorrowRaw: bigint;
  userAvailableCollateral: string;
  userAvailableCollateralRaw: bigint;
  userHealthFactor: string; // "—" or formatted number
  userHealthFactorBps: bigint;
  userCollateralValueUsdc: string;
  ownerAddress: Address | null;
  isContractOwner: boolean;
  userUsdcBalance: string;
  userUsdcBalanceRaw: bigint;
  userUsdcAllowance: string;
  userUsdcAllowanceRaw: bigint;
}

const DEFAULT_LENDING_DATA: LendingOnChainData = {
  poolLiquidity: "0.00",
  poolLiquidityRaw: BigInt(0),
  totalOutstandingDebt: "0.00",
  totalOutstandingDebtRaw: BigInt(0),
  isPaused: true, // Safety default
  collateralPrice: "60,000.00",
  collateralPriceRaw: BigInt(60000000000),
  userCollateral: "0.00",
  userCollateralRaw: BigInt(0),
  userDebt: "0.00",
  userDebtRaw: BigInt(0),
  userMaxBorrow: "0.00",
  userMaxBorrowRaw: BigInt(0),
  userAvailableCollateral: "0.00",
  userAvailableCollateralRaw: BigInt(0),
  userHealthFactor: "—",
  userHealthFactorBps: BigInt(0),
  userCollateralValueUsdc: "$0.00",
  ownerAddress: null,
  isContractOwner: false,
  userUsdcBalance: "0.00",
  userUsdcBalanceRaw: BigInt(0),
  userUsdcAllowance: "0.00",
  userUsdcAllowanceRaw: BigInt(0),
};

async function fetchLendingOnChainData(
  userAddress?: Address,
  isArcTestnet?: boolean,
  forceRefresh?: boolean
): Promise<LendingOnChainData> {
  // 1. Global Read Calls
  const poolLiquidityPromise = safeArcReadContract<bigint>({
    address: PAYGRIX_LENDING_ADDRESS,
    abi: PAYGRIX_LENDING_ABI,
    functionName: "poolLiquidity",
  }, { cachePolicy: "shared", forceRefresh });

  const totalDebtPromise = safeArcReadContract<bigint>({
    address: PAYGRIX_LENDING_ADDRESS,
    abi: PAYGRIX_LENDING_ABI,
    functionName: "totalOutstandingDebt",
  }, { cachePolicy: "shared", forceRefresh });

  const pausedPromise = safeArcReadContract<boolean>({
    address: PAYGRIX_LENDING_ADDRESS,
    abi: PAYGRIX_LENDING_ABI,
    functionName: "paused",
  }, { cachePolicy: "shared", forceRefresh });

  const pricePromise = safeArcReadContract<bigint>({
    address: PAYGRIX_LENDING_ADDRESS,
    abi: PAYGRIX_LENDING_ABI,
    functionName: "collateralPrice",
  }, { cachePolicy: "shared", forceRefresh });

  const ownerPromise = safeArcReadContract<Address>({
    address: PAYGRIX_LENDING_ADDRESS,
    abi: PAYGRIX_LENDING_ABI,
    functionName: "owner",
  }, { cachePolicy: "static", forceRefresh }).catch(() => null);

  // 2. User-Specific Read Calls (Only if connected & on Arc Testnet)
  let userPositionPromise = Promise.resolve([BigInt(0), BigInt(0)] as readonly [bigint, bigint]);
  let userMaxBorrowPromise = Promise.resolve(BigInt(0));
  let userHealthFactorPromise = Promise.resolve(BigInt(0));
  let userAvailableCollateralPromise = Promise.resolve(BigInt(0));
  let userUsdcBalancePromise = Promise.resolve(BigInt(0));
  let userUsdcAllowancePromise = Promise.resolve(BigInt(0));

  if (userAddress && isArcTestnet) {
    userPositionPromise = safeArcReadContract<readonly [bigint, bigint]>({
      address: PAYGRIX_LENDING_ADDRESS,
      abi: PAYGRIX_LENDING_ABI,
      functionName: "getPosition",
      args: [userAddress],
    }, { cachePolicy: "wallet", forceRefresh });

    userMaxBorrowPromise = safeArcReadContract<bigint>({
      address: PAYGRIX_LENDING_ADDRESS,
      abi: PAYGRIX_LENDING_ABI,
      functionName: "maxBorrow",
      args: [userAddress],
    }, { cachePolicy: "wallet", forceRefresh });

    userHealthFactorPromise = safeArcReadContract<bigint>({
      address: PAYGRIX_LENDING_ADDRESS,
      abi: PAYGRIX_LENDING_ABI,
      functionName: "healthFactor",
      args: [userAddress],
    }, { cachePolicy: "wallet", forceRefresh });

    userAvailableCollateralPromise = safeArcReadContract<bigint>({
      address: PAYGRIX_LENDING_ADDRESS,
      abi: PAYGRIX_LENDING_ABI,
      functionName: "availableCollateral",
      args: [userAddress],
    }, { cachePolicy: "wallet", forceRefresh });

    userUsdcBalancePromise = safeArcReadContract<bigint>({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: "balanceOf",
      args: [userAddress],
    }, { cachePolicy: "wallet", forceRefresh });

    userUsdcAllowancePromise = safeArcReadContract<bigint>({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: "allowance",
      args: [userAddress, PAYGRIX_LENDING_ADDRESS],
    }, { cachePolicy: "wallet", forceRefresh });
  }

  const [
    poolLiquidityRaw,
    totalDebtRaw,
    isPaused,
    priceRaw,
    ownerAddress,
    userPosition,
    maxBorrowRaw,
    hfBps,
    availableCollateralRaw,
    userUsdcBalanceRaw,
    userUsdcAllowanceRaw,
  ] = await Promise.all([
    poolLiquidityPromise,
    totalDebtPromise,
    pausedPromise,
    pricePromise,
    ownerPromise,
    userPositionPromise,
    userMaxBorrowPromise,
    userHealthFactorPromise,
    userAvailableCollateralPromise,
    userUsdcBalancePromise,
    userUsdcAllowancePromise,
  ]);

  const [userCollateralRaw, userDebtRaw] = userPosition;

  // Format Global Values
  const poolLiquidityStr = formatUnits(poolLiquidityRaw, 6);
  const totalDebtStr = formatUnits(totalDebtRaw, 6);
  const priceNum = Number(priceRaw) / 1e6;
  const priceStr = priceNum.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Format User Values
  const userCollateralStr = formatUnits(userCollateralRaw, 8);
  const userDebtStr = formatUnits(userDebtRaw, 6);
  const userMaxBorrowStr = formatUnits(maxBorrowRaw, 6);
  const userAvailableCollateralStr = formatUnits(availableCollateralRaw, 8);
  const userUsdcBalanceStr = formatUnits(userUsdcBalanceRaw, 6);
  const userUsdcAllowanceStr = formatUnits(userUsdcAllowanceRaw, 6);

  const isContractOwner = Boolean(
    userAddress && ownerAddress && userAddress.toLowerCase() === ownerAddress.toLowerCase()
  );

  // Health Factor String Formatting
  let hfStr = "—";
  if (userDebtRaw > BigInt(0) && hfBps > BigInt(0)) {
    const hfFloat = Number(hfBps) / 10000;
    hfStr = hfFloat.toFixed(2);
  }

  // Collateral Value Calculation in USDC ($)
  let collateralValueStr = "$0.00";
  if (userCollateralRaw > BigInt(0) && priceRaw > BigInt(0)) {
    const valueBaseUnits = (userCollateralRaw * priceRaw) / BigInt(100000000); // cirBTC 8 decimals -> USDC 6 decimals
    const valNum = Number(valueBaseUnits) / 1e6;
    collateralValueStr = `$${valNum.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  return {
    poolLiquidity: poolLiquidityStr,
    poolLiquidityRaw,
    totalOutstandingDebt: totalDebtStr,
    totalOutstandingDebtRaw: totalDebtRaw,
    isPaused,
    collateralPrice: priceStr,
    collateralPriceRaw: priceRaw,
    userCollateral: userCollateralStr,
    userCollateralRaw,
    userDebt: userDebtStr,
    userDebtRaw,
    userMaxBorrow: userMaxBorrowStr,
    userMaxBorrowRaw: maxBorrowRaw,
    userAvailableCollateral: userAvailableCollateralStr,
    userAvailableCollateralRaw: availableCollateralRaw,
    userHealthFactor: hfStr,
    userHealthFactorBps: hfBps,
    userCollateralValueUsdc: collateralValueStr,
    ownerAddress: ownerAddress || null,
    isContractOwner,
    userUsdcBalance: userUsdcBalanceStr,
    userUsdcBalanceRaw,
    userUsdcAllowance: userUsdcAllowanceStr,
    userUsdcAllowanceRaw,
  };
}

export function useLendingData(userAddress?: Address, isArcTestnet?: boolean) {
  const [lendingData, setLendingData] = useState<LendingOnChainData>(DEFAULT_LENDING_DATA);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refreshLendingData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchLendingOnChainData(userAddress, isArcTestnet, true);
      setLendingData(data);
    } catch (err: unknown) {
      console.error("Error refreshing lending on-chain data:", err);
      setError(sanitizeArcError(err));
    } finally {
      setIsLoading(false);
    }
  }, [userAddress, isArcTestnet]);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchLendingOnChainData(userAddress, isArcTestnet, false);
        if (isMounted) {
          setLendingData(data);
        }
      } catch (err: unknown) {
        if (isMounted) {
          console.error("Error loading lending on-chain data:", err);
          setError(sanitizeArcError(err));
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
    lendingData,
    isLoading,
    error,
    refreshLendingData,
  };
}
