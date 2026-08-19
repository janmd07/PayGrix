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
    <Card className="border border-white/10 bg-[#060f24]/60 backdrop-blur-lg relative overflow-hidden shadow-[0_4px_24px_rgba(6,15,36,0.4)]">
      <div className="p-3 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
        {/* Left: Section Header & Status */}
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#4f8cff]/20 to-[#9d4edd]/20 border border-white/10 flex items-center justify-center text-[#4f8cff] shrink-0">
            <Landmark className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-white flex items-center gap-1">
                Lending Market Summary
              </h3>
              {isPaused ? (
                <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-500/30 bg-amber-500/10 font-mono px-1.5 py-0">
                  <AlertTriangle className="h-2.5 w-2.5 mr-1 text-amber-400" />
                  Paused
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30 bg-emerald-500/10 font-mono px-1.5 py-0">
                  <ShieldCheck className="h-2.5 w-2.5 mr-1 text-emerald-400" />
                  Active
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              Live protocol reserves and Oracle state on Arc Testnet (5042002).
            </p>
          </div>
        </div>

        {/* Middle: Compact Essential Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 lg:gap-5 py-2 lg:py-0 border-y lg:border-y-0 lg:border-x border-white/5 lg:px-5">
          {/* Available Liquidity */}
          <div className="space-y-0.5">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
              Pool Liquidity
            </span>
            <span className="text-xs sm:text-sm font-bold text-white font-mono block">
              {isLoading ? "..." : `${lendingData?.poolLiquidity || "0.00"} USDC`}
            </span>
          </div>

          {/* Outstanding Debt */}
          <div className="space-y-0.5">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
              Total Debt
            </span>
            <span className="text-xs sm:text-sm font-bold text-slate-200 font-mono block">
              {isLoading ? "..." : `${lendingData?.totalOutstandingDebt || "0.00"} USDC`}
            </span>
          </div>

          {/* Oracle Price */}
          <div className="space-y-0.5">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
              Oracle Reference
            </span>
            <span className="text-xs sm:text-sm font-bold text-purple-300 font-mono block">
              {isLoading ? "..." : `$${lendingData?.collateralPrice || "0.00"}`}
            </span>
          </div>

          {/* Bad Debt */}
          <div className="space-y-0.5">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
              Bad Debt
            </span>
            <span className="text-xs sm:text-sm font-bold text-emerald-400 font-mono block">
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
              className="w-full sm:w-auto h-8 text-[11px] font-semibold border-white/10 hover:bg-white/5 text-slate-300 hover:text-white transition-all gap-1 px-3"
            >
              Protocol Details
              <ArrowRight className="h-3 w-3 text-[#4f8cff]" />
            </Button>
          </Link>
        </div>
      </div>
    </Card>
  );
}
