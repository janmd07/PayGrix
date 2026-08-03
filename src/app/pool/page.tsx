"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { AlertTriangle, ExternalLink, Loader2, RefreshCw, Layers } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useArcWallet } from "@/components/wallet/use-arc-wallet";
import { usePoolData } from "@/hooks/use-pool-data";
import { TokenLogo } from "@/components/bridge/swap-form";
import { useWriteContract, usePublicClient } from "wagmi";
import { parseUnits, formatUnits, erc20Abi } from "viem";
import { cn } from "@/lib/utils";

const FACTORY_ADDRESS = "0x05c69956564c556fc303Cb74C5505D0E1e8EDF2D";
const ROUTER_ADDRESS = "0xB2A97BAABaB64B389948bebB58D639a654ABac89";
const PAIR_ADDRESS = "0xf9d04BDdA9C857C9440ac9eD6EbB9118686Ef7b2";
const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const EURC_ADDRESS = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";

const ROUTER_ABI = [
  {
    inputs: [
      { internalType: "address", name: "tokenA", type: "address" },
      { internalType: "address", name: "tokenB", type: "address" },
      { internalType: "uint256", name: "amountADesired", type: "uint256" },
      { internalType: "uint256", name: "amountBDesired", type: "uint256" },
      { internalType: "uint256", name: "amountAMin", type: "uint256" },
      { internalType: "uint256", name: "amountBMin", type: "uint256" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "deadline", type: "uint256" }
    ],
    name: "addLiquidity",
    outputs: [
      { internalType: "uint256", name: "amountA", type: "uint256" },
      { internalType: "uint256", name: "amountB", type: "uint256" },
      { internalType: "uint256", name: "liquidity", type: "uint256" }
    ],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "address", name: "tokenA", type: "address" },
      { internalType: "address", name: "tokenB", type: "address" },
      { internalType: "uint256", name: "liquidity", type: "uint256" },
      { internalType: "uint256", name: "amountAMin", type: "uint256" },
      { internalType: "uint256", name: "amountBMin", type: "uint256" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "deadline", type: "uint256" }
    ],
    name: "removeLiquidity",
    outputs: [
      { internalType: "uint256", name: "amountA", type: "uint256" },
      { internalType: "uint256", name: "amountB", type: "uint256" }
    ],
    stateMutability: "nonpayable",
    type: "function"
  }
] as const;

