"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { 
  Activity, 
  CalendarClock, 
  CircleDollarSign, 
  UsersRound, 
  Wallet,
  AlertTriangle,
} from "lucide-react";
import { useReadContract } from "wagmi";
import { formatUnits } from "viem";

import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { useArcWallet } from "@/components/wallet/use-arc-wallet";
import { cn } from "@/lib/utils";

type Contributor = {
  id: string;
  fullName: string;
  walletAddress: string;
  role: string;
  salaryAmount: number;
  status: "Active" | "Suspended";
  startDate?: string;
  frequency?: "Weekly" | "Monthly";
  payoutDay?: number | string;
};

type PayrollBatch = {
  id: string;
  month: string;
  recipientsCount: number;
  totalAmount: number;
  status: "Draft" | "Pending" | "Approved" | "Paid" | "Partially Paid";
  createdAt: string;
  submittedAt?: string;
  approvedAt?: string;
  executedAt?: string;
  type?: "Weekly" | "Monthly";
  period?: string;
  weekStart?: string;
  weekEnd?: string;
  contributors: {
    id: string;
    fullName: string;
    walletAddress: string;
    role: string;
    salaryAmount: number;
    status?: "Awaiting" | "Pending" | "Paid" | "Failed";
    txHash?: string;
    errorMsg?: string;
    frequency?: "Weekly" | "Monthly";
    scheduledDate?: string;
  }[];
};

const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
] as const;

