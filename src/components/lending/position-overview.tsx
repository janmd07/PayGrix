"use client";

import { Wallet, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
    <Card className="border border-white/10 bg-[#060f24]/60 backdrop-blur-lg relative overflow-hidden shadow-[0_8px_32px_rgba(6,15,36,0.5)]">
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#4f8cff] via-[#6d5dfc] to-[#9d4edd]" />

      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pb-4">
        <div>
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
              <Activity className="h-5 w-5 text-[#4f8cff]" />
              Your Position
            </CardTitle>

            {!isConnected ? (
              <Badge variant="outline" className="text-xs text-amber-400 border-amber-500/20 bg-amber-500/10">
                Disconnected
              </Badge>
            ) : hasActivePosition ? (
              <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/20 bg-emerald-500/10">
                Active Position
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs text-slate-400 border-white/10 bg-white/5">
                No active position
              </Badge>
            )}
          </div>
          <CardDescription className="text-xs text-slate-400 mt-1">
            Real-time on-chain position state read directly from PayGrixLending on Arc Testnet.
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent>
        {!isConnected ? (
          <div className="flex flex-col items-center justify-center p-6 text-center rounded-xl border border-dashed border-white/10 bg-[#070e1c]/50 space-y-3">
            <div className="h-10 w-10 rounded-full bg-[#4f8cff]/10 border border-[#4f8cff]/20 flex items-center justify-center text-[#4f8cff]">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Connect wallet to view your position</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Link your Web3 wallet to inspect collateral balances, active debt, and borrowing power.
              </p>
            </div>
            <div className="pt-1">
              <ConnectWalletButton />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Metric 1: Supplied Collateral */}
            <div className="rounded-xl border border-white/5 bg-[#070e1c] p-4 space-y-1.5 transition-all hover:border-white/10">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Supplied Collateral
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl sm:text-2xl font-bold text-white font-mono">
                  {isLoading ? "..." : lendingData?.userCollateral || "0.00"}
                </span>
                <span className="text-xs font-semibold text-[#4f8cff]">cirBTC</span>
              </div>
              <span className="text-[10px] text-slate-400 block font-mono">
                Wallet Balance: {isLoading ? "..." : lendingData?.userCirBtcBalance || "0.00"} cirBTC
              </span>
            </div>

            {/* Metric 2: Collateral Value */}
            <div className="rounded-xl border border-white/5 bg-[#070e1c] p-4 space-y-1.5 transition-all hover:border-white/10">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Collateral Value
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl sm:text-2xl font-bold text-slate-200 font-mono">
                  {isLoading ? "..." : lendingData?.userCollateralValueUsdc || "$0.00"}
                </span>
              </div>
              <span className="text-[10px] text-slate-500 block">Derived from Oracle ($60,000/BTC)</span>
            </div>

            {/* Metric 3: Current Debt */}
            <div className="rounded-xl border border-white/5 bg-[#070e1c] p-4 space-y-1.5 transition-all hover:border-white/10">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Current Debt
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl sm:text-2xl font-bold text-white font-mono">
                  {isLoading ? "..." : lendingData?.userDebt || "0.00"}
                </span>
                <span className="text-xs font-semibold text-emerald-400">USDC</span>
              </div>
              <span className="text-[10px] text-slate-500 block">Borrowed balance</span>
            </div>

            {/* Metric 4: Borrowing Power */}
            <div className="rounded-xl border border-white/5 bg-[#070e1c] p-4 space-y-1.5 transition-all hover:border-white/10">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Borrowing Power
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl sm:text-2xl font-bold text-purple-300 font-mono">
                  {isLoading ? "..." : lendingData?.userMaxBorrow || "0.00"}
                </span>
                <span className="text-xs font-semibold text-purple-400">USDC</span>
              </div>
              <span className="text-[10px] text-slate-500 block">Based on 50% max LTV</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
