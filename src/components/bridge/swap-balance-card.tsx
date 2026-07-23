"use client";

import { Wallet, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface SwapBalanceCardProps {
  usdcBalance: string;
  eurcBalance: string;
  cirbtcBalance: string;
  isLoading: boolean;
  onRefresh: () => void;
}

export function SwapBalanceCard({
  usdcBalance,
  eurcBalance,
  cirbtcBalance,
  isLoading,
  onRefresh,
}: SwapBalanceCardProps) {
  return (
    <Card className="relative overflow-hidden border border-white/10 bg-[#060f24]/50 backdrop-blur-md">
      {/* Decorative accent gradient background */}
      <div className="absolute top-0 right-0 -mr-16 -mt-16 h-36 w-36 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">Arc Testnet Balances</p>
              <p className="text-[10px] text-slate-500 font-semibold">Available for Swap</p>
            </div>
          </div>

          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:bg-white/10 hover:text-slate-200 transition-all disabled:opacity-40"
            title="Refresh balances"
          >
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">USDC Balance</span>
            <div className="flex items-baseline gap-1.5">
              {isLoading ? (
                <div className="h-7 w-20 animate-pulse rounded bg-white/10" />
              ) : (
                <span className="text-xl font-bold tracking-tight text-white font-mono">
                  {parseFloat(usdcBalance).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              )}
              <span className="text-[10px] font-semibold text-[#4f8cff]">USDC</span>
            </div>
          </div>

          <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-white/5 pt-3 sm:pt-0 sm:pl-4">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">EURC Balance</span>
            <div className="flex items-baseline gap-1.5">
              {isLoading ? (
                <div className="h-7 w-20 animate-pulse rounded bg-white/10" />
              ) : (
                <span className="text-xl font-bold tracking-tight text-white font-mono">
                  {parseFloat(eurcBalance).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              )}
              <span className="text-[10px] font-semibold text-purple-400">EURC</span>
            </div>
          </div>

          <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-white/5 pt-3 sm:pt-0 sm:pl-4">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">cirBTC Balance</span>
            <div className="flex items-baseline gap-1.5">
              {isLoading ? (
                <div className="h-7 w-20 animate-pulse rounded bg-white/10" />
              ) : (
                <span className="text-xl font-bold tracking-tight text-white font-mono">
                  {parseFloat(cirbtcBalance).toLocaleString(undefined, {
                    minimumFractionDigits: 4,
                    maximumFractionDigits: 6,
                  })}
                </span>
              )}
              <span className="text-[10px] font-semibold text-amber-500">cirBTC</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
