"use client";

import { useState } from "react";
import { Landmark, Info, Plus, X, ShieldAlert, CheckCircle2, ArrowRight, ExternalLink, History, Lock, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useWriteContract } from "wagmi";
import { parseUnits } from "viem";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useArcWallet } from "@/components/wallet/use-arc-wallet";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";
import {
  LendingOnChainData,
  PAYGRIX_LENDING_ADDRESS,
  PAYGRIX_LENDING_ABI,
  USDC_ADDRESS,
  USDC_ABI,
} from "@/hooks/use-lending-data";
import { arcPublicClient } from "@/lib/arc-client";
import { clearArcReadCache, sanitizeExecutionError } from "@/lib/arc-read-infra";

// Phase 2E Confirmed Historical Funding Transactions
const HISTORICAL_FUNDING_TX = {
  hash: "0x92b52f91001df98c7d230f362ccf94f1785802bb3851ae959fa829bc0867b653",
  amount: "1.00 USDC",
  action: "Pool Funding",
  network: "Arc Testnet",
  status: "Confirmed",
  arcScanUrl: "https://testnet.arcscan.app/tx/0x92b52f91001df98c7d230f362ccf94f1785802bb3851ae959fa829bc0867b653",
};

const HISTORICAL_APPROVAL_TX = {
  hash: "0xf1694edb30e083b9a9c9cba84a48701cc57c74da152d20b0549f0f8a250f2d60",
  amount: "1.00 USDC",
  action: "USDC Approval",
  network: "Arc Testnet",
  status: "Confirmed",
  arcScanUrl: "https://testnet.arcscan.app/tx/0xf1694edb30e083b9a9c9cba84a48701cc57c74da152d20b0549f0f8a250f2d60",
};

interface LendingMarketCardProps {
  lendingData?: LendingOnChainData;
  isLoading?: boolean;
  error?: string | null;
  onRefreshData?: () => Promise<void>;
}

