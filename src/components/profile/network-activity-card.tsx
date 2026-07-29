"use client";

import { useArcWallet } from "@/components/wallet/use-arc-wallet";
import { Card, CardContent } from "@/components/ui/card";
import { Globe } from "lucide-react";
import { motion } from "framer-motion";

interface NetworkBarProps {
  name: string;
  percentage: number;
  color: string;
  bgGlow: string;
}

function NetworkBar({ name, percentage, color, bgGlow }: NetworkBarProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs font-semibold">
        <span className="text-white font-bold">{name}</span>
        <span className={color}>{percentage}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-white/5 overflow-hidden relative">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
          className={`h-full rounded-full ${bgGlow}`}
        />
      </div>
    </div>
  );
}

export function NetworkActivityCard() {
  const { isConnected } = useArcWallet();

  const networkActivities = [
    { name: "Arc Testnet", percentage: 45, color: "text-[#4f8cff]", bgGlow: "bg-gradient-to-r from-[#4f8cff] to-[#6d5dfc]" },
    { name: "Base Sepolia", percentage: 30, color: "text-blue-400", bgGlow: "bg-blue-500" },
    { name: "Arbitrum Sepolia", percentage: 15, color: "text-cyan-400", bgGlow: "bg-cyan-500" },
    { name: "Solana Devnet", percentage: 10, color: "text-emerald-400", bgGlow: "bg-emerald-500" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.15, ease: "easeOut" }}
    >
      <Card className="glass-card-component border-none">
        <CardContent className="p-6 space-y-4">
          <div className="flex justify-between items-center border-b border-white/5 pb-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Network Distribution</span>
            <Globe className="h-4.5 w-4.5 text-slate-400" />
          </div>

          <div className="space-y-4 pt-1">
            {isConnected ? (
              networkActivities.map((net) => (
                <NetworkBar
                  key={net.name}
                  name={net.name}
                  percentage={net.percentage}
                  color={net.color}
                  bgGlow={net.bgGlow}
                />
              ))
            ) : (
              <div className="py-6 text-center text-xs text-slate-500 font-semibold italic">
                Connect wallet to view network metrics.
              </div>
            )}
          </div>

          <p className="text-[9px] text-slate-500 font-semibold uppercase tracking-wider text-center pt-2">
            * Placeholders until analytics engines become available.
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
