"use client";

import Link from "next/link";
import { Landmark, ShieldCheck, ArrowRight, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LendingOnChainData } from "@/hooks/use-lending-data";

interface CompactLendingMarketProps {
  lendingData?: LendingOnChainData;
  isLoading?: boolean;
}

export function CompactLendingMarket({ lendingData, isLoading }: CompactLendingMarketProps) {
  const isPaused = lendingData?.isPaused ?? true;

  return (
    <Card className="border border-white/10 bg-[#060f24]/60 backdrop-blur-lg relative overflow-hidden shadow-[0_8px_32px_rgba(6,15,36,0.5)]">
      <div className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left: Section Header & Status */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#4f8cff]/20 to-[#9d4edd]/20 border border-white/10 flex items-center justify-center text-[#4f8cff] shrink-0">
            <Landmark className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                Lending Market Summary
              </h3>
              {isPaused ? (
                <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-500/30 bg-amber-500/10 font-mono">
                  <AlertTriangle className="h-3 w-3 mr-1 text-amber-400" />
                  Paused
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30 bg-emerald-500/10 font-mono">
                  <ShieldCheck className="h-3 w-3 mr-1 text-emerald-400" />
                  Active
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Live protocol reserves and Oracle state on Arc Testnet (5042002).
            </p>
          </div>
        </div>

        {/* Middle: Compact Essential Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-6 py-2 md:py-0 border-y md:border-y-0 md:border-x border-white/5 md:px-6">
          {/* Available Liquidity */}
          <div className="space-y-0.5">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
              Pool Liquidity
            </span>
            <span className="text-sm sm:text-base font-bold text-white font-mono block">
              {isLoading ? "..." : `${lendingData?.poolLiquidity || "0.00"} USDC`}
            </span>
          </div>

          {/* Outstanding Debt */}
          <div className="space-y-0.5">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
              Total Debt
            </span>
            <span className="text-sm sm:text-base font-bold text-slate-200 font-mono block">
              {isLoading ? "..." : `${lendingData?.totalOutstandingDebt || "0.00"} USDC`}
            </span>
          </div>

          {/* Oracle Price */}
          <div className="space-y-0.5">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
              Oracle Reference
            </span>
            <span className="text-sm sm:text-base font-bold text-purple-300 font-mono block">
              {isLoading ? "..." : `$${lendingData?.collateralPrice || "0.00"}`}
            </span>
          </div>

          {/* Bad Debt */}
          <div className="space-y-0.5">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
              Bad Debt
            </span>
            <span className="text-sm sm:text-base font-bold text-emerald-400 font-mono block">
              {isLoading ? "..." : `${lendingData?.totalBadDebt || "0.00"} USDC`}
            </span>
          </div>
        </div>

        {/* Right: CTA to Settings */}
        <div className="shrink-0">
          <Link href="/settings#lending-protocol">
            <Button
              variant="outline"
              size="sm"
              className="w-full sm:w-auto text-xs font-semibold border-white/10 hover:bg-white/5 text-slate-300 hover:text-white transition-all gap-1.5"
            >
              Protocol Settings
              <ArrowRight className="h-3.5 w-3.5 text-[#4f8cff]" />
            </Button>
          </Link>
        </div>
      </div>
    </Card>
  );
}
