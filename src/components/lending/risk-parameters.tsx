"use client";

import { Sliders } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { LendingOnChainData } from "@/hooks/use-lending-data";

interface RiskParametersProps {
  lendingData?: LendingOnChainData;
}

export function RiskParameters({ lendingData }: RiskParametersProps) {
  const referencePrice = lendingData?.collateralPrice || "60,000.00";

  return (
    <Card className="border border-white/10 bg-[#060f24]/60 backdrop-blur-lg relative overflow-hidden shadow-[0_8px_32px_rgba(6,15,36,0.5)]">
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-500" />

      <CardHeader className="pb-3">
        <CardTitle className="text-base font-bold text-white flex items-center gap-2">
          <Sliders className="h-4.5 w-4.5 text-[#4f8cff]" />
          Lending Parameters & Addresses
        </CardTitle>
        <CardDescription className="text-xs text-slate-400">
          On-chain parameters read directly from PayGrixLending on Arc Testnet.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="rounded-xl border border-white/5 bg-[#070e1c] divide-y divide-white/5 text-xs">
          <div className="flex justify-between items-center p-3">
            <span className="text-slate-400 font-medium">Lending Contract</span>
            <span className="text-white font-mono font-bold text-[11px]">
              0x5662...6111
            </span>
          </div>

          <div className="flex justify-between items-center p-3">
            <span className="text-slate-400 font-medium">Oracle Feed</span>
            <span className="text-purple-300 font-mono font-bold text-[11px]">
              0x2946...9A45 (${referencePrice})
            </span>
          </div>

          <div className="flex justify-between items-center p-3">
            <span className="text-slate-400 font-medium">Supported Collateral</span>
            <span className="text-white font-mono font-bold flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              cirBTC (8 decimals)
            </span>
          </div>

          <div className="flex justify-between items-center p-3">
            <span className="text-slate-400 font-medium">Borrow Asset</span>
            <span className="text-white font-mono font-bold flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-blue-400" />
              USDC (6 decimals)
            </span>
          </div>

          <div className="flex justify-between items-center p-3">
            <span className="text-slate-400 font-medium">Max Borrow LTV</span>
            <span className="text-purple-400 font-mono font-bold">50%</span>
          </div>

          <div className="flex justify-between items-center p-3">
            <span className="text-slate-400 font-medium">Liquidation Threshold</span>
            <span className="text-amber-400 font-mono font-bold">75%</span>
          </div>

          <div className="flex justify-between items-center p-3">
            <span className="text-slate-400 font-medium">Interest / Protocol Fee</span>
            <span className="text-emerald-400 font-mono font-bold">0% (V1 Prototype)</span>
          </div>
        </div>

        <p className="text-[11px] text-slate-500 italic leading-relaxed pt-1 border-t border-white/5">
          * Arc Testnet staging environment. StagingOracle price is reference-only (${referencePrice} / cirBTC). Real borrowing is disabled in Phase 2D.
        </p>
      </CardContent>
    </Card>
  );
}
