"use client";

import { useArcWallet } from "@/components/wallet/use-arc-wallet";
import { Card, CardContent } from "@/components/ui/card";
import { Hourglass, CheckCircle2, Network, Milestone, Clock } from "lucide-react";

interface WalletStatItemProps {
  label: string;
  value: string;
  icon: React.ReactNode;
}

function StatTile({ label, value, icon }: WalletStatItemProps) {
  return (
    <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5 group hover:bg-white/10 transition-premium">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 border border-white/5 text-slate-400 group-hover:text-[#4f8cff] group-hover:border-[#4f8cff]/20 transition-all duration-300">
          {icon}
        </div>
        <div>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">{label}</p>
          <p className="text-sm font-bold text-white mt-0.5">{value}</p>
        </div>
      </div>
      <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#4f8cff]/70 bg-[#4f8cff]/10 px-2 py-0.5 rounded-full border border-[#4f8cff]/20 shadow-[0_0_8px_rgba(79,140,255,0.05)]">
        Coming Soon
      </span>
    </div>
  );
}

export function WalletStatsCard() {
  const { address, isConnected } = useArcWallet();

  const getPlaceholderValue = () => {
    if (!isConnected || !address) {
      return "Connect Wallet";
    }
    return "No Data Available";
  };

  const placeholder = getPlaceholderValue();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-white tracking-wide">Onchain Wallet Analytics</h2>
        <p className="text-xs text-slate-400 font-medium mt-0.5">
          Detailed metrics indexed from block explorer activities.
        </p>
      </div>

      <Card className="glass-card-component border-none overflow-hidden">
        <CardContent className="p-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <StatTile
              label="Wallet Age"
              value={placeholder}
              icon={<Hourglass className="h-4.5 w-4.5" />}
            />
            <StatTile
              label="Successful Txns"
              value={placeholder}
              icon={<CheckCircle2 className="h-4.5 w-4.5" />}
            />
            <StatTile
              label="Chains Active"
              value={placeholder}
              icon={<Network className="h-4.5 w-4.5" />}
            />
            <StatTile
              label="First Transaction"
              value={placeholder}
              icon={<Milestone className="h-4.5 w-4.5" />}
            />
            <StatTile
              label="Last Activity"
              value={placeholder}
              icon={<Clock className="h-4.5 w-4.5" />}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
