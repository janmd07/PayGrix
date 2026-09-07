"use client";

import { useState, useEffect, useCallback } from "react";

import {
  Wallet,
  Smartphone,
  ExternalLink,
  Copy,
  Check,
  X,
  Download,
  ChevronRight,
  Building2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useArcWallet } from "@/components/wallet/use-arc-wallet";
import { cn } from "@/lib/utils";

interface ConnectWalletButtonProps {
  className?: string;
  size?: "default" | "sm" | "lg" | "icon";
}

export function ConnectWalletButton({ className, size = "sm" }: ConnectWalletButtonProps) {
  const { availableConnector, connect, isConnecting } = useArcWallet();
  const [hasInjected, setHasInjected] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setMounted(true);
    const win = typeof window !== "undefined" ? (window as { ethereum?: unknown; web3?: unknown }) : undefined;
    setHasInjected(!!win && (!!win.ethereum || !!win.web3));
  }, []);

  // Close modal on Escape
  useEffect(() => {
    if (!isModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isModalOpen]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isModalOpen]);

  const handleCopyLink = useCallback(async () => {
    if (typeof window === "undefined") return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, []);

  const handleOpenMetaMask = useCallback(() => {
    if (typeof window === "undefined") return;
    const cleanUrl = window.location.href.replace(/^https?:\/\//, "");
    const deepLink = `https://metamask.app.link/dapp/${cleanUrl}`;
    window.open(deepLink, "_blank", "noopener,noreferrer");
  }, []);

  const handleButtonClick = () => {
    // Desktop with injected provider connects immediately
    if (typeof window !== "undefined" && window.innerWidth >= 1024 && hasInjected && availableConnector) {
      connect({ connector: availableConnector });
    } else {
      setIsModalOpen(true);
    }
  };

  if (!mounted) {
    return (
      <Button className={cn("gap-2 font-semibold shadow-[0_0_14px_rgba(109,93,252,0.35)]", className)} size={size}>
        <Wallet className="h-4 w-4" />
        Connect Wallet
      </Button>
    );
  }

  return (
    <>
      <Button
        className={cn(
          "gap-2 font-semibold bg-gradient-to-r from-[#4f8cff] to-[#6d5dfc] text-white shadow-[0_0_14px_rgba(109,93,252,0.35)] hover:shadow-[0_0_22px_rgba(109,93,252,0.55)] hover:from-[#5b95ff] hover:to-[#7b6dff] active:scale-[0.98] transition-all shrink-0 border-0",
          className
        )}
        disabled={isConnecting}
        size={size}
        onClick={handleButtonClick}
      >
        <Wallet className="h-4 w-4" />
        {isConnecting ? "Connecting..." : "Connect Wallet"}
      </Button>

      {/* Mobile Bottom-Sheet / Desktop Dialog Wallet Picker */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity"
            onClick={() => setIsModalOpen(false)}
            aria-hidden="true"
          />

          {/* Bottom-Sheet Container on Mobile / Centered Modal on Desktop */}
          <div
            className="relative z-10 w-full max-w-md mx-auto rounded-t-[28px] sm:rounded-2xl overflow-hidden shadow-[0_-12px_45px_rgba(0,0,0,0.85),0_0_35px_rgba(109,93,252,0.25)] animate-in fade-in slide-in-from-bottom-6 sm:zoom-in-95 duration-250 ease-out"
            style={{
              background: "linear-gradient(180deg, rgba(12, 22, 45, 0.98) 0%, rgba(6, 12, 28, 0.99) 100%)",
              borderTop: "1px solid rgba(79, 140, 255, 0.3)",
              borderLeft: "1px solid rgba(79, 140, 255, 0.15)",
              borderRight: "1px solid rgba(79, 140, 255, 0.15)",
              backdropFilter: "blur(24px)",
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="wallet-picker-title"
          >
            {/* Drag handle indicator on mobile */}
            <div className="pt-3 pb-1 flex justify-center sm:hidden">
              <div className="w-10 h-1.5 rounded-full bg-white/20" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.08]">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-xl shrink-0"
                  style={{
                    background: "linear-gradient(135deg, #4f8cff 0%, #6d5dfc 50%, #d65dfc 100%)",
                    boxShadow: "0 0 12px rgba(109, 93, 252, 0.4)",
                  }}
                >
                  <Building2 className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h3 id="wallet-picker-title" className="text-base font-bold text-white tracking-tight leading-none">
                    Connect a wallet
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Connect your wallet to access PayGrix
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-[#4f8cff]/50"
                aria-label="Close wallet picker"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            {/* Wallet options list */}
            <div className="p-4 sm:p-5 space-y-2.5 max-h-[calc(85vh-120px)] overflow-y-auto">
              {/* Option: Detected Browser Wallet (if window.ethereum present) */}
              {hasInjected && (
                <button
                  type="button"
                  onClick={() => {
                    if (availableConnector) {
                      connect({ connector: availableConnector });
                      setIsModalOpen(false);
                    }
                  }}
                  className="group w-full flex items-center justify-between min-h-[56px] p-3.5 rounded-2xl border border-[#4f8cff]/40 bg-[#2563ff]/15 hover:bg-[#2563ff]/25 hover:border-[#4f8cff]/70 active:scale-[0.99] transition-all text-left focus-visible:ring-2 focus-visible:ring-[#4f8cff]/50 focus:outline-none"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#4f8cff]/30 to-[#6d5dfc]/30 text-[#60a5fa] border border-[#4f8cff]/30 shrink-0 group-hover:shadow-[0_0_12px_rgba(79,140,255,0.4)] transition-all">
                      <Wallet className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white group-hover:text-[#93c5fd] transition-colors">
                        Detected Wallet
                      </div>
                      <div className="text-xs text-slate-400">
                        Connect current browser wallet
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-slate-500 group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0" />
                </button>
              )}

              {/* Option 1: Open in MetaMask App */}
              <button
                type="button"
                onClick={handleOpenMetaMask}
                className={cn(
                  "group w-full flex items-center justify-between min-h-[56px] p-3.5 rounded-2xl active:scale-[0.99] transition-all text-left focus-visible:ring-2 focus-visible:ring-[#4f8cff]/50 focus:outline-none",
                  !hasInjected
                    ? "border border-[#4f8cff]/40 bg-[#2563ff]/10 hover:bg-[#2563ff]/20 hover:border-[#4f8cff]/60"
                    : "border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/20"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#4f8cff]/15 text-[#60a5fa] border border-[#4f8cff]/25 shrink-0 group-hover:shadow-[0_0_12px_rgba(79,140,255,0.35)] transition-all">
                    <Smartphone className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white group-hover:text-[#93c5fd] transition-colors">
                      Open in MetaMask App
                    </div>
                    <div className="text-xs text-slate-400">
                      Launch PayGrix in MetaMask Mobile browser
                    </div>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-slate-500 group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0" />
              </button>

              {/* Option 2: Copy App Link */}
              <button
                type="button"
                onClick={handleCopyLink}
                className="group w-full flex items-center justify-between min-h-[56px] p-3.5 rounded-2xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/20 active:scale-[0.99] transition-all text-left focus-visible:ring-2 focus-visible:ring-[#4f8cff]/50 focus:outline-none"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-slate-300 border border-white/10 shrink-0 group-hover:border-white/20 transition-all">
                    {copied ? <Check className="h-5 w-5 text-emerald-400" /> : <Copy className="h-5 w-5" />}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">
                      {copied ? "URL Copied to Clipboard!" : "Copy App URL"}
                    </div>
                    <div className="text-xs text-slate-400">
                      Paste into Coinbase, Rainbow, or Trust Wallet
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {copied && (
                    <span className="text-[11px] font-semibold text-emerald-400 px-2 py-0.5 rounded-full bg-emerald-400/10 border border-emerald-400/20">
                      Copied
                    </span>
                  )}
                  <ChevronRight className="h-5 w-5 text-slate-500 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
                </div>
              </button>

              {/* Option 3: Download MetaMask */}
              <a
                href="https://metamask.io/download/"
                target="_blank"
                rel="noopener noreferrer"
                className="group w-full flex items-center justify-between min-h-[56px] p-3.5 rounded-2xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/20 active:scale-[0.99] transition-all text-left focus-visible:ring-2 focus-visible:ring-[#4f8cff]/50 focus:outline-none"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-slate-300 border border-white/10 shrink-0 group-hover:border-white/20 transition-all">
                    <Download className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white group-hover:text-slate-200 transition-colors">
                      Don&apos;t have a wallet?
                    </div>
                    <div className="text-xs text-slate-400">
                      Download MetaMask for mobile or desktop
                    </div>
                  </div>
                </div>
                <ExternalLink className="h-4.5 w-4.5 text-slate-500 group-hover:text-white transition-colors shrink-0 mr-0.5" />
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}