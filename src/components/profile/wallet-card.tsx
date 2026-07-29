"use client";

import { useState } from "react";
import { useArcWallet } from "@/components/wallet/use-arc-wallet";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Check, ExternalLink, ShieldCheck, ShieldAlert, Wallet } from "lucide-react";
import { motion } from "framer-motion";

export function WalletCard() {
  const { address, isConnected, connector, currentNetwork } = useArcWallet();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const explorerUrl =
    currentNetwork && "blockExplorers" in currentNetwork && currentNetwork.blockExplorers?.default?.url
      ? `${currentNetwork.blockExplorers.default.url}/address/${address}`
      : `https://testnet.arcscan.app/address/${address}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <Card className="glass-card-component border-none">
        <CardContent className="p-6">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            {/* Left side: Wallet icon and details */}
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4f8cff]/20 to-[#6d5dfc]/20 border border-[#4f8cff]/30 shadow-[0_0_15px_rgba(79,140,255,0.15)] text-[#4f8cff]">
                <Wallet className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-white">Connected Wallet</h3>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Connected
                  </span>
                </div>
                <p className="text-sm font-semibold text-slate-400">
                  {connector?.name || "Web3 Injector"}
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <span className="font-mono text-sm text-slate-300 font-bold bg-white/5 px-2.5 py-1 rounded-lg border border-white/5">
                    {address ? address : "No Address connected"}
                  </span>
                </div>
              </div>
            </div>

            {/* Right side: Action buttons & Network Info */}
            {isConnected && address ? (
              <div className="flex flex-col gap-3 sm:flex-row md:flex-col lg:flex-row shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopy}
                  className="gap-2 h-9 rounded-xl text-slate-300 border-white/10 hover:bg-white/5 hover:text-white transition-all font-semibold"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 text-emerald-400" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy Address
                    </>
                  )}
                </Button>
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto"
                >
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2 h-9 w-full rounded-xl text-slate-300 border-white/10 hover:bg-white/5 hover:text-white transition-all font-semibold"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open Explorer
                  </Button>
                </a>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-rose-300 text-sm">
                <ShieldAlert className="h-5 w-5 shrink-0 text-rose-400" />
                <span className="font-semibold">Please connect your wallet.</span>
              </div>
            )}
          </div>

          {/* Network details bar */}
          {isConnected && address && (
            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-white/5 pt-4 text-xs font-semibold text-slate-400">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">Active Network:</span>
                <span className="text-[#4f8cff] drop-shadow-[0_0_6px_rgba(79,140,255,0.25)] font-bold">
                  {currentNetwork?.name || "Unknown Network"}
                </span>
              </div>
              <div className="h-3 w-px bg-white/10 hidden sm:block" />
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">Security Check:</span>
                <span className="text-emerald-400 inline-flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" /> Checked & Safe
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
