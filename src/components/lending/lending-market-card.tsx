"use client";

import { useState } from "react";
import { Landmark, Info, ExternalLink, History, Lock, ShieldCheck, HelpCircle, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LendingOnChainData } from "@/hooks/use-lending-data";

// Confirmed Historical Funding Activity Metadata
const HISTORICAL_FUNDING_TX = {
  hash: "0x92b52f91001df98c7d230f362ccf94f1785802bb3851ae959fa829bc0867b653",
  amount: "1.00 USDC",
  action: "Phase 2E Pool Funding",
  network: "Arc Testnet",
  status: "Confirmed",
  arcScanUrl: "https://testnet.arcscan.app/tx/0x92b52f91001df98c7d230f362ccf94f1785802bb3851ae959fa829bc0867b653",
};

const PHASE_3C_FUNDING_TX = {
  hash: "0xe0f1c3230f073b2284746b2266baeb4ef016922c6f4bd5d7695e17c5629e5f8a",
  amount: "1.00 USDC",
  action: "Phase 3C Controlled Staging Funding",
  network: "Arc Testnet",
  status: "Confirmed",
  arcScanUrl: "https://testnet.arcscan.app/tx/0xe0f1c3230f073b2284746b2266baeb4ef016922c6f4bd5d7695e17c5629e5f8a",
};

interface LendingMarketCardProps {
  lendingData?: LendingOnChainData;
  isLoading?: boolean;
  error?: string | null;
}

