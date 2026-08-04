"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { AlertTriangle, ExternalLink, Loader2, RefreshCw, Layers, Plus, HelpCircle, Clock } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useArcWallet } from "@/components/wallet/use-arc-wallet";
import { usePoolData } from "@/hooks/use-pool-data";
import { TokenLogo } from "@/components/bridge/swap-form";
import { useWriteContract } from "wagmi";
import { arcPublicClient } from "@/lib/arc-client";
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

  const publicClient = arcPublicClient;
  const { writeContractAsync } = useWriteContract();

  // Helper to read contracts with automatic retry on rate limiting
  const safeReadContract = useCallback(async <T,>(
    args: Parameters<typeof publicClient.readContract>[0]
  ): Promise<T> => {
    const maxRetries = 1;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          // Add spacing between retries
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
        return await publicClient.readContract(args) as T;
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const is429 = errMsg.includes("429") || 
                      errMsg.toLowerCase().includes("request limit reached") || 
                      errMsg.toLowerCase().includes("rate limit") ||
                      errMsg.toLowerCase().includes("busy");
        
        if (is429 && attempt < maxRetries) {
          continue;
        }
        throw err;
      }
    }
    throw new Error("Arc Testnet RPC is temporarily busy. Please try again shortly.");
  }, [publicClient]);

  // Clean error message to hide raw RPC endpoints or stack traces from users
  const sanitizeErrorMessage = useCallback((err: unknown): string => {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes("User rejected") || errMsg.toLowerCase().includes("user rejected")) {
      return "Transaction rejected by wallet signature.";
    }
    if (errMsg.toLowerCase().includes("request limit reached") || errMsg.toLowerCase().includes("429") || errMsg.toLowerCase().includes("busy") || errMsg.toLowerCase().includes("rate limit")) {
      return "Arc Testnet RPC is temporarily busy. Please try again shortly.";
    }
    // Truncate nested stack trace/RPC details commonly returned by viem
    if (errMsg.includes("ContractFunctionExecutionError") || errMsg.includes("CallExecutionError") || errMsg.includes("RPC Request failed")) {
      const firstLine = errMsg.split("\n")[0];
      return firstLine.replace(/ContractCallExecutionError: /, "").replace(/ContractFunctionExecutionError: /, "").trim();
    }
    return errMsg;
  }, []);

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
      const factoryPair = await safeReadContract<`0x${string}`>({
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
      const usdcAllowance = await safeReadContract<bigint>({
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
      const eurcAllowance = await safeReadContract<bigint>({
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
      setTxError(sanitizeErrorMessage(err));
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
      const lpAllowance = await safeReadContract<bigint>({
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
      setTxError(sanitizeErrorMessage(err));
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
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            {/* Left: Main Interaction Card */}
            <div className="space-y-6">
              <Card className="border border-white/10 bg-[#060f24]/60 backdrop-blur-lg relative overflow-hidden shadow-[0_8px_32px_rgba(6,15,36,0.5)]">
                {/* Elegant top gradient accent line */}
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#4f8cff] via-[#9d4edd] to-[#7b2cbf]" />

                <CardHeader className="pb-4">
                  <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                    <Layers className="h-5 w-5 text-purple-400 animate-pulse" />
                    Manage Liquidity
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-400">
                    Add or remove USDC/EURC liquidity on Arc Testnet.
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Tab Switcher */}
                  <div className="flex rounded-xl bg-[#070e1c]/80 p-1 border border-white/5 mb-6">
                    <button
                      onClick={() => setActiveTab("add")}
                      className={cn(
                        "flex-1 py-2 text-xs font-bold rounded-lg transition-all duration-200",
                        activeTab === "add"
                          ? "bg-purple-600 text-white shadow-lg shadow-purple-600/20"
                          : "text-slate-400 hover:text-white hover:bg-white/5"
                      )}
                    >
                      Add Liquidity
                    </button>
                    <button
                      onClick={() => setActiveTab("remove")}
                      className={cn(
                        "flex-1 py-2 text-xs font-bold rounded-lg transition-all duration-200",
                        activeTab === "remove"
                          ? "bg-purple-600 text-white shadow-lg shadow-purple-600/20"
                          : "text-slate-400 hover:text-white hover:bg-white/5"
                      )}
                    >
                      Remove Liquidity
                    </button>
                  </div>

                  {activeTab === "add" ? (
                    <div className="space-y-4">
                      {/* USDC Input Panel */}
                      <div className="bg-[#070e1c] border border-white/5 rounded-2xl p-5 space-y-3.5 transition-all duration-200 focus-within:border-purple-500/30">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">DEPOSIT</span>
                          <div className="flex items-center gap-2 text-slate-500 font-mono">
                            <span>Balance: {parseFloat(walletUsdcBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</span>
                            <button
                              onClick={handleUsdcMax}
                              className="rounded-md bg-[#000000] border border-white/10 hover:bg-white/5 px-2.5 py-1 text-[10px] font-bold text-white transition-all disabled:opacity-40"
                            >
                              MAX
                            </button>
                          </div>
                        </div>

                        <div className="flex justify-between items-center gap-4 pt-1">
                          <div className="flex-1 min-w-0">
                            <input
                              type="text"
                              value={usdcInput}
                              onChange={(e) => handleUsdcInputChange(e.target.value)}
                              placeholder="0.00"
                              className="w-full bg-transparent text-4xl font-bold text-white placeholder-slate-700 focus:outline-none transition-all font-mono"
                            />
                          </div>

                          <div className="shrink-0">
                            <div className="flex items-center bg-[#070f21] border border-white/8 rounded-full pl-2.5 pr-4 py-2 text-white select-none">
                              <TokenLogo symbol="USDC" />
                              <span className="font-bold text-sm tracking-wider ml-2">USDC</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Middle Icon */}
                      <div className="flex justify-center -my-4.5 relative z-10">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#070e1c] border border-white/10 text-slate-400 hover:text-white hover:border-purple-500/50 hover:shadow-[0_0_10px_rgba(157,78,221,0.4)] transition-all duration-200">
                          <Plus className="h-3.5 w-3.5 text-purple-400" />
                        </div>
                      </div>

                      {/* EURC Input Panel */}
                      <div className="bg-[#070e1c] border border-white/5 rounded-2xl p-5 space-y-3.5 transition-all duration-200 focus-within:border-purple-500/30">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">DEPOSIT</span>
                          <div className="flex items-center gap-2 text-slate-500 font-mono">
                            <span>Balance: {parseFloat(walletEurcBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</span>
                            <button
                              onClick={handleEurcMax}
                              className="rounded-md bg-[#000000] border border-white/10 hover:bg-white/5 px-2.5 py-1 text-[10px] font-bold text-white transition-all disabled:opacity-40"
                            >
                              MAX
                            </button>
                          </div>
                        </div>

                        <div className="flex justify-between items-center gap-4 pt-1">
                          <div className="flex-1 min-w-0">
                            <input
                              type="text"
                              value={eurcInput}
                              onChange={(e) => handleEurcInputChange(e.target.value)}
                              placeholder="0.00"
                              className="w-full bg-transparent text-4xl font-bold text-white placeholder-slate-700 focus:outline-none transition-all font-mono"
                            />
                          </div>

                          <div className="shrink-0">
                            <div className="flex items-center bg-[#070f21] border border-white/8 rounded-full pl-2.5 pr-4 py-2 text-white select-none">
                              <TokenLogo symbol="EURC" />
                              <span className="font-bold text-sm tracking-wider ml-2">EURC</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Add Preview / Quote Details */}
                      {addEstimates && (
                        <div className="rounded-2xl border border-white/5 bg-[#070e1c] p-4.5 space-y-2 text-xs">
                          <div className="flex justify-between items-center border-b border-white/5 pb-2">
                            <span className="font-semibold text-slate-300">Quote Details</span>
                            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              Live Quote
                            </span>
                          </div>

                          <div className="space-y-1.5 pt-1">
                            <div className="flex justify-between items-center">
                              <span className="text-slate-400">Pool Ratio</span>
                              <span className="text-white font-mono font-medium">1 USDC ≈ {getRatioString()} EURC</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-slate-400">Expected USDC</span>
                              <span className="text-white font-mono font-medium">{formatUnits(addEstimates.usdcAmountRaw, 6)} USDC</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-slate-400">Expected EURC</span>
                              <span className="text-white font-mono font-medium">{formatUnits(addEstimates.eurcAmountRaw, 6)} EURC</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-slate-400">Minimum USDC</span>
                              <span className="text-white font-mono font-medium">{formatUnits(addEstimates.minUsdcRaw, 6)} USDC</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-slate-400">Minimum EURC</span>
                              <span className="text-white font-mono font-medium">{formatUnits(addEstimates.minEurcRaw, 6)} EURC</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-slate-400">Estimated LP Units</span>
                              <div className="text-right">
                                <span className="font-mono text-white font-bold block">
                                  {(Number(addEstimates.estimatedLPRaw) / 1000000).toFixed(6)} Units
                                </span>
                                <span className="text-[10px] text-slate-500 block font-mono">
                                  ({formatUnits(addEstimates.estimatedLPRaw, 18)} UNI-V2)
                                </span>
                              </div>
                            </div>

                            <div className="pt-1.5 border-t border-white/5 text-[10px] text-slate-500 flex items-center gap-1">
                              <Clock className="h-3 w-3 text-purple-400 shrink-0" />
                              <span>Slippage: 1% | Deadline: 20 minutes</span>
                            </div>
                          </div>
                        </div>
                      )}

                      <Button
                        disabled={!isAddValid || txStatus !== "idle"}
                        onClick={handleAddLiquidity}
                        className={cn(
                          "w-full text-sm font-bold py-3.5 h-12 rounded-xl transition-all duration-300 active:scale-[0.98]",
                          "bg-gradient-to-r from-[#4f8cff] via-[#9d4edd] to-[#7b2cbf] hover:from-[#3b7cff] hover:via-[#8c3ed9] hover:to-[#6a1cb0]",
                          "text-white shadow-[0_4px_14px_rgba(157,78,221,0.3)] hover:shadow-[0_4px_20px_rgba(157,78,221,0.5)]",
                          (!isAddValid || txStatus !== "idle") && "opacity-50 cursor-not-allowed hover:shadow-none hover:from-[#4f8cff] hover:via-[#9d4edd] hover:to-[#7b2cbf]"
                        )}
                      >
                        Add Liquidity
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* LP Input Panel */}
                      <div className="bg-[#070e1c] border border-white/5 rounded-2xl p-5 space-y-3.5 transition-all duration-200 focus-within:border-purple-500/30">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">LP Pool Units to Remove</span>
                          <div className="flex items-center gap-2 text-slate-500 font-mono">
                            <span>Max: {(Number(poolData.userLPBalanceRaw) / 1000000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} Units</span>
                          </div>
                        </div>

                        <div className="flex justify-between items-center gap-4 pt-1">
                          <div className="flex-1 min-w-0">
                            <input
                              type="text"
                              value={lpInput}
                              onChange={(e) => handleLpInputChange(e.target.value)}
                              placeholder="0.00"
                              className="w-full bg-transparent text-4xl font-bold text-white placeholder-slate-700 focus:outline-none transition-all font-mono"
                            />
                          </div>

                          <div className="shrink-0 flex gap-1">
                            {([25, 50, 75, 100] as const).map((pct) => (
                              <button
                                key={pct}
                                onClick={() => handlePercentSelect(pct)}
                                className="rounded-md bg-[#000000] border border-white/10 hover:bg-white/5 px-2.5 py-1 text-[10px] font-bold text-white transition-all disabled:opacity-40"
                              >
                                {pct === 100 ? "MAX" : `${pct}%`}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Receive Preview Cards */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-[#070e1c] border border-white/5 rounded-xl p-3 flex flex-col gap-1">
                          <span className="text-[10px] text-slate-500 font-semibold uppercase">USDC to Receive</span>
                          <span className="text-sm font-bold text-white font-mono">
                            {removeEstimates 
                              ? parseFloat(formatUnits(removeEstimates.usdcExpectedRaw, 6)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })
                              : "0.00"}{" "}
                            USDC
                          </span>
                        </div>
                        <div className="bg-[#070e1c] border border-white/5 rounded-xl p-3 flex flex-col gap-1">
                          <span className="text-[10px] text-slate-500 font-semibold uppercase">EURC to Receive</span>
                          <span className="text-sm font-bold text-white font-mono">
                            {removeEstimates 
                              ? parseFloat(formatUnits(removeEstimates.eurcExpectedRaw, 6)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })
                              : "0.00"}{" "}
                            EURC
                          </span>
                        </div>
                      </div>

                      {/* Remove Preview / Quote Details */}
                      {removeEstimates && (
                        <div className="rounded-2xl border border-white/5 bg-[#070e1c] p-4.5 space-y-2 text-xs">
                          <div className="flex justify-between items-center border-b border-white/5 pb-2">
                            <span className="font-semibold text-slate-300">Quote Details</span>
                            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              Live Quote
                            </span>
                          </div>

                          <div className="space-y-1.5 pt-1">
                            <div className="flex justify-between items-center">
                              <span className="text-slate-400">Selected Pool Units</span>
                              <span className="text-white font-mono font-medium">{lpInput} Units</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-slate-400">Expected USDC</span>
                              <span className="text-white font-mono font-medium">{formatUnits(removeEstimates.usdcExpectedRaw, 6)} USDC</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-slate-400">Expected EURC</span>
                              <span className="text-white font-mono font-medium">{formatUnits(removeEstimates.eurcExpectedRaw, 6)} EURC</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-slate-400">Minimum USDC</span>
                              <span className="text-white font-mono font-medium">{formatUnits(removeEstimates.minUsdcRaw, 6)} USDC</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-slate-400">Minimum EURC</span>
                              <span className="text-white font-mono font-medium">{formatUnits(removeEstimates.minEurcRaw, 6)} EURC</span>
                            </div>

                            <div className="pt-1.5 border-t border-white/5 text-[10px] text-slate-500 flex items-center gap-1">
                              <Clock className="h-3 w-3 text-purple-400 shrink-0" />
                              <span>Slippage: 1% | Deadline: 20 minutes</span>
                            </div>
                          </div>
                        </div>
                      )}

                      <Button
                        disabled={!isRemoveValid || txStatus !== "idle"}
                        onClick={handleRemoveLiquidity}
                        className={cn(
                          "w-full text-sm font-bold py-3.5 h-12 rounded-xl transition-all duration-300 active:scale-[0.98]",
                          "bg-gradient-to-r from-[#4f8cff] via-[#9d4edd] to-[#7b2cbf] hover:from-[#3b7cff] hover:via-[#8c3ed9] hover:to-[#6a1cb0]",
                          "text-white shadow-[0_4px_14px_rgba(157,78,221,0.3)] hover:shadow-[0_4px_20px_rgba(157,78,221,0.5)]",
                          (!isRemoveValid || txStatus !== "idle") && "opacity-50 cursor-not-allowed hover:shadow-none hover:from-[#4f8cff] hover:via-[#9d4edd] hover:to-[#7b2cbf]"
                        )}
                      >
                        Remove Liquidity
                      </Button>
                    </div>
                  )}

                  {/* Dynamic Status panel (below action buttons) */}
                  {txStatus !== "idle" && (
                    <div className="border-t border-white/5 pt-3.5 mt-2 space-y-2.5">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
                        <span>Transaction Status</span>
                        {txStatus === "failed" && (
                          <span className="text-[10px] font-medium text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">Failed</span>
                        )}
                        {txStatus === "success" && (
                          <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">Success</span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 bg-[#070e1c] border border-white/5 rounded-xl p-3 text-slate-300">
                        {txStatus !== "success" && txStatus !== "failed" && (
                          <Loader2 className="h-4 w-4 animate-spin text-purple-400 shrink-0" />
                        )}
                        <div className="text-xs space-y-1">
                          <p className="font-semibold text-white">{confirmStage || "Executing transaction..."}</p>
                          {txStatus === "success" && <p className="text-[10px] text-emerald-400 font-medium">Transaction completed successfully!</p>}
                          {txStatus === "failed" && txError && <p className="text-[10px] text-rose-400 font-medium">{txError}</p>}
                        </div>
                      </div>

                      {txHash && (
                        <div className="flex justify-between items-center text-[10px] text-slate-500 pt-2 border-t border-white/5">
                          <span>Transaction Hash</span>
                          <a
                            href={`https://testnet.arcscan.app/tx/${txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-purple-400 hover:text-white flex items-center gap-1 transition-all font-mono"
                          >
                            {txHash.slice(0, 8)}...{txHash.slice(-6)}{" "}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Collapsed link for protocol contracts */}
              <div className="flex justify-end">
                <a
                  href="/settings#protocol-contracts"
                  className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1 transition-colors"
                >
                  View protocol contracts
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>

            {/* Right: Summary details */}
            <div className="space-y-6">
              {/* Card 1: Pool Overview */}
              <Card className="border border-white/10 bg-[#060f24]/50 backdrop-blur-md relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-purple-600/5 to-transparent pointer-events-none" />
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold flex items-center justify-between text-white">
                    <span>Pool Overview</span>
                    <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Active</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">USDC Reserve:</span>
                    <span className="font-semibold text-white font-mono">
                      {parseFloat(poolData.reserve0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} USDC
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">EURC Reserve:</span>
                    <span className="font-semibold text-white font-mono">
                      {parseFloat(poolData.reserve1).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} EURC
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Total Pool Units:</span>
                    <span className="font-semibold text-white font-mono">
                      {(Number(poolData.totalSupplyRaw) / 1000000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} Units
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Current Ratio:</span>
                    <span className="font-semibold text-white font-mono">
                      1 USDC = {getRatioString()} EURC
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-2.5 border-t border-white/5">
                    <span className="text-slate-400">Network:</span>
                    <span className="font-semibold text-white">Arc Testnet (5042002)</span>
                  </div>
                </CardContent>
              </Card>

              {/* Card 2: My Position */}
              <Card className="border border-white/10 bg-[#060f24]/50 backdrop-blur-md relative overflow-hidden">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                    <Layers className="h-4 w-4 text-purple-400" />
                    My Position
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3.5 text-xs">
                  {!isConnected ? (
                    <div className="rounded-xl border border-dashed border-white/10 p-4 text-center">
                      <p className="text-slate-400">Wallet disconnected.</p>
                    </div>
                  ) : !isArcTestnet ? (
                    <div className="rounded-xl border border-dashed border-red-500/20 bg-red-500/5 p-4 text-center">
                      <p className="text-red-400 font-semibold">Wrong Network</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Pool Units:</span>
                        <span className="font-semibold text-white font-mono">
                          {(Number(poolData.userLPBalanceRaw) / 1000000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} Units
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Pool Share:</span>
                        <span className="font-semibold text-white">{(poolData.userPoolShare * 100).toFixed(6)}%</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Underlying USDC:</span>
                        <span className="font-semibold text-white font-mono">
                          {parseFloat(poolData.underlyingUSDC).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} USDC
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Underlying EURC:</span>
                        <span className="font-semibold text-white font-mono">
                          {parseFloat(poolData.underlyingEURC).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} EURC
                        </span>
                      </div>
                      <div className="pt-2 border-t border-white/5">
                        <details className="group">
                          <summary className="text-[10px] text-slate-500 hover:text-slate-300 font-semibold cursor-pointer select-none list-none flex items-center justify-between">
                            <span>Technical Details</span>
                            <span className="transition-transform group-open:rotate-180">▼</span>
                          </summary>
                          <div className="mt-2 space-y-1.5 pl-1.5 text-[10px] text-slate-400 font-mono">
                            <div className="flex justify-between">
                              <span>Official ERC-20 LP Balance:</span>
                              <span className="text-white">
                                {Number(poolData.userLPBalance) === 0 ? "0.00" : parseFloat(poolData.userLPBalance).toFixed(12)} UNI-V2
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>LP Token Address:</span>
                              <span className="text-white truncate max-w-[120px]" title={PAIR_ADDRESS}>{PAIR_ADDRESS}</span>
                            </div>
                          </div>
                        </details>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Card 3: How Liquidity Works */}
              <Card className="border border-white/10 bg-[#060f24]/50 backdrop-blur-md">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2 text-white">
                    <HelpCircle className="h-4 w-4 text-purple-400" />
                    How Liquidity Works
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3.5 text-xs text-slate-400 leading-5">
                  <div className="flex gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-purple-500 shrink-0 mt-2" />
                    <p>Deposit USDC and EURC at the current pool ratio.</p>
                  </div>
                  <div className="flex gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-purple-500 shrink-0 mt-2" />
                    <p>Receive pool units representing your share.</p>
                  </div>
                  <div className="flex gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-purple-500 shrink-0 mt-2" />
                    <p>Remove liquidity anytime to reclaim both assets.</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
