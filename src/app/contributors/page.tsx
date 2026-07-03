"use client";

import { useState, useEffect } from "react";
import { 
  Plus, 
  Search, 
  UserRoundCheck, 
  Edit2, 
  Trash2, 
  AlertCircle, 
  Check, 
  Copy, 
  ExternalLink,
  X,
  DollarSign,
  AlertTriangle,
  Lock,
  CalendarClock,
  Calendar,
  Users
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { shortenAddress, useArcWallet } from "@/components/wallet/use-arc-wallet";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";

type Contributor = {
  id: string;
  fullName: string;
  walletAddress: string;
  role: string;
  salaryAmount: number;
  status: "Active" | "Suspended";
  startDate: string;
  frequency: "Weekly" | "Monthly";
  payoutDay: number | string;
};

const DEFAULT_CONTRIBUTORS: Contributor[] = [
  {
    id: "c-1",
    fullName: "Maya Chen",
    walletAddress: "0x7a8df39c1234567890abcdef1234567890abcdef",
    role: "Lead Protocol Engineer",
    salaryAmount: 10,
    status: "Active",
    startDate: "2026-06-01",
    frequency: "Monthly",
    payoutDay: 1,
  },
  {
    id: "c-2",
    fullName: "Luis Park",
    walletAddress: "0xbc8a892b1234567890abcdef1234567890abcdef",
    role: "Frontend Engineer",
    salaryAmount: 10,
    status: "Active",
    startDate: "2026-06-01",
    frequency: "Monthly",
    payoutDay: 15,
  },
  {
    id: "c-3",
    fullName: "Ari James",
    walletAddress: "0x4e23761a1234567890abcdef1234567890abcdef",
    role: "Product Designer",
    salaryAmount: 10,
    status: "Active",
    startDate: "2026-06-01",
    frequency: "Weekly",
    payoutDay: "Friday",
  },
  {
    id: "c-4",
    fullName: "Nora Singh",
    walletAddress: "0x9f1a238b1234567890abcdef1234567890abcdef",
    role: "DevOps Engineer",
    salaryAmount: 10,
    status: "Suspended",
    startDate: "2026-06-01",
    frequency: "Monthly",
    payoutDay: 1,
  },
];

const initialForm = {
  fullName: "",
  walletAddress: "",
  role: "",
  salaryAmount: 0,
  status: "Active" as "Active" | "Suspended",
  startDate: new Date().toISOString().split("T")[0],
  frequency: "Monthly" as "Weekly" | "Monthly",
  payoutDay: 1 as number | string,
};

export default function ContributorsPage() {
  const [mounted, setMounted] = useState(false);
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("All");
  const [storageError, setStorageError] = useState(false);
  const { isConnected } = useArcWallet();
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingContributorId, setEditingContributorId] = useState<string | null>(null);
  const [formData, setFormData] = useState(initialForm);
  const [formError, setFormError] = useState<string | null>(null);
  
  // Delete confirm states
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  
  // Clipboard copied states
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const FILTER_OPTIONS = ["All", "Active", "Weekly", "Monthly", "High payout"] as const;

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("arc_contributors");
    if (stored) {
      try {
        setContributors(JSON.parse(stored));
      } catch {
        setContributors([]);
        setStorageError(true);
      }
    }
  }, []);

  useEffect(() => {
    if (isConnected && mounted) {
      const stored = localStorage.getItem("arc_contributors");
      if (!stored) {
        setContributors(DEFAULT_CONTRIBUTORS);
        localStorage.setItem("arc_contributors", JSON.stringify(DEFAULT_CONTRIBUTORS));
      } else {
        try {
          setContributors(JSON.parse(stored));
        } catch {
          setContributors([]);
          setStorageError(true);
        }
      }
    }
  }, [isConnected, mounted]);

  const saveRoster = (newRoster: Contributor[]) => {
    setContributors(newRoster);
    localStorage.setItem("arc_contributors", JSON.stringify(newRoster));
  };

  const handleCopy = (id: string, address: string) => {
    navigator.clipboard.writeText(address);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenAddModal = () => {
    setFormData(initialForm);
    setEditingContributorId(null);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (contributor: Contributor) => {
    setFormData({
      fullName: contributor.fullName,
      walletAddress: contributor.walletAddress,
      role: contributor.role,
      salaryAmount: contributor.salaryAmount,
      status: contributor.status,
      startDate: contributor.startDate || new Date().toISOString().split("T")[0],
      frequency: contributor.frequency || "Monthly",
      payoutDay: contributor.payoutDay !== undefined ? contributor.payoutDay : 1,
    });
    setEditingContributorId(contributor.id);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingContributorId(null);
    setFormError(null);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const { fullName, walletAddress, role, salaryAmount, status, startDate, frequency, payoutDay } = formData;

    // Simple validations
    if (!fullName.trim() || !role.trim()) {
      setFormError("Full Name and Role fields are required.");
      return;
    }

    if (salaryAmount <= 0) {
      setFormError("Salary amount must be a positive number.");
      return;
    }

    if (!startDate) {
      setFormError("Start date is required.");
      return;
    }

    // EVM Address Validation
    const cleanAddress = walletAddress.trim();
    const isAddressValid = /^0x[a-fA-F0-9]{40}$/.test(cleanAddress);
    if (!isAddressValid) {
      setFormError("Please enter a valid wallet address (0x followed by 40 hex characters).");
      return;
    }

    // Duplicate Address check
    const isDuplicate = contributors.some(c => 
      c.id !== editingContributorId && 
      c.walletAddress.toLowerCase() === cleanAddress.toLowerCase()
    );

    if (isDuplicate) {
      setFormError("This wallet address is already assigned to another contributor.");
      return;
    }

    if (editingContributorId) {
      // Edit mode
      const updated = contributors.map(c => 
        c.id === editingContributorId 
          ? { 
              ...c, 
              fullName, 
              walletAddress: cleanAddress, 
              role, 
              salaryAmount, 
              status, 
              startDate, 
              frequency, 
              payoutDay 
            }
          : c
      );
      saveRoster(updated);
    } else {
      // Add mode
      const newContributor: Contributor = {
        id: `c-${Date.now()}`,
        fullName,
        walletAddress: cleanAddress,
        role,
        salaryAmount,
        status,
        startDate,
        frequency,
        payoutDay,
      };
      saveRoster([...contributors, newContributor]);
    }

    handleCloseModal();
  };

  const handleConfirmDelete = (id: string) => {
    const updated = contributors.filter(c => c.id !== id);
    saveRoster(updated);
    setDeleteConfirmId(null);
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 0) return "";
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const averageSalary = contributors.length > 0
    ? contributors.reduce((sum, c) => sum + c.salaryAmount, 0) / contributors.length
    : 0;

  const filteredContributors = contributors.filter(c => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = (
      c.fullName.toLowerCase().includes(query) ||
      c.role.toLowerCase().includes(query) ||
      c.walletAddress.toLowerCase().includes(query)
    );
    if (!matchesSearch) return false;

    if (activeFilter === "Active") {
      return c.status === "Active";
    }
    if (activeFilter === "Weekly") {
      return c.frequency === "Weekly";
    }
    if (activeFilter === "Monthly") {
      return c.frequency === "Monthly";
    }
    if (activeFilter === "High payout") {
      return c.salaryAmount >= averageSalary;
    }
    return true;
  });

  const totalContributors = contributors.length;
  const totalMonthlyPayroll = contributors
    .filter(c => c.status === "Active")
    .reduce((sum, c) => sum + c.salaryAmount, 0);
  const weeklyContributorsCount = contributors.filter(c => c.frequency === "Weekly").length;
  const monthlyContributorsCount = contributors.filter(c => c.frequency === "Monthly").length;

  if (!mounted) {
    return (
      <AppShell>
        <div className="space-y-6">
          <PageHeader
            eyebrow="Contributors"
            title="Workspace Roster"
            description="Syncing workspace contributor parameters..."
          />
          <Card className="glass-card-component bg-[#060f24]/30 animate-pulse h-96" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="relative space-y-6 pb-12">
        {/* Ambient background glows */}
        <div className="orb orb-1 opacity-40" />
        <div className="orb orb-2 opacity-30" />

        <div className="relative z-10">
          <PageHeader
            eyebrow="Contributors"
            title="Workspace Roster"
            description="Manage contributor profiles, wallet addresses, and monthly compensations. Setup direct payroll pipelines."
            action={
              isConnected && (
                <button
                  onClick={handleOpenAddModal}
                  className="inline-flex items-center gap-2 relative overflow-hidden bg-gradient-to-r from-[#6d5dfc] via-[#5c4df0] to-[#00c2ff] text-white font-semibold py-2 px-4.5 rounded-xl transition-all duration-300 shadow-[0_0_15px_rgba(109,93,252,0.35)] hover:shadow-[0_0_25px_rgba(109,93,252,0.55)] hover:-translate-y-0.5 hover:scale-[1.02] active:translate-y-0 active:scale-100 group shrink-0"
                >
                  <Plus className="h-4.5 w-4.5 shrink-0" />
                  <span className="text-sm">Add Contributor</span>
                  <span className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer-slide_0.8s_ease-out_forwards] skew-x-12" />
                </button>
              )
            }
          />
        </div>

        {storageError && (
          <div className="relative z-10 flex gap-3 p-4 rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-200 text-sm animate-in fade-in slide-in-from-top-4 duration-200">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
            <div>
              <p className="font-semibold">Local Storage Corrupted</p>
              <p className="mt-1 text-xs text-amber-300/90 leading-relaxed">
                Workspace roster data is corrupted or invalid. Falling back to an empty team roster.
              </p>
            </div>
          </div>
        )}

        {!isConnected ? (
          <Card className="relative z-10 glass-card-component border border-white/5 bg-[#060f24]/30 backdrop-blur-xl">
            <CardContent className="py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#6d5dfc]/10 border border-[#6d5dfc]/15 text-[#4f8cff] mx-auto mb-4 animate-pulse">
                <Lock className="h-6 w-6" />
              </div>
              <p className="text-base font-semibold text-slate-200">Connect your wallet to view and manage contributors.</p>
              <p className="text-xs text-slate-500 mt-1 mb-6 max-w-xs mx-auto">
                Please connect your wallet to access the workspace roster and salary configurations.
              </p>
              <div className="flex justify-center">
                <ConnectWalletButton />
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Overview Stats Cards Grid */}
            <div className="relative z-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 animate-in fade-in slide-in-from-top-4 duration-300">
              <Card className="relative overflow-hidden border border-white/5 bg-[#060f24]/40 backdrop-blur-xl shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
                <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-blue-500 to-[#6d5dfc]" />
                <CardContent className="p-5 flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Contributors</span>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl font-extrabold text-white tracking-tight">{totalContributors}</span>
                      <span className="text-xs text-slate-400 font-medium">members</span>
                    </div>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                    <Users className="h-5 w-5" />
                  </div>
                </CardContent>
              </Card>

              <Card className="relative overflow-hidden border border-white/5 bg-[#060f24]/40 backdrop-blur-xl shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
                <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-[#6d5dfc] to-purple-500" />
                <CardContent className="p-5 flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Active Monthly Payroll</span>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl font-extrabold text-emerald-400 tracking-tight">${totalMonthlyPayroll.toLocaleString()}</span>
                      <span className="text-xs text-slate-400 font-medium">/ mo</span>
                    </div>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                    <DollarSign className="h-5 w-5" />
                  </div>
                </CardContent>
              </Card>

              <Card className="relative overflow-hidden border border-white/5 bg-[#060f24]/40 backdrop-blur-xl shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
                <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-purple-500 to-[#4f8cff]" />
                <CardContent className="p-5 flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Weekly Payouts</span>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl font-extrabold text-white tracking-tight">{weeklyContributorsCount}</span>
                      <span className="text-xs text-slate-400 font-medium">schedules</span>
                    </div>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                    <CalendarClock className="h-5 w-5" />
                  </div>
                </CardContent>
              </Card>

              <Card className="relative overflow-hidden border border-white/5 bg-[#060f24]/40 backdrop-blur-xl shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
                <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-[#4f8cff] to-cyan-500" />
                <CardContent className="p-5 flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Monthly Payouts</span>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl font-extrabold text-white tracking-tight">{monthlyContributorsCount}</span>
                      <span className="text-xs text-slate-400 font-medium">schedules</span>
                    </div>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                    <Calendar className="h-5 w-5" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Directory Card */}
            <Card className="relative z-10 glass-card-component border border-white/5 bg-[#060f24]/30 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] animate-in fade-in slide-in-from-top-6 duration-300">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl font-bold text-white tracking-tight">Team Roster</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {contributors.length === 0 ? (
                  <div className="text-center py-20 max-w-md mx-auto px-6 border border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#6d5dfc]/10 border border-[#6d5dfc]/15 text-[#4f8cff] mx-auto mb-6 shadow-[0_0_30px_rgba(109,93,252,0.15)] animate-pulse">
                      <UserRoundCheck className="h-8 w-8" />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2">No contributors yet</h3>
                    <p className="text-sm text-slate-400 leading-relaxed mb-6">
                      No contributors yet. Add your first team member to start payroll.
                    </p>
                    <button 
                      onClick={handleOpenAddModal} 
                      className="inline-flex items-center gap-2 relative overflow-hidden bg-gradient-to-r from-[#6d5dfc] via-[#5c4df0] to-[#4f8cff] text-white font-semibold py-2.5 px-6 rounded-xl transition-all duration-300 shadow-[0_0_20px_rgba(109,93,252,0.35)] hover:shadow-[0_0_30px_rgba(109,93,252,0.55)] hover:-translate-y-0.5 hover:scale-[1.02] active:translate-y-0 active:scale-100 group"
                    >
                      <Plus className="h-4.5 w-4.5" />
                      <span>Add team member</span>
                      <span className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer-slide_0.8s_ease-out_forwards] skew-x-12" />
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Search & Filter Controls Panel */}
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between pb-6 border-b border-white/5 mb-6">
                      {/* Search Bar */}
                      <div className="relative w-full md:w-80">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Search name, role, or wallet..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full pl-10 pr-10 py-2.5 text-sm bg-[#020817]/40 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-[#6d5dfc] focus:ring-2 focus:ring-[#6d5dfc]/20 focus:shadow-[0_0_15px_rgba(109,93,252,0.15)] transition-all duration-300"
                        />
                        {searchQuery && (
                          <button
                            type="button"
                            onClick={() => setSearchQuery("")}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-all"
                            title="Clear search"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Filter Chips */}
                      <div className="flex flex-wrap gap-2 items-center">
                        {FILTER_OPTIONS.map((filter) => {
                          const isActive = activeFilter === filter;
                          const label = filter === "High payout"
                            ? `High payout (≥ $${Math.round(averageSalary).toLocaleString()})`
                            : filter;
                          return (
                            <button
                              key={filter}
                              type="button"
                              onClick={() => setActiveFilter(filter)}
                              className={`px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all duration-200 border ${
                                isActive
                                  ? "bg-[#6d5dfc]/15 text-white border-[#6d5dfc] shadow-[0_0_12px_rgba(109,93,252,0.25)]"
                                  : "bg-white/[0.03] text-slate-400 border-white/5 hover:text-white hover:bg-white/[0.08] hover:border-white/10"
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {filteredContributors.length === 0 ? (
                      <div className="text-center py-16 border border-dashed border-white/5 rounded-2xl bg-white/[0.01] px-6">
                        <Search className="h-10 w-10 text-slate-600 mx-auto mb-4" />
                        <h4 className="text-sm font-semibold text-slate-300">No results found</h4>
                        <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto leading-relaxed">
                          No team members match your current filter or search criteria. Try adjusting your terms or resetting filters.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setSearchQuery("");
                            setActiveFilter("All");
                          }}
                          className="mt-4 text-xs font-semibold text-[#4f8cff] hover:underline"
                        >
                          Reset filters & search
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {filteredContributors.map((c) => {
                          const initials = getInitials(c.fullName);
                          return (
                            <div
                              key={c.id}
                              className="group relative flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4.5 rounded-2xl border border-white/5 bg-[#060f24]/40 hover:bg-[#0b1735]/40 hover:border-[#6d5dfc]/25 hover:shadow-[0_0_20px_rgba(109,93,252,0.1)] transition-all duration-300 hover:-translate-y-0.5"
                            >
                              {/* Contributor Main Info */}
                              <div className="flex items-center gap-4 min-w-[240px]">
                                {/* Initials Badge */}
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#6d5dfc]/20 to-[#4f8cff]/20 text-[#4f8cff] font-bold text-sm border border-[#6d5dfc]/30 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]">
                                  {initials}
                                </div>
                                <div className="space-y-0.5 truncate">
                                  <h4 className="font-semibold text-white text-base leading-snug truncate">{c.fullName}</h4>
                                  <p className="text-xs text-slate-400 font-medium truncate">{c.role}</p>
                                  {/* Payout Schedule indicator */}
                                  <div className="flex items-center gap-1 text-[10px] text-slate-500 font-mono mt-1">
                                    <CalendarClock className="h-3 w-3 text-[#4f8cff] shrink-0" />
                                    <span>
                                      Starts {c.startDate || "2026-06-01"}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Wallet Address section */}
                              <div className="flex flex-col gap-1 min-w-[190px]">
                                <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Wallet</span>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs text-slate-300 bg-[#020817]/40 border border-white/5 px-2 py-1 rounded-lg">
                                    {shortenAddress(c.walletAddress)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleCopy(c.id, c.walletAddress)}
                                    className="p-1.5 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 text-slate-400 hover:text-white transition-all transform hover:scale-105 active:scale-95"
                                    title="Copy address"
                                  >
                                    {copiedId === c.id ? (
                                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                                    ) : (
                                      <Copy className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                  <a
                                    href={`https://testnet.arcscan.app/address/${c.walletAddress}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="p-1.5 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 text-slate-400 hover:text-white transition-all transform hover:scale-105 active:scale-95"
                                    title="View on ArcScan"
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </a>
                                </div>
                              </div>

                              {/* Compensation details */}
                              <div className="flex flex-col gap-1 min-w-[130px]">
                                <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Compensation</span>
                                <div className="flex items-baseline gap-1">
                                  <span className="font-extrabold text-emerald-400 text-lg leading-none">
                                    ${c.salaryAmount.toLocaleString()}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-medium">/ month</span>
                                </div>
                                <div className="mt-0.5">
                                  <Badge 
                                    className={`text-[9px] font-bold tracking-wide uppercase px-2 py-0 border-0 ${
                                      c.frequency === "Weekly" 
                                        ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" 
                                        : "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                                    }`}
                                  >
                                    {c.frequency}
                                  </Badge>
                                </div>
                              </div>

                              {/* Next Payout / Schedule */}
                              <div className="flex flex-col gap-1 min-w-[120px]">
                                <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Schedule Details</span>
                                <span className="text-xs font-semibold text-slate-300 font-mono">
                                  {c.frequency === "Weekly" ? `Friday (${c.payoutDay})` : `Day ${c.payoutDay}`}
                                </span>
                                <span className="text-[9px] text-slate-500 font-medium leading-none">
                                  {c.frequency === "Weekly" ? `Every week` : `Every month`}
                                </span>
                              </div>

                              {/* Status Indicator */}
                              <div className="flex flex-col gap-1 min-w-[90px]">
                                <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Status</span>
                                <div>
                                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                                    c.status === "Active"
                                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]"
                                      : "bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.1)]"
                                  }`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${
                                      c.status === "Active" ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
                                    }`} />
                                    {c.status}
                                  </span>
                                </div>
                              </div>

                              {/* Actions Menu */}
                              <div className="flex items-center gap-2 justify-end lg:self-center border-t border-white/5 pt-3 lg:border-t-0 lg:pt-0 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditModal(c)}
                                  className="p-2 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 text-slate-400 hover:text-white transition-all transform hover:scale-105 active:scale-95"
                                  title="Edit contributor"
                                >
                                  <Edit2 className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteConfirmId(c.id)}
                                  className="p-2 rounded-xl bg-rose-500/5 border border-rose-500/5 hover:bg-rose-500/10 hover:border-rose-500/15 text-rose-400/85 hover:text-rose-400 transition-all transform hover:scale-105 active:scale-95"
                                  title="Remove contributor"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* Custom Edit/Add Modal Overlay */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div 
              className="absolute inset-0 bg-black/70 backdrop-blur-sm cursor-pointer"
              onClick={handleCloseModal}
            />
            
            {/* Modal Card */}
            <div className="w-full max-w-md relative z-10 rounded-2xl border border-white/12 bg-[#060f24]/95 backdrop-blur-xl p-6 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#6d5dfc] via-[#6d5dfc] to-[#4f8cff]" />
              
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-white">
                    {editingContributorId ? "Edit Contributor" : "Add Contributor"}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Configure profile data, payment credentials, and compensation.
                  </p>
                </div>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="h-8 w-8 p-0 hover:bg-white/10" 
                  onClick={handleCloseModal}
                >
                  <X className="h-4.5 w-4.5 text-slate-400" />
                </Button>
              </div>

              {formError && (
                <div className="mb-4 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 flex gap-2">
                  <AlertCircle className="h-4.5 w-4.5 shrink-0 text-rose-400 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleFormSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">FULL NAME</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Maya Chen"
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    className="w-full rounded-xl bg-white/5 border border-white/8 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#6d5dfc] focus:ring-1 focus:ring-[#6d5dfc] transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">WALLET ADDRESS</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 0x..."
                    value={formData.walletAddress}
                    onChange={(e) => setFormData({ ...formData, walletAddress: e.target.value })}
                    className="w-full rounded-xl bg-white/5 border border-white/8 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#6d5dfc] focus:ring-1 focus:ring-[#6d5dfc] transition-all font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">ROLE / DESIGNATION</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Lead Developer"
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full rounded-xl bg-white/5 border border-white/8 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#6d5dfc] focus:ring-1 focus:ring-[#6d5dfc] transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">SALARY (USD / MO)</label>
                    <input
                      type="number"
                      required
                      min="1"
                      placeholder="e.g. 5000"
                      value={formData.salaryAmount || ""}
                      onChange={(e) => setFormData({ ...formData, salaryAmount: Number(e.target.value) })}
                      className="w-full rounded-xl bg-white/5 border border-white/8 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#6d5dfc] focus:ring-1 focus:ring-[#6d5dfc] transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">STATUS</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value as "Active" | "Suspended" })}
                      className="w-full rounded-xl bg-[#060f24] border border-white/8 px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#6d5dfc] focus:ring-1 focus:ring-[#6d5dfc] transition-all"
                    >
                      <option value="Active">Active</option>
                      <option value="Suspended">Suspended</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">START DATE</label>
                  <input
                    type="date"
                    required
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full rounded-xl bg-white/5 border border-white/8 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#6d5dfc] focus:ring-1 focus:ring-[#6d5dfc] transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">PAYOUT FREQUENCY</label>
                    <select
                      value={formData.frequency}
                      onChange={(e) => {
                        const freq = e.target.value as "Weekly" | "Monthly";
                        setFormData({ 
                          ...formData, 
                          frequency: freq,
                          payoutDay: freq === "Weekly" ? "Friday" : 1 
                        });
                      }}
                      className="w-full rounded-xl bg-[#060f24] border border-white/8 px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#6d5dfc] focus:ring-1 focus:ring-[#6d5dfc] transition-all"
                    >
                      <option value="Weekly">Weekly</option>
                      <option value="Monthly">Monthly</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                      {formData.frequency === "Weekly" ? "WEEKDAY" : "DAY OF MONTH"}
                    </label>
                    {formData.frequency === "Weekly" ? (
                      <select
                        value={formData.payoutDay}
                        onChange={(e) => setFormData({ ...formData, payoutDay: e.target.value })}
                        className="w-full rounded-xl bg-[#060f24] border border-white/8 px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#6d5dfc] focus:ring-1 focus:ring-[#6d5dfc] transition-all"
                      >
                        <option value="Monday">Monday</option>
                        <option value="Tuesday">Tuesday</option>
                        <option value="Wednesday">Wednesday</option>
                        <option value="Thursday">Thursday</option>
                        <option value="Friday">Friday</option>
                        <option value="Saturday">Saturday</option>
                        <option value="Sunday">Sunday</option>
                      </select>
                    ) : (
                      <select
                        value={formData.payoutDay}
                        onChange={(e) => setFormData({ ...formData, payoutDay: Number(e.target.value) })}
                        className="w-full rounded-xl bg-[#060f24] border border-white/8 px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#6d5dfc] focus:ring-1 focus:ring-[#6d5dfc] transition-all"
                      >
                        {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                          <option key={day} value={day}>
                            {day === 1 ? "1st" : day === 2 ? "2nd" : day === 3 ? "3rd" : `${day}th`}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-white/5 mt-6">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCloseModal}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="btn-electric"
                  >
                    Save profile
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Confirmation Warning Overlay */}
        {deleteConfirmId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div 
              className="absolute inset-0 bg-black/70 backdrop-blur-sm cursor-pointer"
              onClick={() => setDeleteConfirmId(null)}
            />
            
            {/* Warning Box */}
            <div className="w-full max-w-sm relative z-10 rounded-2xl border border-rose-500/20 bg-[#060f24]/95 backdrop-blur-xl p-6 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="absolute top-0 left-0 right-0 h-1 bg-rose-500" />
              <div className="mb-4 flex gap-3">
                <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 shrink-0">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-md font-semibold text-white">Remove Contributor</h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Are you sure you want to remove this profile? This will delete their payroll parameter records.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-white/5 mt-6">
                <Button
                  variant="outline"
                  onClick={() => setDeleteConfirmId(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => handleConfirmDelete(deleteConfirmId)}
                >
                  Remove Roster
                </Button>
              </div>
            </div>
          </div>
        )}

      </div>
    </AppShell>
  );
}
