"use client";

import { useState, useEffect } from "react";
import {
  Activity,
  ArrowUpRight,
  Clock,
  Coins,
  Copy,
  Check,
  ExternalLink,
  Globe,
  HeartPulse,
  Percent,
  ShieldCheck,
  TrendingUp,
  UsersRound,
  AlertTriangle,
  FileSpreadsheet
} from "lucide-react";

import { useChainId, useAccount } from "wagmi";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { shortenAddress } from "@/components/wallet/use-arc-wallet";
import { PAYROLL_CONTRACT_ADDRESS as PAYROLL_ADDRESS } from "@/config/arc-testnet";
import { cn } from "@/lib/utils";

// Recharts imports
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from "recharts";

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

export default function AnalyticsPage() {
  const [mounted, setMounted] = useState(false);
  const [batches, setBatches] = useState<PayrollBatch[]>([]);
  const [storageError, setStorageError] = useState(false);
  const [copied, setCopied] = useState(false);

  const { isConnected } = useAccount();
  const chainId = useChainId();
  const isArcTestnet = chainId === 5042002;

  useEffect(() => {
    setMounted(true);

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

  const handleCopy = () => {
    navigator.clipboard.writeText(PAYROLL_ADDRESS);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Helper to parse date strings for monthly grouping
  const getMonthYearKey = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        const month = d.toLocaleDateString("en-US", { month: "short" });
        const year = d.getFullYear();
        return {
          month,
          year,
          monthNum: d.getMonth(),
          yearNum: year,
          key: `${month} ${year}`
        };
      }
    } catch {
      // ignore and proceed to fallback
    }

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const fullMonthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    for (let i = 0; i < 12; i++) {
      if (dateStr.includes(fullMonthNames[i]) || dateStr.includes(monthNames[i])) {
        const yearMatch = dateStr.match(/\b(202\d)\b/);
        const year = yearMatch ? parseInt(yearMatch[0]) : 2026;
        return {
          month: monthNames[i],
          year,
          monthNum: i,
          yearNum: year,
          key: `${monthNames[i]} ${year}`
        };
      }
    }

    return { month: "Unknown", year: 2026, monthNum: 0, yearNum: 2026, key: "Unknown 2026" };
  };

  // SKELETON / LOADING STATE FOR INITIAL HYDRATION
  if (!mounted) {
    return (
      <AppShell>
        <div className="space-y-6">
          <PageHeader
            eyebrow="Analytics"
            title="Payroll Analytics"
            description="Syncing payroll configuration and historical performance metrics..."
          />
          <div className="grid gap-6 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="glass-card-component bg-[#060f24]/30 animate-pulse h-32" />
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2 glass-card-component bg-[#060f24]/30 animate-pulse h-96" />
            <Card className="glass-card-component bg-[#060f24]/30 animate-pulse h-96" />
          </div>
        </div>
      </AppShell>
    );
  }

  // 1. OVERVIEW CALCULATIONS
  let totalUsdcPaid = 0;
  const paidContribAddresses = new Set<string>();

  const executedBatches = batches.filter(
    (b) => b.status === "Paid" || b.status === "Partially Paid" || b.executedAt
  );

  batches.forEach((b) => {
    b.contributors.forEach((c) => {
      if (c.status === "Paid" && c.txHash) {
        totalUsdcPaid += c.salaryAmount;
        paidContribAddresses.add(c.walletAddress.toLowerCase());
      }
    });
  });

  const contributorsPaidCount = paidContribAddresses.size;
  const payrollRunsCount = executedBatches.length;
  const averagePayroll = payrollRunsCount > 0 ? totalUsdcPaid / payrollRunsCount : 0;

  // 2. MONTHLY PAYROLL CHART DATA
  const monthlySums: Record<string, { amount: number; dateVal: Date; label: string }> = {};

  batches.forEach((b) => {
    const isExecuted = b.status === "Paid" || b.status === "Partially Paid" || b.executedAt;
    if (!isExecuted) return;

    const dateStr = b.executedAt || b.approvedAt || b.createdAt;
    if (!dateStr) return;

    const { key, monthNum, yearNum } = getMonthYearKey(dateStr);
    if (key === "Unknown 2026") return;

    const paidContributors = b.contributors.filter((c) => c.status === "Paid");
    const paidSum = paidContributors.reduce((s, c) => s + c.salaryAmount, 0);

    if (paidSum === 0) return;

    if (!monthlySums[key]) {
      monthlySums[key] = {
        amount: 0,
        dateVal: new Date(yearNum, monthNum, 1),
        label: key
      };
    }
    monthlySums[key].amount += paidSum;
  });

  const chartData = Object.values(monthlySums)
    .sort((a, b) => a.dateVal.getTime() - b.dateVal.getTime())
    .map((item) => ({
      name: item.label,
      amount: item.amount,
    }));

  // 3. TOP CONTRIBUTORS RANKING
  const contributorPaidMap: Record<
    string,
    { name: string; wallet: string; role: string; totalPaid: number; count: number }
  > = {};

  batches.forEach((b) => {
    const isExecuted = b.status === "Paid" || b.status === "Partially Paid" || b.executedAt;
    if (!isExecuted) return;

    b.contributors.forEach((c) => {
      if (c.status === "Paid") {
        const key = c.walletAddress.toLowerCase();
        if (!contributorPaidMap[key]) {
          contributorPaidMap[key] = {
            name: c.fullName,
            wallet: c.walletAddress,
            role: c.role,
            totalPaid: 0,
            count: 0
          };
        }
        contributorPaidMap[key].totalPaid += c.salaryAmount;
        contributorPaidMap[key].count += 1;
      }
    });
  });

  const topContributors = Object.values(contributorPaidMap)
    .sort((a, b) => b.totalPaid - a.totalPaid)
    .slice(0, 5); // Limit to top 5 for dashboard layout

  // Maximum paid amount for calculating ranking percentage bars
  const maxPaidAmount = topContributors.length > 0 ? topContributors[0].totalPaid : 1;

  // 4. RECENT PAYROLL ACTIVITY
  interface ActivityItem {
    id: string;
    batchId: string;
    batchName: string;
    date: string;
    contributorName: string;
    walletAddress: string;
    role: string;
    amount: number;
    status: "Paid" | "Failed";
    txHash?: string;
    errorMsg?: string;
  }

  const activities: ActivityItem[] = [];
  batches.forEach((b) => {
    b.contributors.forEach((c) => {
      if (c.status === "Paid" || c.status === "Failed") {
        activities.push({
          id: `${b.id}-${c.id || c.walletAddress}`,
          batchId: b.id,
          batchName: b.month || b.period || "Payroll Run",
          date: b.executedAt || b.approvedAt || b.createdAt || "Unknown date",
          contributorName: c.fullName,
          walletAddress: c.walletAddress,
          role: c.role,
          amount: c.salaryAmount,
          status: c.status as "Paid" | "Failed",
          txHash: c.txHash,
          errorMsg: c.errorMsg
        });
      }
    });
  });

  // Sort activities by date newest first
  const recentActivities = activities
    .sort((a, b) => {
      const timeA = new Date(a.date).getTime();
      const timeB = new Date(b.date).getTime();
      if (isNaN(timeA) || isNaN(timeB)) return 0;
      return timeB - timeA;
    })
    .slice(0, 5);

  // 6. PAYROLL SUCCESS RATE CALCULATIONS
  let successCount = 0;
  let failedCount = 0;
  batches.forEach((b) => {
    b.contributors.forEach((c) => {
      if (c.status === "Paid") {
        successCount++;
      } else if (c.status === "Failed") {
        failedCount++;
      }
    });
  });

  const totalPayments = successCount + failedCount;
  const successPercentage = totalPayments > 0 ? (successCount / totalPayments) * 100 : 100;

  // 7. PAYROLL HEALTH SCORE CALCULATIONS
  let healthScore = 100;
  let networkStatusStr = "Wrong Network";
  let networkColor = "text-rose-400";
  let contractSyncStatus = "Offline (Wrong Network)";
  let contractSyncColor = "text-rose-400";

  if (isArcTestnet) {
    networkStatusStr = "Arc Testnet";
    networkColor = "text-emerald-400";
    contractSyncStatus = "Synchronized";
    contractSyncColor = "text-emerald-400";
  } else if (chainId === 84532) {
    networkStatusStr = "Base Sepolia";
    networkColor = "text-[#0052FF]";
    contractSyncStatus = "Arc Sync Required";
    contractSyncColor = "text-amber-400";
  } else {
    healthScore -= 30; // Wrong Network penalty
    healthScore -= 20; // Contract offline penalty
    if (!isConnected) {
      contractSyncStatus = "Offline";
    }
  }

  // Deduct based on success rate (50 points maximum deduction)
  if (totalPayments > 0) {
    const failureRate = failedCount / totalPayments;
    healthScore -= Math.round(failureRate * 50);
  }

  // Ensure score stays bounded
  healthScore = Math.max(0, Math.min(100, healthScore));

  let healthLabel = "Excellent";
  let healthLabelColor = "text-emerald-400";
  if (healthScore < 50) {
    healthLabel = "Critical";
    healthLabelColor = "text-rose-500";
  } else if (healthScore < 75) {
    healthLabel = "Warning";
    healthLabelColor = "text-amber-500";
  } else if (healthScore < 95) {
    healthLabel = "Good";
    healthLabelColor = "text-blue-400";
  }

  return (
    <AppShell>
      <div className="relative space-y-6">
        {/* Ambient background glows */}
        <div className="orb orb-1 opacity-40" />
        <div className="orb orb-3 opacity-30" />

        <div className="relative z-10 flex flex-col justify-between sm:flex-row sm:items-center gap-4">
          <PageHeader
            eyebrow="Analytics"
            title="Historical Performance Dashboard"
            description="Track aggregate stablecoin payouts, health indexes, contract alignment, and contributor ranking metrics."
          />
        </div>

        {storageError && (
          <div className="relative z-10 flex gap-3 p-4 rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-200 text-sm">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
            <div>
              <p className="font-semibold">Local Storage Corrupted</p>
              <p className="mt-1 text-xs text-amber-300/90 leading-relaxed">
                Workspace payroll configuration history is corrupted or invalid. Falling back to clean calculation matrices.
              </p>
            </div>
          </div>
        )}

        {/* ── 1. Overview Cards ───────────────────────────────────── */}
        <div className="relative z-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {/* Card 1: Total USDC Paid */}
          <Card className="glass-card-component relative overflow-hidden group">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Total USDC Paid
              </CardTitle>
              <Coins className="h-5 w-5 text-slate-400 group-hover:text-[#4f8cff] transition-colors" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tracking-tight text-white mt-1">
                {totalUsdcPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                Audited contract transactions
              </p>
            </CardContent>
          </Card>

          {/* Card 2: Contributors Paid */}
          <Card className="glass-card-component relative overflow-hidden group">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Contributors Paid
              </CardTitle>
              <UsersRound className="h-5 w-5 text-slate-400 group-hover:text-[#6d5dfc] transition-colors" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tracking-tight text-white mt-1">
                {contributorsPaidCount}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">
                Unique receiving addresses
              </p>
            </CardContent>
          </Card>

          {/* Card 3: Payroll Runs */}
          <Card className="glass-card-component relative overflow-hidden group">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Payroll Runs
              </CardTitle>
              <FileSpreadsheet className="h-5 w-5 text-slate-400 group-hover:text-cyan-400 transition-colors" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tracking-tight text-white mt-1">
                {payrollRunsCount}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">
                Batches successfully executed
              </p>
            </CardContent>
          </Card>

          {/* Card 4: Average Payroll */}
          <Card className="glass-card-component relative overflow-hidden group">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Average Payroll
              </CardTitle>
              <TrendingUp className="h-5 w-5 text-slate-400 group-hover:text-emerald-400 transition-colors" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tracking-tight text-white mt-1">
                {averagePayroll.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">
                USDC average transfer volume
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ── Main content grid ──────────────────────────────────── */}
        <div className="relative z-10 grid gap-6 lg:grid-cols-3">

          {/* ── 2. Monthly Payroll Chart ─────────────────────────── */}
          <Card className="lg:col-span-2 glass-card-component flex flex-col justify-between">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-[#4f8cff]" />
                <div>
                  <CardTitle className="text-base font-semibold text-white">Monthly Payroll Distribution</CardTitle>
                  <CardDescription className="text-xs text-slate-400 mt-0.5">
                    Historical aggregates of executed payroll runs in USDC
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="h-[300px] mt-2">
              {chartData.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center border border-dashed border-white/10 rounded-xl bg-white/[0.01] p-4 text-center">
                  <Clock className="h-8 w-8 text-slate-500 mb-2" />
                  <p className="text-sm text-slate-400 font-medium">No payroll aggregates found</p>
                  <p className="text-xs text-slate-600 mt-1 max-w-xs">
                    Execute a draft payroll run to populate the distribution timelines.
                  </p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorPaid" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4f8cff" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#6d5dfc" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis
                      dataKey="name"
                      stroke="#64748b"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="#64748b"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(val) => `${val.toLocaleString()} USDC`}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "rgba(6, 15, 36, 0.90)",
                        borderColor: "rgba(255, 255, 255, 0.12)",
                        borderRadius: "10px",
                        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.5)",
                        color: "#fff",
                      }}
                      itemStyle={{ color: "#4f8cff" }}
                      formatter={(val) => [`${Number(val).toLocaleString(undefined, { minimumFractionDigits: 2 })} USDC`, "Payroll Paid"]}
                      labelStyle={{ fontWeight: "bold", color: "#fff" }}
                    />
                    <Area
                      type="monotone"
                      dataKey="amount"
                      stroke="#4f8cff"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorPaid)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* ── 7. Payroll Health Score ─────────────────────────── */}
          <Card className="glass-card-component flex flex-col justify-between">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <HeartPulse className="h-5 w-5 text-[#6d5dfc]" />
                <div>
                  <CardTitle className="text-base font-semibold text-white">Payroll Health Index</CardTitle>
                  <CardDescription className="text-xs text-slate-400 mt-0.5">
                    Real-time connection, synchronization and execution rating
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center pb-8 pt-4">
              <div className="relative flex items-center justify-center h-32 w-32">
                {/* Circular Gauge */}
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    className="text-white/5"
                    strokeWidth="8"
                    stroke="currentColor"
                    fill="transparent"
                    r="52"
                    cx="64"
                    cy="64"
                  />
                  <circle
                    className="transition-all duration-1000 ease-out"
                    strokeWidth="8"
                    strokeDasharray={326.7}
                    strokeDashoffset={326.7 - (326.7 * healthScore) / 100}
                    strokeLinecap="round"
                    stroke={healthScore < 50 ? "#f43f5e" : healthScore < 75 ? "#f59e0b" : "#4f8cff"}
                    fill="transparent"
                    r="52"
                    cx="64"
                    cy="64"
                  />
                </svg>
                <div className="absolute text-center">
                  <span className="text-3xl font-extrabold text-white">{healthScore}</span>
                  <span className="text-[10px] text-slate-500 block uppercase tracking-wider font-semibold">Score</span>
                </div>
              </div>

              <div className="w-full mt-6 space-y-2.5 text-xs">
                <div className="flex justify-between items-center py-1.5 border-b border-white/5">
                  <span className="text-slate-400">Health Evaluation</span>
                  <span className={cn("font-bold", healthLabelColor)}>{healthLabel}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-white/5">
                  <span className="text-slate-400">Wallet Sync</span>
                  <span className={cn("font-medium", isConnected ? "text-emerald-400" : "text-rose-400")}>
                    {isConnected ? "Connected" : "Disconnected"}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-white/5">
                  <span className="text-slate-400">Network State</span>
                  <span className={cn("font-medium", networkColor)}>
                    {networkStatusStr}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1.5">
                  <span className="text-slate-400">Active Contract</span>
                  <span className={cn("font-medium", contractSyncColor)}>
                    {contractSyncStatus}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Bottom grids: Top contributors, Network Info, Success Rates ── */}
        <div className="relative z-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">

          {/* ── 3. Top Contributors ────────────────────────────── */}
          <Card className="glass-card-component">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <UsersRound className="h-5 w-5 text-cyan-400" />
                <div>
                  <CardTitle className="text-base font-semibold text-white">Top Contributors</CardTitle>
                  <CardDescription className="text-xs text-slate-400 mt-0.5">
                    Ranked by total historical USDC received
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-2">
              {topContributors.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-white/10 rounded-xl bg-white/[0.01]">
                  <UsersRound className="h-6 w-6 text-slate-600 mb-2" />
                  <p className="text-xs text-slate-500">No contributor payouts recorded.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {topContributors.map((tc, index) => {
                    const pct = Math.max(10, Math.round((tc.totalPaid / maxPaidAmount) * 100));
                    return (
                      <div key={tc.wallet} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-semibold text-slate-500">#{index + 1}</span>
                            <span className="font-medium text-white truncate max-w-[130px]">{tc.name}</span>
                            <span className="text-[10px] text-slate-500 truncate">({tc.role})</span>
                          </div>
                          <span className="font-semibold text-[#4f8cff] shrink-0">
                            {tc.totalPaid.toLocaleString()} USDC
                          </span>
                        </div>
                        {/* Custom visual progress bar */}
                        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-[#4f8cff] to-[#6d5dfc] rounded-full transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── 6. Payroll Success Rate ─────────────────────────── */}
          <Card className="glass-card-component">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Percent className="h-5 w-5 text-emerald-400" />
                <div>
                  <CardTitle className="text-base font-semibold text-white">Payroll Success Rate</CardTitle>
                  <CardDescription className="text-xs text-slate-400 mt-0.5">
                    Aggregation of individual transfer metrics
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-2 flex flex-col justify-between h-[200px]">
              <div className="space-y-3 mt-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Successful Payouts</span>
                  <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                    {successCount} transfers
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Failed Payouts</span>
                  <span className="font-semibold text-rose-400 flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                    {failedCount} transfers
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs pt-1.5 border-t border-white/5">
                  <span className="text-slate-400">Total Attempts</span>
                  <span className="font-bold text-white">{totalPayments} transfers</span>
                </div>
              </div>

              {/* Progress visual */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px] font-medium">
                  <span className="text-slate-500">Execution Efficiency</span>
                  <span className="text-emerald-400">{successPercentage.toFixed(1)}%</span>
                </div>
                <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden flex">
                  {totalPayments > 0 ? (
                    <>
                      <div
                        className="h-full bg-emerald-400 transition-all duration-300"
                        style={{ width: `${successPercentage}%` }}
                      />
                      <div
                        className="h-full bg-rose-400 transition-all duration-300"
                        style={{ width: `${100 - successPercentage}%` }}
                      />
                    </>
                  ) : (
                    <div className="h-full bg-slate-500/20 w-full rounded-full" />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── 5. Network Information ──────────────────────────── */}
          <Card className="glass-card-component">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-sky-400" />
                <div>
                  <CardTitle className="text-base font-semibold text-white">Network Alignment</CardTitle>
                  <CardDescription className="text-xs text-slate-400 mt-0.5">
                    Active smart contracts deployed on Arc
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-2 text-xs space-y-3.5">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Target Chain</span>
                <span className="font-semibold text-white font-mono text-[11px]">Arc Testnet (ID: 5042002)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Connected Chain</span>
                <span className={cn("font-semibold font-mono text-[11px]", isArcTestnet ? "text-emerald-400" : chainId === 84532 ? "text-[#4f8cff]" : "text-rose-400")}>
                  {isArcTestnet ? "Arc Testnet" : chainId === 84532 ? "Base Sepolia" : "Wrong Network"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Active Contract</span>
                <span className="font-semibold text-white">ArcPayroll</span>
              </div>

              <div className="pt-2.5 border-t border-white/5 space-y-2">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Contract Address</p>
                <div className="flex items-center justify-between gap-2 bg-white/5 border border-white/8 rounded-lg p-2 font-mono text-[10px] text-slate-300">
                  <span className="truncate">{PAYROLL_ADDRESS}</span>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={handleCopy}
                      className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white transition-colors"
                      title="Copy Address"
                    >
                      {copied ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <a
                      href={`https://testnet.arcscan.app/address/${PAYROLL_ADDRESS}`}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white transition-colors"
                      title="View on ArcScan"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── 4. Recent Payroll Activity ─────────────────────────── */}
        <Card className="relative z-10 glass-card-component">
          <CardHeader className="pb-4 flex flex-row items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-2.5">
              <Clock className="h-5 w-5 text-[#4f8cff]" />
              <div>
                <CardTitle className="text-base font-semibold text-white">Recent Payroll Activity</CardTitle>
                <CardDescription className="text-xs text-slate-400 mt-0.5">
                  Latest individual payout items parsed from payroll execution logs
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            {recentActivities.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center border border-dashed border-white/10 rounded-xl bg-white/[0.01]">
                <div className="rounded-full bg-slate-500/5 border border-white/5 p-3 mb-3 text-slate-400">
                  <Clock className="h-6 w-6" />
                </div>
                <p className="text-sm text-slate-400 max-w-md leading-relaxed">
                  No payroll activity logs found. Executed payouts will appear in real-time.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[650px] space-y-1.5">
                  {/* Headers */}
                  <div className="grid grid-cols-5 bg-white/5 px-4 py-2.5 text-xs font-semibold text-slate-400 rounded-lg">
                    <span>DATE / TIME</span>
                    <span>RUN DETAILS</span>
                    <span>RECIPIENT & ROLE</span>
                    <span>AMOUNT</span>
                    <span className="text-right">STATUS</span>
                  </div>

                  {/* Rows */}
                  {recentActivities.map((act) => (
                    <div
                      key={act.id}
                      className="grid grid-cols-5 items-center border border-white/5 px-4 py-3 text-sm text-white hover:bg-white/[0.02] rounded-lg transition-all"
                    >
                      <span className="text-slate-300 truncate">{act.date}</span>
                      <span className="text-slate-400 font-medium truncate">{act.batchName}</span>
                      <div className="pr-1.5 truncate">
                        <p className="text-white font-medium truncate">{act.contributorName}</p>
                        <p className="font-mono text-[10px] text-slate-500 mt-0.5 truncate">
                          {shortenAddress(act.walletAddress)} · {act.role}
                        </p>
                      </div>
                      <span className="font-semibold text-white">
                        {act.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC
                      </span>
                      <div className="text-right">
                        {act.status === "Paid" ? (
                          <div className="flex flex-col items-end gap-1.5">
                            <Badge variant="success" className="px-2 py-0.5 text-[10px]">
                              Paid
                            </Badge>
                            {act.txHash && (
                              <a
                                href={`https://testnet.arcscan.app/tx/${act.txHash}`}
                                target="_blank"
                                rel="noreferrer"
                                className="font-mono text-[9px] text-[#4f8cff] hover:underline flex items-center gap-0.5"
                              >
                                {act.txHash.slice(0, 8)}...{act.txHash.slice(-6)}
                                <ArrowUpRight className="h-2.5 w-2.5 shrink-0" />
                              </a>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col items-end gap-1">
                            <Badge variant="warning" className="bg-rose-500/15 border border-rose-500/30 text-rose-400 px-2 py-0.5 text-[10px]">
                              Failed
                            </Badge>
                            {act.errorMsg && (
                              <span className="text-[9px] text-rose-400/80 max-w-[120px] truncate" title={act.errorMsg}>
                                {act.errorMsg}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
