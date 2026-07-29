"use client";

import { useState, useEffect } from "react";
import { useArcWallet } from "@/components/wallet/use-arc-wallet";
import { useBridgeBalance } from "@/hooks/use-bridge-balance";
import { StatCard } from "@/components/profile/stat-card";
import { CreditCard, QrCode, ArrowLeftRight, Shuffle, Landmark } from "lucide-react";

export function StatisticsSection() {
  const { address, isConnected } = useArcWallet();
  const [stats, setStats] = useState({
    payrollCount: 0,
    paymentCount: 0,
    bridgeCount: 0,
    swapCount: 0,
  });
  const [mounted, setMounted] = useState(false);

  // Load Treasury Balance from Arc Testnet
  const { balance: arcUsdcBalance, isLoading: isBalanceLoading } = useBridgeBalance(
    "Arc Testnet",
    address
  );

  useEffect(() => {
    setMounted(true);
    if (!isConnected || !address) return;

    // 1. Payroll Runs count from localStorage
    let payrolls = 0;
    try {
      const storedBatches = localStorage.getItem("arc_payroll_batches");
      if (storedBatches) {
        const batches = JSON.parse(storedBatches);
        // Only count executed (Paid or Partially Paid) batches
        payrolls = batches.filter(
          (b: { status: string }) => b.status === "Paid" || b.status === "Partially Paid"
        ).length;
      }
    } catch (err) {
      console.error("Failed to parse payroll batches statistics:", err);
    }

    // 2. Payments count
    let payments = 0;
    try {
      const storedPayments = localStorage.getItem(`paygrid_history_${address.toLowerCase()}`);
      if (storedPayments) {
        payments = JSON.parse(storedPayments).length;
      }
    } catch (err) {
      console.error("Failed to parse payment history statistics:", err);
    }

    // 3. Bridge Transactions count
    let bridges = 0;
    try {
      const storedTransfers = localStorage.getItem("bridge_transfers");
      if (storedTransfers) {
        bridges = JSON.parse(storedTransfers).length;
      }
    } catch (err) {
      console.error("Failed to parse bridge transfers statistics:", err);
    }

    // 4. Swap Transactions count
    let swaps = 0;
    try {
      const storedSwaps = localStorage.getItem("swap_history");
      if (storedSwaps) {
        swaps = JSON.parse(storedSwaps).length;
      }
    } catch (err) {
      console.error("Failed to parse swap history statistics:", err);
    }

    setStats({
      payrollCount: payrolls,
      paymentCount: payments,
      bridgeCount: bridges,
      swapCount: swaps,
    });
  }, [isConnected, address]);

  if (!mounted) {
    return (
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-32 rounded-xl bg-white/5 animate-pulse border border-white/5" />
        ))}
      </div>
    );
  }

  // Graceful empty states if no wallet is connected
  const showEmpty = !isConnected || !address;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-white tracking-wide">PayGrix Operations</h2>
        <p className="text-xs text-slate-400 font-medium mt-0.5">
          Your direct operational metrics on the PayGrix platform.
        </p>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        <StatCard
          title="Payroll Runs"
          value={stats.payrollCount}
          subtitle="All-time executed runs"
          icon={<CreditCard className="h-5 w-5" />}
          emptyState={showEmpty || stats.payrollCount === 0}
          emptyText="No runs executed"
        />

        <StatCard
          title="Payments"
          value={stats.paymentCount}
          subtitle="USDC payments settled"
          icon={<QrCode className="h-5 w-5" />}
          emptyState={showEmpty || stats.paymentCount === 0}
          emptyText="No payments"
        />

        <StatCard
          title="Bridge Transactions"
          value={stats.bridgeCount}
          subtitle="Cross-chain transactions"
          icon={<ArrowLeftRight className="h-5 w-5" />}
          emptyState={showEmpty || stats.bridgeCount === 0}
          emptyText="No transfers"
        />

        <StatCard
          title="Swap Transactions"
          value={stats.swapCount}
          subtitle="Tokens exchanged"
          icon={<Shuffle className="h-5 w-5" />}
          emptyState={showEmpty || stats.swapCount === 0}
          emptyText="No swaps"
        />

        <StatCard
          title="Treasury Balance"
          value={
            isConnected
              ? `${parseFloat(arcUsdcBalance).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} USDC`
              : "0.00 USDC"
          }
          subtitle="Arc Testnet Treasury"
          icon={<Landmark className="h-5 w-5" />}
          isLoading={isConnected && isBalanceLoading}
          emptyState={showEmpty}
          emptyText="Connect Wallet"
        />
      </div>
    </div>
  );
}
