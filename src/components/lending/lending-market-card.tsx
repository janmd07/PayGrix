"use client";

import { useState } from "react";
import { Landmark, Info, Plus, X, Lock, ShieldAlert } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LendingOnChainData } from "@/hooks/use-lending-data";

interface LendingMarketCardProps {
  lendingData?: LendingOnChainData;
  isLoading?: boolean;
  error?: string | null;
}

export function LendingMarketCard({ lendingData, isLoading, error }: LendingMarketCardProps) {
  const [isFundModalOpen, setIsFundModalOpen] = useState(false);
  const [fundAmount, setFundAmount] = useState("");

  const isPaused = lendingData?.isPaused ?? true;
  const poolLiquidity = lendingData?.poolLiquidity || "0.00";
  const totalDebt = lendingData?.totalOutstandingDebt || "0.00";
  const collateralPrice = lendingData?.collateralPrice || "60,000.00";

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
                {isPaused ? "Paused (Staging Mode)" : "Awaiting liquidity"}
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

          {/* Staging Oracle Reference */}
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

          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 flex items-start gap-3 text-xs text-amber-200/90">
            <Info className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              Staging contract is deployed on Arc Testnet. Lending contract is currently paused in staging mode. Real borrowing is disabled.
            </p>
          </div>

          <Button
            type="button"
            onClick={() => setIsFundModalOpen(true)}
            variant="outline"
            className="w-full bg-[#070e1c] hover:bg-white/5 border border-amber-500/30 text-amber-300 hover:text-amber-200 font-semibold text-xs h-10 rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_0_15px_rgba(245,158,11,0.08)] hover:shadow-[0_0_20px_rgba(245,158,11,0.15)] cursor-pointer"
          >
            <Plus className="h-4 w-4 text-amber-400" />
            Add USDC Liquidity
          </Button>
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
              onClick={() => setIsFundModalOpen(false)}
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
              <button
                type="button"
                onClick={() => setIsFundModalOpen(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>

              {/* Header */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
                    <Landmark className="h-4 w-4" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Fund Lending Market</h3>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Provide USDC liquidity to the PayGrix lending market reserve pool.
                </p>
              </div>

              {/* Balance display */}
              <div className="flex items-center justify-between bg-[#070e1c] border border-white/5 rounded-xl px-4 py-3 text-xs">
                <span className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                  Your USDC Balance
                </span>
                <span className="font-mono font-bold text-slate-300">-- USDC</span>
              </div>

              {/* Input field */}
              <div className="bg-[#070e1c] border border-white/5 rounded-2xl p-4 space-y-2.5 transition-all focus-within:border-amber-500/30">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Amount to add
                  </span>
                  <button
                    type="button"
                    onClick={() => setFundAmount("0.00")}
                    className="rounded-md bg-white/5 border border-white/10 hover:bg-white/10 px-2.5 py-0.5 text-[10px] font-bold text-slate-300 transition-all cursor-pointer"
                  >
                    MAX
                  </button>
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

              {/* Informational note */}
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 flex items-start gap-2.5 text-xs text-amber-200/90">
                <Info className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  Staging contract is deployed. Market funding is disabled in Phase 2D.
                </p>
              </div>

              {/* Primary action button */}
              <Button
                disabled
                className="w-full text-sm font-bold py-3 h-11 rounded-xl bg-amber-500/10 text-amber-300/60 border border-amber-500/20 cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Lock className="h-4 w-4 text-amber-400/60" />
                Fund Market (Disabled in Phase 2D)
              </Button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
