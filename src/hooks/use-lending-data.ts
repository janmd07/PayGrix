"use client";

import { useState, useEffect, useCallback } from "react";
import { formatUnits, Address } from "viem";
import { safeArcReadContract, sanitizeArcError, clearArcReadCache } from "@/lib/arc-read-infra";
import { fetchTokenBalanceDeduped } from "@/lib/arc-client";

// Phase 3B/3C Deployed PayGrix Lending Contract & Testnet Simulation Oracle (Arc Testnet 5042002)
export const PAYGRIX_LENDING_ADDRESS: Address = "0x800Cd0a3b737e989F45E69f64eEeB118724522aE";
export const TESTNET_SIMULATION_ORACLE_ADDRESS: Address = "0xA17Bfb3332A83F0e247129ee9c0d1A454A332287";
export const USDC_ADDRESS: Address = "0x3600000000000000000000000000000000000000";
export const CIRBTC_ADDRESS: Address = "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF";

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
    inputs: [],
    name: "totalBadDebt",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "borrowLtvBps",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "liquidationThresholdBps",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "oracle",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "collateralToken",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "borrowToken",
    outputs: [{ internalType: "address", name: "", type: "address" }],
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
] as const;

export interface LendingOnChainData {
  poolLiquidity: string;
  poolLiquidityRaw: bigint;
  totalOutstandingDebt: string;
  totalOutstandingDebtRaw: bigint;
  totalBadDebt: string;
  totalBadDebtRaw: bigint;
  borrowLtvBps: number;
  liquidationThresholdBps: number;
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
  userHealthFactor: string; // "—" or formatted float string
  userHealthFactorBps: bigint;
  userCollateralValueUsdc: string;
  ownerAddress: Address | null;
  oracleAddress: Address;
  oracleAddressShort: string;
  contractAddress: Address;
  contractAddressShort: string;
  isContractOwner: boolean;
  userUsdcBalance: string;
  userUsdcBalanceRaw: bigint;
  userUsdcAllowance: string;
  userUsdcAllowanceRaw: bigint;
  userCirBtcBalance: string;
  userCirBtcBalanceRaw: bigint;
  userCirBtcAllowance: string;
  userCirBtcAllowanceRaw: bigint;
}

