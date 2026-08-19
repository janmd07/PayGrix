"use client";

import { useState } from "react";
import { Layers, Lock, AlertCircle, ArrowUpRight, ArrowDownLeft, RotateCcw, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TokenLogo } from "@/components/bridge/swap-form";
import { cn } from "@/lib/utils";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";
import { LendingOnChainData, PAYGRIX_LENDING_ADDRESS, USDC_ADDRESS, CIRBTC_ADDRESS } from "@/hooks/use-lending-data";
import { useWriteContract } from "wagmi";
import { parseUnits } from "viem";

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

interface LendingWorkspaceProps {
  isConnected: boolean;
  isArcTestnet?: boolean;
  onConnectClick?: () => void;
  lendingData?: LendingOnChainData;
  isLoading?: boolean;
}

export function LendingWorkspace({ isConnected, lendingData, isLoading }: LendingWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<"supply" | "borrow" | "repay" | "withdraw">("supply");
  const [supplyInput, setSupplyInput] = useState<string>("");
  const [borrowInput, setBorrowInput] = useState<string>("");
  const [repayInput, setRepayInput] = useState<string>("");
  const [withdrawInput, setWithdrawInput] = useState<string>("");

  const { writeContractAsync } = useWriteContract();
  const [isPending, setIsPending] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const handleSupply = async () => {
    if (!supplyInput || parseFloat(supplyInput) <= 0) return;
    try {
      setIsPending(true);
      setStatusMsg("Approving cirBTC...");
      const amountRaw = parseUnits(supplyInput, 8);

      await writeContractAsync({
        address: CIRBTC_ADDRESS,
        abi: ERC20_WRITE_ABI,
        functionName: "approve",
        args: [PAYGRIX_LENDING_ADDRESS, amountRaw],
      });

      setStatusMsg("Depositing cirBTC collateral...");
      await writeContractAsync({
        address: PAYGRIX_LENDING_ADDRESS,
        abi: LENDING_WRITE_ABI,
        functionName: "depositCollateral",
        args: [amountRaw],
      });

      setStatusMsg("Collateral supplied successfully!");
      setSupplyInput("");
    } catch (err: unknown) {
      console.error("Supply error:", err);
    } finally {
      setIsPending(false);
    }
  };

  const handleBorrow = async () => {
    if (!borrowInput || parseFloat(borrowInput) <= 0) return;
    try {
      setIsPending(true);
      setStatusMsg("Borrowing USDC...");
      const amountRaw = parseUnits(borrowInput, 6);

      await writeContractAsync({
        address: PAYGRIX_LENDING_ADDRESS,
        abi: LENDING_WRITE_ABI,
        functionName: "borrow",
        args: [amountRaw],
      });

      setStatusMsg("USDC borrowed successfully!");
      setBorrowInput("");
    } catch (err: unknown) {
      console.error("Borrow error:", err);
    } finally {
      setIsPending(false);
    }
  };

  const handleRepay = async () => {
    if (!repayInput || parseFloat(repayInput) <= 0) return;
    try {
      setIsPending(true);
      setStatusMsg("Approving USDC...");
      const amountRaw = parseUnits(repayInput, 6);

      await writeContractAsync({
        address: USDC_ADDRESS,
        abi: ERC20_WRITE_ABI,
        functionName: "approve",
        args: [PAYGRIX_LENDING_ADDRESS, amountRaw],
      });

      setStatusMsg("Repaying USDC debt...");
      await writeContractAsync({
        address: PAYGRIX_LENDING_ADDRESS,
        abi: LENDING_WRITE_ABI,
        functionName: "repay",
        args: [amountRaw],
      });

      setStatusMsg("USDC debt repaid successfully!");
      setRepayInput("");
    } catch (err: unknown) {
      console.error("Repay error:", err);
    } finally {
      setIsPending(false);
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawInput || parseFloat(withdrawInput) <= 0) return;
    try {
      setIsPending(true);
      setStatusMsg("Withdrawing cirBTC collateral...");
      const amountRaw = parseUnits(withdrawInput, 8);

      await writeContractAsync({
        address: PAYGRIX_LENDING_ADDRESS,
        abi: LENDING_WRITE_ABI,
        functionName: "withdrawCollateral",
        args: [amountRaw],
      });

      setStatusMsg("Collateral withdrawn successfully!");
      setWithdrawInput("");
    } catch (err: unknown) {
      console.error("Withdraw error:", err);
    } finally {
      setIsPending(false);
    }
  };

  const isSupplyDisabled = lendingData?.isPaused || !supplyInput || parseFloat(supplyInput) <= 0 || isPending;
  const isBorrowDisabled = lendingData?.isPaused || !borrowInput || parseFloat(borrowInput) <= 0 || isPending;
  const isRepayDisabled = !repayInput || parseFloat(repayInput) <= 0 || (lendingData?.userDebtRaw ?? BigInt(0)) === BigInt(0) || isPending;
  const isWithdrawDisabled = lendingData?.isPaused || !withdrawInput || parseFloat(withdrawInput) <= 0 || isPending;

  return (
    <Card className="border border-white/10 bg-[#060f24]/60 backdrop-blur-lg relative overflow-hidden shadow-[0_8px_32px_rgba(6,15,36,0.5)]">
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#4f8cff] via-[#9d4edd] to-[#7b2cbf]" />

      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
            <Layers className="h-5 w-5 text-purple-400" />
            Manage your position
          </CardTitle>
          <span className="text-[11px] font-mono font-medium text-[#4f8cff] bg-[#4f8cff]/10 border border-[#4f8cff]/20 px-2.5 py-1 rounded-full">
            {lendingData?.isPaused ? "Arc Testnet Paused" : "Arc Testnet Active"}
          </span>
        </div>
        <CardDescription className="text-xs text-slate-400">
          Supply collateral, borrow USDC, repay debt, and manage your position on PayGrixLending.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Segmented Action Tabs */}
        <div className="grid grid-cols-4 rounded-xl bg-[#070e1c]/80 p-1 border border-white/5">
          <button
            type="button"
            onClick={() => setActiveTab("supply")}
            className={cn(
              "py-2.5 text-xs font-bold rounded-lg transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer",
              activeTab === "supply"
                ? "bg-purple-600 text-white shadow-lg shadow-purple-600/20"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
            Supply
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("borrow")}
            className={cn(
              "py-2.5 text-xs font-bold rounded-lg transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer",
              activeTab === "borrow"
                ? "bg-purple-600 text-white shadow-lg shadow-purple-600/20"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
          >
            <ArrowDownLeft className="h-3.5 w-3.5" />
            Borrow
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("repay")}
            className={cn(
              "py-2.5 text-xs font-bold rounded-lg transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer",
              activeTab === "repay"
                ? "bg-purple-600 text-white shadow-lg shadow-purple-600/20"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Repay
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("withdraw")}
            className={cn(
              "py-2.5 text-xs font-bold rounded-lg transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer",
              activeTab === "withdraw"
                ? "bg-purple-600 text-white shadow-lg shadow-purple-600/20"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
          >
            <ArrowUpRight className="h-3.5 w-3.5 rotate-180" />
            Withdraw
          </button>
        </div>

        {/* ── SUPPLY TAB ──────────────────────────────────── */}
        {activeTab === "supply" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Supply collateral</h3>
              <span className="text-xs text-slate-400 font-mono">
                Supplied: {isLoading ? "..." : lendingData?.userCollateral || "0.00"} cirBTC
              </span>
            </div>

            <div className="bg-[#070e1c] border border-white/5 rounded-2xl p-5 space-y-3.5 transition-all focus-within:border-purple-500/30">
              <div className="flex justify-between items-center text-xs">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">COLLATERAL AMOUNT</span>
                <div className="flex items-center gap-2 text-slate-400 font-mono">
                  <span>Supplied: {isLoading ? "..." : lendingData?.userCollateral || "0.00"} cirBTC</span>
                  <button
                    type="button"
                    onClick={() => setSupplyInput("0.001")}
                    className="rounded-md bg-[#000000] border border-white/10 hover:bg-white/5 px-2.5 py-1 text-[10px] font-bold text-white transition-all cursor-pointer"
                  >
                    TEST (0.001)
                  </button>
                </div>
              </div>

              <div className="flex justify-between items-center gap-4 pt-1">
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={supplyInput}
                    onChange={(e) => setSupplyInput(e.target.value)}
                    placeholder="0.00 cirBTC"
                    className="w-full bg-transparent text-3xl sm:text-4xl font-bold text-white placeholder-slate-700 focus:outline-none transition-all font-mono"
                  />
                </div>

                <div className="shrink-0">
                  <div className="flex items-center bg-[#070f21] border border-white/10 rounded-full pl-2.5 pr-4 py-2 text-white select-none">
                    <TokenLogo symbol="cirBTC" />
                    <span className="font-bold text-sm tracking-wider ml-2">cirBTC</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Info notice */}
            <div className="rounded-xl border border-white/5 bg-[#070e1c] p-3.5 text-xs text-slate-400 flex items-center gap-2">
              <Lock className="h-4 w-4 text-purple-400 shrink-0" />
              <span>
                {lendingData?.isPaused
                  ? "Contract is paused (Staging Mode). Supply transactions are disabled."
                  : "Supply cirBTC collateral to increase borrowing capacity on PayGrixLending."}
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
                  "w-full text-sm font-bold py-3.5 h-12 rounded-xl transition-all",
                  isSupplyDisabled
                    ? "bg-purple-600/40 text-purple-200 border border-purple-500/20 cursor-not-allowed"
                    : "bg-purple-600 hover:bg-purple-500 text-white cursor-pointer shadow-lg shadow-purple-600/30"
                )}
              >
                {isPending ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {statusMsg || "Processing..."}
                  </span>
                ) : lendingData?.isPaused ? (
                  "Supply Collateral (Paused)"
                ) : (
                  "Supply Collateral"
                )}
              </Button>
            )}
          </div>
        )}

        {/* ── BORROW TAB ──────────────────────────────────── */}
        {activeTab === "borrow" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Borrow USDC</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Max LTV:</span>
                <span className="text-xs font-bold text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full font-mono">
                  50%
                </span>
              </div>
            </div>

            {/* Metrics preview */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#070e1c] border border-white/5 rounded-xl p-3 flex flex-col gap-1">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Available to borrow</span>
                <span className="text-base font-bold text-[#4f8cff] font-mono">
                  {isLoading ? "..." : `${lendingData?.userMaxBorrow || "0.00"} USDC`}
                </span>
              </div>
              <div className="bg-[#070e1c] border border-white/5 rounded-xl p-3 flex flex-col gap-1">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Current debt</span>
                <span className="text-base font-bold text-white font-mono">
                  {isLoading ? "..." : `${lendingData?.userDebt || "0.00"} USDC`}
                </span>
              </div>
            </div>

            <div className="bg-[#070e1c] border border-white/5 rounded-2xl p-5 space-y-3.5 transition-all focus-within:border-purple-500/30">
              <div className="flex justify-between items-center text-xs">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">BORROW AMOUNT</span>
                <div className="flex items-center gap-2 text-slate-400 font-mono">
                  <button
                    type="button"
                    onClick={() => setBorrowInput(lendingData?.userMaxBorrow || "0.00")}
                    className="rounded-md bg-[#000000] border border-white/10 hover:bg-white/5 px-2.5 py-1 text-[10px] font-bold text-white transition-all cursor-pointer"
                  >
                    MAX
                  </button>
                </div>
              </div>

              <div className="flex justify-between items-center gap-4 pt-1">
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={borrowInput}
                    onChange={(e) => setBorrowInput(e.target.value)}
                    placeholder="0.00 USDC"
                    className="w-full bg-transparent text-3xl sm:text-4xl font-bold text-white placeholder-slate-700 focus:outline-none transition-all font-mono"
                  />
                </div>

                <div className="shrink-0">
                  <div className="flex items-center bg-[#070f21] border border-white/10 rounded-full pl-2.5 pr-4 py-2 text-white select-none">
                    <TokenLogo symbol="USDC" />
                    <span className="font-bold text-sm tracking-wider ml-2">USDC</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Liquidity notice */}
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 text-xs text-amber-300 flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                {lendingData?.isPaused
                  ? "Contract is paused in staging mode. Borrow transactions are disabled."
                  : "Borrow USDC against your deposited cirBTC collateral up to 50% LTV."}
              </p>
            </div>

            {/* CTA Button */}
            {!isConnected ? (
              <ConnectWalletButton />
            ) : (
              <Button
                disabled={isBorrowDisabled}
                onClick={handleBorrow}
                className={cn(
                  "w-full text-sm font-bold py-3.5 h-12 rounded-xl transition-all",
                  isBorrowDisabled
                    ? "bg-slate-800/60 text-slate-500 border border-slate-700/50 cursor-not-allowed"
                    : "bg-gradient-to-r from-[#4f8cff] to-[#6d5dfc] hover:from-[#3b7cff] hover:to-[#5b4be0] text-white cursor-pointer shadow-lg shadow-blue-500/30"
                )}
              >
                {isPending ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
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
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Repay USDC</h3>
              <span className="text-xs text-slate-400 font-mono">
                Current debt: {isLoading ? "..." : lendingData?.userDebt || "0.00"} USDC
              </span>
            </div>

            <div className="bg-[#070e1c] border border-white/5 rounded-2xl p-5 space-y-3.5 transition-all focus-within:border-purple-500/30">
              <div className="flex justify-between items-center text-xs">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">REPAY AMOUNT</span>
                <div className="flex items-center gap-2 text-slate-400 font-mono">
                  <span>Debt: {isLoading ? "..." : lendingData?.userDebt || "0.00"} USDC</span>
                  <button
                    type="button"
                    onClick={() => setRepayInput(lendingData?.userDebt || "0.00")}
                    className="rounded-md bg-[#000000] border border-white/10 hover:bg-white/5 px-2.5 py-1 text-[10px] font-bold text-white transition-all cursor-pointer"
                  >
                    MAX
                  </button>
                </div>
              </div>

              <div className="flex justify-between items-center gap-4 pt-1">
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={repayInput}
                    onChange={(e) => setRepayInput(e.target.value)}
                    placeholder="0.00 USDC"
                    className="w-full bg-transparent text-3xl sm:text-4xl font-bold text-white placeholder-slate-700 focus:outline-none transition-all font-mono"
                  />
                </div>

                <div className="shrink-0">
                  <div className="flex items-center bg-[#070f21] border border-white/10 rounded-full pl-2.5 pr-4 py-2 text-white select-none">
                    <TokenLogo symbol="USDC" />
                    <span className="font-bold text-sm tracking-wider ml-2">USDC</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/5 bg-[#070e1c] p-3.5 text-xs text-slate-400 flex items-center gap-2">
              <Lock className="h-4 w-4 text-purple-400 shrink-0" />
              <span>
                {(lendingData?.userDebtRaw ?? BigInt(0)) === BigInt(0)
                  ? "No active debt on-chain."
                  : "Repay USDC debt to unlock deposited cirBTC collateral."}
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
                  "w-full text-sm font-bold py-3.5 h-12 rounded-xl transition-all",
                  isRepayDisabled
                    ? "bg-purple-600/40 text-purple-200 border border-purple-500/20 cursor-not-allowed"
                    : "bg-purple-600 hover:bg-purple-500 text-white cursor-pointer shadow-lg shadow-purple-600/30"
                )}
              >
                {isPending ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
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
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Withdraw collateral</h3>
              <span className="text-xs text-slate-400 font-mono">
                Available: {isLoading ? "..." : lendingData?.userAvailableCollateral || "0.00"} cirBTC
              </span>
            </div>

            <div className="bg-[#070e1c] border border-white/5 rounded-2xl p-5 space-y-3.5 transition-all focus-within:border-purple-500/30">
              <div className="flex justify-between items-center text-xs">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">WITHDRAW AMOUNT</span>
                <div className="flex items-center gap-2 text-slate-400 font-mono">
                  <span>Max: {isLoading ? "..." : lendingData?.userAvailableCollateral || "0.00"} cirBTC</span>
                  <button
                    type="button"
                    onClick={() => setWithdrawInput(lendingData?.userAvailableCollateral || "0.00")}
                    className="rounded-md bg-[#000000] border border-white/10 hover:bg-white/5 px-2.5 py-1 text-[10px] font-bold text-white transition-all cursor-pointer"
                  >
                    MAX
                  </button>
                </div>
              </div>

              <div className="flex justify-between items-center gap-4 pt-1">
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={withdrawInput}
                    onChange={(e) => setWithdrawInput(e.target.value)}
                    placeholder="0.00 cirBTC"
                    className="w-full bg-transparent text-3xl sm:text-4xl font-bold text-white placeholder-slate-700 focus:outline-none transition-all font-mono"
                  />
                </div>

                <div className="shrink-0">
                  <div className="flex items-center bg-[#070f21] border border-white/10 rounded-full pl-2.5 pr-4 py-2 text-white select-none">
                    <TokenLogo symbol="cirBTC" />
                    <span className="font-bold text-sm tracking-wider ml-2">cirBTC</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/5 bg-[#070e1c] p-3.5 text-xs text-slate-400 flex items-center gap-2">
              <Lock className="h-4 w-4 text-purple-400 shrink-0" />
              <span>
                {lendingData?.isPaused
                  ? "Contract is paused (Staging Mode). Collateral withdrawal is disabled."
                  : "Withdraw available cirBTC collateral back to your connected wallet."}
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
                  "w-full text-sm font-bold py-3.5 h-12 rounded-xl transition-all",
                  isWithdrawDisabled
                    ? "bg-purple-600/40 text-purple-200 border border-purple-500/20 cursor-not-allowed"
                    : "bg-purple-600 hover:bg-purple-500 text-white cursor-pointer shadow-lg shadow-purple-600/30"
                )}
              >
                {isPending ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {statusMsg || "Processing..."}
                  </span>
                ) : lendingData?.isPaused ? (
                  "Withdraw Collateral (Paused)"
                ) : (
                  "Withdraw Collateral"
                )}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
