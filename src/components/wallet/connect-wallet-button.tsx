"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useConnect, type Connector } from "wagmi";

import {
  Wallet,
  ExternalLink,
  Copy,
  Check,
  X,
  ChevronRight,
  AlertCircle,
  Loader2,
  Building2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useArcWallet } from "@/components/wallet/use-arc-wallet";
import { cn } from "@/lib/utils";

interface ConnectWalletButtonProps {
  className?: string;
  size?: "default" | "sm" | "lg" | "icon";
}

type WalletId = "metaMask" | "okxWallet" | "rabby" | "coinbaseWallet" | "phantom";

// Branded SVG Icons for the 5 wallets
function MetaMaskIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none">
      <path
        d="M28.02 16.03l-2.61-9.97-8.1 3.86 3.12 6.55-5.43 2.16-5.43-2.16 3.12-6.55-8.1-3.86-2.61 9.97 4.9 7.82 2.72 4.15h11.82l2.72-4.15 4.9-7.82z"
        fill="#E2761B"
        stroke="#E2761B"
        strokeWidth="0.5"
      />
      <path d="M3.98 16.03l4.9 7.82 2.72 4.15 1.4-6.41-4.12-5.56H3.98z" fill="#E4761B" />
      <path d="M28.02 16.03l-4.9 7.82-2.72 4.15-1.4-6.41 4.12-5.56h4.9z" fill="#E4761B" />
      <path d="M10.2 16.03l2.8 5.56 3 1.5 3-1.5 2.8-5.56-2.8-5.74L16 8.35l-3 1.94-2.8 5.74z" fill="#D7C1B3" />
      <path d="M13 21.59l3 4.41 3-4.41-3-1.5-3 1.5z" fill="#233447" />
      <path d="M9.27 6.06l6.73-2.56 6.73 2.56-6.73 3.36-6.73-3.36z" fill="#F6851B" />
    </svg>
  );
}

function OkxWalletIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none">
      <rect width="32" height="32" rx="8" fill="#000000" />
      <rect x="7" y="7" width="5.5" height="5.5" rx="1" fill="#FFFFFF" />
      <rect x="19.5" y="7" width="5.5" height="5.5" rx="1" fill="#FFFFFF" />
      <rect x="13.25" y="13.25" width="5.5" height="5.5" rx="1" fill="#FFFFFF" />
      <rect x="7" y="19.5" width="5.5" height="5.5" rx="1" fill="#FFFFFF" />
      <rect x="19.5" y="19.5" width="5.5" height="5.5" rx="1" fill="#FFFFFF" />
    </svg>
  );
}

function RabbyWalletIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none">
      <rect width="32" height="32" rx="8" fill="#8697FF" />
      <path
        d="M9 22.5c0-4.14 3.36-7.5 7.5-7.5s7.5 3.36 7.5 7.5v.5H9v-.5z"
        fill="#FFFFFF"
      />
      <circle cx="12.5" cy="11.5" r="2.5" fill="#FFFFFF" />
      <circle cx="19.5" cy="11.5" r="2.5" fill="#FFFFFF" />
      <path d="M12 11h1v2h-1zM19 11h1v2h-1z" fill="#8697FF" />
      <circle cx="16" cy="18" r="1.5" fill="#FF8D69" />
    </svg>
  );
}

function CoinbaseWalletIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none">
      <rect width="32" height="32" rx="8" fill="#0052FF" />
      <rect x="8.5" y="8.5" width="15" height="15" rx="3.5" fill="#FFFFFF" />
      <rect x="12" y="12" width="8" height="8" rx="1.5" fill="#0052FF" />
    </svg>
  );
}

function PhantomWalletIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none">
      <rect width="32" height="32" rx="8" fill="#AB9FF2" />
      <path
        d="M8.5 18c0-4.5 3.36-8 7.5-8s7.5 3.5 7.5 8c0 3.5-2.2 5-3.5 5-1.1 0-1.6-.7-2.2-.7-.6 0-1.1.7-2.2.7-1.3 0-3.5-1.5-3.5-5z"
        fill="#FFFFFF"
      />
      <circle cx="13" cy="16.5" r="1.3" fill="#AB9FF2" />
      <circle cx="17.5" cy="16.5" r="1.3" fill="#AB9FF2" />
    </svg>
  );
}