export function LendingMarketCard({ lendingData, isLoading, error }: LendingMarketCardProps) {
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);

  const isPaused = lendingData?.isPaused ?? true;
  const poolLiquidity = lendingData?.poolLiquidity || "1.00";
  const totalDebt = lendingData?.totalOutstandingDebt || "0.00";
  const totalBadDebt = lendingData?.totalBadDebt || "0.00";
  const collateralPrice = lendingData?.collateralPrice || "60,000.00";
  const contractAddressShort = lendingData?.contractAddressShort || "0x800C...22aE";
  const oracleAddressShort = lendingData?.oracleAddressShort || "0xA17B...2287";

  return (
    <>
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
                {isPaused ? "Paused — Staging Mode" : "Active"}
              </Badge>
            </div>
          </div>
          <CardDescription className="text-xs text-slate-400">
            Arc Testnet primary USDC lending reserve pool status on PayGrixLending Phase 3C contract ({contractAddressShort}).
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {error ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300 flex items-center gap-2">
              <Info className="h-4 w-4 shrink-0 text-red-400" />
              <span>Unable to query live on-chain market data</span>
            </div>
          ) : null}

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="rounded-xl border border-white/5 bg-[#070e1c] p-3 space-y-1">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                Available Liquidity
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-bold text-white font-mono">
                  {isLoading ? "..." : poolLiquidity}
                </span>
                <span className="text-[10px] font-semibold text-emerald-400">USDC</span>
              </div>
            </div>

            <div className="rounded-xl border border-white/5 bg-[#070e1c] p-3 space-y-1">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                Outstanding Debt
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-bold text-white font-mono">
                  {isLoading ? "..." : totalDebt}
                </span>
                <span className="text-[10px] font-semibold text-emerald-400">USDC</span>
              </div>
            </div>

            <div className="rounded-xl border border-white/5 bg-[#070e1c] p-3 space-y-1">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                Total Bad Debt
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-bold text-emerald-400 font-mono">
                  {isLoading ? "..." : totalBadDebt}
                </span>
                <span className="text-[10px] font-semibold text-emerald-400">USDC</span>
              </div>
            </div>
          </div>

          {/* Oracle & Environment Summary */}
          <div className="rounded-xl border border-white/5 bg-[#070e1c] p-3.5 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Oracle Reference
                </span>
                <span className="text-purple-300 font-mono font-medium text-[11px]">
                  Testnet Simulation Oracle ({oracleAddressShort})
                </span>
              </div>
              <div className="text-right">
                <span className="font-mono font-bold text-purple-300 block text-sm">
                  {isLoading ? "..." : `$${collateralPrice}`}
                </span>
                <span className="text-[10px] text-slate-400">per cirBTC</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[11px]">
              <span className="text-slate-400">Contract Target</span>
              <span className="font-mono text-white font-bold">{contractAddressShort}</span>
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Environment</span>
              <span className="font-mono text-amber-300 font-bold">Arc Testnet / Phase 3C Staging</span>
            </div>
          </div>

          {/* Staging Alert Notice */}
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 flex items-start gap-3 text-xs text-amber-200/90">
            <Lock className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              Phase 3C staging contract is paused on Arc Testnet (Chain ID 5042002). Borrowing, deposit, withdraw, repay, and liquidation write operations are disabled. Production borrowing is not enabled.
            </p>
          </div>

          {/* Staging Pool Funding Info Button (Read-Only) */}
          <Button
            type="button"
            onClick={() => setIsInfoModalOpen(true)}
            variant="outline"
            className="w-full bg-[#070e1c] hover:bg-white/5 border border-amber-500/30 text-amber-300 hover:text-amber-200 font-semibold text-xs h-10 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <HelpCircle className="h-4 w-4 text-amber-400" />
            Staging Reserve Pool Information
          </Button>

          {/* ── LATEST CONFIRMED ACTIVITY SECTION ───────────── */}
          <div className="rounded-xl border border-white/10 bg-[#040a17]/80 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
                <History className="h-3.5 w-3.5 text-purple-400" />
                Latest Confirmed Activity
              </span>
              <Badge variant="outline" className="text-[10px] text-purple-300 border-purple-500/30 bg-purple-500/10">
                Phase 3C On-Chain
              </Badge>
            </div>

            <div className="space-y-2 text-xs">
              {/* Phase 3C Staging Funding Tx */}
              <div className="rounded-lg border border-white/5 bg-[#070e1c] p-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-semibold text-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    <span>{PHASE_3C_FUNDING_TX.action}</span>
                  </div>
                  <span className="font-mono text-emerald-400 font-bold text-[11px]">
                    {PHASE_3C_FUNDING_TX.amount}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Network: {PHASE_3C_FUNDING_TX.network}</span>
                  <Badge variant="outline" className="text-[9px] text-emerald-400 border-emerald-500/20 bg-emerald-500/10 py-0 px-1.5">
                    {PHASE_3C_FUNDING_TX.status}
                  </Badge>
                </div>
                <a
                  href={PHASE_3C_FUNDING_TX.arcScanUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[10px] font-mono text-purple-400 hover:text-purple-300 hover:underline pt-0.5"
                >
                  <span>Tx: {PHASE_3C_FUNDING_TX.hash.slice(0, 10)}...{PHASE_3C_FUNDING_TX.hash.slice(-8)}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </div>

              {/* Historical Tx */}
              <div className="rounded-lg border border-white/5 bg-[#070e1c] p-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
                    <span>{HISTORICAL_FUNDING_TX.action}</span>
                  </div>
                  <span className="font-mono text-purple-300 font-bold text-[11px]">
                    {HISTORICAL_FUNDING_TX.amount}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Status: {HISTORICAL_FUNDING_TX.status}</span>
                  <Badge variant="outline" className="text-[9px] text-purple-300 border-purple-500/20 bg-purple-500/10 py-0 px-1.5">
                    Confirmed
                  </Badge>
                </div>
                <a
                  href={HISTORICAL_FUNDING_TX.arcScanUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[10px] font-mono text-purple-400 hover:text-purple-300 hover:underline pt-0.5"
                >
                  <span>Tx: {HISTORICAL_FUNDING_TX.hash.slice(0, 10)}...{HISTORICAL_FUNDING_TX.hash.slice(-8)}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Read-Only Informational Staging Modal */}
      <AnimatePresence>
        {isInfoModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsInfoModalOpen(false)}
              className="fixed inset-0 bg-black/70 backdrop-blur-md"
            />

            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#060f24] p-6 shadow-[0_8px_32px_rgba(6,15,36,0.8)] space-y-5"
            >
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-amber-500/80 via-purple-500/80 to-blue-500/80" />

              <button
                type="button"
                onClick={() => setIsInfoModalOpen(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="space-y-1.5 pt-1">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Staging Reserve Information</h3>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  PayGrix Lending Phase 3C security staging parameters on Arc Testnet.
                </p>
              </div>

              <div className="rounded-xl border border-white/5 bg-[#070e1c] p-3 text-xs space-y-2 divide-y divide-white/5">
                <div className="flex justify-between items-center pb-1">
                  <span className="text-slate-400">Target Contract</span>
                  <span className="font-mono text-white text-[11px] font-bold">0x800C...22aE</span>
                </div>
                <div className="flex justify-between items-center pt-1.5 pb-1">
                  <span className="text-slate-400">Oracle Infrastructure</span>
                  <span className="font-mono text-purple-300 text-[11px]">Testnet Simulation Oracle</span>
                </div>
                <div className="flex justify-between items-center pt-1.5 pb-1">
                  <span className="text-slate-400">Current Pool Liquidity</span>
                  <span className="font-mono font-bold text-emerald-400">{poolLiquidity} USDC</span>
                </div>
                <div className="flex justify-between items-center pt-1.5 pb-1">
                  <span className="text-slate-400">Outstanding Debt</span>
                  <span className="font-mono text-white">{totalDebt} USDC</span>
                </div>
                <div className="flex justify-between items-center pt-1.5 pb-1">
                  <span className="text-slate-400">Total Bad Debt</span>
                  <span className="font-mono text-emerald-400">{totalBadDebt} USDC</span>
                </div>
                <div className="flex justify-between items-center pt-1.5">
                  <span className="text-slate-400">Contract Safety State</span>
                  <span className="font-mono text-amber-300 font-bold">Paused (Staging Mode)</span>
                </div>
              </div>

              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 flex items-start gap-2.5 text-xs text-amber-200/90">
                <Lock className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  Public wallet write transactions (funding, borrowing, collateral deposit, repay, liquidation) are disabled. Testnet funding is controlled via audited deployment scripts during security evaluation.
                </p>
              </div>

              <Button
                type="button"
                onClick={() => setIsInfoModalOpen(false)}
                className="w-full text-xs font-bold h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-white cursor-pointer"
              >
                Close
              </Button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
