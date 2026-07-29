"use client";

import { useArcWallet } from "@/components/wallet/use-arc-wallet";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Share2, Copy, QrCode, Lock } from "lucide-react";
import { motion } from "framer-motion";

export function ShareProfileCard() {
  const { address } = useArcWallet();

  const futureUrl = address 
    ? `https://paygrix.xyz/u/${address.toLowerCase()}`
    : "https://paygrix.xyz/u/disconnected";

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.2, ease: "easeOut" }}
    >
      <Card className="glass-card-component border-none relative overflow-hidden">
        {/* Modern blur effect over card */}
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center text-center p-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#6d5dfc]/20 to-[#4f8cff]/20 border border-[#6d5dfc]/30 text-[#4f8cff] mb-3 shadow-[0_0_15px_rgba(109,93,252,0.15)]">
            <Lock className="h-5.5 w-5.5" />
          </div>
          <h3 className="text-lg font-bold text-white tracking-wide">Public Profile</h3>
          <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-[#6d5dfc]/15 px-3 py-0.5 text-[10px] font-extrabold uppercase tracking-widest text-[#4f8cff] border border-[#6d5dfc]/30 shadow-[0_0_12px_rgba(109,93,252,0.1)]">
            Coming Soon
          </span>
          <p className="text-xs text-slate-400 font-medium max-w-xs mt-3 leading-relaxed">
            Public routing links, user passports, and backend query profiles will be deployed in a future release.
          </p>
        </div>

        {/* Backdrop layout just to preserve structure size and prevent placeholder looks */}
        <CardContent className="p-6 opacity-25 filter blur-[1px]">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 border border-white/10 text-slate-400">
                <Share2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">Share Your Profile</p>
                <p className="text-[10px] text-slate-400 font-semibold tracking-wide uppercase">
                  Future url address
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between bg-white/5 border border-white/5 rounded-xl p-3">
              <span className="font-mono text-xs text-slate-300 font-bold truncate pr-3">
                {futureUrl}
              </span>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button size="sm" variant="outline" className="gap-1.5">
                <Copy className="h-4 w-4" /> Copy Link
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5">
                <Share2 className="h-4 w-4" /> Share
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" disabled>
                <QrCode className="h-4 w-4" /> QR Code
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