interface WalletItemConfig {
  id: WalletId;
  name: string;
  installUrl: string;
  deepLink?: (url: string) => string;
  Icon: React.ComponentType<{ className?: string }>;
}

const WALLET_CONFIGS: WalletItemConfig[] = [
  {
    id: "metaMask",
    name: "MetaMask",
    installUrl: "https://metamask.io/download/",
    deepLink: (url: string) => `https://metamask.app.link/dapp/${url}`,
    Icon: MetaMaskIcon,
  },
  {
    id: "okxWallet",
    name: "OKX Wallet",
    installUrl: "https://www.okx.com/web3",
    deepLink: (url: string) => `https://www.okx.com/download?deeplink=${encodeURIComponent(url)}`,
    Icon: OkxWalletIcon,
  },
  {
    id: "rabby",
    name: "Rabby Wallet",
    installUrl: "https://rabby.io/",
    Icon: RabbyWalletIcon,
  },
  {
    id: "coinbaseWallet",
    name: "Coinbase Wallet",
    installUrl: "https://www.coinbase.com/wallet",
    deepLink: (url: string) => `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(`https://${url}`)}`,
    Icon: CoinbaseWalletIcon,
  },
  {
    id: "phantom",
    name: "Phantom",
    installUrl: "https://phantom.app/download",
    deepLink: (url: string) => `https://phantom.app/ul/browse/${encodeURIComponent(`https://${url}`)}`,
    Icon: PhantomWalletIcon,
  },
];

