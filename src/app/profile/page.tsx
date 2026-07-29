"use client";

import { useState, useEffect } from "react";
import { useArcWallet } from "@/components/wallet/use-arc-wallet";
import { AppShell } from "@/components/layout/app-shell";

// Profile Components
import { ProfileHeader } from "@/components/profile/profile-header";
import { WalletCard } from "@/components/profile/wallet-card";
import { ReputationCard } from "@/components/profile/reputation-card";
import { PortfolioCard } from "@/components/profile/portfolio-card";
import { StatisticsSection } from "@/components/profile/statistics-section";
import { WalletStatsCard } from "@/components/profile/wallet-stats-card";
import { Timeline } from "@/components/profile/timeline";
import { HealthCard } from "@/components/profile/health-card";
import { NetworkActivityCard } from "@/components/profile/network-activity-card";
import { ShareProfileCard } from "@/components/profile/share-profile-card";

export default function ProfilePage() {
  const { address, isConnected } = useArcWallet();
  const [mounted, setMounted] = useState(false);
  const [stats, setStats] = useState({
    payrollRuns: 0,
    payments: 0,
    bridgeTransactions: 0,
    swapTransactions: 0,
    contributorsCount: 0,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isConnected || !address) return;

    // Load actual local storage records to update reputation calculations
    let payrolls = 0;
    try {
      const payrollData = localStorage.getItem("arc_payroll_batches");
      if (payrollData) {
        payrolls = JSON.parse(payrollData).filter(
          (b: { status: string }) => b.status === "Paid" || b.status === "Partially Paid"
        ).length;
      }
    } catch {}

    let payments = 0;
    try {
      const paymentData = localStorage.getItem(`paygrid_history_${address.toLowerCase()}`);
      if (paymentData) {
        payments = JSON.parse(paymentData).length;
      }
    } catch {}

    let bridges = 0;
    try {
      const bridgeData = localStorage.getItem("bridge_transfers");
      if (bridgeData) {
        bridges = JSON.parse(bridgeData).length;
      }
    } catch {}

    let swaps = 0;
    try {
      const swapData = localStorage.getItem("swap_history");
      if (swapData) {
        swaps = JSON.parse(swapData).length;
      }
    } catch {}

    let contributors = 0;
    try {
      const rosterData = localStorage.getItem("arc_contributors");
      if (rosterData) {
        contributors = JSON.parse(rosterData).length;
      }
    } catch {}

    setStats({
      payrollRuns: payrolls,
      payments,
      bridgeTransactions: bridges,
      swapTransactions: swaps,
      contributorsCount: contributors,
    });
  }, [isConnected, address]);

  if (!mounted) {
    return (
      <AppShell>
        <div className="space-y-6 animate-pulse mt-4">
          <div className="h-8 w-48 bg-white/5 rounded" />
          <div className="grid gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3 space-y-6">
              <div className="h-32 bg-white/5 rounded-xl" />
              <div className="h-48 bg-white/5 rounded-xl" />
            </div>
            <div className="lg:col-span-2 space-y-6">
              <div className="h-48 bg-white/5 rounded-xl" />
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <ProfileHeader />

        {/* Responsive Grid Layout */}
        <div className="grid gap-6 lg:grid-cols-5 items-start">
          {/* Left Column (Main): 3/5 width on desktop */}
          <div className="lg:col-span-3 space-y-6">
            <WalletCard />
            <PortfolioCard />
            <StatisticsSection />
            <WalletStatsCard />
            <Timeline />
            <ShareProfileCard />
          </div>

          {/* Right Column (Sidebar): 2/5 width on desktop */}
          <div className="lg:col-span-2 space-y-6">
            <ReputationCard stats={stats} />
            <HealthCard />
            <NetworkActivityCard />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
