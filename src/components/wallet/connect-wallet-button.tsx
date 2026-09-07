"use client";

import { useState, useEffect, useCallback } from "react";

import { Wallet, Smartphone, ExternalLink, Copy, Check, X, Download } from "lucide-react";

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
    if (hasInjected && availableConnector) {
      connect({ connector: availableConnector });
    } else {
      setIsModalOpen(true);
    }
  };

  if (!mounted) {
    return (
      <Button className={cn("gap-2", className)} size={size}>
        <Wallet className="h-4 w-4" />
        Connect Wallet
      </Button>
    );
  }

  return (
    <>
      <Button
        className={cn("gap-2", className)}
        disabled={isConnecting}
        size={size}
        onClick={handleButtonClick}
      >
        <Wallet className="h-4 w-4" />
        {isConnecting ? "Connecting..." : "Connect Wallet"}
      </Button>

      {/* Connect Wallet Modal for Mobile & Non-Injected Browsers */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="connect-modal-title"
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
            onClick={() => setIsModalOpen(false)}
          />

          {/* Modal Content */}
          <div
            className="relative w-full max-w-md rounded-2xl p-6 text-left shadow-2xl transition-all z-10"
            style={{
              background: "linear-gradient(180deg, rgba(16, 28, 56, 0.96) 0%, rgba(8, 15, 32, 0.98) 100%)",
              border: "1px solid rgba(79, 140, 255, 0.25)",
              boxShadow: "0 0 35px rgba(109, 93, 252, 0.25), 0 25px 50px -12px rgba(0, 0, 0, 0.7)",
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{
                    background: "linear-gradient(135deg, #4f8cff 0%, #6d5dfc 100%)",
                    boxShadow: "0 0 16px rgba(109, 93, 252, 0.4)",
                  }}
                >
                  <Wallet className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 id="connect-modal-title" className="text-base font-semibold text-white">
                    Connect Wallet
                  </h3>
                  <p className="text-xs text-slate-400">
                    Connect your Web3 wallet to use PayGrix
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content options */}
            <div className="mt-5 space-y-3">
              {/* Option 1: Open in MetaMask App */}
              <button
                type="button"
                onClick={handleOpenMetaMask}
                className="w-full flex items-center justify-between p-3.5 rounded-xl border border-[#4f8cff]/30 bg-[#2563ff]/10 hover:bg-[#2563ff]/20 hover:border-[#4f8cff]/60 transition-all text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#4f8cff]/20 text-[#4f8cff] shrink-0">
                    <Smartphone className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white group-hover:text-[#93c5fd] transition-colors">
                      Open in MetaMask App
                    </div>
                    <div className="text-xs text-slate-400">
                      Launch PayGrix directly in MetaMask Mobile
                    </div>
                  </div>
                </div>
                <ExternalLink className="h-4 w-4 text-slate-400 group-hover:text-[#4f8cff] shrink-0 transition-colors" />
              </button>

              {/* Option 2: Copy App Link */}
              <button
                type="button"
                onClick={handleCopyLink}
                className="w-full flex items-center justify-between p-3.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-slate-300 shrink-0">
                    {copied ? <Check className="h-5 w-5 text-green-400" /> : <Copy className="h-5 w-5" />}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">
                      {copied ? "URL Copied to Clipboard!" : "Copy App URL"}
                    </div>
                    <div className="text-xs text-slate-400">
                      Paste into Coinbase Wallet, Rainbow, or Trust Wallet
                    </div>
                  </div>
                </div>
                <span className="text-xs text-[#4f8cff] font-medium shrink-0">
                  {copied ? "Copied" : "Copy"}
                </span>
              </button>

              {/* Option 3: Install MetaMask for Desktop */}
              <a
                href="https://metamask.io/download/"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-between p-3.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-slate-300 shrink-0">
                    <Download className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white group-hover:text-slate-200 transition-colors">
                      Don&apos;t have a wallet?
                    </div>
                    <div className="text-xs text-slate-400">
                      Download MetaMask browser extension or app
                    </div>
                  </div>
                </div>
                <ExternalLink className="h-4 w-4 text-slate-400 group-hover:text-white shrink-0 transition-colors" />
              </a>
            </div>

            {/* Note */}
            <div className="mt-4 rounded-lg bg-[#4f8cff]/5 border border-[#4f8cff]/15 p-3">
              <p className="text-[11px] leading-relaxed text-slate-400">
                <strong className="text-slate-300">Mobile tip:</strong> If you are on iPhone or Android, tap &quot;Open in MetaMask App&quot; or copy the URL into your wallet app&apos;s built-in browser.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}