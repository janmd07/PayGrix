"use client";

import { useState, useEffect } from "react";
import { useArcWallet } from "@/components/wallet/use-arc-wallet";
import { Trophy, Lock, HelpCircle } from "lucide-react";

interface BadgeProps {
  id: string;
  name: string;
  description: string;
  status: "Unlocked" | "Locked" | "Coming Soon";
  iconName: string;
}

function BadgeTile({ name, description, status }: Omit<BadgeProps, "id" | "iconName">) {
  const isUnlocked = status === "Unlocked";
  const isComingSoon = status === "Coming Soon";

  return (
    <div
      className={`relative flex flex-col items-center justify-between p-5 rounded-2xl border text-center transition-premium overflow-hidden h-full ${
        isUnlocked
          ? "bg-gradient-to-b from-[#6d5dfc]/10 to-[#4f8cff]/5 border-[#6d5dfc]/30 shadow-[0_8px_32px_rgba(109,93,252,0.08)] group hover:border-[#6d5dfc]/70 hover:shadow-[0_8px_32px_rgba(109,93,252,0.18)]"
          : isComingSoon
          ? "bg-white/2 border-dashed border-white/10 opacity-70"
          : "bg-[#020714] border-white/5 opacity-40"
      }`}
    >
      {/* Icon Frame */}
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-full mb-3 border transition-transform duration-300 ${
          isUnlocked
            ? "bg-[#6d5dfc]/15 text-[#4f8cff] border-[#6d5dfc]/30 group-hover:scale-115 group-hover:drop-shadow-[0_0_8px_rgba(109,93,252,0.5)]"
            : isComingSoon
            ? "bg-white/5 text-slate-500 border-white/5"
            : "bg-white/2 text-slate-600 border-white/5"
        }`}
      >
        {isUnlocked ? (
          <Trophy className="h-5 w-5" />
        ) : isComingSoon ? (
          <HelpCircle className="h-5 w-5" />
        ) : (
          <Lock className="h-5 w-5" />
        )}
      </div>

      {/* Text Meta */}
      <div className="space-y-1">
        <p
          className={`text-sm font-bold tracking-wide ${
            isUnlocked ? "text-white" : isComingSoon ? "text-slate-400" : "text-slate-500"
          }`}
        >
          {name}
        </p>
        <p className="text-[10px] leading-relaxed text-slate-400 font-medium px-1">
          {description}
        </p>
      </div>

      {/* Bottom status indicator */}
      <span
        className={`mt-4 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-widest border ${
          isUnlocked
            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.1)]"
            : isComingSoon
            ? "bg-white/5 text-slate-400 border-white/10"
            : "bg-rose-500/5 text-rose-400 border-rose-500/10"
        }`}
      >
        {status}
      </span>
    </div>
  );
}

export function AchievementCard() {
  const { address, isConnected } = useArcWallet();
  const [stats, setStats] = useState({
    hasPayroll: false,
    hasPayment: false,
    hasBridge: false,
    hasSwap: false,
    hasRoster: false,
  });

  useEffect(() => {
    if (!isConnected || !address) {
      setStats({
        hasPayroll: false,
        hasPayment: false,
        hasBridge: false,
        hasSwap: false,
        hasRoster: false,
      });
      return;
    }

    let payrollVal = false;
    try {
      const payrollData = localStorage.getItem("arc_payroll_batches");
      if (payrollData) {
        const list = JSON.parse(payrollData);
        payrollVal = list.some(
          (b: { status: string }) => b.status === "Paid" || b.status === "Partially Paid"
        );
      }
    } catch {}

    let paymentVal = false;
    try {
      const paymentData = localStorage.getItem(`paygrid_history_${address.toLowerCase()}`);
      if (paymentData) {
        paymentVal = JSON.parse(paymentData).length > 0;
      }
    } catch {}

    let bridgeVal = false;
    try {
      const bridgeData = localStorage.getItem("bridge_transfers");
      if (bridgeData) {
        bridgeVal = JSON.parse(bridgeData).length > 0;
      }
    } catch {}

    let swapVal = false;
    try {
      const swapData = localStorage.getItem("swap_history");
      if (swapData) {
        swapVal = JSON.parse(swapData).length > 0;
      }
    } catch {}

    let rosterVal = false;
    try {
      const rosterData = localStorage.getItem("arc_contributors");
      if (rosterData) {
        rosterVal = JSON.parse(rosterData).length > 0;
      }
    } catch {}

    setStats({
      hasPayroll: payrollVal,
      hasPayment: paymentVal,
      hasBridge: bridgeVal,
      hasSwap: swapVal,
      hasRoster: rosterVal,
    });
  }, [isConnected, address]);

  // Construct Badges
  const badges: BadgeProps[] = [
    {
      id: "early_builder",
      name: "Early Builder",
      description: "Connect to the early Arc Testnet deployment",
      status: isConnected ? "Unlocked" : "Locked",
      iconName: "early",
    },
    {
      id: "first_payroll",
      name: "First Payroll",
      description: "Deploy and execute a batch stablecoin payroll roster",
      status: stats.hasPayroll ? "Unlocked" : "Locked",
      iconName: "payroll",
    },
    {
      id: "first_payment",
      name: "First Payment",
      description: "Settle your first decentralized invoice payment",
      status: stats.hasPayment ? "Unlocked" : "Locked",
      iconName: "payment",
    },
    {
      id: "bridge_explorer",
      name: "Bridge Explorer",
      description: "Transfer liquidity across supported blockchain networks",
      status: stats.hasBridge ? "Unlocked" : "Locked",
      iconName: "bridge",
    },
    {
      id: "swap_user",
      name: "Swap User",
      description: "Swap stablecoins locally on Arc Testnet",
      status: stats.hasSwap ? "Unlocked" : "Locked",
      iconName: "swap",
    },
    {
      id: "treasury_manager",
      name: "Treasury Manager",
      description: "Configure contributor roster salaries and frequencies",
      status: stats.hasRoster ? "Unlocked" : "Locked",
      iconName: "treasury",
    },
    {
      id: "builder_passport",
      name: "Builder Passport",
      description: "Integrate multi-source credit score rating badge",
      status: "Coming Soon",
      iconName: "passport",
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-white tracking-wide">Developer Achievements</h2>
        <p className="text-xs text-slate-400 font-medium mt-0.5">
          Credentials unlocked based on your PayGrid stablecoin actions.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {badges.map((badge) => (
          <div key={badge.id}>
            <BadgeTile
              name={badge.name}
              description={badge.description}
              status={badge.status}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
