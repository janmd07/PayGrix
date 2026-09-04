"use client";

import { useState } from "react";
import Image from "next/image";
import { Layers, Lock, AlertCircle, ArrowUpRight, ArrowDownLeft, RotateCcw, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";
import { LendingOnChainData } from "@/hooks/use-lending-data";
import { clearArcReadCache } from "@/lib/arc-read-infra";
import { clearBaseBalanceCache } from "@/lib/base-client";
import { LENDING_CHAINS, SupportedLendingChain } from "@/config/lending-config";
import { useWriteContract, usePublicClient, useAccount, useSwitchChain } from "wagmi";
import { parseUnits, formatUnits } from "viem";

const LENDING_WRITE_ABI = [
  {
    inputs: [{ internalType: "uint256", name: "amount", type: "uint256" }],
    name: "depositCollateral",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "amount", type: "uint256" }],
    name: "borrow",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "amount", type: "uint256" }],
    name: "repay",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "amount", type: "uint256" }],
    name: "withdrawCollateral",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  { inputs: [], name: "ZeroAddress", type: "error" },
  { inputs: [], name: "ZeroAmount", type: "error" },
  { inputs: [], name: "InvalidRiskParameters", type: "error" },
  { inputs: [], name: "InsufficientCollateral", type: "error" },
  { inputs: [], name: "ExceedsMaxLtv", type: "error" },
  { inputs: [], name: "InsufficientPoolLiquidity", type: "error" },
  { inputs: [], name: "InsufficientDebt", type: "error" },
  { inputs: [], name: "OverRepayment", type: "error" },
  { inputs: [], name: "InsolventAdminWithdrawal", type: "error" },
  { inputs: [], name: "InvalidOraclePrice", type: "error" },
  { inputs: [], name: "OraclePriceStale", type: "error" },
  { inputs: [], name: "OraclePriceOutOfBounds", type: "error" },
  { inputs: [], name: "UnsafePosition", type: "error" },
  { inputs: [], name: "PositionNotLiquidatable", type: "error" },
  { inputs: [], name: "ExcessiveLiquidationAmount", type: "error" },
] as const;

