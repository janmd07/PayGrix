"use client";

import { useState, useEffect, useMemo } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Send,
  AlertCircle,
  History,
  ExternalLink,
  Copy,
  Check,
  Play,
  ArrowRight,
  ShieldCheck,
  Plus,
  Loader2,
  X,
  AlertOctagon,
  AlertTriangle,
  Lock,
  FileText,
  Key,
  TrendingUp,
  Wallet,
  Coins,
  UsersRound,
  FileSpreadsheet
} from "lucide-react";
import { useReadContract, useWriteContract, usePublicClient } from "wagmi";
import { formatUnits, parseUnits } from "viem";
import type { Address } from "viem";
import Link from "next/link";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { shortenAddress, useArcWallet } from "@/components/wallet/use-arc-wallet";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";
import { PAYROLL_CONTRACT_ADDRESS } from "@/config/arc-testnet";
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

const USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as Address;
const PAYROLL_ADDRESS = PAYROLL_CONTRACT_ADDRESS as Address;

const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" }
    ],
    outputs: [{ name: "remaining", type: "uint256" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" }
    ],
    outputs: [{ name: "success", type: "bool" }],
  }
] as const;

const PAYROLL_ABI = [
  {
    name: "batchPayEmployees",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "recipients", type: "address[]" },
      { name: "amounts", type: "uint256[]" }
    ],
    outputs: []
  }
] as const;

const MONTH_OPTIONS = [
  "May 2026",
  "June 2026",
  "July 2026",
  "August 2026",
  "September 2026",
  "October 2026",
  "November 2026",
  "December 2026",
];

const generateWeeklyPeriods = (year: number) => {
  const periods: { startStr: string; endStr: string; label: string }[] = [];
  let currentStart = new Date(year, 0, 1, 0, 0, 0);
  const endYearLimit = new Date(year, 11, 31, 23, 59, 59);

  const formatPeriodDate = (d: Date) => {
    const day = String(d.getDate()).padStart(2, "0");
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    return `${day} ${monthNames[d.getMonth()]} ${d.getFullYear()}`;
  };

  while (currentStart <= endYearLimit) {
    const currentEnd = new Date(currentStart);
    currentEnd.setDate(currentStart.getDate() + 6);

    const label = `${formatPeriodDate(currentStart)} - ${formatPeriodDate(currentEnd)}`;
    periods.push({
      startStr: currentStart.toISOString().split("T")[0],
      endStr: currentEnd.toISOString().split("T")[0],
      label
    });

    const nextStart = new Date(currentEnd);
    nextStart.setDate(currentEnd.getDate() + 1);
    currentStart = nextStart;
  }
  return periods;
};

// Helper for user avatars
const getInitials = (name: string) => {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
};