const DEFAULT_LENDING_DATA: LendingOnChainData = {
  poolLiquidity: "1.00",
  poolLiquidityRaw: BigInt(1000000),
  totalOutstandingDebt: "0.00",
  totalOutstandingDebtRaw: BigInt(0),
  totalBadDebt: "0.00",
  totalBadDebtRaw: BigInt(0),
  borrowLtvBps: 5000,
  liquidationThresholdBps: 7500,
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
  oracleAddress: TESTNET_SIMULATION_ORACLE_ADDRESS,
  oracleAddressShort: `${TESTNET_SIMULATION_ORACLE_ADDRESS.slice(0, 6)}...${TESTNET_SIMULATION_ORACLE_ADDRESS.slice(-4)}`,
  contractAddress: PAYGRIX_LENDING_ADDRESS,
  contractAddressShort: `${PAYGRIX_LENDING_ADDRESS.slice(0, 6)}...${PAYGRIX_LENDING_ADDRESS.slice(-4)}`,
  isContractOwner: false,
  userUsdcBalance: "0.00",
  userUsdcBalanceRaw: BigInt(0),
  userUsdcAllowance: "0.00",
  userUsdcAllowanceRaw: BigInt(0),
  userCirBtcBalance: "0.00",
  userCirBtcBalanceRaw: BigInt(0),
  userCirBtcAllowance: "0.00",
  userCirBtcAllowanceRaw: BigInt(0),
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

  const totalBadDebtPromise = safeArcReadContract<bigint>({
    address: PAYGRIX_LENDING_ADDRESS,
    abi: PAYGRIX_LENDING_ABI,
    functionName: "totalBadDebt",
  }, { cachePolicy: "shared", forceRefresh }).catch(() => BigInt(0));

  const ltvPromise = safeArcReadContract<bigint>({
    address: PAYGRIX_LENDING_ADDRESS,
    abi: PAYGRIX_LENDING_ABI,
    functionName: "borrowLtvBps",
  }, { cachePolicy: "static", forceRefresh }).catch(() => BigInt(5000));

  const thresholdPromise = safeArcReadContract<bigint>({
    address: PAYGRIX_LENDING_ADDRESS,
    abi: PAYGRIX_LENDING_ABI,
    functionName: "liquidationThresholdBps",
  }, { cachePolicy: "static", forceRefresh }).catch(() => BigInt(7500));

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

  const oraclePromise = safeArcReadContract<Address>({
    address: PAYGRIX_LENDING_ADDRESS,
    abi: PAYGRIX_LENDING_ABI,
    functionName: "oracle",
  }, { cachePolicy: "static", forceRefresh }).catch(() => TESTNET_SIMULATION_ORACLE_ADDRESS);

  const ownerPromise = safeArcReadContract<Address>({
    address: PAYGRIX_LENDING_ADDRESS,
    abi: PAYGRIX_LENDING_ABI,
    functionName: "owner",
  }, { cachePolicy: "static", forceRefresh }).catch(() => null);

  // 2. User-Specific Read Calls (Only if connected)
  let userPositionPromise = Promise.resolve([BigInt(0), BigInt(0)] as readonly [bigint, bigint]);
  let userMaxBorrowPromise = Promise.resolve(BigInt(0));
  let userHealthFactorPromise = Promise.resolve(BigInt(0));
  let userAvailableCollateralPromise = Promise.resolve(BigInt(0));
  let userUsdcBalancePromise = Promise.resolve(BigInt(0));
  let userUsdcAllowancePromise = Promise.resolve(BigInt(0));
  let userCirBtcBalancePromise: Promise<bigint | null> = Promise.resolve(BigInt(0));
  let userCirBtcAllowancePromise = Promise.resolve(BigInt(0));

  if (userAddress && (isArcTestnet ?? true)) {
    userPositionPromise = safeArcReadContract<readonly [bigint, bigint]>({
      address: PAYGRIX_LENDING_ADDRESS,
      abi: PAYGRIX_LENDING_ABI,
      functionName: "getPosition",
      args: [userAddress],
      account: userAddress,
    }, { cachePolicy: "wallet", forceRefresh }).catch(() => [BigInt(0), BigInt(0)] as readonly [bigint, bigint]);

    userMaxBorrowPromise = safeArcReadContract<bigint>({
      address: PAYGRIX_LENDING_ADDRESS,
      abi: PAYGRIX_LENDING_ABI,
      functionName: "maxBorrow",
      args: [userAddress],
      account: userAddress,
    }, { cachePolicy: "wallet", forceRefresh }).catch(() => BigInt(0));

    userHealthFactorPromise = safeArcReadContract<bigint>({
      address: PAYGRIX_LENDING_ADDRESS,
      abi: PAYGRIX_LENDING_ABI,
      functionName: "healthFactor",
      args: [userAddress],
      account: userAddress,
    }, { cachePolicy: "wallet", forceRefresh }).catch(() => BigInt(0));

    userAvailableCollateralPromise = safeArcReadContract<bigint>({
      address: PAYGRIX_LENDING_ADDRESS,
      abi: PAYGRIX_LENDING_ABI,
      functionName: "availableCollateral",
      args: [userAddress],
      account: userAddress,
    }, { cachePolicy: "wallet", forceRefresh }).catch(() => BigInt(0));

    userUsdcBalancePromise = safeArcReadContract<bigint>({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: "balanceOf",
      args: [userAddress],
      account: userAddress,
    }, { cachePolicy: "wallet", forceRefresh })
      .catch(async () => await fetchTokenBalanceDeduped(USDC_ADDRESS, userAddress))
      .catch(() => BigInt(0));

    userUsdcAllowancePromise = safeArcReadContract<bigint>({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: "allowance",
      args: [userAddress, PAYGRIX_LENDING_ADDRESS],
      account: userAddress,
    }, { cachePolicy: "wallet", forceRefresh }).catch(() => BigInt(0));

    userCirBtcBalancePromise = safeArcReadContract<bigint>({
      address: CIRBTC_ADDRESS,
      abi: USDC_ABI,
      functionName: "balanceOf",
      args: [userAddress],
      account: userAddress,
    }, { cachePolicy: "wallet", forceRefresh })
      .catch(async () => await fetchTokenBalanceDeduped(CIRBTC_ADDRESS, userAddress))
      .catch(() => null);

    userCirBtcAllowancePromise = safeArcReadContract<bigint>({
      address: CIRBTC_ADDRESS,
      abi: USDC_ABI,
      functionName: "allowance",
      args: [userAddress, PAYGRIX_LENDING_ADDRESS],
      account: userAddress,
    }, { cachePolicy: "wallet", forceRefresh }).catch(() => BigInt(0));
  }

  const [
    poolLiquidityRaw,
    totalDebtRaw,
    totalBadDebtRaw,
    borrowLtvBpsRaw,
    liquidationThresholdBpsRaw,
    isPaused,
    priceRaw,
    oracleAddr,
    ownerAddress,
    userPosition,
    maxBorrowRaw,
    hfBps,
    availableCollateralRaw,
    userUsdcBalanceRaw,
    userUsdcAllowanceRaw,
    userCirBtcBalanceRaw,
    userCirBtcAllowanceRaw,
  ] = await Promise.all([
    poolLiquidityPromise,
    totalDebtPromise,
    totalBadDebtPromise,
    ltvPromise,
    thresholdPromise,
    pausedPromise,
    pricePromise,
    oraclePromise,
    ownerPromise,
    userPositionPromise,
    userMaxBorrowPromise,
    userHealthFactorPromise,
    userAvailableCollateralPromise,
    userUsdcBalancePromise,
    userUsdcAllowancePromise,
    userCirBtcBalancePromise,
    userCirBtcAllowancePromise,
  ]);

  const [userCollateralRaw, userDebtRaw] = userPosition;

  // Format Global Values
  const poolLiquidityStr = formatUnits(poolLiquidityRaw, 6);
  const totalDebtStr = formatUnits(totalDebtRaw, 6);
  const totalBadDebtStr = formatUnits(totalBadDebtRaw, 6);
  const priceNum = Number(priceRaw) / 1e6;
  const priceStr = priceNum.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Format User Values
  const userCollateralStr = formatUnits(userCollateralRaw, 8);
  const userDebtStr = formatUnits(userDebtRaw, 6);
  const userMaxBorrowStr = formatUnits(maxBorrowRaw, 6);
  const userAvailableCollateralStr = formatUnits(availableCollateralRaw, 8);
  const userUsdcBalanceStr = formatUnits(userUsdcBalanceRaw, 6);
  const userUsdcAllowanceStr = formatUnits(userUsdcAllowanceRaw, 6);

  let userCirBtcBalanceStr = "0.00";
  let safeUserCirBtcBalanceRaw = BigInt(0);
  if (userCirBtcBalanceRaw !== null) {
    safeUserCirBtcBalanceRaw = userCirBtcBalanceRaw;
    if (userCirBtcBalanceRaw === BigInt(0)) {
      userCirBtcBalanceStr = "0.00";
    } else {
      userCirBtcBalanceStr = formatUnits(userCirBtcBalanceRaw, 8);
    }
  } else {
    userCirBtcBalanceStr = "Unable to load";
  }

  const userCirBtcAllowanceStr = formatUnits(userCirBtcAllowanceRaw, 8);

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

  const actualOracleAddr = oracleAddr || TESTNET_SIMULATION_ORACLE_ADDRESS;

  return {
    poolLiquidity: poolLiquidityStr,
    poolLiquidityRaw,
    totalOutstandingDebt: totalDebtStr,
    totalOutstandingDebtRaw: totalDebtRaw,
    totalBadDebt: totalBadDebtStr,
    totalBadDebtRaw,
    borrowLtvBps: Number(borrowLtvBpsRaw),
    liquidationThresholdBps: Number(liquidationThresholdBpsRaw),
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
    oracleAddress: actualOracleAddr,
    oracleAddressShort: `${actualOracleAddr.slice(0, 6)}...${actualOracleAddr.slice(-4)}`,
    contractAddress: PAYGRIX_LENDING_ADDRESS,
    contractAddressShort: `${PAYGRIX_LENDING_ADDRESS.slice(0, 6)}...${PAYGRIX_LENDING_ADDRESS.slice(-4)}`,
    isContractOwner,
    userUsdcBalance: userUsdcBalanceStr,
    userUsdcBalanceRaw,
    userUsdcAllowance: userUsdcAllowanceStr,
    userUsdcAllowanceRaw,
    userCirBtcBalance: userCirBtcBalanceStr,
    userCirBtcBalanceRaw: safeUserCirBtcBalanceRaw,
    userCirBtcAllowance: userCirBtcAllowanceStr,
    userCirBtcAllowanceRaw,
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
      clearArcReadCache();
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

    if (!userAddress) {
      setLendingData(DEFAULT_LENDING_DATA);
      setIsLoading(false);
      return;
    }

    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        clearArcReadCache(userAddress);
        const data = await fetchLendingOnChainData(userAddress, isArcTestnet, true);
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
