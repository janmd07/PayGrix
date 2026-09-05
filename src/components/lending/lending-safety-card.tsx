"use client";

import { ShieldCheck, CheckCircle2, Lock, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LendingOnChainData } from "@/hooks/use-lending-data";

interface LendingSafetyCardProps {
  lendingData?: LendingOnChainData;
  isLoading?: boolean;
}

export function LendingSafetyCard({ lendingData, isLoading }: LendingSafetyCardProps) {
  const isPaused = lendingData?.isPaused ?? true;
  const isBase = lendingData?.selectedChain === "Base";
  const isArc = lendingData?.selectedChain === "Arc";
  const poolLiquidity = lendingData?.poolLiquidity || "1.00";
  const totalDebt = lendingData?.totalOutstandingDebt || "0.00";
  const totalBadDebt = lendingData?.totalBadDebt || "0.00";
  const collateralPrice = lendingData?.collateralPrice || (isBase ? "2,500.00" : "60,000.00");
  const contractAddressShort = lendingData?.contractAddressShort || (isBase ? "0x7C5e...34b8" : "0x800C...22aE");

  return (
    <Card className="border border-emerald-500/20 bg-[#060f24]/60 backdrop-blur-lg relative overflow-hidden shadow-[0_8px_32px_rgba(6,15,36,0.5)]">
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-500 via-teal-500 to-amber-500" />

      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-bold text-white flex items-center gap-2">
            <ShieldCheck className="h-4.5 w-4.5 text-emerald-400" />
            Lending Safety & Staging Checklist
          </CardTitle>
          <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30 bg-emerald-500/10 font-mono">
            {isBase ? "Base Sepolia Verified" : isArc ? "Phase 3C Verified" : "Verification Checklist"}
          </Badge>
        </div>
        <CardDescription className="text-xs text-slate-400">
          On-chain safety parameters and contract operational state on {isBase ? "Base Sepolia." : isArc ? "Arc Testnet." : "supported networks."}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="rounded-xl border border-white/5 bg-[#070e1c] p-3 space-y-2.5 text-xs">
          {/* Item 1: Contract Deployed */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span className="text-slate-300 font-medium">Contract Deployed</span>
            </div>
            <span className="font-mono text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded font-bold">
              {contractAddressShort}
            </span>
          </div>

          {/* Item 2: Pool Liquidity Funded */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span className="text-slate-300 font-medium">Pool Liquidity</span>
            </div>
            <span className="font-mono text-emerald-400 font-bold">
              {isLoading ? "..." : `${poolLiquidity} USDC`}
            </span>
          </div>

          {/* Item 3: Contract Status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span className="text-slate-300 font-medium">Contract Status</span>
            </div>
            <span className="font-mono text-amber-300 font-semibold bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
              {isPaused ? "Paused — Staging Mode" : "Active"}
            </span>
          </div>

          {/* Item 4: Borrowing Disabled */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <span className="text-slate-300 font-medium">Borrowing</span>
            </div>
            <span className="font-mono text-red-300 font-semibold bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded">
              Disabled
            </span>
          </div>

          {/* Item 5: Oracle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span className="text-slate-300 font-medium">Oracle</span>
            </div>
            <span className="font-mono text-purple-300 font-medium">
              {isBase
                ? `Chainlink ETH/USD (${isLoading ? "..." : `$${collateralPrice}`})`
                : isArc
                ? `Testnet Simulation Oracle (${isLoading ? "..." : `$${collateralPrice}`})`
                : `Oracle (${isLoading ? "..." : `$${collateralPrice}`})`}
            </span>
          </div>

          {/* Item 6: Outstanding Debt */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span className="text-slate-300 font-medium">Outstanding Debt</span>
            </div>
            <span className="font-mono text-slate-300 font-bold">
              {isLoading ? "..." : `${totalDebt} USDC`}
            </span>
          </div>

          {/* Item 7: Total Bad Debt */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span className="text-slate-300 font-medium">Total Bad Debt</span>
            </div>
            <span className="font-mono text-emerald-400 font-bold">
              {isLoading ? "..." : `${totalBadDebt} USDC`}
            </span>
          </div>
        </div>

        {/* Safety Note */}
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 flex items-start gap-2.5 text-[11px] text-amber-200/90 leading-relaxed">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            {isBase
              ? "Base Sepolia environment: BaseSepoliaLending contract active on Base Sepolia. Supply WETH, borrow USDC, repay debt, and manage collateral on-chain."
              : isArc
              ? "Safety Staging: PayGrixLending Phase 3C remains paused on Arc Testnet. Public borrowing, deposits, repayments, and liquidations are disabled. Production borrowing is not enabled."
              : "Please connect your wallet to Arc Testnet or Base Sepolia to interact with lending."}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