export default function PayrollPage() {
  const [mounted, setMounted] = useState(false);
  const { isConnected, address, isArcTestnet, switchToArcTestnet, isSwitching, chainId } = useArcWallet();
  const [storageError, setStorageError] = useState(false);
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [batches, setBatches] = useState<PayrollBatch[]>([]);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  
  // Tab states for single card unified generator
  const [activeGeneratorTab, setActiveGeneratorTab] = useState<"monthly" | "weekly">("monthly");
  
  // Selection/form states
  const currentMonthYear = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const defaultMonth = MONTH_OPTIONS.includes(currentMonthYear) ? currentMonthYear : MONTH_OPTIONS[0];
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const [weeklyPeriods, setWeeklyPeriods] = useState<{ startStr: string; endStr: string; label: string }[]>([]);
  const [selectedWeeklyPeriodIndex, setSelectedWeeklyPeriodIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Modal & Payout Execution States
  const [isPayoutModalOpen, setIsPayoutModalOpen] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentExecutionIndex, setCurrentExecutionIndex] = useState(-1);
  const [payoutError, setPayoutError] = useState<string | null>(null);
  
  // Copy state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Disable buttons logic during active operations
  const isActionPending = isExecuting || isSwitching;

  // Wagmi wallet read/write hooks
  const { 
    data: usdcBalance, 
    refetch: refetchUsdc,
    error: usdcBalanceError,
    isError: isUsdcBalanceError
  } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: isArcTestnet && address ? [address] : undefined,
    query: {
      enabled: !!isArcTestnet && !!address,
    }
  });

  const { 
    data: usdcAllowance, 
    refetch: refetchAllowance,
    error: usdcAllowanceError,
    isError: isUsdcAllowanceError
  } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: isArcTestnet && address ? [address, PAYROLL_ADDRESS] : undefined,
    query: {
      enabled: !!isArcTestnet && !!address,
    }
  });

  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: 5042002 });

  useEffect(() => {
    if (isUsdcBalanceError && usdcBalanceError) {
      console.error("[DEBUG ERROR] [useReadContract - balanceOf] failed. Exact Function: balanceOf. Line: 192. Complete Error Object:", usdcBalanceError);
    }
  }, [isUsdcBalanceError, usdcBalanceError, address, isArcTestnet]);

  useEffect(() => {
    if (isUsdcAllowanceError && usdcAllowanceError) {
      console.error("[DEBUG ERROR] [useReadContract - allowance] failed. Exact Function: allowance. Line: 202. Complete Error Object:", usdcAllowanceError);
    }
  }, [isUsdcAllowanceError, usdcAllowanceError, address, isArcTestnet]);

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
    
    // Load payroll batches
    const storedBatches = localStorage.getItem("arc_payroll_batches");
    if (storedBatches) {
      try {
        const parsed = JSON.parse(storedBatches);
        setBatches(parsed);
        if (parsed.length > 0) {
          setActiveBatchId(parsed[0].id);
        }
      } catch {
        setBatches([]);
        setStorageError(true);
      }
    }

    // Generate weekly periods for current year
    const currentYear = new Date().getFullYear();
    const periods = generateWeeklyPeriods(currentYear);
    setWeeklyPeriods(periods);

    // Default to the period containing today's date
    const today = new Date().toISOString().split("T")[0];
    const foundIndex = periods.findIndex(
      (p) => today >= p.startStr && today <= p.endStr
    );
    setSelectedWeeklyPeriodIndex(foundIndex !== -1 ? foundIndex : 0);
  }, []);

  const saveBatches = (newBatches: PayrollBatch[]) => {
    setBatches(newBatches);
    localStorage.setItem("arc_payroll_batches", JSON.stringify(newBatches));
  };

  const handleCopy = (id: string, copyAddress: string) => {
    navigator.clipboard.writeText(copyAddress);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // 1. OVERVIEW STATISTICS CALCULATIONS (useMemo)
  const stats = useMemo(() => {
    let paidSum = 0;
    const uniqueWallets = new Set<string>();
    let runs = 0;
    let successTransfers = 0;
    let failedTransfers = 0;

    batches.forEach((b) => {
      const isExecuted = b.status === "Paid" || b.status === "Partially Paid" || b.executedAt;
      if (isExecuted) {
        runs++;
      }
      b.contributors.forEach((c) => {
        if (c.status === "Paid") {
          paidSum += c.salaryAmount;
          uniqueWallets.add(c.walletAddress.toLowerCase());
          successTransfers++;
        } else if (c.status === "Failed") {
          failedTransfers++;
        }
      });
    });

    const totalAttempts = successTransfers + failedTransfers;
    const successRate = totalAttempts > 0 ? (successTransfers / totalAttempts) * 100 : 100;

    return {
      totalUsdcPaid: paidSum,
      contributorsPaidCount: uniqueWallets.size,
      payrollRunsCount: runs,
      successRate
    };
  }, [batches]);

  // 7. LIVE ACTIVITY CALCULATIONS (useMemo)
  const liveActivities = useMemo(() => {
    const list: { id: string; contributorName: string; role: string; amount: number; date: string; txHash?: string }[] = [];
    batches.forEach((b) => {
      const dateVal = b.executedAt || b.approvedAt || b.createdAt;
      b.contributors.forEach((c) => {
        if (c.status === "Paid") {
          list.push({
            id: `${b.id}-${c.id || c.walletAddress}`,
            contributorName: c.fullName,
            role: c.role,
            amount: c.salaryAmount,
            date: dateVal,
            txHash: c.txHash
          });
        }
      });
    });

    return list
      .sort((a, b) => {
        const timeA = new Date(a.date).getTime();
        const timeB = new Date(b.date).getTime();
        if (isNaN(timeA) || isNaN(timeB)) return 0;
        return timeB - timeA;
      })
      .slice(0, 4);
  }, [batches]);

  // Generate Monthly Batch
  const handleGenerateMonthlyBatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (isActionPending) return;
    setError(null);
    setSuccess(null);

    const MONTH_NAMES = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    const [monthName, yearStr] = selectedMonth.split(" ");
    const monthIndex = MONTH_NAMES.indexOf(monthName);
    const year = parseInt(yearStr);
    
    const refDate = new Date(year, monthIndex + 1, 0);
    const batchName = `Monthly Run - ${selectedMonth}`;

    const duplicateExists = batches.some(b => 
      (b.type === "Monthly" && b.period === selectedMonth) || 
      b.month === batchName
    );
    if (duplicateExists) {
      setError(`A monthly payroll batch for ${selectedMonth} already exists.`);
      return;
    }

    const activeContributors = contributors.filter(
      c => c.status === "Active" && (c.frequency === "Monthly" || !c.frequency)
    );
    if (activeContributors.length === 0) {
      setError("No active monthly contributors found in directory. Please add active contributors first.");
      return;
    }

    const formatLocalDate = (date: Date) => {
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
      });
    };

    const getDueDate = (c: Contributor): Date | null => {
      const start = new Date((c.startDate || "2026-06-01") + "T00:00:00");
      if (start > refDate) {
        return null;
      }

      const scheduled = new Date(refDate.getFullYear(), refDate.getMonth(), Number(c.payoutDay || 1));
      if (scheduled <= refDate) {
        if (scheduled >= start) return scheduled;
      } else {
        const prevScheduled = new Date(refDate.getFullYear(), refDate.getMonth() - 1, Number(c.payoutDay || 1));
        if (prevScheduled >= start) return prevScheduled;
      }
      return null;
    };

    const dueContributorsData = activeContributors
      .map(c => ({ c, dueDate: getDueDate(c) }))
      .filter((item): item is { c: Contributor; dueDate: Date } => item.dueDate !== null);

    if (dueContributorsData.length === 0) {
      setError("No contributors are due for this payroll period.");
      return;
    }

    const totalAmount = dueContributorsData.reduce((sum, item) => sum + item.c.salaryAmount, 0);

    const timestamp = new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });

    const newBatch: PayrollBatch = {
      id: `batch-${Date.now()}`,
      month: batchName,
      recipientsCount: dueContributorsData.length,
      totalAmount,
      status: "Draft",
      createdAt: timestamp,
      type: "Monthly",
      period: selectedMonth,
      contributors: dueContributorsData.map(item => ({
        id: item.c.id,
        fullName: item.c.fullName,
        walletAddress: item.c.walletAddress,
        role: item.c.role,
        salaryAmount: item.c.salaryAmount,
        status: "Awaiting" as const,
        frequency: item.c.frequency || "Monthly",
        scheduledDate: formatLocalDate(item.dueDate)
      }))
    };

    const updatedBatches = [newBatch, ...batches];
    saveBatches(updatedBatches);
    setActiveBatchId(newBatch.id);
    setSuccess(`Successfully generated Draft payroll batch for ${selectedMonth}.`);
  };

  // Generate Weekly Batch
  const handleGenerateWeeklyBatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (isActionPending) return;
    setError(null);
    setSuccess(null);

    if (weeklyPeriods.length === 0) {
      setError("Weekly periods are not initialized.");
      return;
    }

    const selectedPeriod = weeklyPeriods[selectedWeeklyPeriodIndex];
    if (!selectedPeriod) {
      setError("Selected weekly period is invalid.");
      return;
    }

    const start = new Date(selectedPeriod.startStr + "T00:00:00");
    const end = new Date(selectedPeriod.endStr + "T00:00:00");
    const batchName = `Weekly Run - ${selectedPeriod.label.replace(" - ", " to ")}`;

    const duplicateExists = batches.some(b => 
      (b.type === "Weekly" && b.period === selectedPeriod.label) || 
      b.month === batchName
    );
    if (duplicateExists) {
      setError(`A weekly payroll batch for ${selectedPeriod.label} already exists.`);
      return;
    }

    const activeContributors = contributors.filter(
      c => c.status === "Active" && c.frequency === "Weekly"
    );
    if (activeContributors.length === 0) {
      setError("No active weekly contributors found in directory. Please add active contributors first.");
      return;
    }

    const formatLocalDate = (date: Date) => {
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
      });
    };

    const getWeeklyDueDateInRange = (c: Contributor): Date | null => {
      const contributorStart = new Date((c.startDate || "2026-05-01") + "T00:00:00");
      
      const weekdays: Record<string, number> = {
        Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6
      };
      const targetDay = weekdays[c.payoutDay || "Friday"] ?? 5;

      let scheduled: Date | null = null;
      const curr = new Date(start);
      for (let i = 0; i < 7; i++) {
        if (curr.getDay() === targetDay) {
          scheduled = new Date(curr);
          break;
        }
        curr.setDate(curr.getDate() + 1);
      }

      if (scheduled && scheduled >= contributorStart && scheduled <= end) {
        return scheduled;
      }
      return null;
    };

    const dueContributorsData = activeContributors
      .map(c => ({ c, dueDate: getWeeklyDueDateInRange(c) }))
      .filter((item): item is { c: Contributor; dueDate: Date } => item.dueDate !== null);

    if (dueContributorsData.length === 0) {
      setError("No contributors are due for this payroll period.");
      return;
    }

    const totalAmount = dueContributorsData.reduce((sum, item) => sum + item.c.salaryAmount, 0);

    const timestamp = new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });

    const newBatch: PayrollBatch = {
      id: `batch-${Date.now()}`,
      month: batchName,
      recipientsCount: dueContributorsData.length,
      totalAmount,
      status: "Draft",
      createdAt: timestamp,
      type: "Weekly",
      period: selectedPeriod.label,
      weekStart: selectedPeriod.startStr,
      weekEnd: selectedPeriod.endStr,
      contributors: dueContributorsData.map(item => ({
        id: item.c.id,
        fullName: item.c.fullName,
        walletAddress: item.c.walletAddress,
        role: item.c.role,
        salaryAmount: item.c.salaryAmount,
        status: "Awaiting" as const,
        frequency: "Weekly",
        scheduledDate: formatLocalDate(item.dueDate)
      }))
    };

    const updatedBatches = [newBatch, ...batches];
    saveBatches(updatedBatches);
    setActiveBatchId(newBatch.id);
    setSuccess(`Successfully generated Draft payroll batch for ${selectedPeriod.label}.`);
  };

  // Advance pipeline status
  const handleAdvanceStatus = (batchId: string, nextStatus: "Pending" | "Approved") => {
    if (isActionPending) return;
    setError(null);
    setSuccess(null);

    const timestamp = new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });

    const updated = batches.map(b => {
      if (b.id === batchId) {
        return {
          ...b,
          status: nextStatus,
          submittedAt: nextStatus === "Pending" ? timestamp : b.submittedAt,
          approvedAt: nextStatus === "Approved" ? timestamp : b.approvedAt
        };
      }
      return b;
    });

    saveBatches(updated);
    setSuccess(`Payroll batch advanced to ${nextStatus}.`);
  };

  // Batch USDC Payout through ArcPayroll contract
  const handleExecutePayout = async () => {
    const activeBatch = batches.find(b => b.id === activeBatchId);
    if (!activeBatch || !address || isActionPending) return;

    setError(null);
    setSuccess(null);
    setPayoutError(null);

    // Verify network is Arc Testnet before starting execution
    if (chainId !== 5042002) {
      setPayoutError("Switching network to Arc Testnet...");
      return;
    }

    setIsExecuting(true);
    setCurrentExecutionIndex(-2); // -2 is Approval state

    const updatedContributors = activeBatch.contributors.map(c => ({
      ...c,
      status: "Pending" as "Awaiting" | "Pending" | "Paid" | "Failed"
    }));

    try {
      const recipients = activeBatch.contributors.map(c => c.walletAddress as Address);
      const amounts = activeBatch.contributors.map(c => parseUnits(String(c.salaryAmount), 6));
      const totalAmountUnits = amounts.reduce((sum, current) => sum + current, BigInt(0));

      const timestamp = new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });

      // Step 1: Check and approve USDC allowance
      if (usdcAllowance === undefined || usdcAllowance < totalAmountUnits) {
        let approveHash;
        try {
          approveHash = await writeContractAsync({
            abi: ERC20_ABI,
            functionName: "approve",
            address: USDC_ADDRESS,
            args: [PAYROLL_ADDRESS, totalAmountUnits],
            chainId: 5042002,
          });
        } catch (err: unknown) {
          console.error("[DEBUG ERROR] [writeContractAsync - approve] failed. Exact Function: approve. Line: 580. Complete Error Object:", err);
          throw err;
        }

        if (publicClient) {
          try {
            await publicClient.waitForTransactionReceipt({ hash: approveHash });
          } catch (err: unknown) {
            console.error("[DEBUG ERROR] [waitForTransactionReceipt - approve] failed. Exact Function: waitForTransactionReceipt (approve). Line: 608. Complete Error Object:", err);
            throw err;
          }
        }
      }

      // Step 2: batchPayEmployees execution
      setCurrentExecutionIndex(-1); // -1 signifies broadcasting payouts
      
      let batchHash;
      try {
        batchHash = await writeContractAsync({
          address: PAYROLL_ADDRESS,
          abi: PAYROLL_ABI,
          functionName: "batchPayEmployees",
          args: [recipients, amounts],
          chainId: 5042002,
        });
      } catch (err: unknown) {
        console.error("[DEBUG ERROR] [writeContractAsync - batchPayEmployees] failed. Exact Function: batchPayEmployees. Line: 639. Complete Error Object:", err);
        throw err;
      }

      if (publicClient) {
        try {
          await publicClient.waitForTransactionReceipt({ hash: batchHash });
        } catch (err: unknown) {
          console.error("[DEBUG ERROR] [waitForTransactionReceipt - batchPayEmployees] failed. Exact Function: waitForTransactionReceipt (batchPayEmployees). Line: 667. Complete Error Object:", err);
          throw err;
        }
      }

      // Success: Mark all as Paid
      for (let i = 0; i < updatedContributors.length; i++) {
        updatedContributors[i].status = "Paid";
        updatedContributors[i].txHash = batchHash;
      }

      const finalBatchesList = batches.map(b => 
        b.id === activeBatch.id ? { 
          ...b, 
          status: "Paid" as const, 
          executedAt: timestamp,
          contributors: updatedContributors 
        } : b
      );

      saveBatches(finalBatchesList);
      setSuccess("Payroll batch executed successfully! All payments transferred.");
      setIsPayoutModalOpen(false);

    } catch (error) {
      console.error("[DEBUG ERROR] Main catch block in handleExecutePayout. Complete Error Object:", error);
      const err = error as { name?: string; code?: number; message?: string; shortMessage?: string };
      const msg = err.shortMessage || err.message || "Transaction failed";
      
      const isUserRejection = 
        err.name === "UserRejectedRequestError" || 
        err.code === 4001 || 
        /user rejected/i.test(err.message || "") ||
        /user rejected/i.test(err.shortMessage || "");

      const errorText = isUserRejection ? "User rejected signature request" : msg;

      for (let i = 0; i < updatedContributors.length; i++) {
        updatedContributors[i].status = "Failed";
        updatedContributors[i].errorMsg = errorText;
      }

      const finalBatchesList = batches.map(b => 
        b.id === activeBatch.id ? { 
          ...b, 
          status: "Approved" as const, 
          contributors: updatedContributors 
        } : b
      );

      saveBatches(finalBatchesList);
      setPayoutError(isUserRejection ? "Execution cancelled by user." : `Payroll execution failed: ${msg}`);
    } finally {
      setIsExecuting(false);
      setCurrentExecutionIndex(-1);
      refetchUsdc();
      if (refetchAllowance) {
        refetchAllowance();
      }
    }
  };

  const activeBatch = batches.find(b => b.id === activeBatchId) || null;
  const usdcBalanceFormatted = usdcBalance !== undefined
    ? Number(formatUnits(usdcBalance, 6))
    : 0;

  // Hydration state check
  if (!mounted) {
    return (
      <AppShell>
        <div className="space-y-6">
          <PageHeader
            eyebrow="Payroll"
            title="Payroll Runs"
            description="Syncing payroll configuration..."
          />
          <div className="grid gap-6 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="glass-card-component bg-[#060f24]/30 animate-pulse h-32" />
            ))}
          </div>
          <Card className="glass-card-component bg-[#060f24]/30 animate-pulse h-96" />
        </div>
      </AppShell>
    );
  }

  // Helper for active steps rendering mapping
  // Pipeline: Draft -> Approved -> Wallet Signed -> Completed
  const getPipelineSteps = (batch: PayrollBatch) => {
    const status = batch.status;
    const steps = [
      {
        label: "Draft",
        description: "Roster snap locked",
        time: batch.createdAt,
        isCompleted: status !== "Draft" && status !== "Pending",
        isActive: status === "Draft" || status === "Pending",
        icon: FileText
      },
      {
        label: "Approved",
        description: "Audit completed",
        time: batch.approvedAt,
        isCompleted: status === "Paid" || status === "Partially Paid",
        isActive: status === "Approved",
        icon: ShieldCheck
      },
      {
        label: "Wallet Signed",
        description: "Allowances & signatures",
        time: isExecuting ? "Signing..." : batch.executedAt ? "Signed" : undefined,
        isCompleted: status === "Paid" || status === "Partially Paid",
        isActive: isExecuting,
        icon: Key
      },
      {
        label: "Completed",
        description: "On-chain execution",
        time: batch.executedAt,
        isCompleted: status === "Paid" || status === "Partially Paid",
        isActive: (status === "Paid" || status === "Partially Paid") && !isExecuting,
        icon: CheckCircle2
      }
    ];
    return steps;
  };

  return (
    <AppShell>
      <div className="relative space-y-6">
        {/* Ambient background glows */}
        <div className="orb orb-1 opacity-40" />
        <div className="orb orb-3 opacity-30" />

        <div className="relative z-10 flex flex-col justify-between sm:flex-row sm:items-center gap-4">
          <PageHeader
            eyebrow="Payroll Manager"
            title="Premium Payroll Runs"
            description="Generate weekly and monthly payroll rosters, verify smart contract alignment, and execute stablecoin payouts."
          />
        </div>

        {storageError && (
          <div className="relative z-10 flex gap-3 p-4 rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-200 text-sm">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
            <div>
              <p className="font-semibold">Local Storage Corrupted</p>
              <p className="mt-1 text-xs text-amber-300/90 leading-relaxed">
                Workspace payroll configuration history is corrupted. Falling back to safe calculation arrays.
              </p>
            </div>
          </div>
        )}

        {/* ── 1. Payroll Overview Cards (Top) ─────────────────────── */}
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
                {stats.totalUsdcPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">
                Aggregated successful payouts
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
                {stats.contributorsPaidCount}
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
                {stats.payrollRunsCount}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">
                Batches successfully executed
              </p>
            </CardContent>
          </Card>

          {/* Card 4: Success Rate */}
          <Card className="glass-card-component relative overflow-hidden group">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Success Rate
              </CardTitle>
              <TrendingUp className="h-5 w-5 text-slate-400 group-hover:text-emerald-400 transition-colors" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tracking-tight text-white mt-1">
                {stats.successRate.toFixed(1)}%
              </p>
              <p className="text-[10px] text-slate-500 mt-1">
                Broadcasting success ratio
              </p>
            </CardContent>
          </Card>
        </div>

        {!isConnected ? (
          <Card className="relative z-10 glass-card-component">
            <CardContent className="py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#6d5dfc]/10 border border-[#6d5dfc]/15 text-[#4f8cff] mx-auto mb-4 animate-pulse">
                <Lock className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Payroll Access Locked</h3>
              <p className="text-xs text-slate-400 mt-1 mb-6 max-w-sm mx-auto leading-relaxed">
                Connect your founder wallet in the header navigation to generate payroll batches and manage contributor payouts.
              </p>
              <div className="flex justify-center">
                <ConnectWalletButton />
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Form Messages */}
            {(error || success) && (
              <div className="relative z-10 space-y-2">
                {error && (
                  <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 flex gap-3">
                    <AlertCircle className="h-5 w-5 shrink-0 text-rose-400" />
                    <span>{error}</span>
                  </div>
                )}
                {success && (
                  <div className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex gap-3">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                    <span>{success}</span>
                  </div>
                )}
              </div>
            )}

            {/* ── Main Grid ────────────────────────────────────────── */}
            <div className="relative z-10 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              
              {/* Left Column: Generator, Contract widget, Quick Actions, Live Activity */}
              <div className="space-y-6">
                
                {/* ── 2. Unified Payroll Generator Card ───────────────── */}
                <Card className="glass-card-component overflow-hidden">
                  <div className="border-b border-white/5 bg-white/[0.02]">
                    <div className="flex items-center justify-between px-5 pt-4 pb-2">
                      <div>
                        <CardTitle className="text-base font-semibold text-white">Generate Payroll Roster</CardTitle>
                        <CardDescription className="text-xs text-slate-400 mt-0.5">
                          Create draft execution lists based on active cycles
                        </CardDescription>
                      </div>
                    </div>
                    {/* Unified Tabs */}
                    <div className="flex border-t border-white/5 mt-2">
                      <button
                        onClick={() => setActiveGeneratorTab("monthly")}
                        disabled={isActionPending}
                        className={cn(
                          "flex-1 py-3 text-xs font-semibold uppercase tracking-wider text-center transition-all border-b-2 focus:outline-none focus:ring-1 focus:ring-[#6d5dfc]/30",
                          activeGeneratorTab === "monthly"
                            ? "text-[#4f8cff] border-[#4f8cff] bg-white/[0.01]"
                            : "text-slate-400 border-transparent hover:text-white hover:bg-white/[0.01]"
                        )}
                      >
                        Monthly Payroll
                      </button>
                      <button
                        onClick={() => setActiveGeneratorTab("weekly")}
                        disabled={isActionPending}
                        className={cn(
                          "flex-1 py-3 text-xs font-semibold uppercase tracking-wider text-center transition-all border-b-2 focus:outline-none focus:ring-1 focus:ring-[#6d5dfc]/30",
                          activeGeneratorTab === "weekly"
                            ? "text-[#4f8cff] border-[#4f8cff] bg-white/[0.01]"
                            : "text-slate-400 border-transparent hover:text-white hover:bg-white/[0.01]"
                        )}
                      >
                        Weekly Payroll
                      </button>
                    </div>
                  </div>

                  <CardContent className="p-6">
                    {activeGeneratorTab === "monthly" ? (
                      <form onSubmit={handleGenerateMonthlyBatch} className="space-y-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                            Select Payroll Month
                          </label>
                          <select
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            disabled={isActionPending}
                            className="w-full rounded-xl bg-[#060f24] border border-white/8 px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#4f8cff] focus:ring-1 focus:ring-[#4f8cff] transition-all cursor-pointer disabled:opacity-50"
                          >
                            {MONTH_OPTIONS.map((m) => (
                              <option key={m} value={m} className="bg-[#060f24] text-white">
                                {m}
                              </option>
                            ))}
                          </select>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          Compiles active monthly contributors due for payments (e.g. 1st or 15th of month schedules).
                        </p>
                        <Button
                          type="submit"
                          disabled={isActionPending}
                          className="w-full btn-electric whitespace-nowrap gap-2"
                        >
                          {isActionPending ? (
                            <>
                              <Loader2 className="h-4.5 w-4.5 animate-spin" />
                              Operation pending...
                            </>
                          ) : (
                            <>
                              <Plus className="h-4.5 w-4.5" />
                              Generate Monthly Batch
                            </>
                          )}
                        </Button>
                      </form>
                    ) : (
                      <form onSubmit={handleGenerateWeeklyBatch} className="space-y-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                            Select Weekly Period
                          </label>
                          <select
                            value={selectedWeeklyPeriodIndex}
                            onChange={(e) => setSelectedWeeklyPeriodIndex(parseInt(e.target.value))}
                            disabled={isActionPending}
                            className="w-full rounded-xl bg-[#060f24] border border-white/8 px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#4f8cff] focus:ring-1 focus:ring-[#4f8cff] transition-all cursor-pointer disabled:opacity-50"
                          >
                            {weeklyPeriods.map((period, index) => (
                              <option key={index} value={index} className="bg-[#060f24] text-white">
                                {period.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          Compiles active weekly contributors due for payments (e.g. weekly Friday schedules) in the selected period.
                        </p>
                        <Button
                          type="submit"
                          disabled={isActionPending}
                          className="w-full btn-electric whitespace-nowrap gap-2"
                        >
                          {isActionPending ? (
                            <>
                              <Loader2 className="h-4.5 w-4.5 animate-spin" />
                              Operation pending...
                            </>
                          ) : (
                            <>
                              <Plus className="h-4.5 w-4.5" />
                              Generate Weekly Batch
                            </>
                          )}
                        </Button>
                      </form>
                    )}
                  </CardContent>
                </Card>

                {/* ── 10. Smart Contract Status Widget ────────────────── */}
                <Card className="glass-card-component">
                  <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                    <div>
                      <CardTitle className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Smart Contract Status
                      </CardTitle>
                      <CardDescription className="text-[10px] text-slate-500 mt-0.5">
                        Aligned with Arc Testnet deployment address
                      </CardDescription>
                    </div>
                    <Badge variant={isArcTestnet ? "success" : "warning"} className="text-[10px]">
                      {isArcTestnet ? "Connected" : "Wrong Network"}
                    </Badge>
                  </CardHeader>
                  <CardContent className="text-xs space-y-2">
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span className="text-slate-400">Target Contract</span>
                      <span className="font-semibold text-white">ArcPayroll</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span className="text-slate-400">Chain Target</span>
                      <span className="font-semibold text-white">Arc Testnet (5042002)</span>
                    </div>
                    <div className="pt-2">
                      <span className="text-slate-500 text-[10px] uppercase font-bold block mb-1">Contract Address</span>
                      <div className="flex items-center justify-between gap-2 bg-white/5 border border-white/8 rounded-lg p-2 font-mono text-[10px] text-slate-300">
                        <span className="truncate">{PAYROLL_ADDRESS}</span>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            onClick={() => handleCopy("contract-addr", PAYROLL_ADDRESS)}
                            className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white transition-colors"
                            title="Copy Address"
                          >
                            {copiedId === "contract-addr" ? (
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

                {/* ── 8. Quick Actions Panel ──────────────────────────── */}
                <Card className="glass-card-component">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Quick Operations
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-3">
                    <Link
                      href="/contributors"
                      className="flex items-center gap-2 p-3 rounded-xl border border-white/5 bg-white/[0.01] hover:bg-white/5 hover:border-white/10 text-xs font-medium text-slate-300 hover:text-white transition-all group"
                    >
                      <Plus className="h-4 w-4 text-[#6d5dfc] group-hover:scale-110 transition-transform" />
                      Add Contributor
                    </Link>
                    <Link
                      href="/treasury"
                      className="flex items-center gap-2 p-3 rounded-xl border border-white/5 bg-white/[0.01] hover:bg-white/5 hover:border-white/10 text-xs font-medium text-slate-300 hover:text-white transition-all group"
                    >
                      <Wallet className="h-4 w-4 text-[#4f8cff] group-hover:scale-110 transition-transform" />
                      View Treasury
                    </Link>
                    <Link
                      href="/analytics"
                      className="flex items-center gap-2 p-3 rounded-xl border border-white/5 bg-white/[0.01] hover:bg-white/5 hover:border-white/10 text-xs font-medium text-slate-300 hover:text-white transition-all group"
                    >
                      <TrendingUp className="h-4 w-4 text-emerald-400 group-hover:scale-110 transition-transform" />
                      View Analytics
                    </Link>
                    <button
                      onClick={() => setActiveGeneratorTab(activeGeneratorTab === "monthly" ? "weekly" : "monthly")}
                      className="flex items-center gap-2 p-3 rounded-xl border border-white/5 bg-white/[0.01] hover:bg-white/5 hover:border-white/10 text-xs font-medium text-slate-300 hover:text-white transition-all group text-left"
                    >
                      <Plus className="h-4 w-4 text-cyan-400 group-hover:scale-110 transition-transform" />
                      Generate Payroll
                    </button>
                  </CardContent>
                </Card>

                {/* ── 7. Live Activity Widget ─────────────────────────── */}
                <Card className="glass-card-component">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                      Live Payout activity
                    </CardTitle>
                    <CardDescription className="text-[10px] text-slate-500">
                      Real-time stream of successful payroll transfers
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-1">
                    {liveActivities.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-6 text-center border border-dashed border-white/5 rounded-xl bg-white/[0.01] p-4">
                        <Coins className="h-6 w-6 text-slate-600 mb-1" />
                        <p className="text-[11px] text-slate-500">No payroll history yet.</p>
                        <p className="text-[9px] text-slate-600 mt-0.5">Generate your first payroll run to see analytics.</p>
                      </div>
                    ) : (
                      <div className="space-y-3.5">
                        {liveActivities.map((act) => (
                          <div key={act.id} className="flex items-center justify-between text-xs border-b border-white/5 pb-2.5 last:border-0 last:pb-0">
                            <div>
                              <p className="font-semibold text-white">{act.contributorName}</p>
                              <p className="text-[10px] text-slate-500 mt-0.5">{act.role} · {act.date}</p>
                            </div>
                            <div className="text-right">
                              <span className="font-semibold text-[#4f8cff]">{act.amount.toLocaleString()} USDC</span>
                              {act.txHash && (
                                <a
                                  href={`https://testnet.arcscan.app/tx/${act.txHash}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[9px] text-slate-500 hover:text-white flex items-center gap-0.5 justify-end mt-0.5"
                                >
                                  Mined
                                  <ExternalLink className="h-2.5 w-2.5" />
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

              </div>

              {/* Right Column: Active Batch pipeline details & History */}
              <div className="space-y-6">
                
                {/* Active Batch Container */}
                {!activeBatch ? (
                  <Card className="glass-card-component flex flex-col items-center justify-center text-center p-12 min-h-[400px]">
                    <div className="h-14 w-14 rounded-2xl bg-white/5 border border-white/8 flex items-center justify-center text-slate-500 mb-4">
                      <CalendarDays className="h-6 w-6" />
                    </div>
                    <h3 className="text-sm font-semibold text-slate-300">No active run selected</h3>
                    <p className="text-xs text-slate-500 mt-2 max-w-sm leading-relaxed">
                      Select a run from the history or generate a new month run to inspect recipient breakdowns, audit totals, and initiate payments.
                    </p>
                  </Card>
                ) : (
                  <div className="space-y-6">
                    
                    {/* Active Run Header */}
                    <div className="glow-border-shell">
                      <div className="border-0 bg-[#060f24]/90 rounded-2xl p-5 space-y-5">
                        
                        <div>
                          <Badge variant="blue" className="mb-2">
                            {activeBatch.type || "Monthly"} Run
                          </Badge>
                          <h3 className="text-lg font-bold text-white leading-tight">{activeBatch.month}</h3>
                          <p className="text-xs text-slate-400 mt-1">
                            {activeBatch.recipientsCount} Contributors · {activeBatch.totalAmount.toLocaleString()} USDC
                          </p>
                        </div>

                        {/* ── 3. Payroll Pipeline Progress Tracker ────────────── */}
                        <div className="border-t border-b border-white/5 py-4">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">
                            Pipeline Progress
                          </p>
                          <div className="grid grid-cols-4 gap-2 relative">
                            {/* Line connector */}
                            <div className="absolute top-4 left-[12.5%] right-[12.5%] h-0.5 bg-white/5 z-0" />
                            
                            {getPipelineSteps(activeBatch).map((step, idx) => {
                              const StepIcon = step.icon;
                              const isCompleted = step.isCompleted;
                              const isActive = step.isActive;

                              return (
                                <div key={idx} className="flex flex-col items-center text-center relative z-10 group">
                                  <div
                                    className={cn(
                                      "h-8.5 w-8.5 rounded-full border flex items-center justify-center transition-all duration-300",
                                      isCompleted
                                        ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.25)]"
                                        : isActive
                                        ? "bg-[#6d5dfc]/10 border-[#6d5dfc]/50 text-[#4f8cff] shadow-[0_0_12px_rgba(109,93,252,0.4)] animate-pulse"
                                        : "bg-[#060f24] border-white/8 text-slate-500"
                                    )}
                                  >
                                    <StepIcon className="h-4 w-4" />
                                  </div>
                                  <span className={cn(
                                    "text-[10px] font-bold mt-2",
                                    isActive ? "text-[#4f8cff]" : isCompleted ? "text-slate-300" : "text-slate-500"
                                  )}>
                                    {step.label}
                                  </span>
                                  {step.time && (
                                    <span className="text-[8px] text-slate-500 font-mono mt-0.5 block truncate max-w-full">
                                      {step.time.split(",")[0]}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Pipeline Actions */}
                        <div>
                          {activeBatch.status === "Draft" && (
                            <div className="space-y-3">
                              <p className="text-xs text-slate-400 leading-relaxed">
                                Verify roster details below. Submit for review once alignment is audited.
                              </p>
                              <Button 
                                onClick={() => handleAdvanceStatus(activeBatch.id, "Pending")}
                                disabled={isActionPending}
                                className="w-full btn-electric gap-2"
                              >
                                <Play className="h-4 w-4" />
                                Submit Roster for Review
                              </Button>
                            </div>
                          )}

                          {activeBatch.status === "Pending" && (
                            <div className="space-y-3">
                              <p className="text-xs text-slate-400 leading-relaxed">
                                Pending workspace administrator audit. Verify keys and salaries below.
                              </p>
                              <Button 
                                onClick={() => handleAdvanceStatus(activeBatch.id, "Approved")}
                                disabled={isActionPending}
                                className="w-full btn-electric gap-2"
                              >
                                <ShieldCheck className="h-4 w-4" />
                                Approve Payroll Run
                              </Button>
                            </div>
                          )}

                          {activeBatch.status === "Approved" && (
                            <div className="space-y-3">
                              <p className="text-xs text-slate-400 leading-relaxed">
                                Batch authorized. Launch the execution pipeline to pay contributors.
                              </p>
                              <Button 
                                onClick={() => setIsPayoutModalOpen(true)}
                                disabled={!isArcTestnet || isActionPending}
                                className="w-full btn-electric gap-2"
                              >
                                <Send className="h-4 w-4" />
                                {!isArcTestnet ? "Switch Network to execute" : "Confirm & Execute Payouts"}
                              </Button>
                            </div>
                          )}

                          {/* ── 4. Premium Payroll Execution Summary ──────────── */}
                          {(activeBatch.status === "Paid" || activeBatch.status === "Partially Paid") && (
                            <div className={cn(
                              "border rounded-xl p-4 space-y-3 text-xs backdrop-blur-md",
                              activeBatch.status === "Paid" 
                                ? "bg-emerald-500/5 border-emerald-500/15 text-emerald-400" 
                                : "bg-amber-500/5 border-amber-500/15 text-amber-200"
                            )}>
                              <div className="flex items-center gap-2 font-bold text-sm">
                                <ShieldCheck className={cn("h-5 w-5 shrink-0", activeBatch.status === "Paid" ? "text-emerald-400" : "text-amber-400")} />
                                <span>
                                  {activeBatch.status === "Paid" ? "Payroll Completed Successfully" : "Payroll Completed with Failures"}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-3 text-slate-300 py-1 border-t border-b border-white/5 my-1">
                                <div>
                                  <span className="text-[10px] text-slate-500 uppercase block font-semibold">Employees Paid</span>
                                  <span className="font-semibold text-white">
                                    {activeBatch.contributors.filter(c => c.status === "Paid").length} contributors
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-500 uppercase block font-semibold">USDC Disbursed</span>
                                  <span className="font-semibold text-white">
                                    {activeBatch.contributors.filter(c => c.status === "Paid").reduce((s, c) => s + c.salaryAmount, 0).toLocaleString()} USDC
                                  </span>
                                </div>
                                <div className="col-span-2">
                                  <span className="text-[10px] text-slate-500 uppercase block font-semibold">Execution Date</span>
                                  <span className="font-semibold text-white">{activeBatch.executedAt}</span>
                                </div>
                              </div>
                              
                              {/* Grab transaction hash from the first paid contributor */}
                              {activeBatch.contributors.find(c => c.status === "Paid" && c.txHash) && (
                                <div className="space-y-1.5 pt-1">
                                  <span className="text-[10px] text-slate-500 uppercase block font-semibold">Transaction Link</span>
                                  <a
                                    href={`https://testnet.arcscan.app/tx/${activeBatch.contributors.find(c => c.status === "Paid")?.txHash}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-[#4f8cff] hover:underline font-mono text-[10px] break-all bg-white/5 p-2 border border-white/8 rounded-lg w-full justify-between"
                                  >
                                    <span className="truncate mr-2">
                                      {activeBatch.contributors.find(c => c.status === "Paid")?.txHash}
                                    </span>
                                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                                  </a>
                                </div>
                              )}
                            </div>
                          )}

                        </div>

                      </div>
                    </div>

                    {/* ── 6. Contributor Breakdown Roster ─────────────────── */}
                    <Card className="glass-card-component">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                          Contributor Breakdown
                        </CardTitle>
                        <CardDescription className="text-[10px] text-slate-500">
                          Roster config snapshots for {activeBatch.month}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-1">
                        <div className="overflow-x-auto">
                          <div className="min-w-[500px] space-y-2.5">
                            {/* Headers */}
                            <div className="grid grid-cols-[1.5fr_1.5fr_1fr_1fr] bg-white/5 px-4 py-2 text-[10px] font-semibold text-slate-400 rounded-lg">
                              <span>CONTRIBUTOR / ROLE</span>
                              <span>WALLET</span>
                              <span>STATUS</span>
                              <span className="text-right">SALARY</span>
                            </div>

                            {/* Rows */}
                            {activeBatch.contributors.map(c => (
                              <div 
                                key={c.id} 
                                className="grid grid-cols-[1.5fr_1.5fr_1fr_1fr] items-center border border-white/5 px-4 py-3 text-xs text-slate-300 rounded-xl hover:bg-white/[0.01] hover:border-white/10 transition-all"
                              >
                                {/* Contributor with initials avatar */}
                                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                  <div className="h-7 w-7 rounded-full bg-gradient-to-br from-[#4f8cff] to-[#6d5dfc] text-white flex items-center justify-center text-[10px] font-bold shrink-0 shadow-[0_0_10px_rgba(109,93,252,0.2)]">
                                    {getInitials(c.fullName)}
                                  </div>
                                  <div className="truncate">
                                    <p className="font-semibold text-white truncate">{c.fullName}</p>
                                    <p className="text-[9px] text-slate-500 truncate mt-0.5">{c.role}</p>
                                  </div>
                                </div>
                                
                                {/* Wallet */}
                                <div className="flex items-center gap-1.5 font-mono text-slate-400 pr-1.5">
                                  <span>{shortenAddress(c.walletAddress)}</span>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 w-6 p-0 hover:bg-white/10"
                                    onClick={() => handleCopy(c.id, c.walletAddress)}
                                    title="Copy address"
                                  >
                                    {copiedId === c.id ? (
                                      <Check className="h-3 w-3 text-emerald-400" />
                                    ) : (
                                      <Copy className="h-3 w-3 text-slate-500" />
                                    )}
                                  </Button>
                                </div>

                                {/* Status */}
                                <div>
                                  {c.status === "Paid" && c.txHash ? (
                                    <a 
                                      href={`https://testnet.arcscan.app/tx/${c.txHash}`} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="text-emerald-400 inline-flex items-center gap-1 hover:underline font-semibold text-[10px] bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full"
                                    >
                                      Mined
                                      <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                                    </a>
                                  ) : c.status === "Failed" ? (
                                    <span className="text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full font-semibold text-[10px]" title={c.errorMsg}>
                                      Failed
                                    </span>
                                  ) : c.status === "Pending" ? (
                                    <span className="text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full font-semibold inline-flex items-center gap-1 text-[10px]">
                                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                      Mining
                                    </span>
                                  ) : (
                                    <span className="text-slate-500 bg-slate-500/5 border border-white/5 px-2 py-0.5 rounded-full text-[10px]">
                                      Unpaid
                                    </span>
                                  )}
                                </div>

                                {/* Salary */}
                                <div className="text-right font-semibold text-white">
                                  {c.salaryAmount.toLocaleString()} USDC
                                </div>
                              </div>
                            ))}

                          </div>
                        </div>
                      </CardContent>
                    </Card>

                  </div>
                )}
                
                {/* ── 5. Payroll Run History ──────────────────────────── */}
                <Card className="glass-card-component">
                  <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                    <div>
                      <CardTitle className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Payroll Run History
                      </CardTitle>
                      <CardDescription className="text-[10px] text-slate-500">
                        Historical roster compilations and executions
                      </CardDescription>
                    </div>
                    {batches.length > 0 && (
                      <div className="text-[10px] font-semibold text-[#4f8cff] bg-[#6d5dfc]/10 border border-[#6d5dfc]/15 px-2.5 py-0.5 rounded-full shrink-0">
                        {batches.length} runs
                      </div>
                    )}
                  </CardHeader>
                  <CardContent className="pt-2">
                    {batches.length === 0 ? (
                      <div className="text-center py-12 border border-white/5 rounded-2xl bg-white/[0.01] p-6">
                        <History className="h-10 w-10 text-slate-600 mx-auto mb-3" />
                        <p className="text-sm font-semibold text-slate-300">No payroll history yet.</p>
                        <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                          Generate your first payroll run using the builder tab card above.
                        </p>
                      </div>
                    ) : (
                      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-1">
                        {batches.map((b) => {
                          const isActive = b.id === activeBatchId;
                          return (
                            <div
                              key={b.id}
                              onClick={() => {
                                if (isActionPending) return;
                                setActiveBatchId(b.id);
                                setError(null);
                                setSuccess(null);
                              }}
                              className={cn(
                                "flex items-center justify-between border rounded-xl px-4 py-3.5 cursor-pointer hover:-translate-y-0.5 transition-all duration-300 group",
                                isActive 
                                  ? "border-[#6d5dfc]/40 bg-[#6d5dfc]/10 hover:bg-[#6d5dfc]/12 shadow-[0_0_12px_rgba(109,93,252,0.15)]" 
                                  : "border-white/5 hover:border-white/12 bg-white/[0.01] hover:bg-white/[0.03]",
                                isActionPending && "opacity-50 cursor-not-allowed pointer-events-none"
                              )}
                            >
                              <div className="space-y-1 min-w-0 pr-2">
                                <p className="font-semibold text-white text-sm truncate">{b.month}</p>
                                <p className="text-[10px] text-slate-400">
                                  {b.recipientsCount} Recipients · {b.totalAmount.toLocaleString()} USDC
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <Badge 
                                  variant={
                                    b.status === "Paid" ? "success" : 
                                    b.status === "Partially Paid" ? "warning" :
                                    b.status === "Approved" ? "blue" : "secondary"
                                  }
                                >
                                  {b.status}
                                </Badge>
                                <button
                                  disabled={isActionPending}
                                  className="p-1 rounded bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/12 text-slate-400 group-hover:text-white transition-colors"
                                >
                                  <ArrowRight className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

              </div>

            </div>
          </>
        )}

        {/* Payout Execution & Review Modal (Functional parity preserved) */}
        {isPayoutModalOpen && activeBatch && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div 
              className="absolute inset-0 bg-black/70 backdrop-blur-sm cursor-pointer animate-fade-in"
              onClick={() => !isExecuting && setIsPayoutModalOpen(false)}
            />
            
            {/* Modal Card */}
            <div className="w-full max-w-xl relative z-10 rounded-2xl border border-white/12 bg-[#060f24]/95 backdrop-blur-xl p-6 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#6d5dfc] via-[#6d5dfc] to-[#4f8cff]" />
              
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-white">Confirm Payroll Payouts</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Batch payroll execution through the ArcPayroll smart contract on Arc Testnet.
                  </p>
                </div>
                {!isExecuting && (
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-8 w-8 p-0 hover:bg-white/10" 
                    onClick={() => setIsPayoutModalOpen(false)}
                  >
                    <X className="h-4.5 w-4.5 text-slate-400" />
                  </Button>
                )}
              </div>

              {payoutError && (
                <div className="mb-4 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 flex gap-2">
                  <AlertOctagon className="h-4.5 w-4.5 shrink-0 text-rose-400 mt-0.5" />
                  <span>{payoutError}</span>
                </div>
              )}

              {/* Founder wallet balance info */}
              <div className="mb-4 rounded-xl border border-white/8 bg-white/5 p-4 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-500 text-xs">FOUNDER WALLET BALANCE</p>
                  <p className={cn(
                    "font-bold mt-1",
                    isConnected ? "gradient-text inline-block" : "text-white"
                  )}>
                    {!isConnected 
                      ? "Wallet Disconnected" 
                      : `${usdcBalanceFormatted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs">TOTAL PAYROLL AMOUNT</p>
                  <p className="font-bold gradient-text inline-block mt-1">
                    {activeBatch.totalAmount.toLocaleString()} USDC
                  </p>
                </div>
              </div>

              {/* Warning for insufficient balance */}
              {isConnected && usdcBalance !== undefined && usdcBalanceFormatted < activeBatch.totalAmount && (
                <div className="mb-4 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex gap-2">
                  <AlertCircle className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
                  <p className="leading-relaxed">
                    <strong>Warning:</strong> Your USDC balance is less than the total payroll amount. Transactions might revert due to insufficient funds. Visit the Faucet to claim test tokens.
                  </p>
                </div>
              )}

              {/* Recipient Roster inside Modal */}
              <div className="max-h-[200px] overflow-y-auto border border-white/5 rounded-xl pr-1 space-y-1.5 p-2 bg-black/20">
                <div className="grid grid-cols-[1.5fr_1.5fr_1fr] px-3 py-1.5 text-[10px] font-semibold text-slate-500">
                  <span>RECIPIENT</span>
                  <span>WALLET ADDRESS</span>
                  <span className="text-right">SALARY</span>
                </div>
                {activeBatch.contributors.map((c, index) => {
                  const isCurrent = currentExecutionIndex === index;
                  return (
                    <div 
                      key={c.id} 
                      className={cn(
                        "grid grid-cols-[1.5fr_1.5fr_1fr] items-center px-3 py-2 text-xs border border-transparent rounded-lg transition-all",
                        isCurrent ? "bg-[#6d5dfc]/10 border-[#6d5dfc]/20" : "bg-white/[0.01]"
                      )}
                    >
                      <div className="truncate pr-1">
                        <p className="font-semibold text-white truncate">{c.fullName}</p>
                        {c.frequency && c.scheduledDate ? (
                          <p className="text-[9px] text-[#4f8cff] truncate mt-0.5 font-medium">
                            {c.frequency} (Due {c.scheduledDate})
                          </p>
                        ) : (
                          <p className="text-[10px] text-slate-400 truncate">{c.role}</p>
                        )}
                      </div>
                      <span className="font-mono text-slate-400 text-[10px]">
                        {shortenAddress(c.walletAddress)}
                      </span>
                      <div className="text-right flex items-center justify-end gap-1.5 font-semibold text-white">
                        <span>{c.salaryAmount.toLocaleString()} USDC</span>
                        {c.status === "Paid" && (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                        )}
                        {c.status === "Failed" && (
                          <span title={c.errorMsg} className="shrink-0">
                            <AlertOctagon className="h-4 w-4 text-rose-400" />
                          </span>
                        )}
                        {c.status === "Pending" && (
                          <Loader2 className="h-4 w-4 text-amber-400 animate-spin shrink-0" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-white/5 mt-6">
                {!isConnected ? (
                  <div className="text-xs text-amber-400 bg-amber-500/5 border border-amber-500/10 rounded-lg p-2.5 w-full text-center">
                    Please connect your founder wallet in the header navigation to execute payouts.
                  </div>
                ) : !isArcTestnet ? (
                  <div className="flex flex-col gap-3 w-full">
                    <div className="text-xs text-amber-400 bg-amber-500/5 border border-amber-500/10 rounded-lg p-2.5 text-center">
                      Unsupported network connected. Arc Payroll only supports Arc Testnet. Please switch networks to execute payouts.
                    </div>
                    <div className="flex justify-end gap-3">
                      <Button
                        variant="outline"
                        onClick={() => setIsPayoutModalOpen(false)}
                        disabled={isExecuting}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={switchToArcTestnet}
                        disabled={isActionPending}
                        className="btn-electric"
                      >
                        {isSwitching ? "Switching..." : "Switch to Arc Testnet"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {!isExecuting ? (
                      <>
                        <Button
                          variant="outline"
                          onClick={() => setIsPayoutModalOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={handleExecutePayout}
                          disabled={isActionPending}
                          className="btn-electric gap-2"
                        >
                          <Send className="h-4 w-4" />
                          Confirm & Execute Payouts
                        </Button>
                      </>
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
                        <Loader2 className="h-4 w-4 animate-spin text-[#4f8cff]" />
                        <span>
                          {currentExecutionIndex === -2 ? (
                            "Approving USDC allowance..."
                          ) : (
                            "Executing batch payroll through ArcPayroll contract..."
                          )}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>

            </div>
          </div>
        )}

      </div>
    </AppShell>
  );
}