export default function DashboardPage() {
  const [mounted, setMounted] = useState(false);
  const { isConnected, address, isArcTestnet } = useArcWallet();
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [batches, setBatches] = useState<PayrollBatch[]>([]);
  const [storageError, setStorageError] = useState(false);

  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const logoRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!logoRef.current) return;
    const rect = logoRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    const maxTilt = 6;
    setTilt({
      x: x * maxTilt,
      y: -y * maxTilt,
    });
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setTilt({ x: 0, y: 0 });
  };

  // USDC balance read
  const { data: usdcBalance, isLoading: isBalanceLoading } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: isArcTestnet && address ? [address] : undefined,
    query: {
      enabled: !!isArcTestnet && !!address,
    }
  });

  useEffect(() => {
    setMounted(true);
    // Load contributors
    const storedContributors = localStorage.getItem("arc_contributors");
    if (storedContributors) {
      try {
        setContributors(JSON.parse(storedContributors));
      } catch {
        setContributors([]);
        setStorageError(true);
      }
    }
    // Load batches
    const storedBatches = localStorage.getItem("arc_payroll_batches");
    if (storedBatches) {
      try {
        setBatches(JSON.parse(storedBatches));
      } catch {
        setBatches([]);
        setStorageError(true);
      }
    }
  }, []);

  const getNextScheduledPayrollDetails = (activeList: Contributor[]) => {
    if (activeList.length === 0) {
      return { dateStr: "None", count: 0, amount: 0 };
    }

    const refDate = new Date();
    
    const getNextPayoutDate = (c: Contributor): Date => {
      const start = new Date((c.startDate || "2026-06-01") + "T00:00:00");
      const today = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());

      if (c.frequency === "Weekly") {
        const weekdays: Record<string, number> = {
          Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6
        };
        const targetDay = weekdays[c.payoutDay || "Friday"] ?? 5;
        
        const result = new Date(today);
        const currentDay = today.getDay();
        const diff = (targetDay - currentDay + 7) % 7;
        result.setDate(today.getDate() + diff);

        return result >= start ? result : start;
      } else {
        // Monthly
        const payoutDayNum = Number(c.payoutDay || 1);
        let result = new Date(today.getFullYear(), today.getMonth(), payoutDayNum);
        if (result < today) {
          result = new Date(today.getFullYear(), today.getMonth() + 1, payoutDayNum);
        }
        return result >= start ? result : start;
      }
    };

    const contributorDates = activeList.map(c => ({
      c,
      date: getNextPayoutDate(c)
    }));

    contributorDates.sort((a, b) => a.date.getTime() - b.date.getTime());
    const earliestDate = contributorDates[0].date;

    const dueContributors = contributorDates.filter(
      item => item.date.toDateString() === earliestDate.toDateString()
    );

    const totalAmount = dueContributors.reduce((sum, item) => sum + item.c.salaryAmount, 0);
    const dateStr = earliestDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });

    return {
      dateStr,
      count: dueContributors.length,
      amount: totalAmount
    };
  };

  if (!mounted) {
    return (
      <AppShell>
        <div className="grid gap-8 lg:grid-cols-5 items-center mt-4 lg:mt-8 animate-pulse">
          <div className="lg:col-span-3 space-y-6">
            <div className="h-6 w-48 bg-white/5 rounded-full" />
            <div className="h-10 w-80 bg-white/5 rounded-lg" />
            <div className="h-16 w-full bg-white/5 rounded-xl" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="h-32 bg-[#060f24]/30 border-white/5" />
              <Card className="h-32 bg-[#060f24]/30 border-white/5" />
              <Card className="h-32 bg-[#060f24]/30 border-white/5" />
              <Card className="h-32 bg-[#060f24]/30 border-white/5" />
            </div>
          </div>
          <div className="lg:col-span-2 flex justify-center">
            <div className="w-56 h-56 bg-white/5 rounded-full" />
          </div>
        </div>
      </AppShell>
    );
  }

  // Calculations
  const totalPaid = batches.reduce((sum, b) => {
    if ((b.status === "Paid" || b.status === "Partially Paid") && b.executedAt) {
      const paidContributors = b.contributors.filter(
        c => c.status === "Paid" && c.txHash
      );
      const paidSum = paidContributors.reduce((s, c) => s + c.salaryAmount, 0);
      return sum + paidSum;
    }
    return sum;
  }, 0);

  const activeContributors = contributors.filter(c => c.status === "Active");
  const activeCount = activeContributors.length;
  const activeWeeklyCount = activeContributors.filter(c => c.frequency === "Weekly").length;
  const activeMonthlyCount = activeContributors.filter(c => c.frequency === "Monthly" || !c.frequency).length;
  const activeSubtitle = `${activeWeeklyCount} Weekly • ${activeMonthlyCount} Monthly`;

  const usdcBalanceFormatted = usdcBalance !== undefined
    ? Number(formatUnits(usdcBalance, 6))
    : 0;

  // Determine Next Payroll Date
  let nextPayrollDateVal = "No payroll scheduled";

  // First, check unexecuted batches from localStorage
  const unexecutedBatch = batches.find(
    b => b.status === "Draft" || b.status === "Pending" || b.status === "Approved"
  );

  if (unexecutedBatch) {
    const dates = unexecutedBatch.contributors
      .map(c => c.scheduledDate ? new Date(c.scheduledDate) : null)
      .filter((d): d is Date => d !== null && !isNaN(d.getTime()));

    if (dates.length > 0) {
      dates.sort((a, b) => a.getTime() - b.getTime());
      nextPayrollDateVal = dates[0].toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
      });
    } else {
      nextPayrollDateVal = unexecutedBatch.period || unexecutedBatch.month;
    }
  } else if (activeContributors.length > 0) {
    const scheduledDetails = getNextScheduledPayrollDetails(activeContributors);
    if (scheduledDetails.dateStr && scheduledDetails.dateStr !== "None") {
      nextPayrollDateVal = scheduledDetails.dateStr;
    }
  }

  return (
    <AppShell>
      <div className="grid gap-8 lg:grid-cols-5 items-center mt-4 lg:mt-8">
        {/* Left Column: Heading, description, and metrics grid */}
        <div className="lg:col-span-3 space-y-6">
          {storageError && (
            <div className="flex gap-3 p-4 rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-200 text-sm">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
              <div>
                <p className="font-semibold">Local Storage Corrupted</p>
                <p className="mt-1 text-xs text-amber-300/90 leading-relaxed">
                  Workspace configuration data is corrupted or invalid. Falling back to an empty roster and payout history.
                </p>
              </div>
            </div>
          )}

          {/* Status Chips */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold badge-live tracking-wide">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Arc Testnet · Live
            </span>
            <span className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold badge-arc tracking-wide">
              <Activity className="h-3.5 w-3.5" />
              Stablecoin payroll
            </span>
          </div>

          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl mb-4">
              Welcome to PayGrix
            </h1>
            <p className="text-slate-400 text-sm sm:text-base leading-relaxed max-w-xl">
              Manage contributors, schedule weekly and monthly stablecoin payouts, and monitor treasury operations from a single workspace.
            </p>
          </div>

          {/* Metrics 2x2 Grid */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Active Contributors */}
            <Card className="glass-card-component overflow-hidden relative group">
              <CardContent className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Contributors</p>
                  <UsersRound className="h-5 w-5 text-slate-400 group-hover:text-[#6d5dfc] transition-colors" />
                </div>
                <p className="text-3xl font-extrabold text-white">{activeCount}</p>
                <p className="mt-1.5 text-xs text-slate-500 font-medium">{activeSubtitle}</p>
              </CardContent>
            </Card>

            {/* Total Paid USDC */}
            <Card className="glass-card-component overflow-hidden relative group">
              <CardContent className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Paid USDC</p>
                  <CircleDollarSign className="h-5 w-5 text-slate-400 group-hover:text-[#6d5dfc] transition-colors" />
                </div>
                <p className="text-3xl font-extrabold gradient-text inline-block">
                  {totalPaid.toLocaleString()} USDC
                </p>
                <p className="mt-1.5 text-xs text-slate-500 font-medium">All-time payroll executed</p>
              </CardContent>
            </Card>

            {/* Next Payroll Date */}
            <Card className="glass-card-component overflow-hidden relative group">
              <CardContent className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Next Payroll Date</p>
                  <CalendarClock className="h-5 w-5 text-slate-400 group-hover:text-[#6d5dfc] transition-colors" />
                </div>
                <p className={cn(
                  "text-2xl font-extrabold",
                  nextPayrollDateVal === "No payroll scheduled" ? "text-slate-400 font-semibold text-xl" : "text-white"
                )}>
                  {nextPayrollDateVal}
                </p>
                <p className="mt-1.5 text-xs text-slate-500 font-medium">Next cycle schedule</p>
              </CardContent>
            </Card>

            {/* Treasury Balance */}
            <Card className="glass-card-component overflow-hidden relative group">
              <CardContent className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Treasury Balance</p>
                  <Wallet className="h-5 w-5 text-slate-400 group-hover:text-[#6d5dfc] transition-colors" />
                </div>
                <p className={cn(
                  "text-3xl font-extrabold",
                  isConnected ? "gradient-text inline-block" : "text-slate-400 font-semibold text-xl"
                )}>
                  {!isConnected 
                    ? "Disconnected"
                    : !isArcTestnet
                      ? "Switch Network"
                      : isBalanceLoading
                        ? "Loading..."
                        : `${usdcBalanceFormatted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`
                  }
                </p>
                <p className="mt-1.5 text-xs text-slate-500 font-medium">Current treasury balance</p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Right Column: Centered Interactive 3D Arc Logo */}
        <div className="lg:col-span-2 flex justify-center">
          <div className="relative inline-flex items-center justify-center group cursor-pointer">
            {/* Soft breathing blue aura behind the logo */}
            <div 
              className="absolute -inset-12 pointer-events-none transition-all duration-700 opacity-60 group-hover:opacity-95 group-hover:scale-110" 
              aria-hidden="true" 
            >
              <div className="w-64 h-64 rounded-full logo-glow-aura animate-logo-glow" />
            </div>
            {/* Logo image container with perspective, smooth mouse-follow tilt and hover scale */}
            <div 
              ref={logoRef}
              onMouseMove={handleMouseMove}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              className="relative z-10 w-44 h-44 sm:w-48 sm:h-48 md:w-56 md:h-56"
              style={{ 
                perspective: 800,
                transform: `rotateY(${tilt.x}deg) rotateX(${tilt.y}deg) scale(${isHovered ? 1.05 : 1})`,
                transition: 'transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
                transformStyle: 'preserve-3d'
              }}
            >
              {/* Animating container that floats and rotates in 3D */}
              <div className="w-full h-full animate-logo-float">
                <Image
                  src="/arc-logo.png"
                  alt="Arc logo"
                  fill
                  className="object-contain"
                  priority
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
