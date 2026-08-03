"use client";

import { AlertTriangle, ExternalLink, Loader2, RefreshCw, Layers } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useArcWallet } from "@/components/wallet/use-arc-wallet";
import { usePoolData } from "@/hooks/use-pool-data";
import { TokenLogo } from "@/components/bridge/swap-form";

export default function PoolPage() {
  const { address, isConnected, isArcTestnet } = useArcWallet();
  const { poolData, isLoading, error, refreshPoolData } = usePoolData(address, isArcTestnet);

  // Calculate price ratio
  const getRatio = () => {
    if (!poolData) return "0.00";
    const r0 = parseFloat(poolData.reserve0);
    const r1 = parseFloat(poolData.reserve1);
    if (r0 === 0 || r1 === 0) return "1.000";
    return (r1 / r0).toFixed(4);
  };

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <PageHeader
            eyebrow="Liquidity & Pools"
            title="USDC/EURC Liquidity Pool"
            description="Inspect the on-chain reserves, total LP token supply, and your active liquidity position."
          />
          <button
            onClick={() => refreshPoolData()}
            disabled={isLoading}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-[#060f24]/50 text-slate-400 hover:text-white hover:bg-white/5 transition-all disabled:opacity-50 shrink-0 self-start sm:self-center"
          >
            <RefreshCw className={`h-4.5 w-4.5 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Loading / Error States */}
        {isLoading && !poolData && (
          <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 rounded-2xl border border-white/5 bg-[#060f24]/30 backdrop-blur-md">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-slate-400">Loading pool data from Arc Testnet...</p>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-red-400">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <div className="text-sm">
              <span className="font-semibold">RPC Fetch Error:</span> {error}
            </div>
          </div>
        )}

        {poolData && (
          <>
            {/* Pool Status Header Card */}
            <Card className="border border-white/10 bg-[#060f24]/50 backdrop-blur-md overflow-hidden">
              <div className="p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between relative">
                {/* Smoky background glow */}
                <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-purple-600/5 to-transparent pointer-events-none" />
                <div className="flex items-center gap-4 relative z-10">
                  <div className="flex -space-x-1.5">
                    <TokenLogo symbol="USDC" className="border border-[#060f24] bg-[#070f21] shadow-lg relative z-20" />
                    <TokenLogo symbol="EURC" className="border border-[#060f24] bg-[#070f21] shadow-lg relative z-10" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-white">USDC / EURC Pool</h2>
                      <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Active</Badge>
                    </div>
                    <p className="text-xs text-slate-400">Uniswap V2 Pair • 0.30% Fee Tier</p>
                  </div>
                </div>
                <div className="text-sm text-slate-400 relative z-10">
                  Chain: <span className="font-semibold text-white">Arc Testnet (5042002)</span>
                </div>
              </div>
            </Card>

            <div className="flex justify-end -mt-2">
              <a
                href="/settings#protocol-contracts"
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
              >
                View protocol contracts
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            {/* Overview Stats Grid */}
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="border border-white/5 bg-[#060f24]/30 backdrop-blur-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold text-slate-400 uppercase tracking-wider">USDC Reserves</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">{parseFloat(poolData.reserve0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</div>
                  <p className="text-xs text-slate-500 mt-1">USD Coin pegged reserve</p>
                </CardContent>
              </Card>

              <Card className="border border-white/5 bg-[#060f24]/30 backdrop-blur-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold text-slate-400 uppercase tracking-wider">EURC Reserves</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">{parseFloat(poolData.reserve1).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</div>
                  <p className="text-xs text-slate-500 mt-1">Euro Coin pegged reserve</p>
                </CardContent>
              </Card>

              <Card className="border border-white/5 bg-[#060f24]/30 backdrop-blur-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total LP Supply</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">{parseFloat(poolData.totalSupply).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</div>
                  <p className="text-xs text-slate-500 mt-1">USDC-EURC Uni-V2 tokens</p>
                </CardContent>
              </Card>

              <Card className="border border-white/5 bg-[#060f24]/30 backdrop-blur-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Current Ratio</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">1 USDC = {getRatio()} EURC</div>
                  <p className="text-xs text-slate-500 mt-1">On-chain pool conversion rate</p>
                </CardContent>
              </Card>
            </div>

            {/* User LP Position */}
            <Card className="border border-white/10 bg-[#060f24]/50 backdrop-blur-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white font-bold">
                  <Layers className="h-5 w-5 text-primary" />
                  My LP Position
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                {!isConnected ? (
                  <div className="rounded-xl border border-dashed border-white/10 p-6 text-center">
                    <p className="text-sm text-slate-400">Wallet disconnected.</p>
                    <p className="text-xs text-slate-500 mt-1">Please connect your wallet in the navigation header to load your pool share.</p>
                  </div>
                ) : !isArcTestnet ? (
                  <div className="rounded-xl border border-dashed border-red-500/20 bg-red-500/5 p-6 text-center">
                    <p className="text-sm text-red-400 font-semibold">Wrong Network Connected</p>
                    <p className="text-xs text-slate-400 mt-1">Switch to Arc Testnet (Chain ID 5042002) in your wallet to view your position.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {/* LP Token Details */}
                    <div className="flex justify-between items-center p-3 rounded-lg bg-white/5 border border-white/5">
                      <span className="text-sm text-slate-400">My LP Balance:</span>
                      <span className="text-sm font-semibold text-white">{parseFloat(poolData.userLPBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} LP</span>
                    </div>

                    <div className="flex justify-between items-center p-3 rounded-lg bg-white/5 border border-white/5">
                      <span className="text-sm text-slate-400">My Pool Share:</span>
                      <span className="text-sm font-semibold text-white">{(poolData.userPoolShare * 100).toFixed(6)}%</span>
                    </div>

                    {/* Underlying tokens */}
                    <div className="mt-2 space-y-3">
                      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Underlying Tokens</h4>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="p-3 rounded-lg bg-slate-900/50 border border-white/5 flex flex-col gap-1">
                          <span className="text-[10px] text-slate-500 font-semibold uppercase">USDC Amount</span>
                          <span className="text-base font-bold text-white">
                            {parseFloat(poolData.underlyingUSDC).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                          </span>
                        </div>
                        <div className="p-3 rounded-lg bg-slate-900/50 border border-white/5 flex flex-col gap-1">
                          <span className="text-[10px] text-slate-500 font-semibold uppercase">EURC Amount</span>
                          <span className="text-base font-bold text-white">
                            {parseFloat(poolData.underlyingEURC).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Disabled Action Area */}
                <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t border-white/5">
                  <button
                    disabled
                    className="flex-1 py-3 px-4 rounded-xl text-sm font-semibold text-slate-400 bg-white/5 border border-white/5 cursor-not-allowed hover:bg-white/5 transition-all text-center"
                  >
                    Add Liquidity (Coming in next step)
                  </button>
                  <button
                    disabled
                    className="flex-1 py-3 px-4 rounded-xl text-sm font-semibold text-slate-400 bg-white/5 border border-white/5 cursor-not-allowed hover:bg-white/5 transition-all text-center"
                  >
                    Remove Liquidity (Coming in next step)
                  </button>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
