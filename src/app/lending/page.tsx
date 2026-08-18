"use client";

import { HandCoins, BookOpen, AlertTriangle } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useArcWallet } from "@/components/wallet/use-arc-wallet";
import { useLendingData } from "@/hooks/use-lending-data";
import { PositionOverview } from "@/components/lending/position-overview";
import { LendingMarketCard } from "@/components/lending/lending-market-card";
import { LendingWorkspace } from "@/components/lending/lending-workspace";
import { HowItWorks } from "@/components/lending/how-it-works";
import { RiskParameters } from "@/components/lending/risk-parameters";
import { LendingSafetyCard } from "@/components/lending/lending-safety-card";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";

export default function LendingPage() {
  const { isConnected, isArcTestnet, address } = useArcWallet();
  const { lendingData, isLoading, error } = useLendingData(address, isArcTestnet);

  const handleStartBorrowing = () => {
    const el = document.getElementById("manage-position");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleLearnHowItWorks = () => {
    const el = document.getElementById("how-it-works");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  const contractAddressShort = lendingData?.contractAddressShort || "0x800C...22aE";

  return (
    <AppShell>
      <div className="flex flex-col gap-8 max-w-7xl mx-auto">
        {/* ── STAGING & PAUSED STATUS BANNER ──────────────── */}
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-[0_4px_20px_rgba(245,158,11,0.1)]">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
            <div>
              <span className="font-bold text-amber-300">Arc Testnet — Lending Security Staging</span>
              <span className="mx-2 text-amber-500">•</span>
              <span>PayGrixLending Phase 3C contract paused (Public write operations & borrowing disabled)</span>
            </div>
          </div>
          <div className="flex items-center gap-2 font-mono shrink-0">
            <Badge variant="outline" className="border-amber-500/40 text-amber-300 bg-amber-500/10">
              Contract: {contractAddressShort}
            </Badge>
          </div>
        </div>

        {/* ── TOP HERO / HEADER SECTION ─────────────────────── */}
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#060f24] via-[#070e1c] to-[#0d1b3e] p-6 sm:p-8 lg:p-10 shadow-[0_12px_40px_rgba(6,15,36,0.6)]">
          {/* Ambient light glows */}
          <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-[#6d5dfc]/15 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-[#4f8cff]/15 blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col gap-6 max-w-3xl">
            <div className="flex items-center gap-2.5 flex-wrap">
              <Badge variant="outline" className="text-xs text-[#4f8cff] border-[#4f8cff]/30 bg-[#4f8cff]/10 font-semibold px-3 py-1">
                Arc Testnet • Security Staging
              </Badge>
              <Badge variant="outline" className="text-xs text-purple-300 border-purple-500/20 bg-purple-500/10">
                Phase 3C Testnet Simulation Oracle
              </Badge>
            </div>

            <div className="space-y-3">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-[1.15]">
                Borrow USDC against <br className="hidden sm:inline" />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#4f8cff] via-[#9d4edd] to-[#7b2cbf]">
                  your collateral.
                </span>
              </h1>
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                Inspect real-time on-chain lending reserves, liquidation thresholds, and user position metrics directly from PayGrixLending Phase 3C on Arc Testnet.
              </p>
            </div>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
              {!isConnected ? (
                <div className="flex items-center gap-3">
                  <ConnectWalletButton />
                  <Button
                    variant="outline"
                    onClick={handleLearnHowItWorks}
                    className="gap-2 border-white/10 text-slate-300 hover:text-white hover:bg-white/5"
                  >
                    <BookOpen className="h-4 w-4" />
                    Learn how it works
                  </Button>
                </div>
              ) : (
                <>
                  <Button
                    onClick={handleStartBorrowing}
                    className="gap-2 font-bold bg-gradient-to-r from-[#4f8cff] via-[#6d5dfc] to-[#9d4edd] hover:from-[#3b7cff] hover:to-[#8c3ed9] text-white shadow-[0_4px_16px_rgba(109,93,252,0.35)]"
                  >
                    <HandCoins className="h-4 w-4" />
                    Inspect Position
                  </Button>

                  <Button
                    variant="outline"
                    onClick={handleLearnHowItWorks}
                    className="gap-2 border-white/10 text-slate-300 hover:text-white hover:bg-white/5"
                  >
                    <BookOpen className="h-4 w-4" />
                    Learn how it works
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── POSITION OVERVIEW ────────────────────────────── */}
        <PositionOverview
          isConnected={isConnected}
          isArcTestnet={isArcTestnet}
          lendingData={lendingData}
          isLoading={isLoading}
        />

        {/* ── WORKSPACE & MARKET GRID ───────────────────────── */}
        <div id="manage-position" className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-6">
          {/* Left Column: Manage Position Workspace */}
          <div>
            <LendingWorkspace
              isConnected={isConnected}
              isArcTestnet={isArcTestnet}
              lendingData={lendingData}
              isLoading={isLoading}
            />
          </div>

          {/* Right Column: Market Status & Risk Parameters */}
          <div className="space-y-6">
            <LendingMarketCard
              lendingData={lendingData}
              isLoading={isLoading}
              error={error}
            />
            <LendingSafetyCard lendingData={lendingData} isLoading={isLoading} />
            <RiskParameters lendingData={lendingData} />
          </div>
        </div>

        {/* ── HOW IT WORKS ─────────────────────────────────── */}
        <HowItWorks />
      </div>
    </AppShell>
  );
}
