"use client";

import { useState, useEffect } from "react";
import { HandCoins, BookOpen } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useArcWallet } from "@/components/wallet/use-arc-wallet";
import { useLendingData } from "@/hooks/use-lending-data";
import { PositionOverview } from "@/components/lending/position-overview";
import { LendingWorkspace } from "@/components/lending/lending-workspace";
import { CompactLendingMarket } from "@/components/lending/compact-lending-market";
import { HowItWorks } from "@/components/lending/how-it-works";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";
import { SupportedLendingChain } from "@/config/lending-config";

export default function LendingPage() {
  const { isConnected, isArcTestnet, address, chainId } = useArcWallet();
  const [selectedChain, setSelectedChain] = useState<SupportedLendingChain>("Arc");

  // Sync selected chain with wallet network when user switches chain in their wallet
  useEffect(() => {
    if (chainId === 84532) {
      setSelectedChain("Base");
    } else if (chainId === 5042002) {
      setSelectedChain("Arc");
    }
  }, [chainId]);

  const { lendingData, isLoading, refreshLendingData } = useLendingData(address, selectedChain, isArcTestnet);

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

  if (!isConnected) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[60vh] py-8 px-4">
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#060f24] via-[#070e1c] to-[#0d1b3e] p-8 text-center shadow-[0_8px_32px_rgba(6,15,36,0.4)]">
            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-[#4f8cff] via-[#6d5dfc] to-[#9d4edd]" />
            
            <div className="flex flex-col items-center gap-5">
              {/* Small Lending badge */}
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] text-[#4f8cff] border-[#4f8cff]/30 bg-[#4f8cff]/10 font-semibold px-2.5 py-0.5">
                  Lending
                </Badge>
              </div>

              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#6d5dfc]/10 border border-[#6d5dfc]/20 text-[#4f8cff] shadow-inner">
                <HandCoins className="h-7 w-7" />
              </div>

              {/* Title & Description */}
              <div className="space-y-2">
                <h1 className="text-xl font-bold text-white tracking-tight">
                  Connect your wallet to access Lending
                </h1>
                <p className="text-xs text-slate-300 leading-relaxed max-w-sm mx-auto">
                  Connect your wallet to view your collateral, borrowing power, debt, and lending actions on Arc Testnet and Base Sepolia.
                </p>
              </div>

              {/* Prominent Connect Wallet Button */}
              <div className="pt-2 pb-1">
                <ConnectWalletButton />
              </div>

              {/* Network badges */}
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="text-[10px] text-slate-400 border-white/10 bg-white/5 font-mono px-2 py-0.5">
                  Arc Testnet
                </Badge>
                <Badge variant="outline" className="text-[10px] text-slate-400 border-white/10 bg-white/5 font-mono px-2 py-0.5">
                  Base Sepolia
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  const isBase = selectedChain === "Base";

  return (
    <AppShell>
      <div className="flex flex-col gap-5 max-w-6xl mx-auto">
        {/* ── 1. COMPACT LENDING HEADER ───────────────────── */}
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#060f24] via-[#070e1c] to-[#0d1b3e] p-4 sm:p-5 shadow-[0_8px_32px_rgba(6,15,36,0.4)]">
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1.5 max-w-2xl">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] text-[#4f8cff] border-[#4f8cff]/30 bg-[#4f8cff]/10 font-semibold px-2 py-0.5">
                  {isBase ? "Base Sepolia • Chain ID 84532" : "Arc Testnet • Security Staging"}
                </Badge>
                <Badge variant="outline" className="text-[10px] text-purple-300 border-purple-500/20 bg-purple-500/10 px-2 py-0.5">
                  {isBase 
                    ? `Chainlink Oracle ($${lendingData?.collateralPrice || "2,500.00"}/ETH)`
                    : `Simulation Oracle ($${lendingData?.collateralPrice || "60,000.00"}/BTC)`}
                </Badge>
              </div>

              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                Borrow USDC against{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#4f8cff] via-[#9d4edd] to-[#7b2cbf]">
                  your collateral.
                </span>
              </h1>
              <p className="text-xs text-slate-300 leading-relaxed">
                {isBase
                  ? "Supply WETH collateral, borrow USDC up to 50% LTV, repay debt, and manage your position on Base Sepolia."
                  : "Supply cirBTC collateral, borrow USDC up to 50% LTV, repay debt, and manage your position on PayGrixLending."}
              </p>
            </div>

            {/* Compact Header CTAs */}
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                onClick={handleStartBorrowing}
                className="h-9 gap-1.5 text-xs font-bold bg-gradient-to-r from-[#4f8cff] via-[#6d5dfc] to-[#9d4edd] hover:from-[#3b7cff] hover:to-[#8c3ed9] text-white shadow-md shadow-purple-600/20"
              >
                <HandCoins className="h-3.5 w-3.5" />
                Inspect Position
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleLearnHowItWorks}
                className="h-9 gap-1.5 text-xs border-white/10 text-slate-300 hover:text-white hover:bg-white/5"
              >
                <BookOpen className="h-3.5 w-3.5" />
                How it works
              </Button>
            </div>
          </div>
        </div>

        {/* ── 3. COMPACT POSITION OVERVIEW ────────────────── */}
        <PositionOverview
          isConnected={isConnected}
          isArcTestnet={isArcTestnet}
          lendingData={lendingData}
          isLoading={isLoading}
        />

        {/* ── 4. MAIN LENDING WORKSPACE ────────────────────── */}
        <div id="manage-position">
          <LendingWorkspace
            isConnected={isConnected}
            isArcTestnet={isArcTestnet}
            lendingData={lendingData}
            isLoading={isLoading}
            refreshLendingData={refreshLendingData}
            selectedChain={selectedChain}
            onChainChange={setSelectedChain}
          />
        </div>

        {/* ── 5. COMPACT MARKET SUMMARY ───────────────────── */}
        <CompactLendingMarket
          lendingData={lendingData}
          isLoading={isLoading}
        />

        {/* ── 6. HOW IT WORKS ─────────────────────────────── */}
        <HowItWorks />
      </div>
    </AppShell>
  );
}
