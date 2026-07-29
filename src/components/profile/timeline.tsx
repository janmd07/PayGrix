"use client";

import { useState, useEffect } from "react";
import { useArcWallet } from "@/components/wallet/use-arc-wallet";
import { Card, CardContent } from "@/components/ui/card";
import { CreditCard, QrCode, ArrowLeftRight, Shuffle, AlertCircle, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";

interface ActivityItem {
  id: string;
  type: "Payroll" | "Payment" | "Bridge" | "Swap" | "Treasury";
  title: string;
  description: string;
  amount: string;
  timestamp: string;
  date: Date;
  txHash?: string;
  status: string;
}

interface PayrollBatchLocal {
  id: string;
  recipientsCount: number;
  totalAmount: number;
  status: string;
  executedAt?: string;
  submittedAt?: string;
  createdAt: string;
}

interface PaymentRecordLocal {
  id?: string;
  tx_hash: string;
  source_type: string;
  recipient_name?: string | null;
  recipient_address: string;
  amount: number;
  token_symbol?: string;
  created_at: string;
  status?: string;
}

interface BridgeTransferLocal {
  id: string;
  fromChain: string;
  toChain: string;
  amount: string;
  status: string;
  date: string;
  sourceTx: string;
}

interface SwapHistoryItemLocal {
  id: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  timestamp: string;
  txHash: string;
}

export function Timeline() {
  const { address, isConnected } = useArcWallet();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!isConnected || !address) {
      setActivities([]);
      return;
    }

    const aggregated: ActivityItem[] = [];

    // 1. Load Payroll Activity
    try {
      const storedBatches = localStorage.getItem("arc_payroll_batches");
      if (storedBatches) {
        const batches = JSON.parse(storedBatches) as PayrollBatchLocal[];
        batches.forEach((b) => {
          if (b.status === "Paid" || b.status === "Partially Paid") {
            const dateStr = b.executedAt || b.submittedAt || b.createdAt;
            const parsedDate = new Date(dateStr);
            aggregated.push({
              id: `payroll-${b.id}`,
              type: "Payroll",
              title: "Payroll Executed",
              description: `Paid ${b.recipientsCount} contributor(s)`,
              amount: `${b.totalAmount} USDC`,
              timestamp: parsedDate.toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              }),
              date: parsedDate,
              status: b.status,
            });
          }
        });
      }
    } catch (err) {
      console.error("Error reading payroll activity for timeline:", err);
    }

    // 2. Load Invoice/Payments Activity
    try {
      const storedPayments = localStorage.getItem(`paygrid_history_${address.toLowerCase()}`);
      if (storedPayments) {
        const payments = JSON.parse(storedPayments) as PaymentRecordLocal[];
        payments.forEach((p) => {
          const parsedDate = new Date(p.created_at);
          aggregated.push({
            id: `payment-${p.id || p.tx_hash}`,
            type: "Payment",
            title: p.source_type === "invoice" ? "Invoice Settled" : "Payment Sent",
            description: p.recipient_name 
              ? `To ${p.recipient_name}` 
              : `To ${p.recipient_address.slice(0, 6)}...${p.recipient_address.slice(-4)}`,
            amount: `${p.amount} ${p.token_symbol || "USDC"}`,
            timestamp: parsedDate.toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }),
            date: parsedDate,
            txHash: p.tx_hash,
            status: p.status || "Completed",
          });
        });
      }
    } catch (err) {
      console.error("Error reading payment activity for timeline:", err);
    }

    // 3. Load Bridge Transfers Activity
    try {
      const storedBridges = localStorage.getItem("bridge_transfers");
      if (storedBridges) {
        const transfers = JSON.parse(storedBridges) as BridgeTransferLocal[];
        transfers.forEach((t) => {
          const parsedDate = new Date(t.date);
          aggregated.push({
            id: `bridge-${t.id}`,
            type: "Bridge",
            title: "Asset Bridged",
            description: `${t.fromChain} → ${t.toChain}`,
            amount: `${t.amount} USDC`,
            timestamp: parsedDate.toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }),
            date: parsedDate,
            txHash: t.sourceTx,
            status: t.status,
          });
        });
      }
    } catch (err) {
      console.error("Error reading bridge activity for timeline:", err);
    }

    // 4. Load Swap History Activity
    try {
      const storedSwaps = localStorage.getItem("swap_history");
      if (storedSwaps) {
        const swaps = JSON.parse(storedSwaps) as SwapHistoryItemLocal[];
        swaps.forEach((s) => {
          const parsedDate = new Date(s.timestamp);
          aggregated.push({
            id: `swap-${s.id}`,
            type: "Swap",
            title: "Stablecoin Swapped",
            description: `${s.tokenIn} → ${s.tokenOut}`,
            amount: `${s.amountIn} ${s.tokenIn}`,
            timestamp: parsedDate.toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }),
            date: parsedDate,
            txHash: s.txHash,
            status: "Completed",
          });
        });
      }
    } catch (err) {
      console.error("Error reading swap activity for timeline:", err);
    }

    // Sort by date descending
    aggregated.sort((a, b) => b.date.getTime() - a.date.getTime());

    setActivities(aggregated.slice(0, 10)); // Top 10 activities
  }, [isConnected, address]);

  if (!mounted) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-32 bg-white/5 animate-pulse rounded" />
        <div className="h-48 w-full bg-white/5 animate-pulse rounded-xl" />
      </div>
    );
  }

  const getIcon = (type: string) => {
    switch (type) {
      case "Payroll":
        return <CreditCard className="h-4 w-4" />;
      case "Payment":
        return <QrCode className="h-4 w-4" />;
      case "Bridge":
        return <ArrowLeftRight className="h-4 w-4" />;
      case "Swap":
        return <Shuffle className="h-4 w-4" />;
      default:
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  const getExplorerLink = (txHash?: string) => {
    if (!txHash) return "";
    return `https://testnet.arcscan.app/tx/${txHash}`;
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-white tracking-wide">Recent Platform Activity</h2>
        <p className="text-xs text-slate-400 font-medium mt-0.5">
          Real-time log of operations executed on your account.
        </p>
      </div>

      <Card className="glass-card-component border-none overflow-hidden">
        <CardContent className="p-6">
          {activities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center text-slate-500">
              <AlertCircle className="h-8 w-8 text-slate-600 mb-2" />
              <p className="text-sm font-bold">No Recent Activity</p>
              <p className="text-xs text-slate-500 mt-1 max-w-xs px-4">
                Execute payroll runs, invoice payments, bridges, or token swaps to populate this timeline.
              </p>
            </div>
          ) : (
            <div className="relative border-l border-white/5 pl-6 ml-2 space-y-6">
              {activities.map((act, index) => (
                <motion.div
                  key={act.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  className="relative group"
                >
                  {/* Timeline bullet */}
                  <div className="absolute -left-9 top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#040a1c] border border-white/10 text-slate-400 group-hover:text-[#4f8cff] group-hover:border-[#4f8cff]/35 shadow-[0_0_10px_rgba(0,0,0,0.8)] transition-colors duration-200">
                    {getIcon(act.type)}
                  </div>

                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-white tracking-wide leading-snug">
                        {act.title}
                      </h4>
                      <p className="text-xs text-slate-400 font-medium mt-0.5 leading-normal">
                        {act.description}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 mt-1 sm:mt-0 shrink-0">
                      <span className="text-xs font-black text-[#4f8cff]">{act.amount}</span>
                      <span className="text-[10px] text-slate-500 font-bold">{act.timestamp}</span>
                      
                      {act.txHash && (
                        <a
                          href={getExplorerLink(act.txHash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-500 hover:text-white transition-colors"
                          title="View Transaction"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
