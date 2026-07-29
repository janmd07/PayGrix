"use client";

import { useState, useEffect } from "react";
import { 
  Activity, 
  Check, 
  Copy, 
  ExternalLink, 
  Landmark, 
  Wallet,
  Coins,
  History,
  AlertCircle,
  HelpCircle,
  ArrowUpRight,
  ShieldCheck,
  LogOut,
  AlertTriangle
} from "lucide-react";
import { useReadContract } from "wagmi";
import { formatUnits } from "viem";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { shortenAddress, useArcWallet } from "@/components/wallet/use-arc-wallet";
import { arcTestnet } from "@/config/arc-testnet";
import { cn } from "@/lib/utils";

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

// Mock transactions removed to show only real payout history


interface BatchContributor {
  id?: string;
  walletAddress: string;
  salaryAmount: number;
  status?: string;
  frequency?: string;
  scheduledDate?: string;
  txHash?: string;
}

interface TransactionRow {
  id: string;
  date: string;
  txHash: string;
  recipientWallet: string;
  amount: number;
  status: string;
  frequency: string;
  scheduledDate: string;
}

export default function TreasuryPage() {
  const [mounted, setMounted] = useState(false);
  const [allTransactions, setAllTransactions] = useState<TransactionRow[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [storageError, setStorageError] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) {
      const storedBatches = localStorage.getItem("arc_payroll_batches");
      if (storedBatches) {
        try {
          const parsed = JSON.parse(storedBatches);
          const txs: TransactionRow[] = [];
          
          if (Array.isArray(parsed)) {
            parsed.forEach((b) => {
              if (b && b.contributors && Array.isArray(b.contributors)) {
                b.contributors.forEach((c: BatchContributor) => {
                  if (c && c.txHash) {
                    txs.push({
                      id: `${b.id}-${c.id || c.walletAddress}`,
                      date: b.executedAt || b.approvedAt || b.createdAt || "Unknown date",
                      txHash: c.txHash,
                      recipientWallet: c.walletAddress,
                      amount: c.salaryAmount,
                      status: c.status || "Paid",
                      frequency: c.frequency || "Monthly",
                      scheduledDate: c.scheduledDate || b.executedAt || b.approvedAt || b.createdAt || "Unknown date"
                    });
                  }
                });
              }
            });
          }

          // Helper to get time safely
          const getTime = (dateStr: string) => {
            const time = new Date(dateStr).getTime();
            return isNaN(time) ? 0 : time;
          };

          // Sort by newest first
          const sorted = txs.sort((a, b) => {
            const timeA = getTime(a.date);
            const timeB = getTime(b.date);
            return timeB - timeA;
          });

          setAllTransactions(sorted);
        } catch {
          setAllTransactions([]);
          setStorageError(true);
        }
      }
    }
  }, [mounted]);


  const { 
    address, 
    isConnected, 
    isArcTestnet, 
    availableConnector, 
    connect, 
    disconnect,
    isConnecting,
    isSwitching,
    switchToArcTestnet
  } = useArcWallet();


  const { data: balance, isLoading: isBalanceLoading } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: isArcTestnet && address ? [address] : undefined,
    query: {
      enabled: !!isArcTestnet && !!address,
    }
  });

  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Loading / Hydration state
  if (!mounted) {
    return (
      <AppShell>
        <div className="space-y-6">
          <PageHeader
            eyebrow="Treasury"
            title="Wallet Treasury"
            description="Syncing wallet and treasury posture on Arc Testnet..."
          />
          <div className="grid gap-6 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="glass-card-component bg-[#060f24]/30">
                <CardHeader className="pb-2">
                  <div className="h-4 w-24 bg-white/5 animate-pulse rounded" />
                </CardHeader>
                <CardContent className="h-20 flex items-end">
                  <div className="h-8 w-36 bg-white/5 animate-pulse rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </AppShell>
    );
  }

  // Disconnected view
  if (!isConnected) {
    return (
      <AppShell>
        <div className="relative min-h-[75vh] flex items-center justify-center py-12">
          {/* Animated Ambient background glows */}
          <div className="orb orb-1 opacity-60" />
          <div className="orb orb-2 opacity-40" />
          
          <Card className="w-full max-w-md relative z-10 border border-white/10 bg-[#060f24]/60 backdrop-blur-xl p-8 text-center shadow-2xl">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#6d5dfc]/10 border border-[#6d5dfc]/15 text-[#4f8cff]">
              <Landmark className="h-8 w-8" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white mb-2">Connect Founder Wallet</h2>
            <p className="text-sm text-[#b7c4d6] mb-8 max-w-sm mx-auto leading-relaxed">
              PayGrix uses your connected founder wallet as the active treasury. Connect your wallet to view balances, network status, and recent payroll runs.
            </p>
            <div className="flex flex-col gap-3">
              {availableConnector ? (
                <Button 
                  onClick={() => connect({ connector: availableConnector })}
                  disabled={isConnecting}
                  size="lg"
                  className="w-full btn-electric"
                >
                  <Wallet className="mr-2 h-4.5 w-4.5" />
                  {isConnecting ? "Connecting wallet..." : "Connect Founder Wallet"}
                </Button>
              ) : (
                <div className="text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex gap-3 text-left">
                  <AlertCircle className="h-5 w-5 shrink-0 text-amber-400" />
                  <span>No Web3 provider detected. Please install a browser extension like MetaMask to connect.</span>
                </div>
              )}
              <p className="text-xs text-slate-500 mt-2">
                Supports MetaMask, Coinbase Wallet, Rabby, and other browser wallets.
              </p>
            </div>
          </Card>
        </div>
      </AppShell>
    );
  }


  const formattedBalance = balance !== undefined
    ? `${Number(formatUnits(balance as bigint, 6)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`
    : isBalanceLoading
    ? "Fetching..."
    : "0.00 USDC";

  const ITEMS_PER_PAGE = 4;
  const totalPages = Math.ceil(allTransactions.length / ITEMS_PER_PAGE);
  const paginatedTransactions = allTransactions.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  return (
    <AppShell>
      <div className="relative space-y-6">
        {/* Ambient background glows */}
        <div className="orb orb-1 opacity-40" />
        <div className="orb orb-3 opacity-30" />

        <div className="relative z-10">
          <PageHeader
            eyebrow="Treasury"
            title="Wallet Treasury"
            description="Founder wallet acting as the direct payroll treasury. Payments are calculated and funded directly from this address."
          />
        </div>

        {storageError && (
          <div className="relative z-10 flex gap-3 p-4 rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-200 text-sm">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
            <div>
              <p className="font-semibold">Local Storage Corrupted</p>
              <p className="mt-1 text-xs text-amber-300/90 leading-relaxed">
                Workspace payroll configuration history is corrupted or invalid. Falling back to empty transaction lists.
              </p>
            </div>
          </div>
        )}

        {/* Overview Row */}
        <div className="relative z-10 grid gap-6 md:grid-cols-2">
          {/* Wallet custody card */}
          <Card className="glass-card-component">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-slate-400">Connected Founder Wallet</CardTitle>
                <Badge variant="blue">Founder Custody</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-xl bg-white/5 border border-white/8 p-3">
                <span className="font-mono text-sm text-white">{shortenAddress(address || "")}</span>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 hover:bg-white/10"
                    onClick={handleCopy}
                    title="Copy full address"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Copy className="h-4 w-4 text-slate-400" />
                    )}
                  </Button>
                  <a
                    href={`https://testnet.arcscan.app/address/${address}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 hover:bg-white/10"
                      title="View on ArcScan"
                    >
                      <ExternalLink className="h-4 w-4 text-slate-400" />
                    </Button>
                  </a>
                </div>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                The founder wallet itself acts as the treasury. Deposits are not required since all payroll runs are signed and sent directly from your address.
              </p>
              <div className="pt-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => disconnect()}
                  className="w-full sm:w-auto text-rose-400 border-rose-500/20 hover:bg-rose-500/10 hover:text-rose-300"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Disconnect Wallet
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Network configuration card */}
          <Card className="glass-card-component">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-medium text-slate-400">Arc Testnet Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-xl bg-white/5 border border-white/8 p-3">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "h-2 w-2 rounded-full",
                    isArcTestnet ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
                  )} />
                  <span className="text-sm font-medium text-white">
                    {isArcTestnet ? "Arc Testnet (Active)" : "Unsupported Network"}
                  </span>
                </div>
                <Badge variant={isArcTestnet ? "success" : "warning"}>
                  {isArcTestnet ? "Active" : "Wrong Network"}
                </Badge>
              </div>
              
              {!isArcTestnet ? (
                <div className="space-y-3">
                  <p className="text-xs text-amber-400/90 leading-relaxed bg-amber-500/5 border border-amber-500/10 rounded-lg p-2.5">
                    Your wallet is currently connected to an unsupported network. Please switch to Arc Testnet to sync your active treasury balance.
                  </p>
                  <Button
                    size="sm"
                    className="w-full btn-electric"
                    disabled={isSwitching}
                    onClick={switchToArcTestnet}
                  >
                    {isSwitching ? "Switching Network..." : `Switch to ${arcTestnet.name}`}
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="rounded-lg bg-white/[0.02] border border-white/5 p-2">
                    <span className="text-slate-500 block mb-1">Chain ID</span>
                    <span className="text-slate-300 font-mono">{arcTestnet.id}</span>
                  </div>
                  <div className="rounded-lg bg-white/[0.02] border border-white/5 p-2">
                    <span className="text-slate-500 block mb-1">RPC endpoint</span>
                    <span className="text-slate-300 truncate block font-mono">{arcTestnet.rpcUrls.default.http[0]}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Stats Grid */}
        <div className="relative z-10 grid gap-6 md:grid-cols-3">
          {/* Total Balance */}
          <Card className="glass-card-component">
            <CardHeader className="flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm text-slate-400 font-medium">Total Balance</CardTitle>
              <Coins className="h-4.5 w-4.5 text-[#4f8cff]" />
            </CardHeader>
            <CardContent>
              {isBalanceLoading && isArcTestnet ? (
                <div className="h-8 w-24 bg-white/5 animate-pulse rounded-lg mt-1" />
              ) : isArcTestnet ? (
                <p className="text-2xl font-bold tracking-tight gradient-text inline-block">{formattedBalance}</p>
              ) : (
                <p className="text-2xl font-bold text-slate-500 tracking-tight">— USDC</p>
              )}
              <p className="mt-1 text-xs text-slate-500">
                {isArcTestnet ? "USDC balance on Arc Testnet" : "Switch network to view balance"}
              </p>
            </CardContent>
          </Card>

          {/* Available for Payroll */}
          <div className="glow-border-shell">
            <Card className="h-full border-0 bg-[#060f24]/90">
              <CardHeader className="flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm text-[#4f8cff] font-semibold">Available for Payroll</CardTitle>
                <Landmark className="h-4.5 w-4.5 text-[#6d5dfc]" />
              </CardHeader>
              <CardContent>
                {isBalanceLoading && isArcTestnet ? (
                  <div className="h-8 w-24 bg-white/5 animate-pulse rounded-lg mt-1" />
                ) : isArcTestnet ? (
                  <p className="text-2xl font-bold tracking-tight gradient-text inline-block">{formattedBalance}</p>
                ) : (
                  <p className="text-2xl font-bold text-slate-500 tracking-tight">— USDC</p>
                )}
                <p className="mt-1 text-xs text-[#b7c4d6]/80 flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <span>100% of founder USDC is available</span>
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Security Posture */}
          <Card className="glass-card-component">
            <CardHeader className="flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm text-slate-400 font-medium">Security Posture</CardTitle>
              <Activity className="h-4.5 w-4.5 text-[#6d5dfc]" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-white tracking-tight">Direct Custody</p>
              <p className="mt-1 text-xs text-slate-500">
                No third-party contract risk
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Transactions Table */}
        <Card className="relative z-10 glass-card-component">
          <CardHeader className="pb-4 flex flex-row items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-2.5">
              <History className="h-5 w-5 text-[#4f8cff]" />
              <div>
                <CardTitle className="text-base font-semibold text-white">Recent Payroll History</CardTitle>
                <CardDescription className="text-xs text-slate-400 mt-1">
                  On-chain payroll payouts executed on Arc Testnet
                </CardDescription>
              </div>
            </div>
            {mounted && allTransactions.length > 0 && (
              <div className="text-xs font-semibold text-[#4f8cff] bg-[#6d5dfc]/10 border border-[#6d5dfc]/15 rounded-full px-3 py-1 shrink-0">
                {allTransactions.length} successful {allTransactions.length === 1 ? "payout" : "payouts"}
              </div>
            )}
          </CardHeader>
          <CardContent className="pt-2">
            {allTransactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center border border-dashed border-white/10 rounded-xl bg-white/[0.01]">
                <div className="rounded-full bg-slate-500/5 border border-white/5 p-3 mb-3 text-slate-400">
                  <History className="h-6 w-6" />
                </div>
                <p className="text-sm text-slate-400 max-w-md leading-relaxed">
                  No payout history yet. Execute your first approved payroll to see transactions here.
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <div className="min-w-[650px] space-y-1.5">
                    {/* Headers */}
                    <div className="grid grid-cols-5 bg-white/5 px-4 py-2.5 text-xs font-semibold text-slate-400 rounded-lg">
                      <span>DATE & TIME</span>
                      <span>TRANSACTION HASH</span>
                      <span>RECIPIENT WALLET</span>
                      <span>AMOUNT</span>
                      <span className="text-right">STATUS</span>
                    </div>

                    {/* Rows */}
                    {paginatedTransactions.map((tx) => (
                      <div 
                        key={tx.id} 
                        className="grid grid-cols-5 items-center border border-white/5 px-4 py-3 text-sm text-white hover:bg-white/[0.02] rounded-lg transition-all"
                      >
                        <div className="pr-1.5 truncate">
                          <p className="text-slate-300 font-medium truncate">{tx.date}</p>
                          <p className="text-[10px] text-slate-500 truncate mt-0.5">Due: {tx.scheduledDate}</p>
                        </div>
                        <a 
                          href={`https://testnet.arcscan.app/tx/${tx.txHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-xs text-[#4f8cff] hover:underline flex items-center gap-1 cursor-pointer w-fit"
                        >
                          {tx.txHash.slice(0, 10)}...{tx.txHash.slice(-8)}
                          <ArrowUpRight className="h-3 w-3 inline shrink-0" />
                        </a>
                        <div className="pr-1.5 truncate">
                          <p className="font-mono text-xs text-slate-300 truncate">{shortenAddress(tx.recipientWallet)}</p>
                          <p className="text-[10px] text-[#4f8cff] font-medium truncate mt-0.5">{tx.frequency} Payout</p>
                        </div>
                        <span className="font-semibold text-white">
                          {tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC
                        </span>
                        <div className="text-right">
                          <Badge 
                            variant="success" 
                            className="px-2 py-0.5 text-[10px]"
                          >
                            Paid
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
                    <span className="text-xs text-slate-400">
                      Page {currentPage} of {totalPages}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-3 text-xs border-white/10 hover:bg-white/5 text-slate-300 disabled:opacity-50 disabled:hover:bg-transparent"
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      >
                        Previous
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-3 text-xs border-white/10 hover:bg-white/5 text-slate-300 disabled:opacity-50 disabled:hover:bg-transparent"
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
            
            <div className="mt-4 text-xs text-slate-500 bg-white/[0.01] border border-white/5 rounded-xl p-3 flex gap-2">
              <HelpCircle className="h-4.5 w-4.5 shrink-0 text-slate-500 mt-0.5" />
              <p className="leading-relaxed">
                Note: All transactions are executed on Arc Testnet. Transaction hashes can be clicked to view their status on the ArcScan explorer.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
