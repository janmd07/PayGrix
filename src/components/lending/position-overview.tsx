"use client";

import { Wallet, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";
import { LendingOnChainData } from "@/hooks/use-lending-data";

interface PositionOverviewProps {
  isConnected: boolean;
  isArcTestnet?: boolean;
  lendingData?: LendingOnChainData;
  isLoading?: boolean;
}

export function PositionOverview({ isConnected, lendingData, isLoading }: PositionOverviewProps) {
  const hasActivePosition = lendingData && (lendingData.userCollateralRaw > BigInt(0) || lendingData.userDebtRaw > BigInt(0));

  return (
    <Card className="border border-white/10 bg-[#060f24]/60 backdrop-blur-lg relative overflow-hidden shadow-[0_4px_24px_rgba(6,15,36,0.4)]">
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#4f8cff] via-[#6d5dfc] to-[#9d4edd]" />

      <CardHeader className="p-3.5 sm:p-4 pb-2 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm font-bold text-white flex items-center gap-1.5">
            <Activity className="h-4 w-4 text-[#4f8cff]" />
            Your Position Overview
          </CardTitle>

          {!isConnected ? (
            <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-500/20 bg-amber-500/10 px-2 py-0.5">
              Disconnected
            </Badge>
          ) : hasActivePosition ? (
            <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5">
              Active Position
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] text-slate-400 border-white/10 bg-white/5 px-2 py-0.5">
              No active position
            </Badge>
          )}
        </div>
        <span className="text-[11px] text-slate-400 hidden sm:inline-block">
          Arc Testnet (5042002)
        </span>
      </CardHeader>

      <CardContent className="p-3.5 sm:p-4 pt-1">
        {!isConnected ? (
          <div className="flex flex-col sm:flex-row items-center justify-between p-4 rounded-xl border border-dashed border-white/10 bg-[#070e1c]/50 gap-3">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-[#4f8cff]/10 border border-[#4f8cff]/20 flex items-center justify-center text-[#4f8cff] shrink-0">
                <Wallet className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-white">Connect wallet to view your position</p>
                <p className="text-[11px] text-slate-400">
                  Inspect collateral balances, active debt, and borrowing power on-chain.
                </p>
              </div>
            </div>
            <div className="shrink-0">
              <ConnectWalletButton />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Metric 1: Supplied Collateral */}
            <div className="rounded-xl border border-white/5 bg-[#070e1c] p-3 space-y-1 transition-all hover:border-white/10">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                Supplied Collateral
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-lg sm:text-xl font-bold text-white font-mono">
                  {isLoading ? "Loading..." : lendingData?.userCollateral || "0.00"}
                </span>
                <span className="text-[11px] font-semibold text-[#4f8cff]">cirBTC</span>
              </div>
              <span className="text-[10px] text-slate-400 block font-mono">
                Wallet: {isLoading ? "Loading..." : lendingData?.userCirBtcBalance || "0.00"} cirBTC
              </span>
            </div>

            {/* Metric 2: Collateral Value */}
            <div className="rounded-xl border border-white/5 bg-[#070e1c] p-3 space-y-1 transition-all hover:border-white/10">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                Collateral Value
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-lg sm:text-xl font-bold text-slate-200 font-mono">
                  {isLoading ? "Loading..." : lendingData?.userCollateralValueUsdc || "$0.00"}
                </span>
              </div>
              <span className="text-[10px] text-slate-500 block">Oracle: $60,000/BTC</span>
            </div>

            {/* Metric 3: Current Debt */}
            <div className="rounded-xl border border-white/5 bg-[#070e1c] p-3 space-y-1 transition-all hover:border-white/10">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                Current Debt
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-lg sm:text-xl font-bold text-white font-mono">
                  {isLoading ? "Loading..." : lendingData?.userDebt || "0.00"}
                </span>
                <span className="text-[11px] font-semibold text-emerald-400">USDC</span>
              </div>
              <span className="text-[10px] text-slate-500 block">Borrowed balance</span>
            </div>

            {/* Metric 4: Borrowing Power */}
            <div className="rounded-xl border border-white/5 bg-[#070e1c] p-3 space-y-1 transition-all hover:border-white/10">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                Borrowing Power
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-lg sm:text-xl font-bold text-purple-300 font-mono">
                  {isLoading ? "Loading..." : lendingData?.userMaxBorrow || "0.00"}
                </span>
                <span className="text-[11px] font-semibold text-purple-400">USDC</span>
              </div>
              <span className="text-[10px] text-slate-500 block">50% Max LTV</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
