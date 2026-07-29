"use client";

import { useState } from "react";
import { useArcWallet } from "@/components/wallet/use-arc-wallet";
import { Card, CardContent } from "@/components/ui/card";
import { calculateReputation } from "@/lib/profile/reputation-engine";
import { HelpCircle, Star, X, Info } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function ReputationCard({ 
  stats = { payrollRuns: 0, payments: 0, bridgeTransactions: 0, swapTransactions: 0, contributorsCount: 0 } 
}: { 
  stats?: {
    payrollRuns: number;
    payments: number;
    bridgeTransactions: number;
    swapTransactions: number;
    contributorsCount: number;
  };
}) {
  const { address, isConnected } = useArcWallet();
  const [isOpen, setIsOpen] = useState(false);

  // Compute reputation
  const rep = calculateReputation(address, {
    ...stats,
    isConnected: !!isConnected && !!address
  });

  const ratingStars = rep.ratingStars;
  const score = rep.score;
  const maxScore = rep.maxScore;

  // SVG circular properties
  const radius = 50;
  const stroke = 8;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (score / maxScore) * circumference;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05, ease: "easeOut" }}
      >
        <Card className="glass-card-component border-none h-full flex flex-col justify-between">
          <CardContent className="p-6 flex flex-col items-center text-center justify-between h-full min-h-[300px]">
            <div className="w-full flex justify-between items-center mb-4">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Reputation Roster</span>
              <button
                onClick={() => setIsOpen(true)}
                className="text-slate-400 hover:text-white transition-colors duration-200"
                title="Reputation calculation details"
              >
                <HelpCircle className="h-5 w-5" />
              </button>
            </div>

            {/* Circular Gauge */}
            <div className="relative flex items-center justify-center mb-4">
              <svg
                height={radius * 2}
                width={radius * 2}
                className="transform -rotate-90 drop-shadow-[0_0_12px_rgba(109,93,252,0.15)]"
              >
                <circle
                  stroke="rgba(255, 255, 255, 0.03)"
                  fill="transparent"
                  strokeWidth={stroke}
                  r={normalizedRadius}
                  cx={radius}
                  cy={radius}
                />
                <motion.circle
                  stroke="url(#reputation-gradient)"
                  fill="transparent"
                  strokeWidth={stroke}
                  strokeDasharray={circumference + " " + circumference}
                  style={{ strokeDashoffset }}
                  r={normalizedRadius}
                  cx={radius}
                  cy={radius}
                  strokeLinecap="round"
                  initial={{ strokeDashoffset: circumference }}
                  animate={{ strokeDashoffset }}
                  transition={{ duration: 1.2, ease: "easeOut" }}
                />
                <defs>
                  <linearGradient id="reputation-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#4f8cff" />
                    <stop offset="100%" stopColor="#6d5dfc" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute flex flex-col items-center">
                <span className="text-3xl font-extrabold text-white leading-none">
                  {isConnected ? score : "—"}
                </span>
                <span className="text-[10px] text-slate-500 font-semibold uppercase mt-0.5">
                  / {maxScore}
                </span>
              </div>
            </div>

            {/* Label and stars */}
            <div className="space-y-1.5 w-full">
              <h4 className="text-md font-bold text-white tracking-wide">
                {isConnected ? rep.label : "Disconnected"}
              </h4>
              
              <div className="flex items-center justify-center gap-0.5">
                {isConnected && ratingStars > 0 ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`h-4 w-4 ${
                        i < ratingStars 
                          ? "fill-[#6d5dfc] text-[#6d5dfc] drop-shadow-[0_0_6px_rgba(109,93,252,0.6)]" 
                          : "text-white/10"
                      }`}
                    />
                  ))
                ) : (
                  <span className="text-xs text-slate-500 font-medium">Connect wallet to evaluate</span>
                )}
              </div>
            </div>

            {/* Calculations Trigger */}
            <button
              onClick={() => setIsOpen(true)}
              className="mt-5 text-xs text-[#4f8cff] hover:text-[#93c5fd] transition-colors font-semibold flex items-center gap-1.5"
            >
              <Info className="h-3.5 w-3.5" />
              How is this calculated?
            </button>
          </CardContent>
        </Card>
      </motion.div>

      {/* Modal Dialog */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            />

            {/* Modal Box */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#040a1c] p-6 shadow-2xl"
            >
              {/* Close Button */}
              <button
                onClick={() => setIsOpen(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="space-y-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#4f8cff]/10 to-[#6d5dfc]/10 border border-[#4f8cff]/20 text-[#4f8cff]">
                  <HelpCircle className="h-5.5 w-5.5" />
                </div>

                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-white">Onchain Reputation Score</h3>
                  <p className="text-xs text-slate-400 font-medium">Platform identity & trust metric</p>
                </div>

                <div className="text-sm text-slate-300 space-y-3 leading-relaxed">
                  <p>
                    Your reputation score is computed locally by evaluating your connected wallet status and real-time operations performed on the platform.
                  </p>
                  
                  <div className="bg-white/5 rounded-xl p-3 border border-white/5 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Wallet Connection:</span>
                      <span className="text-emerald-400 font-semibold">+75 Points</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Payroll Runs Executed:</span>
                      <span className="text-[#4f8cff] font-semibold">+5 Points</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Stablecoin Payments Sent:</span>
                      <span className="text-[#4f8cff] font-semibold">+4 Points</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">USDC Bridge Transferred:</span>
                      <span className="text-[#4f8cff] font-semibold">+4 Points</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Swap Ratios Swapped:</span>
                      <span className="text-[#4f8cff] font-semibold">+4 Points</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400"> Roster Configuration:</span>
                      <span className="text-[#4f8cff] font-semibold">+3 Points</span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 italic">
                    Note: Reputation evaluation is currently in V1. Real onchain indexing, compliance verification, and decentralized data source feeds will be integrated in a future release.
                  </p>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => setIsOpen(false)}
                    className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-white bg-primary rounded-xl hover:bg-primary/95 transition-all shadow-[0_0_12px_rgba(79,140,255,0.2)]"
                  >
                    Understood
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
