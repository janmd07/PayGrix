"use client";

import { Sliders } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function RiskParameters() {
  return (
    <Card className="border border-white/10 bg-[#060f24]/60 backdrop-blur-lg relative overflow-hidden shadow-[0_8px_32px_rgba(6,15,36,0.5)]">
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-500" />

      <CardHeader className="pb-3">
        <CardTitle className="text-base font-bold text-white flex items-center gap-2">
          <Sliders className="h-4.5 w-4.5 text-[#4f8cff]" />
          Initial Lending Parameters
        </CardTitle>
        <CardDescription className="text-xs text-slate-400">
          Reference product parameters configured for Arc Testnet prototype evaluation.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="rounded-xl border border-white/5 bg-[#070e1c] divide-y divide-white/5 text-xs">
          <div className="flex justify-between items-center p-3">
            <span className="text-slate-400 font-medium">Supported Collateral</span>
            <span className="text-white font-mono font-bold flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              cirBTC
            </span>
          </div>

          <div className="flex justify-between items-center p-3">
            <span className="text-slate-400 font-medium">Borrow Asset</span>
            <span className="text-white font-mono font-bold flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-blue-400" />
              USDC
            </span>
          </div>

          <div className="flex justify-between items-center p-3">
            <span className="text-slate-400 font-medium">Reference Borrow Factor</span>
            <span className="text-purple-400 font-mono font-bold">50%</span>
          </div>

          <div className="flex justify-between items-center p-3">
            <span className="text-slate-400 font-medium">Interest (Borrow APY)</span>
            <span className="text-emerald-400 font-mono font-bold">0%*</span>
          </div>

          <div className="flex justify-between items-center p-3">
            <span className="text-slate-400 font-medium">Protocol Fee</span>
            <span className="text-emerald-400 font-mono font-bold">0%*</span>
          </div>
        </div>

        <p className="text-[11px] text-slate-500 italic leading-relaxed pt-1 border-t border-white/5">
          * Initial testnet product assumptions. Final lending parameters and risk controls will be defined before live borrowing is enabled.
        </p>
      </CardContent>
    </Card>
  );
}