export default function PoolPage() {
  const { address, isConnected, isArcTestnet, switchToArcTestnetAsync } = useArcWallet();
  const { poolData, isLoading, error, refreshPoolData } = usePoolData(address, isArcTestnet);

  const publicClient = usePublicClient({ chainId: 5042002 });
  const { writeContractAsync } = useWriteContract();

  // Connected token balances derived from unified poolData hook
  const walletUsdcBalance = poolData?.walletUSDCBalance ?? "0.00";
  const walletEurcBalance = poolData?.walletEURCBalance ?? "0.00";

  const refreshUsdc = useCallback(async () => {
    await refreshPoolData();
  }, [refreshPoolData]);
  const refreshEurc = useCallback(async () => {
    await refreshPoolData();
  }, [refreshPoolData]);

  // Tab State
  const [activeTab, setActiveTab] = useState<"add" | "remove">("add");

  // Add Liquidity State
  const [usdcInput, setUsdcInput] = useState<string>("");
  const [eurcInput, setEurcInput] = useState<string>("");

  // Remove Liquidity State
  const [lpInput, setLpInput] = useState<string>("");
  const [rawLPToRemove, setRawLPToRemove] = useState<bigint>(BigInt(0));

  // Tx States
  const [txStatus, setTxStatus] = useState<"idle" | "checking" | "approving" | "signing" | "confirming" | "success" | "failed">("idle");
  const [txHash, setTxHash] = useState<string>("");
  const [txError, setTxError] = useState<string | null>(null);
  const [confirmStage, setConfirmStage] = useState<string>("");

  // Clean Inputs on Tab Switch
  useEffect(() => {
    setUsdcInput("");
    setEurcInput("");
    setLpInput("");
    setRawLPToRemove(BigInt(0));
    setTxError(null);
    setTxStatus("idle");
  }, [activeTab]);

  // Price ratio calculations
  const ratio = useMemo(() => {
    if (!poolData) return 1;
    const r0 = parseFloat(poolData.reserve0);
    const r1 = parseFloat(poolData.reserve1);
    if (r0 === 0 || r1 === 0) return 1;
    return r1 / r0;
  }, [poolData]);

  const getRatioString = () => {
    if (!poolData) return "0.00";
    return ratio.toFixed(4);
  };

  // Sync inputs for Add Liquidity
  const handleUsdcInputChange = (val: string) => {
    setUsdcInput(val);
    if (!val || isNaN(Number(val)) || parseFloat(val) <= 0) {
      setEurcInput("");
      return;
    }
    const counterpart = parseFloat(val) * ratio;
    setEurcInput(counterpart.toFixed(6));
  };

  const handleEurcInputChange = (val: string) => {
    setEurcInput(val);
    if (!val || isNaN(Number(val)) || parseFloat(val) <= 0) {
      setUsdcInput("");
      return;
    }
    const counterpart = parseFloat(val) / ratio;
    setUsdcInput(counterpart.toFixed(6));
  };

  const handleUsdcMax = () => {
    if (parseFloat(walletUsdcBalance) > 0) {
      handleUsdcInputChange(walletUsdcBalance);
    }
  };

  const handleEurcMax = () => {
    if (parseFloat(walletEurcBalance) > 0) {
      handleEurcInputChange(walletEurcBalance);
    }
  };

  // Estimates for Add Liquidity
  const addEstimates = useMemo(() => {
    if (!usdcInput || !poolData || isNaN(Number(usdcInput))) return null;
    try {
      const usdcAmountRaw = parseUnits(usdcInput, 6);
      const reserve0Raw = parseUnits(poolData.reserve0, 6);
      const totalSupplyRaw = BigInt(poolData.totalSupplyRaw);

      if (reserve0Raw === BigInt(0) || totalSupplyRaw === BigInt(0)) {
        // Initial liquidity mint
        const eurcAmountRaw = parseUnits(eurcInput, 6);
        const product = usdcAmountRaw * eurcAmountRaw;
        // Simple square root estimation for bigint
        const estimatedLPRaw = BigInt(Math.floor(Math.sqrt(Number(product)))) - BigInt(1000);
        const finalLPRaw = estimatedLPRaw > BigInt(0) ? estimatedLPRaw : BigInt(0);

        return {
          usdcAmountRaw,
          eurcAmountRaw: parseUnits(eurcInput, 6),
          estimatedLPRaw: finalLPRaw,
          minUsdcRaw: (usdcAmountRaw * BigInt(99)) / BigInt(100),
          minEurcRaw: (parseUnits(eurcInput, 6) * BigInt(99)) / BigInt(100),
        };
      }

      const estimatedLPRaw = (usdcAmountRaw * totalSupplyRaw) / reserve0Raw;
      return {
        usdcAmountRaw,
        eurcAmountRaw: (usdcAmountRaw * parseUnits(poolData.reserve1, 6)) / reserve0Raw,
        estimatedLPRaw,
        minUsdcRaw: (usdcAmountRaw * BigInt(99)) / BigInt(100),
        minEurcRaw: (((usdcAmountRaw * parseUnits(poolData.reserve1, 6)) / reserve0Raw) * BigInt(99)) / BigInt(100),
      };
    } catch {
      return null;
    }
  }, [usdcInput, eurcInput, poolData]);

  // Remove Liquidity input handlers
  const handleLpInputChange = (val: string) => {
    setLpInput(val);
    if (!val || isNaN(Number(val)) || parseFloat(val) <= 0) {
      setRawLPToRemove(BigInt(0));
      return;
    }
    try {
      const parsed = parseUnits(val, 6);
      const userLPBalanceRaw = BigInt(poolData?.userLPBalanceRaw || "0");
      if (parsed > userLPBalanceRaw) {
        setRawLPToRemove(userLPBalanceRaw);
      } else {
        setRawLPToRemove(parsed);
      }
    } catch {
      setRawLPToRemove(BigInt(0));
    }
  };

  const handlePercentSelect = (percent: number) => {
    const userLPBalanceRaw = BigInt(poolData?.userLPBalanceRaw || "0");
    if (userLPBalanceRaw === BigInt(0)) return;
    if (percent === 100) {
      setRawLPToRemove(userLPBalanceRaw);
      setLpInput(formatUnits(userLPBalanceRaw, 6));
    } else {
      const amt = (userLPBalanceRaw * BigInt(percent)) / BigInt(100);
      setRawLPToRemove(amt);
      setLpInput(formatUnits(amt, 6));
    }
  };

  // Estimates for Remove Liquidity
  const removeEstimates = useMemo(() => {
    if (!poolData || rawLPToRemove === BigInt(0)) return null;
    try {
      const reserve0Raw = parseUnits(poolData.reserve0, 6);
      const reserve1Raw = parseUnits(poolData.reserve1, 6);
      const totalSupplyRaw = BigInt(poolData.totalSupplyRaw);

      if (totalSupplyRaw === BigInt(0)) return null;

      const usdcExpectedRaw = (rawLPToRemove * reserve0Raw) / totalSupplyRaw;
      const eurcExpectedRaw = (rawLPToRemove * reserve1Raw) / totalSupplyRaw;

      return {
        usdcExpectedRaw,
        eurcExpectedRaw,
        minUsdcRaw: (usdcExpectedRaw * BigInt(99)) / BigInt(100),
        minEurcRaw: (eurcExpectedRaw * BigInt(99)) / BigInt(100),
      };
    } catch {
      return null;
    }
  }, [rawLPToRemove, poolData]);

  // Execute Add Liquidity Flow
  const handleAddLiquidity = async () => {
    if (!isConnected || !address) {
      setTxError("Wallet not connected.");
      return;
    }
    if (!isArcTestnet) {
      setTxStatus("checking");
      setConfirmStage("Switching network to Arc Testnet...");
      try {
        await switchToArcTestnetAsync();
      } catch {
        setTxError("Please switch to Arc Testnet (Chain ID 5042002).");
        setTxStatus("failed");
        return;
      }
    }

    if (!addEstimates || !publicClient) return;

    setTxError(null);
    setTxHash("");
    setTxStatus("checking");
    setConfirmStage("Checking router pair address...");

    try {
      // Pre-flight: verify Factory returns the known pair address
      const factoryPair = await publicClient.readContract({
        address: FACTORY_ADDRESS,
        abi: [
          {
            inputs: [
              { internalType: "address", name: "tokenA", type: "address" },
              { internalType: "address", name: "tokenB", type: "address" }
            ],
            name: "getPair",
            outputs: [{ internalType: "address", name: "pair", type: "address" }],
            stateMutability: "view",
            type: "function"
          }
        ],
        functionName: "getPair",
        args: [USDC_ADDRESS, EURC_ADDRESS]
      });

      if (factoryPair.toLowerCase() !== PAIR_ADDRESS.toLowerCase()) {
        throw new Error(`Factory returned incorrect pair address: ${factoryPair}. Expected: ${PAIR_ADDRESS}`);
      }

      // Step 1: Check and Approve USDC
      setTxStatus("approving");
      setConfirmStage("Checking USDC allowance...");
      const usdcAllowance = await publicClient.readContract({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, ROUTER_ADDRESS]
      });

      if (usdcAllowance < addEstimates.usdcAmountRaw) {
        setConfirmStage("Approving USDC (exact amount)...");
        const approveHash = await writeContractAsync({
          address: USDC_ADDRESS,
          abi: erc20Abi,
          functionName: "approve",
          args: [ROUTER_ADDRESS, addEstimates.usdcAmountRaw],
          chainId: 5042002
        });
        setConfirmStage("Confirming USDC approval on-chain...");
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      // Step 2: Check and Approve EURC
      setConfirmStage("Checking EURC allowance...");
      const eurcAllowance = await publicClient.readContract({
        address: EURC_ADDRESS,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, ROUTER_ADDRESS]
      });

      if (eurcAllowance < addEstimates.eurcAmountRaw) {
        setConfirmStage("Approving EURC (exact amount)...");
        const approveHash = await writeContractAsync({
          address: EURC_ADDRESS,
          abi: erc20Abi,
          functionName: "approve",
          args: [ROUTER_ADDRESS, addEstimates.eurcAmountRaw],
          chainId: 5042002
        });
        setConfirmStage("Confirming EURC approval on-chain...");
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      // Step 3: Add Liquidity Call
      setTxStatus("signing");
      setConfirmStage("Requesting signature to Add Liquidity...");
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);

      const hash = await writeContractAsync({
        address: ROUTER_ADDRESS,
        abi: ROUTER_ABI,
        functionName: "addLiquidity",
        args: [
          USDC_ADDRESS,
          EURC_ADDRESS,
          addEstimates.usdcAmountRaw,
          addEstimates.eurcAmountRaw,
          addEstimates.minUsdcRaw,
          addEstimates.minEurcRaw,
          address,
          deadline
        ],
        chainId: 5042002
      });

      setTxHash(hash);
      setTxStatus("confirming");
      setConfirmStage("Confirming transaction on-chain...");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status === "success") {
        setTxStatus("success");
        // Clear caches and refresh
        await refreshPoolData();
        await refreshUsdc();
        await refreshEurc();
        setUsdcInput("");
        setEurcInput("");
      } else {
        throw new Error("Transaction reverted on-chain.");
      }
    } catch (err: unknown) {
      console.error("Add Liquidity error:", err);
      const errMsg = err instanceof Error ? err.message : String(err);
      setTxError(errMsg.includes("User rejected") ? "Transaction rejected by wallet signature." : errMsg);
      setTxStatus("failed");
    }
  };

  // Execute Remove Liquidity Flow
  const handleRemoveLiquidity = async () => {
    if (!isConnected || !address) {
      setTxError("Wallet not connected.");
      return;
    }
    if (!isArcTestnet) {
      setTxStatus("checking");
      setConfirmStage("Switching network to Arc Testnet...");
      try {
        await switchToArcTestnetAsync();
      } catch {
        setTxError("Please switch to Arc Testnet (Chain ID 5042002).");
        setTxStatus("failed");
        return;
      }
    }

    if (rawLPToRemove === BigInt(0) || !removeEstimates || !publicClient) return;

    setTxError(null);
    setTxHash("");
    setTxStatus("checking");
    setConfirmStage("Checking LP token allowance...");

    try {
      // Step 1: Check and Approve LP token
      setTxStatus("approving");
      const lpAllowance = await publicClient.readContract({
        address: PAIR_ADDRESS,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, ROUTER_ADDRESS]
      });

      if (lpAllowance < rawLPToRemove) {
        setConfirmStage("Approving LP token (exact amount)...");
        const approveHash = await writeContractAsync({
          address: PAIR_ADDRESS,
          abi: erc20Abi,
          functionName: "approve",
          args: [ROUTER_ADDRESS, rawLPToRemove],
          chainId: 5042002
        });
        setConfirmStage("Confirming LP token approval on-chain...");
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      // Step 2: Remove Liquidity Call
      setTxStatus("signing");
      setConfirmStage("Requesting signature to Remove Liquidity...");
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);

      const hash = await writeContractAsync({
        address: ROUTER_ADDRESS,
        abi: ROUTER_ABI,
        functionName: "removeLiquidity",
        args: [
          USDC_ADDRESS,
          EURC_ADDRESS,
          rawLPToRemove,
          removeEstimates.minUsdcRaw,
          removeEstimates.minEurcRaw,
          address,
          deadline
        ],
        chainId: 5042002
      });

      setTxHash(hash);
      setTxStatus("confirming");
      setConfirmStage("Confirming transaction on-chain...");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status === "success") {
        setTxStatus("success");
        // Clear caches and refresh
        await refreshPoolData();
        await refreshUsdc();
        await refreshEurc();
        setLpInput("");
        setRawLPToRemove(BigInt(0));
      } else {
        throw new Error("Transaction reverted on-chain.");
      }
    } catch (err: unknown) {
      console.error("Remove Liquidity error:", err);
      const errMsg = err instanceof Error ? err.message : String(err);
      setTxError(errMsg.includes("User rejected") ? "Transaction rejected by wallet signature." : errMsg);
      setTxStatus("failed");
    }
  };

  // Add Liquidity validation check
  const isAddValid = useMemo(() => {
    if (!usdcInput || !eurcInput) return false;
    const usdcVal = parseFloat(usdcInput);
    const eurcVal = parseFloat(eurcInput);
    if (isNaN(usdcVal) || usdcVal <= 0) return false;
    if (isNaN(eurcVal) || eurcVal <= 0) return false;

    // Check balances
    const usdcBal = parseFloat(walletUsdcBalance);
    const eurcBal = parseFloat(walletEurcBalance);
    return usdcVal <= usdcBal && eurcVal <= eurcBal;
  }, [usdcInput, eurcInput, walletUsdcBalance, walletEurcBalance]);

  // Remove Liquidity validation check
  const isRemoveValid = useMemo(() => {
    if (rawLPToRemove === BigInt(0)) return false;
    const userLPBalanceRaw = BigInt(poolData?.userLPBalanceRaw || "0");
    return rawLPToRemove <= userLPBalanceRaw;
  }, [rawLPToRemove, poolData]);

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <PageHeader
            eyebrow="Liquidity & Pools"
            title="USDC/EURC Liquidity Pool"
            description="Inspect the on-chain reserves, total LP token supply, and your active liquidity position."
          />
          <button
            onClick={() => refreshPoolData()}
            disabled={isLoading}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-[#060f24]/50 text-slate-400 hover:text-white hover:bg-white/5 transition-all disabled:opacity-50 shrink-0 self-start sm:self-center"
          >
            <RefreshCw className={`h-4.5 w-4.5 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Loading / Error States */}
        {isLoading && !poolData && (
          <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 rounded-2xl border border-white/5 bg-[#060f24]/30 backdrop-blur-md">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-slate-400">Loading pool data from Arc Testnet...</p>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-red-400">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <div className="text-sm">
              <span className="font-semibold">RPC Fetch Error:</span> {error}
            </div>
          </div>
        )}

        {poolData && (
          <>
            {/* Pool Status Header Card */}
            <Card className="border border-white/10 bg-[#060f24]/50 backdrop-blur-md overflow-hidden">
              <div className="p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between relative">
                {/* Smoky background glow */}
                <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-purple-600/5 to-transparent pointer-events-none" />
                <div className="flex items-center gap-4 relative z-10">
                  <div className="flex -space-x-1.5">
                    <TokenLogo symbol="USDC" className="border border-[#060f24] bg-[#070f21] shadow-lg relative z-20" />
                    <TokenLogo symbol="EURC" className="border border-[#060f24] bg-[#070f21] shadow-lg relative z-10" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-white">USDC / EURC Pool</h2>
                      <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Active</Badge>
                    </div>
                    <p className="text-xs text-slate-400">Uniswap V2 Pair • 0.30% Fee Tier</p>
                  </div>
                </div>
                <div className="text-sm text-slate-400 relative z-10">
                  Chain: <span className="font-semibold text-white">Arc Testnet (5042002)</span>
                </div>
              </div>
            </Card>

            <div className="flex justify-end -mt-2">
              <a
                href="/settings#protocol-contracts"
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
              >
                View protocol contracts
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            {/* Overview Stats Grid */}
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="border border-white/5 bg-[#060f24]/30 backdrop-blur-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold text-slate-400 uppercase tracking-wider">USDC Reserves</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">{parseFloat(poolData.reserve0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</div>
                  <p className="text-xs text-slate-500 mt-1">USD Coin pegged reserve</p>
                </CardContent>
              </Card>

              <Card className="border border-white/5 bg-[#060f24]/30 backdrop-blur-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold text-slate-400 uppercase tracking-wider">EURC Reserves</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">{parseFloat(poolData.reserve1).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</div>
                  <p className="text-xs text-slate-500 mt-1">Euro Coin pegged reserve</p>
                </CardContent>
              </Card>

              <Card className="border border-white/5 bg-[#060f24]/30 backdrop-blur-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Pool Units</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">
                    {(Number(poolData.totalSupplyRaw) / 1000000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Official ERC-20: {Number(poolData.totalSupply) === 0 ? "0.00" : parseFloat(poolData.totalSupply).toFixed(12)} UNI-V2
                  </p>
                </CardContent>
              </Card>

              <Card className="border border-white/5 bg-[#060f24]/30 backdrop-blur-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Current Ratio</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">1 USDC = {getRatioString()} EURC</div>
                  <p className="text-xs text-slate-500 mt-1">On-chain pool conversion rate</p>
                </CardContent>
              </Card>
            </div>

            {/* User LP Position */}
            <Card className="border border-white/10 bg-[#060f24]/50 backdrop-blur-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white font-bold">
                  <Layers className="h-5 w-5 text-primary" />
                  My LP Position
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                {!isConnected ? (
                  <div className="rounded-xl border border-dashed border-white/10 p-6 text-center">
                    <p className="text-sm text-slate-400">Wallet disconnected.</p>
                    <p className="text-xs text-slate-500 mt-1">Please connect your wallet in the navigation header to load your pool share.</p>
                  </div>
                ) : !isArcTestnet ? (
                  <div className="rounded-xl border border-dashed border-red-500/20 bg-red-500/5 p-6 text-center">
                    <p className="text-sm text-red-400 font-semibold">Wrong Network Connected</p>
                    <p className="text-xs text-slate-400 mt-1">Switch to Arc Testnet (Chain ID 5042002) in your wallet to view your position.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {/* LP Token Details */}
                    <div className="flex flex-col gap-2 p-3 rounded-lg bg-white/5 border border-white/5">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-400">Official LP Balance (ERC-20):</span>
                        <span className="text-sm font-semibold text-white">
                          {Number(poolData.userLPBalance) === 0 ? "0.00" : parseFloat(poolData.userLPBalance).toFixed(12)} UNI-V2
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs border-t border-white/5 pt-2 mt-1">
                        <span className="text-slate-500">Normalized Pool Units (6 decimals):</span>
                        <span className="font-semibold text-slate-300">
                          {(Number(poolData.userLPBalanceRaw) / 1000000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} Units
                        </span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center p-3 rounded-lg bg-white/5 border border-white/5">
                      <span className="text-sm text-slate-400">My Pool Share:</span>
                      <span className="text-sm font-semibold text-white">{(poolData.userPoolShare * 100).toFixed(6)}%</span>
                    </div>

                    {/* Underlying tokens */}
                    <div className="mt-2 space-y-3">
                      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Underlying Tokens</h4>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="p-3 rounded-lg bg-slate-900/50 border border-white/5 flex flex-col gap-1">
                          <span className="text-[10px] text-slate-500 font-semibold uppercase">USDC Amount</span>
                          <span className="text-base font-bold text-white">
                            {parseFloat(poolData.underlyingUSDC).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                          </span>
                        </div>
                        <div className="p-3 rounded-lg bg-slate-900/50 border border-white/5 flex flex-col gap-1">
                          <span className="text-[10px] text-slate-500 font-semibold uppercase">EURC Amount</span>
                          <span className="text-base font-bold text-white">
                            {parseFloat(poolData.underlyingEURC).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Interactive Liquidity Tabs */}
                {isConnected && isArcTestnet && (
                  <div className="mt-6 pt-6 border-t border-white/5 space-y-4">
                    <div className="flex border-b border-white/5 pb-2">
                      <button
                        onClick={() => setActiveTab("add")}
                        className={cn(
                          "px-4 py-2 text-sm font-semibold border-b-2 transition-all",
                          activeTab === "add"
                            ? "border-primary text-white"
                            : "border-transparent text-slate-400 hover:text-white"
                        )}
                      >
                        Add Liquidity
                      </button>
                      <button
                        onClick={() => setActiveTab("remove")}
                        className={cn(
                          "px-4 py-2 text-sm font-semibold border-b-2 transition-all",
                          activeTab === "remove"
                            ? "border-primary text-white"
                            : "border-transparent text-slate-400 hover:text-white"
                        )}
                      >
                        Remove Liquidity
                      </button>
                    </div>

                    {/* Form Section */}
                    {activeTab === "add" ? (
                      <div className="space-y-4">
                        {/* USDC Input */}
                        <div className="space-y-2">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-400 font-semibold">USDC Amount</span>
                            <span className="text-slate-500">
                              Balance: {isLoading || !poolData ? "Loading..." : parseFloat(walletUsdcBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 }) + " USDC"}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={usdcInput}
                              onChange={(e) => handleUsdcInputChange(e.target.value)}
                              placeholder="0.00"
                              className="flex-1 bg-[#070f21] border border-white/8 rounded-xl px-4 py-2.5 text-white font-mono placeholder-slate-600 focus:outline-none focus:border-primary/50 text-sm"
                            />
                            <Button
                              onClick={handleUsdcMax}
                              variant="outline"
                              size="sm"
                              className="h-10 rounded-xl px-3 text-xs border-white/10 hover:bg-white/5 text-slate-300"
                            >
                              MAX
                            </Button>
                          </div>
                        </div>

                        {/* EURC Input */}
                        <div className="space-y-2">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-400 font-semibold">EURC Amount</span>
                            <span className="text-slate-500">
                              Balance: {isLoading || !poolData ? "Loading..." : parseFloat(walletEurcBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 }) + " EURC"}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={eurcInput}
                              onChange={(e) => handleEurcInputChange(e.target.value)}
                              placeholder="0.00"
                              className="flex-1 bg-[#070f21] border border-white/8 rounded-xl px-4 py-2.5 text-white font-mono placeholder-slate-600 focus:outline-none focus:border-primary/50 text-sm"
                            />
                            <Button
                              onClick={handleEurcMax}
                              variant="outline"
                              size="sm"
                              className="h-10 rounded-xl px-3 text-xs border-white/10 hover:bg-white/5 text-slate-300"
                            >
                              MAX
                            </Button>
                          </div>
                        </div>

                        {/* Add Preview */}
                        {addEstimates && (
                          <div className="p-3.5 rounded-xl border border-white/5 bg-white/[0.01] space-y-2 text-xs">
                            <div className="flex justify-between">
                              <span className="text-slate-400">Expected USDC:</span>
                              <span className="font-mono text-white">{formatUnits(addEstimates.usdcAmountRaw, 6)} USDC</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Expected EURC:</span>
                              <span className="font-mono text-white">{formatUnits(addEstimates.eurcAmountRaw, 6)} EURC</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Min. USDC (1% slippage):</span>
                              <span className="font-mono text-white">{formatUnits(addEstimates.minUsdcRaw, 6)} USDC</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Min. EURC (1% slippage):</span>
                              <span className="font-mono text-white">{formatUnits(addEstimates.minEurcRaw, 6)} EURC</span>
                            </div>
                            <div className="flex justify-between border-t border-white/5 pt-2 mt-1">
                              <span className="text-slate-400 font-semibold">Estimated LP Tokens:</span>
                              <div className="text-right">
                                <span className="font-mono text-white font-bold block">
                                  {formatUnits(addEstimates.estimatedLPRaw, 18)} UNI-V2
                                </span>
                                <span className="text-[10px] text-slate-500 block">
                                  ({(Number(addEstimates.estimatedLPRaw) / 1000000).toFixed(6)} Pool Units)
                                </span>
                              </div>
                            </div>
                          </div>
                        )}

                        <Button
                          disabled={!isAddValid || txStatus !== "idle"}
                          onClick={handleAddLiquidity}
                          className="w-full py-3 h-12 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary/95 transition-all"
                        >
                          Add Liquidity
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* LP Input */}
                        <div className="space-y-2">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-400 font-semibold">LP Pool Units to Remove</span>
                            <span className="text-slate-500">
                              Max: {(Number(poolData.userLPBalanceRaw) / 1000000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} Units
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={lpInput}
                              onChange={(e) => handleLpInputChange(e.target.value)}
                              placeholder="0.00"
                              className="flex-1 bg-[#070f21] border border-white/8 rounded-xl px-4 py-2.5 text-white font-mono placeholder-slate-600 focus:outline-none focus:border-primary/50 text-sm"
                            />
                            <div className="flex gap-1">
                              {([25, 50, 75, 100] as const).map((pct) => (
                                <Button
                                  key={pct}
                                  onClick={() => handlePercentSelect(pct)}
                                  variant="outline"
                                  size="sm"
                                  className="h-10 rounded-xl px-2.5 text-[10px] border-white/10 hover:bg-white/5 text-slate-300"
                                >
                                  {pct === 100 ? "MAX" : `${pct}%`}
                                </Button>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Remove Preview */}
                        {removeEstimates && (
                          <div className="p-3.5 rounded-xl border border-white/5 bg-white/[0.01] space-y-2 text-xs">
                            <div className="flex justify-between">
                              <span className="text-slate-400">Raw LP amount:</span>
                              <span className="font-mono text-white">{rawLPToRemove.toString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Est. USDC to Receive:</span>
                              <span className="font-mono text-white">{formatUnits(removeEstimates.usdcExpectedRaw, 6)} USDC</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Est. EURC to Receive:</span>
                              <span className="font-mono text-white">{formatUnits(removeEstimates.eurcExpectedRaw, 6)} EURC</span>
                            </div>
                            <div className="flex justify-between border-t border-white/5 pt-2 mt-1">
                              <span className="text-slate-400">Min. USDC (1% slippage):</span>
                              <span className="font-mono text-white font-semibold">{formatUnits(removeEstimates.minUsdcRaw, 6)} USDC</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Min. EURC (1% slippage):</span>
                              <span className="font-mono text-white font-semibold">{formatUnits(removeEstimates.minEurcRaw, 6)} EURC</span>
                            </div>
                          </div>
                        )}

                        <Button
                          disabled={!isRemoveValid || txStatus !== "idle"}
                          onClick={handleRemoveLiquidity}
                          className="w-full py-3 h-12 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary/95 transition-all"
                        >
                          Remove Liquidity
                        </Button>
                      </div>
                    )}

                    {/* Non-blocking Status Panel */}
                    {txStatus !== "idle" && (
                      <div className={cn(
                        "mt-4 p-4 rounded-xl border",
                        txStatus === "success" ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400" :
                        txStatus === "failed" ? "border-rose-500/20 bg-rose-500/5 text-rose-400" :
                        "border-white/5 bg-white/[0.02] text-slate-300"
                      )}>
                        <div className="flex items-center gap-3">
                          {txStatus !== "success" && txStatus !== "failed" && (
                            <Loader2 className="h-4.5 w-4.5 animate-spin text-primary shrink-0" />
                          )}
                          <div className="text-xs space-y-1">
                            <p className="font-semibold">{confirmStage || "Executing transaction..."}</p>
                            {txHash && (
                              <p className="font-mono text-[10px] text-slate-400 flex items-center gap-1.5">
                                Tx Hash: {txHash.slice(0, 10)}...{txHash.slice(-8)}
                                <a
                                  href={`https://testnet.arcscan.app/tx/${txHash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:text-white"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              </p>
                            )}
                            {txStatus === "success" && <p className="text-[10px] text-emerald-500">Transaction completed successfully!</p>}
                            {txStatus === "failed" && txError && <p className="text-[10px] text-rose-500">{txError}</p>}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