export function LendingMarketCard({ lendingData, isLoading, error, onRefreshData }: LendingMarketCardProps) {
  const { isConnected, isArcTestnet, address, switchToArcTestnetAsync } = useArcWallet();
  const { writeContractAsync } = useWriteContract();

  const [isFundModalOpen, setIsFundModalOpen] = useState(false);
  const [fundAmount, setFundAmount] = useState("");
  const [isConfirmingStep, setIsConfirmingStep] = useState(false);

  // Tx Lifecycle State
  const [txStatus, setTxStatus] = useState<
    "idle" | "approving" | "confirming_approval" | "funding" | "confirming_funding" | "success" | "failed"
  >("idle");
  const [txHash, setTxHash] = useState("");
  const [txError, setTxError] = useState<string | null>(null);
  const [confirmStage, setConfirmStage] = useState("");

  const isPaused = lendingData?.isPaused ?? true;
  const poolLiquidity = lendingData?.poolLiquidity || "0.00";
  const totalDebt = lendingData?.totalOutstandingDebt || "0.00";
  const collateralPrice = lendingData?.collateralPrice || "60,000.00";
  const userUsdcBalance = lendingData?.userUsdcBalance || "0.00";
  const userUsdcBalanceRaw = lendingData?.userUsdcBalanceRaw || BigInt(0);
  const userUsdcAllowanceRaw = lendingData?.userUsdcAllowanceRaw || BigInt(0);
  const isOwner = lendingData?.isContractOwner || false;

  // Reset modal state
  const handleOpenModal = () => {
    setFundAmount("");
    setIsConfirmingStep(false);
    setTxStatus("idle");
    setTxHash("");
    setTxError(null);
    setConfirmStage("");
    setIsFundModalOpen(true);
  };

  const handleCloseModal = () => {
    if (txStatus === "approving" || txStatus === "confirming_approval" || txStatus === "funding" || txStatus === "confirming_funding") {
      return; // Block closing while transaction is active
    }
    setIsFundModalOpen(false);
  };

  // Helper to parse and validate input
  const getValidation = () => {
    if (!fundAmount.trim()) {
      return { isValid: false, errorMsg: null, amountRaw: BigInt(0) };
    }

    if (!/^\d+(\.\d{1,6})?$/.test(fundAmount.trim())) {
      return { isValid: false, errorMsg: "Amount must have at most 6 decimal places", amountRaw: BigInt(0) };
    }

    const valNum = parseFloat(fundAmount.trim());
    if (isNaN(valNum) || valNum <= 0) {
      return { isValid: false, errorMsg: "Amount must be greater than zero", amountRaw: BigInt(0) };
    }

    try {
      const amountRaw = parseUnits(fundAmount.trim(), 6);
      if (amountRaw > userUsdcBalanceRaw) {
        return { isValid: false, errorMsg: "Amount exceeds wallet USDC balance", amountRaw };
      }
      return { isValid: true, errorMsg: null, amountRaw };
    } catch {
      return { isValid: false, errorMsg: "Invalid numerical format", amountRaw: BigInt(0) };
    }
  };

  const validation = getValidation();
  const requiresApproval = validation.isValid && userUsdcAllowanceRaw < validation.amountRaw;

  // MAX button handler
  const handleSetMax = () => {
    setFundAmount(userUsdcBalance);
  };

  // Execute Market Funding Flow
  const handleExecuteFunding = async () => {
    if (!isConnected || !address) {
      setTxError("Wallet not connected.");
      return;
    }

    if (!isArcTestnet) {
      setTxStatus("approving");
      setConfirmStage("Switching network to Arc Testnet...");
      try {
        await switchToArcTestnetAsync();
      } catch {
        setTxError("Please switch to Arc Testnet (Chain ID 5042002).");
        setTxStatus("failed");
        return;
      }
    }

    if (!validation.isValid || validation.amountRaw <= BigInt(0)) {
      setTxError("Please enter a valid amount.");
      return;
    }

    const amountRaw = validation.amountRaw;
    setTxError(null);
    setTxHash("");

    try {
      // Step 1: USDC Approval if needed
      if (userUsdcAllowanceRaw < amountRaw) {
        setTxStatus("approving");
        setConfirmStage("1/4: Requesting USDC allowance approval in wallet...");

        const approveHash = await writeContractAsync({
          address: USDC_ADDRESS,
          abi: USDC_ABI,
          functionName: "approve",
          args: [PAYGRIX_LENDING_ADDRESS, amountRaw],
          chainId: 5042002,
        });

        setTxStatus("confirming_approval");
        setConfirmStage("2/4: Confirming USDC approval on Arc Testnet...");
        await arcPublicClient.waitForTransactionReceipt({ hash: approveHash });
        clearArcReadCache(`arc:${USDC_ADDRESS.toLowerCase()}`);
      }

      // Step 2: Call PayGrixLending.fundPool(amount)
      setTxStatus("funding");
      setConfirmStage("3/4: Requesting signature to fund pool in wallet...");

      const fundHash = await writeContractAsync({
        address: PAYGRIX_LENDING_ADDRESS,
        abi: PAYGRIX_LENDING_ABI,
        functionName: "fundPool",
        args: [amountRaw],
        chainId: 5042002,
      });

      setTxHash(fundHash);
      setTxStatus("confirming_funding");
      setConfirmStage("4/4: Confirming pool funding transaction on Arc Testnet...");

      await arcPublicClient.waitForTransactionReceipt({ hash: fundHash });
      clearArcReadCache(`arc:${PAYGRIX_LENDING_ADDRESS.toLowerCase()}`);

      setTxStatus("success");
      setConfirmStage("Funding completed successfully!");

      // Refresh on-chain data
      if (onRefreshData) {
        await onRefreshData();
      }
    } catch (err: unknown) {
      console.error("Market funding transaction failed:", err);
      setTxError(sanitizeExecutionError(err));
      setTxStatus("failed");
    }
  };

  return (
    <>
      <Card className="border border-white/10 bg-[#060f24]/60 backdrop-blur-lg relative overflow-hidden shadow-[0_8px_32px_rgba(6,15,36,0.5)]">
        {/* Top accent line */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-amber-500/80 via-purple-500/80 to-blue-500/80" />

        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
              <Landmark className="h-5 w-5 text-amber-400" />
              Lending Market
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
              </span>
              <Badge variant="outline" className="text-xs text-amber-300 border-amber-500/30 bg-amber-500/10 font-mono">
                {isPaused ? "Paused — Staging Mode" : "Active"}
              </Badge>
            </div>
          </div>
          <CardDescription className="text-xs text-slate-400">
            Arc Testnet primary USDC lending reserve pool status on PayGrixLending.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {error ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0 text-red-400" />
              <span>Unable to load lending market state</span>
            </div>
          ) : null}

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/5 bg-[#070e1c] p-3.5 space-y-1">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Available Liquidity
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold text-white font-mono">
                  {isLoading ? "..." : poolLiquidity}
                </span>
                <span className="text-xs font-semibold text-emerald-400">USDC</span>
              </div>
            </div>

            <div className="rounded-xl border border-white/5 bg-[#070e1c] p-3.5 space-y-1">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Total Outstanding Debt
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold text-white font-mono">
                  {isLoading ? "..." : totalDebt}
                </span>
                <span className="text-xs font-semibold text-emerald-400">USDC</span>
              </div>
            </div>
          </div>

          {/* Staging Oracle Reference & Environment */}
          <div className="rounded-xl border border-white/5 bg-[#070e1c] p-3.5 flex items-center justify-between text-xs">
            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Oracle Reference Price
              </span>
              <span className="text-slate-500 text-[10px]">Environment: Arc Testnet / Staging</span>
            </div>
            <div className="text-right">
              <span className="font-mono font-bold text-purple-300 block text-sm">
                {isLoading ? "..." : `$${collateralPrice}`}
              </span>
              <span className="text-[10px] text-slate-400">per cirBTC</span>
            </div>
          </div>

          {/* Staging Alert Notice */}
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 flex items-start gap-3 text-xs text-amber-200/90">
            <Info className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              Staging contract is deployed on Arc Testnet (Chain ID 5042002). Contract paused in staging mode. Borrowing, supply, withdraw, and repay operations are disabled. Funding is allowed for reserve testing.
            </p>
          </div>

          {/* Add Liquidity Button */}
          <Button
            type="button"
            onClick={handleOpenModal}
            variant="outline"
            className="w-full bg-[#070e1c] hover:bg-white/5 border border-amber-500/30 text-amber-300 hover:text-amber-200 font-semibold text-xs h-10 rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_0_15px_rgba(245,158,11,0.08)] hover:shadow-[0_0_20px_rgba(245,158,11,0.15)] cursor-pointer"
          >
            <Plus className="h-4 w-4 text-amber-400" />
            + Add USDC Liquidity
          </Button>

          {/* ── LATEST CONFIRMED ACTIVITY SECTION ───────────── */}
          <div className="rounded-xl border border-white/10 bg-[#040a17]/80 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
                <History className="h-3.5 w-3.5 text-purple-400" />
                Latest Confirmed Activity
              </span>
              <Badge variant="outline" className="text-[10px] text-purple-300 border-purple-500/30 bg-purple-500/10">
                Phase 2E On-Chain
              </Badge>
            </div>

            <div className="space-y-2 text-xs">
              {/* Pool Funding Tx */}
              <div className="rounded-lg border border-white/5 bg-[#070e1c] p-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-semibold text-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    <span>{HISTORICAL_FUNDING_TX.action}</span>
                  </div>
                  <span className="font-mono text-emerald-400 font-bold text-[11px]">
                    {HISTORICAL_FUNDING_TX.amount}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Network: {HISTORICAL_FUNDING_TX.network}</span>
                  <Badge variant="outline" className="text-[9px] text-emerald-400 border-emerald-500/20 bg-emerald-500/10 py-0 px-1.5">
                    {HISTORICAL_FUNDING_TX.status}
                  </Badge>
                </div>
                <a
                  href={HISTORICAL_FUNDING_TX.arcScanUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[10px] font-mono text-purple-400 hover:text-purple-300 hover:underline pt-0.5"
                >
                  <span>Tx: {HISTORICAL_FUNDING_TX.hash.slice(0, 10)}...{HISTORICAL_FUNDING_TX.hash.slice(-8)}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </div>

              {/* Approval Tx */}
              <div className="rounded-lg border border-white/5 bg-[#070e1c] p-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
                    <span>{HISTORICAL_APPROVAL_TX.action}</span>
                  </div>
                  <span className="font-mono text-purple-300 font-bold text-[11px]">
                    {HISTORICAL_APPROVAL_TX.amount}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Status: {HISTORICAL_APPROVAL_TX.status}</span>
                  <Badge variant="outline" className="text-[9px] text-purple-300 border-purple-500/20 bg-purple-500/10 py-0 px-1.5">
                    Confirmed
                  </Badge>
                </div>
                <a
                  href={HISTORICAL_APPROVAL_TX.arcScanUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[10px] font-mono text-purple-400 hover:text-purple-300 hover:underline pt-0.5"
                >
                  <span>Tx: {HISTORICAL_APPROVAL_TX.hash.slice(0, 10)}...{HISTORICAL_APPROVAL_TX.hash.slice(-8)}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </div>
            </div>

            <p className="text-[10px] text-slate-500 italic">
              * Confirmed historical metadata from Phase 2E liquidity funding.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Fund Lending Market Modal */}
      <AnimatePresence>
        {isFundModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCloseModal}
              className="fixed inset-0 bg-black/70 backdrop-blur-md"
            />

            {/* Modal Container */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#060f24] p-6 shadow-[0_8px_32px_rgba(6,15,36,0.8)] space-y-5"
            >
              {/* Top Accent Line */}
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-amber-500/80 via-purple-500/80 to-blue-500/80" />

              {/* Close Button */}
              {txStatus !== "approving" && txStatus !== "confirming_approval" && txStatus !== "funding" && txStatus !== "confirming_funding" && (
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              )}

              {/* Header */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
                      <Landmark className="h-4 w-4" />
                    </div>
                    <h3 className="text-lg font-bold text-white">Fund Lending Market</h3>
                  </div>

                  {isOwner && (
                    <Badge variant="outline" className="text-[10px] text-amber-300 border-amber-500/30 bg-amber-500/10">
                      Contract Owner
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Provide USDC liquidity to the PayGrix lending market reserve pool on Arc Testnet.
                </p>
              </div>

              {/* Modal Metadata Summary */}
              <div className="rounded-xl border border-white/5 bg-[#070e1c] p-3 text-xs space-y-1.5 divide-y divide-white/5">
                <div className="flex justify-between items-center pb-1">
                  <span className="text-slate-400 font-medium">Destination Contract</span>
                  <span className="font-mono text-white text-[11px]">0x5662...6111</span>
                </div>
                <div className="flex justify-between items-center pt-1 pb-1">
                  <span className="text-slate-400 font-medium">Network</span>
                  <span className="font-mono text-purple-300">Arc Testnet (Chain ID 5042002)</span>
                </div>
                <div className="flex justify-between items-center pt-1 pb-1">
                  <span className="text-slate-400 font-medium">Current Pool Liquidity</span>
                  <span className="font-mono font-bold text-emerald-400">{poolLiquidity} USDC</span>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <span className="text-slate-400 font-medium">Contract Safety State</span>
                  <span className="font-mono text-amber-300">Paused — Staging Mode</span>
                </div>
              </div>

              {/* ── STEP 1: AMOUNT INPUT FORM ─────────────────── */}
              {!isConfirmingStep && txStatus === "idle" && (
                <div className="space-y-4">
                  {/* Balance display */}
                  <div className="flex items-center justify-between bg-[#070e1c] border border-white/5 rounded-xl px-4 py-3 text-xs">
                    <span className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                      Your USDC Balance
                    </span>
                    <span className="font-mono font-bold text-emerald-400">
                      {isConnected ? `${userUsdcBalance} USDC` : "Connect Wallet"}
                    </span>
                  </div>

                  {/* Input field */}
                  <div className="bg-[#070e1c] border border-white/5 rounded-2xl p-4 space-y-2.5 transition-all focus-within:border-amber-500/30">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        Amount to add
                      </span>
                      {isConnected && (
                        <button
                          type="button"
                          onClick={handleSetMax}
                          className="rounded-md bg-white/5 border border-white/10 hover:bg-white/10 px-2.5 py-0.5 text-[10px] font-bold text-slate-300 transition-all cursor-pointer"
                        >
                          MAX
                        </button>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <input
                        type="text"
                        value={fundAmount}
                        onChange={(e) => setFundAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full bg-transparent text-2xl font-bold text-white placeholder-slate-600 focus:outline-none font-mono"
                      />
                      <div className="flex items-center gap-1.5 bg-[#040a1c] border border-white/10 rounded-full px-3 py-1 text-white shrink-0 select-none">
                        <span className="text-xs font-bold text-emerald-400 font-mono">USDC</span>
                      </div>
                    </div>
                  </div>

                  {/* Input Validation Error */}
                  {validation.errorMsg && (
                    <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300 flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4 shrink-0 text-red-400" />
                      <span>{validation.errorMsg}</span>
                    </div>
                  )}

                  {/* Explicit Staging Note */}
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 flex items-start gap-2.5 text-xs text-amber-200/90">
                    <Lock className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                    <p className="leading-relaxed">
                      <strong className="text-amber-300">Staging Mode Notice:</strong> Funding is allowed in staging, but borrowing remains disabled.
                    </p>
                  </div>

                  {/* Primary CTA */}
                  {!isConnected ? (
                    <ConnectWalletButton />
                  ) : (
                    <Button
                      disabled={!validation.isValid}
                      onClick={() => setIsConfirmingStep(true)}
                      className="w-full text-sm font-bold py-3 h-11 rounded-xl bg-gradient-to-r from-amber-500 via-purple-600 to-blue-600 hover:from-amber-600 hover:to-blue-700 text-white shadow-lg cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {requiresApproval ? "Review & Approve USDC" : "Review Market Funding"}
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              )}

              {/* ── STEP 2: SAFETY CONFIRMATION CARD ────────── */}
              {isConfirmingStep && txStatus === "idle" && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-amber-300 font-bold text-xs uppercase tracking-wider">
                      <ShieldAlert className="h-4 w-4 text-amber-400" />
                      Explicit Transaction Confirmation
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      You are about to fund the PayGrix Lending Reserve Pool on Arc Testnet.
                    </p>

                    <div className="rounded-lg border border-white/5 bg-[#070e1c] p-3 divide-y divide-white/5 text-xs">
                      <div className="flex justify-between py-1.5">
                        <span className="text-slate-400">Funding Amount</span>
                        <span className="font-mono font-bold text-emerald-400">{fundAmount} USDC</span>
                      </div>
                      <div className="flex justify-between py-1.5">
                        <span className="text-slate-400">Destination Contract</span>
                        <span className="font-mono text-white text-[11px]">0x5662...6111</span>
                      </div>
                      <div className="flex justify-between py-1.5">
                        <span className="text-slate-400">Target Network</span>
                        <span className="font-mono text-purple-300">Arc Testnet (5042002)</span>
                      </div>
                      <div className="flex justify-between py-1.5">
                        <span className="text-slate-400">Approval Required</span>
                        <span className="font-mono text-amber-300">{requiresApproval ? "Yes" : "Sufficient"}</span>
                      </div>
                      <div className="flex justify-between py-1.5">
                        <span className="text-slate-400">Lending Status</span>
                        <span className="font-mono text-amber-300">Paused (Staging Mode)</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsConfirmingStep(false)}
                      className="border-white/10 text-slate-300 hover:bg-white/5 text-xs h-11 rounded-xl"
                    >
                      Back
                    </Button>
                    <Button
                      type="button"
                      onClick={handleExecuteFunding}
                      className="text-xs font-bold h-11 rounded-xl bg-gradient-to-r from-amber-500 to-emerald-600 hover:from-amber-600 hover:to-emerald-700 text-white cursor-pointer"
                    >
                      Confirm & Fund
                    </Button>
                  </div>
                </div>
              )}

              {/* ── STEP 3: TRANSACTION PROGRESS / RESULT ─────── */}
              {txStatus !== "idle" && (
                <div className="space-y-4 py-2">
                  {/* Active / Loading states */}
                  {(txStatus === "approving" ||
                    txStatus === "confirming_approval" ||
                    txStatus === "funding" ||
                    txStatus === "confirming_funding") && (
                    <div className="flex flex-col items-center justify-center text-center p-6 space-y-4 rounded-xl border border-white/5 bg-[#070e1c]">
                      <Loader2 className="h-10 w-10 animate-spin text-amber-400" />
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-white">Transaction in Progress</p>
                        <p className="text-xs text-amber-300/90 font-mono">{confirmStage}</p>
                      </div>
                    </div>
                  )}

                  {/* Success state */}
                  {txStatus === "success" && (
                    <div className="flex flex-col items-center justify-center text-center p-6 space-y-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10">
                      <CheckCircle2 className="h-10 w-10 text-emerald-400" />
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-emerald-300">Market Funding Complete!</p>
                        <p className="text-xs text-slate-300">
                          {fundAmount} USDC successfully deposited into PayGrixLending reserve pool.
                        </p>
                        {txHash && (
                          <a
                            href={`https://testnet.arcscan.app/tx/${txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block text-[11px] font-mono text-purple-400 hover:underline pt-1"
                          >
                            View on ArcScan: {txHash.slice(0, 10)}...{txHash.slice(-8)}
                          </a>
                        )}
                      </div>
                      <Button
                        type="button"
                        onClick={handleCloseModal}
                        className="w-full text-xs font-bold h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white mt-2"
                      >
                        Done
                      </Button>
                    </div>
                  )}

                  {/* Failed state */}
                  {txStatus === "failed" && (
                    <div className="flex flex-col items-center justify-center text-center p-5 space-y-3 rounded-xl border border-red-500/30 bg-red-500/10">
                      <ShieldAlert className="h-9 w-9 text-red-400" />
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-red-300">Funding Transaction Failed</p>
                        <p className="text-xs text-red-200">{txError || "An error occurred during market funding."}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 w-full pt-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setTxStatus("idle");
                            setIsConfirmingStep(false);
                          }}
                          className="border-white/10 text-slate-300 hover:bg-white/5 text-xs h-10 rounded-xl"
                        >
                          Retry Input
                        </Button>
                        <Button
                          type="button"
                          onClick={handleExecuteFunding}
                          className="text-xs font-bold h-10 rounded-xl bg-red-600 hover:bg-red-700 text-white"
                        >
                          Try Again
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