const ERC20_WRITE_ABI = [
  {
    inputs: [
      { internalType: "address", name: "spender", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

function parseContractError(err: unknown): string {
  if (!err) return "Transaction failed. Please try again.";
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("OraclePriceStale")) return "Price oracle is temporarily stale. Please try again shortly.";
  if (msg.includes("ExceedsMaxLtv")) return "Borrow amount exceeds maximum allowed LTV (50%).";
  if (msg.includes("InsufficientPoolLiquidity")) return "Insufficient USDC pool liquidity available for borrow.";
  if (msg.includes("InsufficientCollateral")) return "Insufficient collateral deposited for withdrawal.";
  if (msg.includes("UnsafePosition")) return "Withdrawal would make position unsafe under liquidation threshold.";
  if (msg.includes("InsufficientDebt")) return "No active debt to repay.";
  if (msg.includes("OverRepayment")) return "Repayment amount exceeds active debt.";
  if (msg.includes("user rejected") || msg.includes("User rejected") || msg.includes("rejected")) return "Transaction rejected by user.";
  return "Transaction failed on-chain. Please verify parameters and try again.";
}

function LendingTokenLogo({ symbol, className }: { symbol: string; className?: string }) {
  if (symbol === "WETH" || symbol === "ETH") {
    return (
      <div className={cn("h-6 w-6 rounded-full bg-[#627EEA]/20 border border-[#627EEA]/40 flex items-center justify-center text-[#627EEA] shrink-0 font-bold text-xs select-none shadow-[0_0_8px_rgba(98,126,234,0.3)]", className)}>
        Ξ
      </div>
    );
  }
  if (symbol === "cirBTC") {
    return (
      <div className={cn("h-6 w-6 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0 font-bold text-xs select-none shadow-[0_0_8px_rgba(245,158,11,0.3)]", className)}>
        ₿
      </div>
    );
  }
  return (
    <div className={cn("h-6 w-6 rounded-full bg-[#2775CA]/20 border border-[#2775CA]/40 flex items-center justify-center text-[#2775CA] shrink-0 font-bold text-xs select-none shadow-[0_0_8px_rgba(39,117,202,0.3)]", className)}>
      $
    </div>
  );
}

function LendingChainLogo({ chain }: { chain: SupportedLendingChain }) {
  const [hasFailed, setHasFailed] = useState(false);
  const logoUrl = chain === "Arc" ? "/chains/arc.png" : "/chains/base.png";
  const alt = chain === "Arc" ? "Arc Testnet" : "Base Sepolia";

  if (hasFailed) {
    return (
      <span
        className={cn(
          "h-2 w-2 rounded-full shrink-0",
          chain === "Arc" ? "bg-purple-400" : "bg-blue-400"
        )}
      />
    );
  }

  return (
    <div className="relative flex items-center justify-center h-4 w-4 rounded-full bg-[#030712] border border-white/10 overflow-hidden shrink-0">
      <Image
        src={logoUrl}
        alt={alt}
        width={16}
        height={16}
        className="h-full w-full object-contain"
        onError={() => setHasFailed(true)}
      />
    </div>
  );
}

interface LendingWorkspaceProps {
  isConnected: boolean;
  isArcTestnet?: boolean;
  onConnectClick?: () => void;
  lendingData?: LendingOnChainData;
  isLoading?: boolean;
  refreshLendingData?: () => Promise<void>;
  selectedChain?: SupportedLendingChain;
  onChainChange?: (chain: SupportedLendingChain) => void;
}

export function LendingWorkspace({
  isConnected,
  lendingData,
  isLoading,
  refreshLendingData,
  selectedChain = "Arc",
  onChainChange,
}: LendingWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<"supply" | "borrow" | "repay" | "withdraw">("supply");
  const [supplyInput, setSupplyInput] = useState<string>("");
  const [borrowInput, setBorrowInput] = useState<string>("");
  const [repayInput, setRepayInput] = useState<string>("");
  const [withdrawInput, setWithdrawInput] = useState<string>("");

  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const { address: userAddress, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  const [isPending, setIsPending] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const currentChain = selectedChain;
  const activeChainConfig = LENDING_CHAINS[currentChain];
  const lendingAddress = activeChainConfig.lendingAddress;
  const collateralToken = activeChainConfig.collateral;
  const debtToken = activeChainConfig.debt;

  const handleTabChange = (tab: "supply" | "borrow" | "repay" | "withdraw") => {
    setActiveTab(tab);
    setActionError(null);
  };

  const handleChainChange = async (chain: SupportedLendingChain) => {
    if (onChainChange) {
      onChainChange(chain);
    }
    setSupplyInput("");
    setBorrowInput("");
    setRepayInput("");
    setWithdrawInput("");
    setActionError(null);
    setStatusMsg(null);

    const targetConfig = LENDING_CHAINS[chain];
    if (isConnected && chainId !== targetConfig.id && switchChainAsync) {
      try {
        await switchChainAsync({ chainId: targetConfig.id });
      } catch (err) {
        console.warn("User dismissed chain switch:", err);
      }
    }
  };

  const ensureCorrectNetwork = async (): Promise<boolean> => {
    if (!isConnected) return false;
    if (chainId !== activeChainConfig.id) {
      if (switchChainAsync) {
        try {
          setStatusMsg(`Switching network to ${activeChainConfig.name}...`);
          await switchChainAsync({ chainId: activeChainConfig.id });
          return true;
        } catch {
          setActionError(`Please switch your wallet network to ${activeChainConfig.name}.`);
          return false;
        }
      } else {
        setActionError(`Please switch your wallet network to ${activeChainConfig.name}.`);
        return false;
      }
    }
    return true;
  };

  const handleSupply = async () => {
    if (!supplyInput || parseFloat(supplyInput) <= 0) return;
    setActionError(null);
    try {
      setIsPending(true);
      const isNetworkOk = await ensureCorrectNetwork();
      if (!isNetworkOk) {
        setIsPending(false);
        return;
      }

      setStatusMsg(`Approving ${collateralToken.symbol}...`);
      const amountRaw = parseUnits(supplyInput, collateralToken.decimals);

      const approveHash = await writeContractAsync({
        address: collateralToken.address,
        abi: ERC20_WRITE_ABI,
        functionName: "approve",
        args: [lendingAddress, amountRaw],
      });

      if (publicClient) {
        setStatusMsg("Waiting for approval confirmation...");
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      setStatusMsg(`Depositing ${collateralToken.symbol} collateral...`);
      const depositHash = await writeContractAsync({
        address: lendingAddress,
        abi: LENDING_WRITE_ABI,
        functionName: "depositCollateral",
        args: [amountRaw],
      });

      if (publicClient) {
        setStatusMsg("Waiting for deposit confirmation...");
        await publicClient.waitForTransactionReceipt({ hash: depositHash });
      }

      setStatusMsg("Collateral supplied successfully!");
      setSupplyInput("");

      if (currentChain === "Base") {
        clearBaseBalanceCache();
      } else {
        clearArcReadCache();
      }

      if (refreshLendingData) {
        await refreshLendingData();
      }
    } catch (err: unknown) {
      console.error("Supply error:", err);
      setActionError(parseContractError(err));
    } finally {
      setIsPending(false);
    }
  };

  const handleBorrow = async () => {
    if (!borrowInput || parseFloat(borrowInput) <= 0) return;
    setActionError(null);
    try {
      setIsPending(true);
      const isNetworkOk = await ensureCorrectNetwork();
      if (!isNetworkOk) {
        setIsPending(false);
        return;
      }

      setStatusMsg("Validating borrow parameters...");
      const amountRaw = parseUnits(borrowInput, debtToken.decimals);

      // Pre-flight simulation with connected wallet address as simulation account
      if (publicClient && userAddress) {
        try {
          await publicClient.simulateContract({
            address: lendingAddress,
            abi: LENDING_WRITE_ABI,
            functionName: "borrow",
            args: [amountRaw],
            account: userAddress,
          });
        } catch (simErr: unknown) {
          console.error("Borrow pre-flight simulation error:", simErr);
          setActionError(parseContractError(simErr));
          setIsPending(false);
          return;
        }
      }

      setStatusMsg("Confirming borrow in wallet...");
      const txHash = await writeContractAsync({
        address: lendingAddress,
        abi: LENDING_WRITE_ABI,
        functionName: "borrow",
        args: [amountRaw],
      });

      if (publicClient) {
        setStatusMsg("Waiting for borrow confirmation...");
        await publicClient.waitForTransactionReceipt({ hash: txHash });
      }

      setStatusMsg("USDC borrowed successfully!");
      setBorrowInput("");

      if (currentChain === "Base") {
        clearBaseBalanceCache();
      } else {
        clearArcReadCache();
      }

      if (refreshLendingData) {
        await refreshLendingData();
      }
    } catch (err: unknown) {
      console.error("Borrow error:", err);
      setActionError(parseContractError(err));
    } finally {
      setIsPending(false);
    }
  };

  const handleRepay = async () => {
    if (!repayInput || parseFloat(repayInput) <= 0) return;
    setActionError(null);
    try {
      setIsPending(true);
      const isNetworkOk = await ensureCorrectNetwork();
      if (!isNetworkOk) {
        setIsPending(false);
        return;
      }

      setStatusMsg("Approving USDC...");
      const amountRaw = parseUnits(repayInput, debtToken.decimals);

      const approveHash = await writeContractAsync({
        address: debtToken.address,
        abi: ERC20_WRITE_ABI,
        functionName: "approve",
        args: [lendingAddress, amountRaw],
      });

      if (publicClient) {
        setStatusMsg("Waiting for approval confirmation...");
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      setStatusMsg("Repaying USDC debt...");
      const repayHash = await writeContractAsync({
        address: lendingAddress,
        abi: LENDING_WRITE_ABI,
        functionName: "repay",
        args: [amountRaw],
      });

      if (publicClient) {
        setStatusMsg("Waiting for repay confirmation...");
        await publicClient.waitForTransactionReceipt({ hash: repayHash });
      }

      setStatusMsg("USDC debt repaid successfully!");
      setRepayInput("");

      if (currentChain === "Base") {
        clearBaseBalanceCache();
      } else {
        clearArcReadCache();
      }

      if (refreshLendingData) {
        await refreshLendingData();
      }
    } catch (err: unknown) {
      console.error("Repay error:", err);
      setActionError(parseContractError(err));
    } finally {
      setIsPending(false);
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawInput || parseFloat(withdrawInput) <= 0) return;
    setActionError(null);
    try {
      setIsPending(true);
      const isNetworkOk = await ensureCorrectNetwork();
      if (!isNetworkOk) {
        setIsPending(false);
        return;
      }

      setStatusMsg("Validating withdrawal...");
      const amountRaw = parseUnits(withdrawInput, collateralToken.decimals);

      if (publicClient && userAddress) {
        try {
          await publicClient.simulateContract({
            address: lendingAddress,
            abi: LENDING_WRITE_ABI,
            functionName: "withdrawCollateral",
            args: [amountRaw],
            account: userAddress,
          });
        } catch (simErr: unknown) {
          console.error("Withdraw simulation error:", simErr);
          setActionError(parseContractError(simErr));
          setIsPending(false);
          return;
        }
      }

      setStatusMsg("Confirming withdrawal in wallet...");
      const txHash = await writeContractAsync({
        address: lendingAddress,
        abi: LENDING_WRITE_ABI,
        functionName: "withdrawCollateral",
        args: [amountRaw],
      });

      if (publicClient) {
        setStatusMsg("Waiting for withdrawal confirmation...");
        await publicClient.waitForTransactionReceipt({ hash: txHash });
      }

      setStatusMsg("Collateral withdrawn successfully!");
      setWithdrawInput("");

      if (currentChain === "Base") {
        clearBaseBalanceCache();
      } else {
        clearArcReadCache();
      }

      if (refreshLendingData) {
        await refreshLendingData();
      }
    } catch (err: unknown) {
      console.error("Withdraw error:", err);
      setActionError(parseContractError(err));
    } finally {
      setIsPending(false);
    }
  };

  const isSupplyDisabled = lendingData?.isPaused || !supplyInput || parseFloat(supplyInput) <= 0 || isPending;
  
  let isBorrowAmountValid = false;
  let borrowError: string | null = null;
  if (borrowInput && !isNaN(Number(borrowInput)) && parseFloat(borrowInput) > 0) {
    try {
      const borrowAmountRaw = parseUnits(borrowInput, debtToken.decimals);
      const maxBorrow = lendingData?.userMaxBorrowRaw ?? BigInt(0);
      const liquidity = lendingData?.poolLiquidityRaw ?? BigInt(0);

      if (borrowAmountRaw > maxBorrow) {
        borrowError = "Amount exceeds available borrowing capacity.";
      } else if (borrowAmountRaw > liquidity) {
        borrowError = "Amount exceeds available pool liquidity.";
      } else {
        isBorrowAmountValid = true;
      }
    } catch {
      borrowError = "Invalid borrowing amount format.";
    }
  }

  const isBorrowDisabled = lendingData?.isPaused || !isBorrowAmountValid || isPending;
  const isRepayDisabled = !repayInput || parseFloat(repayInput) <= 0 || (lendingData?.userDebtRaw ?? BigInt(0)) === BigInt(0) || isPending;
  const isWithdrawDisabled = lendingData?.isPaused || !withdrawInput || parseFloat(withdrawInput) <= 0 || isPending;

  return (
    <Card className="border border-white/10 bg-[#060f24]/60 backdrop-blur-lg relative overflow-hidden shadow-[0_4px_24px_rgba(6,15,36,0.4)]">
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#4f8cff] via-[#9d4edd] to-[#7b2cbf]" />

      <CardHeader className="p-3.5 sm:p-4 pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base font-bold text-white flex items-center gap-2">
            <Layers className="h-4 w-4 text-purple-400" />
            Manage your position
          </CardTitle>
          <CardDescription className="text-xs text-slate-400 mt-0.5">
            Supply collateral, borrow USDC, repay debt, or withdraw collateral on {activeChainConfig.name}.
          </CardDescription>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Chain Selector: Arc vs Base Sepolia */}
          <div className="flex items-center gap-1 p-1 bg-[#070e1c] rounded-xl border border-white/10 shrink-0">
            <button
              type="button"
              onClick={() => handleChainChange("Arc")}
              disabled={isPending}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                currentChain === "Arc"
                  ? "bg-purple-600/90 text-white shadow-[0_0_12px_rgba(168,85,247,0.4)] border border-purple-400/30"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              )}
            >
              <LendingChainLogo chain="Arc" />
              Arc
            </button>
            <button
              type="button"
              onClick={() => handleChainChange("Base")}
              disabled={isPending}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                currentChain === "Base"
                  ? "bg-[#0052FF] text-white shadow-[0_0_12px_rgba(0,82,255,0.4)] border border-blue-400/30"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              )}
            >
              <LendingChainLogo chain="Base" />
              Base Sepolia
            </button>
          </div>

          <span className="text-[10px] font-mono font-medium text-[#4f8cff] bg-[#4f8cff]/10 border border-[#4f8cff]/20 px-2 py-0.5 rounded-full shrink-0">
            {lendingData?.isPaused ? "Paused" : "Active"}
          </span>
        </div>
      </CardHeader>

      <CardContent className="p-3.5 sm:p-4 pt-1 space-y-4">
        {/* Segmented Action Tabs */}
        <div className="grid grid-cols-4 rounded-lg bg-[#070e1c]/80 p-1 border border-white/5">
          <button
            type="button"
            onClick={() => handleTabChange("supply")}
            className={cn(
              "py-2 text-xs font-bold rounded-md transition-all duration-200 flex items-center justify-center gap-1 cursor-pointer",
              activeTab === "supply"
                ? "bg-purple-600 text-white shadow-md shadow-purple-600/20"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
            Supply
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("borrow")}
            className={cn(
              "py-2 text-xs font-bold rounded-md transition-all duration-200 flex items-center justify-center gap-1 cursor-pointer",
              activeTab === "borrow"
                ? "bg-purple-600 text-white shadow-md shadow-purple-600/20"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
          >
            <ArrowDownLeft className="h-3.5 w-3.5" />
            Borrow
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("repay")}
            className={cn(
              "py-2 text-xs font-bold rounded-md transition-all duration-200 flex items-center justify-center gap-1 cursor-pointer",
              activeTab === "repay"
                ? "bg-purple-600 text-white shadow-md shadow-purple-600/20"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Repay
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("withdraw")}
            className={cn(
              "py-2 text-xs font-bold rounded-md transition-all duration-200 flex items-center justify-center gap-1 cursor-pointer",
              activeTab === "withdraw"
                ? "bg-purple-600 text-white shadow-md shadow-purple-600/20"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
          >
            <ArrowUpRight className="h-3.5 w-3.5 rotate-180" />
            Withdraw
          </button>
        </div>

        {/* ── SUPPLY TAB ──────────────────────────────────── */}
        {activeTab === "supply" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
              <span className="font-semibold text-slate-300">Supply {collateralToken.symbol} Collateral</span>
              <div className="flex items-center gap-2 font-mono text-[11px]">
                <span className="text-slate-400">
                  Wallet: <strong className="text-white">{isLoading ? "Loading..." : lendingData?.userCollateralBalance || "0.00"}</strong> {collateralToken.symbol}
                </span>
                <span className="text-slate-600">•</span>
                <span className="text-slate-400">
                  Supplied: <strong className="text-purple-300">{isLoading ? "Loading..." : lendingData?.userCollateral || "0.00"}</strong> {collateralToken.symbol}
                </span>
              </div>
            </div>

            <div className="bg-[#070e1c] border border-white/5 rounded-xl p-3.5 space-y-2 transition-all focus-within:border-purple-500/30">
              <div className="flex justify-between items-center text-[11px]">
                <span className="font-semibold text-slate-400 uppercase tracking-wider">COLLATERAL AMOUNT</span>
                <button
                  type="button"
                  onClick={() => {
                    if (lendingData?.userCollateralBalanceRaw && lendingData.userCollateralBalanceRaw > BigInt(0)) {
                      setSupplyInput(formatUnits(lendingData.userCollateralBalanceRaw, collateralToken.decimals));
                    } else if (lendingData?.userCollateralBalance && lendingData.userCollateralBalance !== "Unable to load") {
                      setSupplyInput(lendingData.userCollateralBalance);
                    }
                  }}
                  className="rounded bg-[#000000] border border-white/10 hover:bg-white/5 px-2 py-0.5 text-[10px] font-bold text-white transition-all cursor-pointer font-mono"
                >
                  MAX
                </button>
              </div>

              <div className="flex justify-between items-center gap-3">
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={supplyInput}
                    onChange={(e) => setSupplyInput(e.target.value)}
                    placeholder={`0.00 ${collateralToken.symbol}`}
                    className="w-full bg-transparent text-2xl sm:text-3xl font-bold text-white placeholder-slate-700 focus:outline-none transition-all font-mono"
                  />
                </div>

                <div className="shrink-0">
                  <div className="flex items-center bg-[#070f21] border border-white/10 rounded-full pl-2 pr-3 py-1.5 text-white select-none">
                    <LendingTokenLogo symbol={collateralToken.symbol} />
                    <span className="font-bold text-xs tracking-wider ml-1.5">{collateralToken.symbol}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Error notice */}
            {actionError && activeTab === "supply" && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-2.5 text-xs text-red-300 flex items-center gap-2 font-mono">
                <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            {/* Info notice */}
            <div className="rounded-lg border border-white/5 bg-[#070e1c] p-2.5 text-xs text-slate-400 flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 text-purple-400 shrink-0" />
              <span>
                {lendingData?.isPaused
                  ? "Contract is paused. Supply operations disabled."
                  : `Supply ${collateralToken.symbol} collateral on ${activeChainConfig.name} to increase borrowing capacity.`}
              </span>
            </div>

            {/* CTA Button */}
            {!isConnected ? (
              <ConnectWalletButton />
            ) : (
              <Button
                disabled={isSupplyDisabled}
                onClick={handleSupply}
                className={cn(
                  "w-full text-xs sm:text-sm font-bold py-2.5 h-10 rounded-lg transition-all",
                  isSupplyDisabled
                    ? "bg-purple-600/40 text-purple-200 border border-purple-500/20 cursor-not-allowed"
                    : "bg-purple-600 hover:bg-purple-500 text-white cursor-pointer shadow-md shadow-purple-600/30"
                )}
              >
                {isPending ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {statusMsg || "Processing..."}
                  </span>
                ) : lendingData?.isPaused ? (
                  "Supply Collateral (Paused)"
                ) : (
                  `Supply ${collateralToken.symbol}`
                )}
              </Button>
            )}
          </div>
        )}

        {/* ── BORROW TAB ──────────────────────────────────── */}
        {activeTab === "borrow" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300">Borrow USDC</span>
              <span className="text-[11px] font-mono font-bold text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full">
                50% Max LTV
              </span>
            </div>

            {/* Metrics preview */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-[#070e1c] border border-white/5 rounded-lg p-2.5 flex flex-col gap-0.5">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Available to borrow</span>
                <span className="text-sm font-bold text-[#4f8cff] font-mono">
                  {isLoading ? "..." : `${lendingData?.userMaxBorrow || "0.00"} USDC`}
                </span>
              </div>
              <div className="bg-[#070e1c] border border-white/5 rounded-lg p-2.5 flex flex-col gap-0.5">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Current debt</span>
                <span className="text-sm font-bold text-white font-mono">
                  {isLoading ? "..." : `${lendingData?.userDebt || "0.00"} USDC`}
                </span>
              </div>
            </div>

            <div className="bg-[#070e1c] border border-white/5 rounded-xl p-3.5 space-y-2 transition-all focus-within:border-purple-500/30">
              <div className="flex justify-between items-center text-[11px]">
                <span className="font-semibold text-slate-400 uppercase tracking-wider">BORROW AMOUNT</span>
                <button
                  type="button"
                  onClick={() => {
                    if (lendingData?.userMaxBorrowRaw && lendingData.userMaxBorrowRaw > BigInt(0)) {
                      setBorrowInput(formatUnits(lendingData.userMaxBorrowRaw, debtToken.decimals));
                    } else if (lendingData?.userMaxBorrow && lendingData.userMaxBorrow !== "Unable to load") {
                      setBorrowInput(lendingData.userMaxBorrow);
                    }
                  }}
                  className="rounded bg-[#000000] border border-white/10 hover:bg-white/5 px-2 py-0.5 text-[10px] font-bold text-white transition-all cursor-pointer font-mono"
                >
                  MAX
                </button>
              </div>

              <div className="flex justify-between items-center gap-3">
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={borrowInput}
                    onChange={(e) => setBorrowInput(e.target.value)}
                    placeholder="0.00 USDC"
                    className="w-full bg-transparent text-2xl sm:text-3xl font-bold text-white placeholder-slate-700 focus:outline-none transition-all font-mono"
                  />
                </div>

                <div className="shrink-0">
                  <div className="flex items-center bg-[#070f21] border border-white/10 rounded-full pl-2 pr-3 py-1.5 text-white select-none">
                    <LendingTokenLogo symbol="USDC" />
                    <span className="font-bold text-xs tracking-wider ml-1.5">USDC</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Validation error notice */}
            {(borrowError || (actionError && activeTab === "borrow")) && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-2.5 text-xs text-red-300 flex items-center gap-2 font-mono">
                <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                <span>{borrowError || actionError}</span>
              </div>
            )}

            {/* Liquidity notice */}
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5 text-xs text-amber-300 flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <span>
                {lendingData?.isPaused
                  ? "Contract is paused. Borrow operations disabled."
                  : `Borrow USDC against deposited ${collateralToken.symbol} collateral up to 50% LTV on ${activeChainConfig.name}.`}
              </span>
            </div>

            {/* CTA Button */}
            {!isConnected ? (
              <ConnectWalletButton />
            ) : (
              <Button
                disabled={isBorrowDisabled}
                onClick={handleBorrow}
                className={cn(
                  "w-full text-xs sm:text-sm font-bold py-2.5 h-10 rounded-lg transition-all",
                  isBorrowDisabled
                    ? "bg-slate-800/60 text-slate-500 border border-slate-700/50 cursor-not-allowed"
                    : "bg-gradient-to-r from-[#4f8cff] to-[#6d5dfc] hover:from-[#3b7cff] hover:to-[#5b4be0] text-white cursor-pointer shadow-md shadow-blue-500/30"
                )}
              >
                {isPending ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {statusMsg || "Processing..."}
                  </span>
                ) : lendingData?.isPaused ? (
                  "Borrow USDC (Paused)"
                ) : (
                  "Borrow USDC"
                )}
              </Button>
            )}
          </div>
        )}

        {/* ── REPAY TAB ───────────────────────────────────── */}
        {activeTab === "repay" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300">Repay USDC Debt</span>
              <span className="text-[11px] text-slate-400 font-mono">
                Current debt: {isLoading ? "..." : lendingData?.userDebt || "0.00"} USDC
              </span>
            </div>

            <div className="bg-[#070e1c] border border-white/5 rounded-xl p-3.5 space-y-2 transition-all focus-within:border-purple-500/30">
              <div className="flex justify-between items-center text-[11px]">
                <span className="font-semibold text-slate-400 uppercase tracking-wider">REPAY AMOUNT</span>
                <button
                  type="button"
                  onClick={() => setRepayInput(lendingData?.userDebt || "0.00")}
                  className="rounded bg-[#000000] border border-white/10 hover:bg-white/5 px-2 py-0.5 text-[10px] font-bold text-white transition-all cursor-pointer font-mono"
                >
                  MAX
                </button>
              </div>

              <div className="flex justify-between items-center gap-3">
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={repayInput}
                    onChange={(e) => setRepayInput(e.target.value)}
                    placeholder="0.00 USDC"
                    className="w-full bg-transparent text-2xl sm:text-3xl font-bold text-white placeholder-slate-700 focus:outline-none transition-all font-mono"
                  />
                </div>

                <div className="shrink-0">
                  <div className="flex items-center bg-[#070f21] border border-white/10 rounded-full pl-2 pr-3 py-1.5 text-white select-none">
                    <LendingTokenLogo symbol="USDC" />
                    <span className="font-bold text-xs tracking-wider ml-1.5">USDC</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Error notice */}
            {actionError && activeTab === "repay" && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-2.5 text-xs text-red-300 flex items-center gap-2 font-mono">
                <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            <div className="rounded-lg border border-white/5 bg-[#070e1c] p-2.5 text-xs text-slate-400 flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 text-purple-400 shrink-0" />
              <span>
                {(lendingData?.userDebtRaw ?? BigInt(0)) === BigInt(0)
                  ? "No active debt on-chain."
                  : `Repay USDC debt on ${activeChainConfig.name} to unlock deposited ${collateralToken.symbol} collateral.`}
              </span>
            </div>

            {/* CTA Button */}
            {!isConnected ? (
              <ConnectWalletButton />
            ) : (
              <Button
                disabled={isRepayDisabled}
                onClick={handleRepay}
                className={cn(
                  "w-full text-xs sm:text-sm font-bold py-2.5 h-10 rounded-lg transition-all",
                  isRepayDisabled
                    ? "bg-purple-600/40 text-purple-200 border border-purple-500/20 cursor-not-allowed"
                    : "bg-purple-600 hover:bg-purple-500 text-white cursor-pointer shadow-md shadow-purple-600/30"
                )}
              >
                {isPending ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {statusMsg || "Processing..."}
                  </span>
                ) : (lendingData?.userDebtRaw ?? BigInt(0)) === BigInt(0) ? (
                  "Repay USDC (No Active Debt)"
                ) : (
                  "Repay USDC"
                )}
              </Button>
            )}
          </div>
        )}

        {/* ── WITHDRAW TAB ────────────────────────────────── */}
        {activeTab === "withdraw" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300">Withdraw {collateralToken.symbol} Collateral</span>
              <span className="text-[11px] text-slate-400 font-mono">
                Available: {isLoading ? "..." : lendingData?.userAvailableCollateral || "0.00"} {collateralToken.symbol}
              </span>
            </div>

            <div className="bg-[#070e1c] border border-white/5 rounded-xl p-3.5 space-y-2 transition-all focus-within:border-purple-500/30">
              <div className="flex justify-between items-center text-[11px]">
                <span className="font-semibold text-slate-400 uppercase tracking-wider">WITHDRAW AMOUNT</span>
                <button
                  type="button"
                  onClick={() => setWithdrawInput(lendingData?.userAvailableCollateral || "0.00")}
                  className="rounded bg-[#000000] border border-white/10 hover:bg-white/5 px-2 py-0.5 text-[10px] font-bold text-white transition-all cursor-pointer font-mono"
                >
                  MAX
                </button>
              </div>

              <div className="flex justify-between items-center gap-3">
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={withdrawInput}
                    onChange={(e) => setWithdrawInput(e.target.value)}
                    placeholder={`0.00 ${collateralToken.symbol}`}
                    className="w-full bg-transparent text-2xl sm:text-3xl font-bold text-white placeholder-slate-700 focus:outline-none transition-all font-mono"
                  />
                </div>

                <div className="shrink-0">
                  <div className="flex items-center bg-[#070f21] border border-white/10 rounded-full pl-2 pr-3 py-1.5 text-white select-none">
                    <LendingTokenLogo symbol={collateralToken.symbol} />
                    <span className="font-bold text-xs tracking-wider ml-1.5">{collateralToken.symbol}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Error notice */}
            {actionError && activeTab === "withdraw" && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-2.5 text-xs text-red-300 flex items-center gap-2 font-mono">
                <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            <div className="rounded-lg border border-white/5 bg-[#070e1c] p-2.5 text-xs text-slate-400 flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 text-purple-400 shrink-0" />
              <span>
                {lendingData?.isPaused
                  ? "Contract is paused. Collateral withdrawal is disabled."
                  : `Withdraw available ${collateralToken.symbol} collateral back to your connected wallet on ${activeChainConfig.name}.`}
              </span>
            </div>

            {/* CTA Button */}
            {!isConnected ? (
              <ConnectWalletButton />
            ) : (
              <Button
                disabled={isWithdrawDisabled}
                onClick={handleWithdraw}
                className={cn(
                  "w-full text-xs sm:text-sm font-bold py-2.5 h-10 rounded-lg transition-all",
                  isWithdrawDisabled
                    ? "bg-purple-600/40 text-purple-200 border border-purple-500/20 cursor-not-allowed"
                    : "bg-purple-600 hover:bg-purple-500 text-white cursor-pointer shadow-md shadow-purple-600/30"
                )}
              >
                {isPending ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {statusMsg || "Processing..."}
                  </span>
                ) : lendingData?.isPaused ? (
                  "Withdraw Collateral (Paused)"
                ) : (
                  `Withdraw ${collateralToken.symbol}`
                )}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
