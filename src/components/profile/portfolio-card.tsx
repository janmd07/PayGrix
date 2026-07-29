"use client";

import { useArcWallet } from "@/components/wallet/use-arc-wallet";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePortfolioBalances } from "@/hooks/use-portfolio-balances";
import { RefreshCw, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";

// Custom chain icons/colors styling map
const CHAIN_STYLING: Record<string, { logo: string; gradient: string; color: string }> = {
  "Arc Testnet": {
    logo: "A",
    gradient: "from-[#4f8cff]/20 to-[#6d5dfc]/20 border-[#4f8cff]/20 hover:border-[#4f8cff]/50",
    color: "text-[#4f8cff]",
  },
  "Base Sepolia": {
    logo: "B",
    gradient: "from-blue-600/10 to-blue-500/10 border-blue-500/20 hover:border-blue-500/50",
    color: "text-blue-400",
  },
  "Arbitrum Sepolia": {
    logo: "Ar",
    gradient: "from-cyan-600/10 to-blue-600/10 border-cyan-500/20 hover:border-cyan-500/50",
    color: "text-cyan-400",
  },
  "Solana Devnet": {
    logo: "S",
    gradient: "from-purple-600/10 to-emerald-600/10 border-purple-500/20 hover:border-purple-500/50",
    color: "text-emerald-400",
  },
};

export function PortfolioCard() {
  const { address, isConnected } = useArcWallet();
  const { balances, isLoading, refreshAll } = usePortfolioBalances(address, isConnected);

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.08 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 100, damping: 15 } },
  };

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white tracking-wide">Multi-Chain Portfolio</h2>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            USDC asset distribution across connected accounts.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={refreshAll}
          disabled={isLoading}
          className="h-8 rounded-lg border-white/5 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white transition-all disabled:opacity-40"
        >
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Grid of Portfolio Items */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid gap-4 sm:grid-cols-2"
      >
        {balances.map((item) => {
          const style = CHAIN_STYLING[item.network] || {
            logo: "?",
            gradient: "from-white/5 to-white/5 border-white/10",
            color: "text-slate-400",
          };

          return (
            <motion.div key={item.network} variants={itemVariants}>
              <Card
                className={`glass-card-component overflow-hidden transition-premium border-none relative group h-full`}
              >
                {/* Visual hover accent glow */}
                <div className={`absolute top-0 right-0 -mr-12 -mt-12 h-24 w-24 rounded-full bg-gradient-to-br ${item.network === "Solana Devnet" ? "from-emerald-500/5 to-purple-500/5" : "from-[#4f8cff]/5 to-[#6d5dfc]/5"} blur-2xl pointer-events-none group-hover:scale-110 transition-transform duration-500`} />

                <CardContent className="p-5 flex flex-col justify-between h-full">
                  <div className="flex items-center justify-between">
                    {/* Chain Meta */}
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 border border-white/10 text-xs font-black ${style.color}`}
                      >
                        {style.logo}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white leading-normal">{item.network}</p>
                        <p className="text-[10px] text-slate-400 font-semibold tracking-wide uppercase">
                          {item.token} Asset
                        </p>
                      </div>
                    </div>

                    {/* Status Chip */}
                    <div className="flex items-center gap-1.5">
                      {item.status === "disconnected" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[9px] font-bold text-rose-400 border border-rose-500/20">
                          Disconnected
                        </span>
                      ) : item.status === "loading" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/10 px-2 py-0.5 text-[9px] font-bold text-yellow-400 border border-yellow-500/20">
                          Loading
                        </span>
                      ) : item.status === "unavailable" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold text-amber-400 border border-amber-500/20" title="RPC Rate limit or connection failed">
                          Unavailable
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-400 border border-emerald-500/20">
                          Active
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Balance Display */}
                  <div className="mt-5 space-y-1">
                    <p className="text-xs text-slate-500 font-medium">Balance</p>
                    <div className="flex items-baseline justify-between">
                      {item.status === "disconnected" ? (
                        <span className="text-sm font-bold text-slate-400 italic">Connect Wallet</span>
                      ) : item.status === "loading" ? (
                        <span className="h-6 w-24 animate-pulse rounded bg-white/5" />
                      ) : item.status === "unavailable" ? (
                        <span className="text-sm font-bold text-amber-400 inline-flex items-center gap-1">
                          <AlertCircle className="h-3.5 w-3.5" /> Balance Unavailable
                        </span>
                      ) : (
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-2xl font-black text-white tracking-tight">
                            {parseFloat(item.balance).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                          <span className="text-xs font-bold text-slate-400">{item.token}</span>
                        </div>
                      )}

                      <span className="text-xs font-bold text-slate-400">
                        {item.status === "connected" ? item.usdValue : ""}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
