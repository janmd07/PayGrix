"use client";

import { ShieldCheck, Wallet, RefreshCw, Coins } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const steps = [
  {
    step: "01",
    title: "Supply collateral",
    description: "Deposit supported collateral into your PayGrix lending position.",
    icon: Wallet,
    accent: "from-blue-500 to-[#4f8cff]",
  },
  {
    step: "02",
    title: "Get borrowing power",
    description: "Your collateral determines how much USDC you may eventually borrow.",
    icon: ShieldCheck,
    accent: "from-[#4f8cff] to-[#6d5dfc]",
  },
  {
    step: "03",
    title: "Borrow USDC",
    description: "Borrow available USDC against your collateral.",
    icon: Coins,
    accent: "from-[#6d5dfc] to-purple-500",
  },
  {
    step: "04",
    title: "Repay and withdraw",
    description: "Repay your debt and withdraw available collateral.",
    icon: RefreshCw,
    accent: "from-purple-500 to-emerald-400",
  },
];

export function HowItWorks() {
  return (
    <div id="how-it-works" className="space-y-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-bold text-white tracking-tight">How lending works</h2>
        <p className="text-xs text-slate-400">
          Four straightforward steps to borrow stablecoin liquidity on PayGrix.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {steps.map((item) => (
          <Card
            key={item.step}
            className="border border-white/10 bg-[#060f24]/60 backdrop-blur-lg relative overflow-hidden shadow-[0_4px_20px_rgba(6,15,36,0.4)] hover:border-white/20 transition-all duration-300 group"
          >
            <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${item.accent}`} />
            
            <CardContent className="p-5 space-y-3">
              <div className="flex justify-between items-start">
                <span className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-500 font-mono">
                  {item.step}
                </span>
                <div className="h-9 w-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-300 group-hover:text-white group-hover:border-purple-500/40 group-hover:bg-purple-500/10 transition-all">
                  <item.icon className="h-4.5 w-4.5" />
                </div>
              </div>

              <div className="space-y-1 pt-1">
                <h3 className="text-sm font-bold text-white group-hover:text-[#4f8cff] transition-colors">
                  {item.title}
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {item.description}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