export function ConnectWalletButton({ className, size = "sm" }: ConnectWalletButtonProps) {
  const { isConnected, isConnecting: isArcConnecting } = useArcWallet();
  const { connectors, connect, isPending: isWagmiPending } = useConnect();

  const [mounted, setMounted] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [connectingWalletId, setConnectingWalletId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close modal when wallet connects
  useEffect(() => {
    if (isConnected) {
      setIsModalOpen(false);
      setConnectingWalletId(null);
      setErrorMessage(null);
    }
  }, [isConnected]);

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

  // Helper to inspect browser window providers
  const detectedMap = useMemo(() => {
    if (!mounted || typeof window === "undefined") {
      return {
        metaMask: false,
        okxWallet: false,
        rabby: false,
        coinbaseWallet: false,
        phantom: false,
      };
    }

    interface WalletProviderLike {
      isMetaMask?: boolean;
      isRabby?: boolean;
      isOkxWallet?: boolean;
      isPhantom?: boolean;
      isCoinbaseWallet?: boolean;
      isBraveWallet?: boolean;
      isOpera?: boolean;
      isTokenPocket?: boolean;
      isTrust?: boolean;
      isTrustWallet?: boolean;
      [key: string]: unknown;
    }

    const win = window as unknown as {
      ethereum?: WalletProviderLike & {
        providers?: WalletProviderLike[];
      };
      okxwallet?: unknown;
      rabby?: unknown;
      coinbaseWalletExtension?: unknown;
      phantom?: {
        ethereum?: unknown;
      };
    };

    // 1. Exact EIP-6963 RDNS matches (prevents static Wagmi connector false positives)
    const hasEip6963 = (rdns: string | string[]) => {
      const targets = Array.isArray(rdns) ? rdns : [rdns];
      return connectors.some((c) => targets.includes(c.id.toLowerCase()));
    };

    const eipMetaMask = hasEip6963(["io.metamask", "io.metamask.mobile"]);
    const eipOkx = hasEip6963("com.okex.wallet");
    const eipRabby = hasEip6963("io.rabby");
    const eipCoinbase = hasEip6963("com.coinbase.wallet");
    const eipPhantom = hasEip6963("app.phantom");

    // 2. Direct window provider checks with anti-spoof filtering
    const eth = win.ethereum;
    const providers = Array.isArray(eth?.providers) ? eth.providers : [];

    const isMetaMaskWindow = Boolean(
      (eth?.isMetaMask &&
        !eth?.isRabby &&
        !eth?.isOkxWallet &&
        !eth?.isPhantom &&
        !eth?.isCoinbaseWallet &&
        !eth?.isBraveWallet &&
        !eth?.isOpera &&
        !eth?.isTokenPocket &&
        !eth?.isTrust &&
        !eth?.isTrustWallet) ||
      providers.some(
        (p) =>
          p?.isMetaMask &&
          !p?.isRabby &&
          !p?.isOkxWallet &&
          !p?.isPhantom &&
          !p?.isCoinbaseWallet &&
          !p?.isBraveWallet &&
          !p?.isOpera &&
          !p?.isTokenPocket &&
          !p?.isTrust &&
          !p?.isTrustWallet
      )
    );

    const isOkxWindow = Boolean(
      win.okxwallet ||
      eth?.isOkxWallet ||
      providers.some((p) => p?.isOkxWallet)
    );

    const isRabbyWindow = Boolean(
      win.rabby ||
      eth?.isRabby ||
      providers.some((p) => p?.isRabby)
    );

    const isCoinbaseWindow = Boolean(
      win.coinbaseWalletExtension ||
      eth?.isCoinbaseWallet ||
      providers.some((p) => p?.isCoinbaseWallet)
    );

    // Strictly Phantom EVM provider (never Solana)
    const isPhantomWindow = Boolean(
      win.phantom?.ethereum ||
      eth?.isPhantom ||
      providers.some((p) => p?.isPhantom)
    );

    return {
      metaMask: eipMetaMask || isMetaMaskWindow,
      okxWallet: eipOkx || isOkxWindow,
      rabby: eipRabby || isRabbyWindow,
      coinbaseWallet: eipCoinbase || isCoinbaseWindow,
      phantom: eipPhantom || isPhantomWindow,
    };
  }, [connectors, mounted]);

  // Find the exact matching connector for a wallet; never fall back to another wallet
  const resolveConnector = useCallback(
    (walletId: WalletId): Connector | undefined => {
      // If the wallet is not detected, never resolve any connector
      if (!detectedMap[walletId]) {
        return undefined;
      }

      // 1. Prefer exact EIP-6963 announced connector
      if (walletId === "metaMask") {
        const c = connectors.find((x) => x.id === "io.metamask" || x.id === "io.metamask.mobile");
        if (c) return c;
      } else if (walletId === "okxWallet") {
        const c = connectors.find((x) => x.id === "com.okex.wallet");
        if (c) return c;
      } else if (walletId === "rabby") {
        const c = connectors.find((x) => x.id === "io.rabby");
        if (c) return c;
      } else if (walletId === "coinbaseWallet") {
        const c = connectors.find((x) => x.id === "com.coinbase.wallet");
        if (c) return c;
      } else if (walletId === "phantom") {
        const c = connectors.find((x) => x.id === "app.phantom");
        if (c) return c;
      }

      // 2. Target connector configured specifically for this wallet
      const target = connectors.find((x) => x.id === walletId);
      if (target) return target;

      // Never fall back to generic "injected" or connectors[0]
      return undefined;
    },
    [connectors, detectedMap]
  );

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

  const handleSelectWallet = useCallback(
    (config: WalletItemConfig) => {
      setErrorMessage(null);
      const isDetected = detectedMap[config.id];

      if (!isDetected) {
        // Genuinely not detected: open official download or mobile deep link.
        // Never attempt to connect an unavailable wallet.
        if (typeof window === "undefined") return;
        const isMobileDevice = window.innerWidth < 640 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

        if (isMobileDevice && config.deepLink) {
          const cleanUrl = window.location.href.replace(/^https?:\/\//, "");
          window.open(config.deepLink(cleanUrl), "_blank", "noopener,noreferrer");
        } else {
          window.open(config.installUrl, "_blank", "noopener,noreferrer");
        }
        return;
      }

      // Genuinely detected: resolve its specific connector
      const connector = resolveConnector(config.id);
      if (!connector) {
        setErrorMessage(`Unable to initialize connection to ${config.name}.`);
        return;
      }

      setConnectingWalletId(config.id);
      connect(
        { connector },
        {
          onSuccess: () => {
            setConnectingWalletId(null);
            setIsModalOpen(false);
          },
          onError: (err) => {
            setConnectingWalletId(null);
            const msg = err?.message || "";
            if (msg.includes("rejected") || msg.includes("denied") || msg.includes("UserRejected")) {
              setErrorMessage("Connection rejected in wallet.");
            } else {
              setErrorMessage(msg.slice(0, 80) || "Connection failed. Please try again.");
            }
          },
        }
      );
    },
    [connect, detectedMap, resolveConnector]
  );

  const isAnyConnecting = isArcConnecting || isWagmiPending;

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
        disabled={isAnyConnecting}
        size={size}
        onClick={() => setIsModalOpen(true)}
      >
        <Wallet className="h-4 w-4" />
        {isAnyConnecting ? "Connecting..." : "Connect Wallet"}
      </Button>

      {/* Responsive Wallet Picker Modal (Mobile Bottom-Sheet / Desktop Centered Dialog) */}
      {mounted && isModalOpen && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 sm:py-6 overflow-hidden">
              {/* Backdrop */}
              <div
                className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity"
                onClick={() => setIsModalOpen(false)}
                aria-hidden="true"
              />

              {/* Dialog Container */}
              <div
                className={cn(
                  "relative z-10 w-full max-w-full sm:max-w-[460px] mx-auto",
                  "rounded-t-[28px] sm:rounded-3xl",
                  "border-t sm:border border-[#4f8cff]/25",
                  "shadow-[0_-12px_45px_rgba(0,0,0,0.85),0_0_35px_rgba(109,93,252,0.25)] sm:shadow-[0_20px_60px_rgba(0,0,0,0.9),0_0_40px_rgba(109,93,252,0.3)]",
                  "animate-in fade-in slide-in-from-bottom-6 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-250 ease-out",
                  "overflow-hidden flex flex-col",
                  "max-h-[88vh] sm:max-h-[min(620px,calc(100vh-3rem))]"
                )}
                style={{
                  background: "linear-gradient(180deg, rgba(12, 22, 45, 0.98) 0%, rgba(6, 12, 28, 0.99) 100%)",
                  backdropFilter: "blur(24px)",
                }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="wallet-picker-title"
              >
                {/* Drag handle indicator on mobile only */}
                <div className="pt-3 pb-1 flex justify-center sm:hidden shrink-0">
                  <div className="w-10 h-1.5 rounded-full bg-white/20" />
                </div>

                {/* Header */}
                <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-white/[0.08] shrink-0">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-9 w-9 items-center justify-center rounded-xl shrink-0"
                      style={{
                        background: "linear-gradient(135deg, #4f8cff 0%, #6d5dfc 50%, #d65dfc 100%)",
                        boxShadow: "0 0 12px rgba(109, 93, 252, 0.4)",
                      }}
                    >
                      <Building2 className="h-4.5 w-4.5 text-white" />
                    </div>
                    <div>
                      <h3 id="wallet-picker-title" className="text-base sm:text-lg font-bold text-white tracking-tight leading-none">
                        Connect a wallet
                      </h3>
                      <p className="text-xs text-slate-400 mt-1">
                        Select a wallet to connect to PayGrix
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

                {/* Error message banner */}
                {errorMessage && (
                  <div className="mx-4 sm:mx-5 mt-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300 flex items-start gap-2 animate-in fade-in shrink-0">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
                    <span className="flex-1">{errorMessage}</span>
                    <button
                      type="button"
                      onClick={() => setErrorMessage(null)}
                      className="text-rose-400 hover:text-white transition-colors"
                      aria-label="Dismiss error"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                {/* Wallet list */}
                <div className="p-4 sm:p-5 space-y-2.5 overflow-y-auto overscroll-contain flex-1 min-h-0">
                  {WALLET_CONFIGS.map((config) => {
                    const isDetected = detectedMap[config.id];
                    const isThisConnecting = connectingWalletId === config.id;
                    const { Icon } = config;

                    return (
                      <button
                        key={config.id}
                        type="button"
                        onClick={() => handleSelectWallet(config)}
                        disabled={isAnyConnecting && !isThisConnecting}
                        className={cn(
                          "group w-full flex items-center justify-between min-h-[58px] p-3.5 rounded-2xl transition-all text-left focus-visible:ring-2 focus-visible:ring-[#4f8cff]/50 focus:outline-none",
                          isDetected
                            ? "border border-[#4f8cff]/30 bg-[#2563ff]/10 hover:bg-[#2563ff]/20 hover:border-[#4f8cff]/60 active:scale-[0.99]"
                            : "border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/20 active:scale-[0.99]",
                          isThisConnecting && "border-[#6d5dfc] bg-[#6d5dfc]/20 ring-1 ring-[#6d5dfc]/50"
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-black/40 border border-white/10 shrink-0 shadow-inner group-hover:scale-105 transition-transform">
                            <Icon className="h-6 w-6" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-white group-hover:text-[#93c5fd] transition-colors truncate">
                              {config.name}
                            </div>
                            <div className="text-xs text-slate-400 truncate">
                              {isThisConnecting
                                ? "Connecting..."
                                : isDetected
                                ? `Connect with ${config.name}`
                                : "Not detected • Click to install"}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          {isThisConnecting ? (
                            <Loader2 className="h-4.5 w-4.5 text-[#4f8cff] animate-spin" />
                          ) : isDetected ? (
                            <>
                              <span className="text-[11px] font-medium text-[#93c5fd] px-2 py-0.5 rounded-full bg-[#4f8cff]/15 border border-[#4f8cff]/30">
                                Detected
                              </span>
                              <ChevronRight className="h-4.5 w-4.5 text-slate-500 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
                            </>
                          ) : (
                            <span className="text-[11px] font-medium text-slate-400 group-hover:text-white px-2 py-0.5 rounded-lg bg-white/5 border border-white/10 flex items-center gap-1 transition-colors">
                              Install
                              <ExternalLink className="h-3 w-3" />
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}

                  {/* Divider for secondary actions */}
                  <div className="relative my-3 pt-1">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-white/[0.08]" />
                    </div>
                    <div className="relative flex justify-center text-[10px] uppercase tracking-wider">
                      <span className="bg-[#081022] px-3 text-slate-500 font-medium">Alternative Options</span>
                    </div>
                  </div>

                  {/* Copy App Link (for in-app browsers like Rainbow, Trust, etc.) */}
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="group w-full flex items-center justify-between min-h-[52px] p-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/20 active:scale-[0.99] transition-all text-left focus-visible:ring-2 focus-visible:ring-[#4f8cff]/50 focus:outline-none"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-slate-300 border border-white/10 shrink-0 group-hover:border-white/20 transition-all">
                        {copied ? <Check className="h-4.5 w-4.5 text-emerald-400" /> : <Copy className="h-4.5 w-4.5" />}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-semibold text-white truncate">
                          {copied ? "URL Copied to Clipboard!" : "Copy App URL"}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          Paste into Rainbow, Trust, or any Web3 browser
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      {copied ? (
                        <span className="text-[11px] font-semibold text-emerald-400 px-2 py-0.5 rounded-full bg-emerald-400/10 border border-emerald-400/20">
                          Copied
                        </span>
                      ) : (
                        <ChevronRight className="h-4.5 w-4.5 text-slate-500 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
                      )}
                    </div>
                  </button>
                </div>

                {/* Subtle Footer */}
                <div className="px-5 py-3 border-t border-white/[0.06] bg-black/20 text-center shrink-0">
                  <p className="text-[11px] text-slate-500">
                    Non-custodial connection on Arc Testnet & Base Sepolia
                  </p>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}