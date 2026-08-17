"use client";

import { Landmark, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function LendingMarketCard() {
  return (
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
              Awaiting liquidity
            </Badge>
          </div>
        </div>
        <CardDescription className="text-xs text-slate-400">
          Arc Testnet primary USDC lending reserve pool status.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/5 bg-[#070e1c] p-3.5 space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Available Liquidity
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-white font-mono">0</span>
              <span className="text-xs font-semibold text-emerald-400">USDC</span>
            </div>
          </div>

          <div className="rounded-xl border border-white/5 bg-[#070e1c] p-3.5 space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Market Status
            </span>
            <span className="text-sm font-semibold text-amber-300 block pt-0.5">
              Awaiting liquidity
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 flex items-start gap-3 text-xs text-amber-200/90">
          <Info className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            The lending pool is not funded yet. Borrowing will become available once liquidity is supplied.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
