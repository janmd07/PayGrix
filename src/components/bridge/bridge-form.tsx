"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  Coins,
  ExternalLink,
  Globe,
  RefreshCw,
  ChevronDown,
  Wallet,
  Cpu,
  Scale,
  ShieldCheck,
  CheckCircle2,
  Lock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useArcWallet } from "@/components/wallet/use-arc-wallet";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

const CHAINS = ["Arc Testnet", "Base Sepolia", "Arbitrum Sepolia", "Solana Devnet", "GenLayer Bradbury"];

const CHAIN_DETAILS: Record<string, {
  name: string;
  logo: string;
  dotColor: string;
  dotShadow: string;
}> = {
  "Arc Testnet": {
    name: "Arc Testnet",
    logo: "/chains/arc.png",
    dotColor: "bg-blue-400",
    dotShadow: "shadow-[0_0_8px_rgba(96,165,250,0.5)]",
  },
  "Base Sepolia": {
    name: "Base Sepolia",
    logo: "/chains/base.png",
    dotColor: "bg-emerald-400",
    dotShadow: "shadow-[0_0_8px_rgba(52,211,153,0.5)]",
  },
  "Arbitrum Sepolia": {
    name: "Arbitrum Sepolia",
    logo: "/chains/arbitrum.png",
    dotColor: "bg-purple-400",
    dotShadow: "shadow-[0_0_8px_rgba(192,132,252,0.5)]",
  },
  "Solana Devnet": {
    name: "Solana Devnet",
    logo: "/chains/solana.png",
    dotColor: "bg-indigo-400",
    dotShadow: "shadow-[0_0_8px_rgba(129,140,248,0.5)]",
  },
  "GenLayer Bradbury": {
    name: "GenLayer Bradbury",
    logo: "/chains/genlayer.png",
    dotColor: "bg-purple-400",
    dotShadow: "shadow-[0_0_8px_rgba(192,132,252,0.5)]",
  },
};

const EXPLORER_URLS: Record<string, string> = {
  "Arc Testnet": "https://testnet.arcscan.app",
  "Base Sepolia": "https://sepolia.basescan.org",
  "Arbitrum Sepolia": "https://sepolia.arbiscan.io",
  "Solana Devnet": "https://explorer.solana.com",
  "GenLayer Bradbury": "https://explorer-bradbury.genlayer.com",
};

export function getExplorerUrl(chain: string): string {
  return EXPLORER_URLS[chain] || "https://testnet.arcscan.app";
}

export function getExplorerTxUrl(chain: string, txHash: string): string {
  if (chain === "Solana Devnet") {
    return `https://explorer.solana.com/tx/${txHash}?cluster=devnet`;
  }
  if (chain === "GenLayer Bradbury") {
    return `https://explorer-bradbury.genlayer.com/tx/${txHash}`;
  }
  return `${getExplorerUrl(chain)}/tx/${txHash}`;
}

interface BridgeFormProps {
  balance: string;
  symbol: string;
  isLoadingBalance: boolean;
  sourceChain: string;
  destinationChain: string;
  onSourceChainChange: (chain: string) => void;
  onDestinationChainChange: (chain: string) => void;
  status: string;
  sourceTxHash: string;
  destTxHash: string;
  error: string | null;
  onBridge: (amount: string) => void;
  isConnected: boolean;
  onRefresh?: () => void;
}

export function BridgeForm({
  balance,
  symbol,
  isLoadingBalance,
  sourceChain,
  destinationChain,
  onSourceChainChange,
  onDestinationChainChange,
  status,
  sourceTxHash,
  destTxHash,
  error,
  onBridge,
  isConnected,
  onRefresh,
}: BridgeFormProps) {
  const [amount, setAmount] = useState<string>("");
  const { availableConnector, connect } = useArcWallet();
  const { connected: isSolanaConnected, wallets, publicKey, disconnect } = useWallet();

  const [activeDropdown, setActiveDropdown] = useState<"source" | "destination" | null>(null);
  const [failedLogos, setFailedLogos] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!activeDropdown) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(".chain-selector-container")) {
        setActiveDropdown(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [activeDropdown]);

  const phantomWallet = wallets.find((w) => w.adapter.name === "Phantom");
  const isPhantomNotDetected = phantomWallet?.readyState === "NotDetected";
  const isPhantomInstalled = phantomWallet?.readyState === "Installed" || phantomWallet?.readyState === "Loadable";

  const isGenLayerRoute = sourceChain === "GenLayer Bradbury" || destinationChain === "GenLayer Bradbury";
  const isSolanaRoute = sourceChain === "Solana Devnet" || destinationChain === "Solana Devnet";
  const isHybridSolanaRoute =
    (sourceChain === "Solana Devnet" && destinationChain === "Arc Testnet") ||
    (sourceChain === "Arc Testnet" && destinationChain === "Solana Devnet");

  const isSameChain = sourceChain === destinationChain;
  const isOverBalance = parseFloat(amount) > parseFloat(balance);
  const isValidAmount = amount !== "" && parseFloat(amount) > 0;
  const isFormInvalid = isSameChain || isOverBalance || !isValidAmount || (isSolanaRoute && !isHybridSolanaRoute);

  const handleSwapChains = () => {
    if (isGenLayerRoute) {
      if (sourceChain === "GenLayer Bradbury") {
        onSourceChainChange("Base Sepolia");
        onDestinationChainChange("GenLayer Bradbury");
      } else {
        onSourceChainChange("GenLayer Bradbury");
        onDestinationChainChange("Base Sepolia");
      }
      return;
    }
    const temp = sourceChain;
    onSourceChainChange(destinationChain);
    onDestinationChainChange(temp);
  };

  const handleMaxClick = () => {
    setAmount(balance);
  };

  const isSelectDisabled = !isConnected || status === "preparing" || status === "waiting-wallet" || status === "bridging";

  const renderChainSelector = (
    value: string,
    onChangeHandler: (val: string) => void,
    type: "source" | "destination"
  ) => {
    const isOpen = activeDropdown === type;
    const hasFailed = failedLogos[value];
    const logoUrl = CHAIN_DETAILS[value]?.logo;

    const handleSelectChain = (c: string) => {
      if (type === "destination") {
        if (c === "GenLayer Bradbury") {
          onChangeHandler("GenLayer Bradbury");
          if (sourceChain !== "Base Sepolia") {
            onSourceChainChange("Base Sepolia");
          }
        } else {
          if (sourceChain === "GenLayer Bradbury") {
            onSourceChainChange("Arc Testnet");
          }
          onChangeHandler(c);
        }
      } else {
        if (c === "GenLayer Bradbury") {
          onChangeHandler("GenLayer Bradbury");
          if (destinationChain !== "Base Sepolia") {
            onDestinationChainChange("Base Sepolia");
          }
        } else {
          if (destinationChain === "GenLayer Bradbury") {
            onDestinationChainChange("Base Sepolia");
          }
          onChangeHandler(c);
        }
      }
      setActiveDropdown(null);
    };

    return (
      <div className="relative shrink-0 chain-selector-container">
        <button
          type="button"
          disabled={isSelectDisabled}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          onClick={() => {
            if (isSelectDisabled) return;
            setActiveDropdown(isOpen ? null : type);
          }}
          className={cn(
            "flex items-center bg-[#070f21] border border-white/8 hover:bg-[#0c1938] rounded-full pl-2 pr-4 py-1.5 text-white hover:border-primary/30 transition-all duration-200 cursor-pointer select-none outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50",
            isSelectDisabled && "opacity-50 cursor-not-allowed pointer-events-none"
          )}
        >
          {!hasFailed && logoUrl ? (
            <div className="relative flex items-center justify-center h-6 w-6 rounded-full bg-[#030712] border border-white/10 overflow-hidden mr-2 shrink-0">
              <Image
                src={logoUrl}
                alt={value}
                width={24}
                height={24}
                className="h-full w-full object-contain"
                onError={() => {
                  setFailedLogos((prev) => ({ ...prev, [value]: true }));
                }}
              />
            </div>
          ) : (
            <div className={cn(
              "h-2 w-2 rounded-full mr-2 shrink-0 ml-1.5",
              CHAIN_DETAILS[value]?.dotColor,
              CHAIN_DETAILS[value]?.dotShadow
            )} />
          )}
          <span className="font-bold text-xs tracking-wider uppercase text-slate-200">{value}</span>
          <ChevronDown className={cn(
            "h-4 w-4 text-slate-400 shrink-0 ml-1.5 transition-transform duration-200",
            isOpen && "rotate-180 text-white"
          )} />
        </button>

        {isOpen && (
          <div
            role="listbox"
            className="absolute top-full mt-2 left-0 z-50 min-w-[200px] bg-[#070f21] border border-white/10 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] p-1.5 animate-in fade-in slide-in-from-top-1 duration-100"
          >
            {CHAINS.map((c) => {
              const isOptionSelected = c === value;
              const optionHasFailed = failedLogos[c];
              const optionLogoUrl = CHAIN_DETAILS[c]?.logo;

              return (
                <div
                  key={c}
                  role="option"
                  aria-selected={isOptionSelected}
                  tabIndex={0}
                  onClick={() => handleSelectChain(c)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleSelectChain(c);
                    }
                  }}
                  className={cn(
                    "flex items-center w-full px-2 py-1.5 text-xs font-semibold rounded-lg text-slate-300 hover:bg-[#0d1b3a] hover:text-white transition-colors cursor-pointer select-none outline-none focus:bg-[#0d1b3a] focus:text-white mb-0.5 last:mb-0",
                    isOptionSelected && "bg-[#11244e] text-white font-bold border border-white/5"
                  )}
                >
                  {!optionHasFailed && optionLogoUrl ? (
                    <div className="relative flex items-center justify-center h-6 w-6 rounded-full bg-[#030712] border border-white/10 overflow-hidden mr-2.5 shrink-0">
                      <Image
                        src={optionLogoUrl}
                        alt={c}
                        width={24}
                        height={24}
                        className="h-full w-full object-contain"
                        onError={() => {
                          setFailedLogos((prev) => ({ ...prev, [c]: true }));
                        }}
                      />
                    </div>
                  ) : (
                    <div className={cn(
                      "h-2 w-2 rounded-full mr-2.5 shrink-0 ml-2",
                      CHAIN_DETAILS[c]?.dotColor,
                      CHAIN_DETAILS[c]?.dotShadow
                    )} />
                  )}
                  <span className="tracking-wide text-slate-200">{c}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const getButtonText = () => {
    if (isGenLayerRoute) {
      if (!isConnected) return "Connect EVM Wallet";
      return "GenLayer Adjudication Ready";
    }
    if (isSolanaRoute && !isHybridSolanaRoute) return "Unsupported Solana Route";
    if (!isConnected) return "Connect EVM Wallet";
    if (isSolanaRoute && !isSolanaConnected) return "Connect Solana Wallet";
    if (isSameChain) return "Invalid Route (Same Chain)";
    if (isOverBalance) return "Insufficient Balance";
    if (!isValidAmount) return "Enter Amount";
    if (status === "preparing") return "Preparing...";
    if (status === "waiting-wallet") return "Waiting for Wallet...";
    if (status === "bridging") return "Bridging USDC...";
    if (status === "completed") return "Bridge Completed";
    if (status === "failed") return "Bridge Failed";
    return "Bridge USDC";
  };

  return (
    <div className="space-y-6">
      <Card className="border border-white/10 bg-[#060f24]/60 backdrop-blur-lg relative overflow-hidden shadow-[0_8px_32px_rgba(6,15,36,0.5)]">
        {/* Elegant top gradient accent line */}
        <div className={cn(
          "absolute top-0 left-0 right-0 h-[2px]",
          isGenLayerRoute
            ? "bg-gradient-to-r from-purple-500 via-indigo-500 to-cyan-500"
            : "bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500"
        )} />

        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
              {isGenLayerRoute ? (
                <>
                  <Cpu className="h-5 w-5 text-purple-400 animate-pulse" />
                  GenLayer Adjudication
                </>
              ) : (
                <>
                  <Coins className="h-5 w-5 text-indigo-400 animate-pulse" />
                  Bridge USDC
                </>
              )}
            </CardTitle>
            {isGenLayerRoute && (
              <Badge variant="outline" className="text-[10px] bg-purple-500/10 border-purple-500/30 text-purple-300 font-mono">
                Consensus Layer
              </Badge>
            )}
          </div>
          <CardDescription className="text-xs text-slate-400">
            {isGenLayerRoute
              ? "Decentralized dispute adjudication on GenLayer Bradbury with USDC settlement secured on Base Sepolia."
              : "Transfer USDC tokens across testnets instantly."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Centered Compact Bridge Widget */}
          <div className="mx-auto w-full max-w-[500px] space-y-4">
            
            {/* Top row: Refresh button (if available) */}
            {onRefresh && (
              <div className="flex justify-end items-center gap-2 pr-1">
                <button
                  onClick={onRefresh}
                  disabled={isLoadingBalance || isSelectDisabled}
                  className="p-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white transition-all disabled:opacity-40"
                  title="Refresh balance"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", isLoadingBalance && "animate-spin")} />
                </button>
              </div>
            )}

            {/* Source card */}
            <div className={cn(
              "bg-[#070e1c] border rounded-2xl p-5 space-y-4 transition-all duration-200",
              isOverBalance
                ? "border-rose-500/30 bg-rose-500/5 focus-within:border-rose-500/50"
                : isGenLayerRoute
                ? "border-purple-500/20 focus-within:border-purple-500/40"
                : "border-white/5 focus-within:border-primary/30"
            )}>
              <div className="flex justify-between items-center text-xs">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {isGenLayerRoute ? "Settlement Layer (From)" : "From"}
                </span>
                <div className="flex items-center gap-1.5 text-slate-500 font-mono">
                  <span>Balance:</span>
                  {isLoadingBalance ? (
                    <span className="h-3 w-12 animate-pulse rounded bg-white/10" />
                  ) : (
                    <span className="text-slate-300 font-semibold">{parseFloat(balance).toFixed(2)}</span>
                  )}
                  <span>{symbol}</span>
                  {!isGenLayerRoute && (
                    <button
                      onClick={handleMaxClick}
                      disabled={isLoadingBalance || parseFloat(balance) <= 0 || isSelectDisabled}
                      className="ml-1.5 text-[10px] font-bold text-primary hover:text-white hover:bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded transition-all disabled:opacity-40"
                    >
                      MAX
                    </button>
                  )}
                </div>
              </div>

              <div className="flex justify-between items-center gap-3">
                {renderChainSelector(sourceChain, onSourceChainChange, "source")}

                <div className="flex items-center gap-2.5 flex-1 justify-end">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={isSelectDisabled}
                    className="bg-transparent text-2xl font-bold font-mono text-white placeholder-slate-600 focus:outline-none w-full text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <div className="flex items-center gap-1.5 bg-white/5 border border-white/8 rounded-full px-2.5 py-1 select-none shrink-0">
                    <img
                      src="/tokens/usdc.png"
                      alt={symbol}
                      className="w-5 h-5 object-contain bg-transparent"
                      style={{ aspectRatio: "1/1" }}
                    />
                    <span className="text-xs font-bold text-slate-200">{symbol}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Circular bridge route button */}
            <div className="flex justify-center -my-3.5 relative z-10">
              <button
                onClick={handleSwapChains}
                disabled={isSelectDisabled}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full bg-[#070f21] border border-white/8 text-slate-400 hover:bg-white/[0.04] hover:text-white hover:border-primary/40 transition-all duration-200 cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed",
                  isGenLayerRoute
                    ? "hover:border-purple-400 hover:shadow-[0_0_15px_rgba(168,85,247,0.4)]"
                    : "hover:border-primary/40 hover:shadow-[0_0_15px_rgba(79,70,229,0.4)]"
                )}
                title="Swap chains"
              >
                {isGenLayerRoute ? (
                  <Scale className="h-4 w-4 text-purple-400 animate-pulse" />
                ) : (
                  <Globe className="h-4 w-4 text-primary animate-pulse" />
                )}
              </button>
            </div>

            {/* Destination card */}
            <div className={cn(
              "bg-[#070e1c] border rounded-2xl p-5 space-y-4 transition-all duration-200",
              isGenLayerRoute ? "border-purple-500/20" : "border-white/5"
            )}>
              <div className="flex justify-between items-center text-xs">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {isGenLayerRoute ? "Consensus Layer (To)" : "To"}
                </span>
                <span className="text-slate-500 font-mono">
                  {isGenLayerRoute ? "Intelligent Adjudication" : `1:1 ${symbol} Bridge`}
                </span>
              </div>

              <div className="flex justify-between items-center gap-3">
                {renderChainSelector(destinationChain, onDestinationChainChange, "destination")}

                <div className="flex items-center gap-2.5 flex-1 justify-end">
                  <span className="text-2xl font-bold font-mono text-slate-400 text-right w-full block truncate">
                    {amount && parseFloat(amount) > 0 ? parseFloat(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : "0.00"}
                  </span>
                  <div className="flex items-center gap-1.5 bg-white/5 border border-white/8 rounded-full px-2.5 py-1 select-none shrink-0">
                    <img
                      src="/tokens/usdc.png"
                      alt={symbol}
                      className="w-5 h-5 object-contain bg-transparent"
                      style={{ aspectRatio: "1/1" }}
                    />
                    <span className="text-xs font-bold text-slate-200">{symbol}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* GenLayer-specific Adjudication UI */}
            {isGenLayerRoute ? (
              <div className="space-y-3.5 pt-1">
                {/* Explanatory Callout Banner */}
                <div className="rounded-xl border border-purple-500/20 bg-purple-500/[0.04] p-4 space-y-2.5 text-xs text-slate-300">
                  <div className="flex items-center gap-2 text-purple-300 font-semibold">
                    <ShieldCheck className="h-4 w-4 text-purple-400" />
                    <span>GenLayer Adjudication Architecture</span>
                  </div>
                  <p className="text-slate-400 leading-relaxed text-[11.5px]">
                    GenLayer evaluates dispute evidence through validator consensus while USDC remains secured on Base Sepolia.
                  </p>
                  <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[10.5px]">
                    <div className="bg-[#040814]/60 border border-white/5 rounded-lg p-2">
                      <span className="text-slate-500 block">Settlement Layer:</span>
                      <span className="text-emerald-400 font-semibold">Base Sepolia</span>
                    </div>
                    <div className="bg-[#040814]/60 border border-white/5 rounded-lg p-2">
                      <span className="text-slate-500 block">Consensus Layer:</span>
                      <span className="text-purple-400 font-semibold">GenLayer Bradbury</span>
                    </div>
                  </div>
                </div>

                {/* Live Verified Contract Box */}
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 space-y-2 text-xs font-mono">
                  <div className="flex justify-between items-center border-b border-white/5 pb-2 font-sans">
                    <span className="font-semibold text-slate-300">Verified GenLayer Contract</span>
                    <span className="text-purple-400 text-[10px] bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-purple-400" /> Live on Bradbury
                    </span>
                  </div>
                  
                  <div className="space-y-1.5 text-[11px] pt-1">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 font-sans">Contract:</span>
                      <a
                        href="https://explorer-bradbury.genlayer.com/address/0xA314b6402477561d9a1650142724724F60f92534"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-all"
                      >
                        0xA314...2534 <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 font-sans">Deployment TX:</span>
                      <a
                        href="https://explorer-bradbury.genlayer.com/tx/0xab7007edb59b09407484666e929391595946db38cb9ea89c2bdab032889f1fff"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-all"
                      >
                        0xab70...1fff <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 font-sans">Chain ID:</span>
                      <span className="text-slate-300">4221 (Bradbury)</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 font-sans">Runner:</span>
                      <span className="text-slate-400 text-[10px] truncate max-w-[200px]" title="py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6">
                        py-genlayer:1jb45...
                      </span>
                    </div>
                  </div>
                </div>

                {/* 4-Step Adjudication Progress Pipeline */}
                <div className="rounded-xl border border-white/5 bg-[#070e1c]/40 p-4 space-y-3">
                  <div className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Cpu className="h-3.5 w-3.5 text-purple-400" />
                      Adjudication Pipeline
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">4-Stage Workflow</span>
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex items-start gap-2.5 text-xs text-slate-300">
                      <div className="h-5 w-5 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-[10px] font-bold text-blue-400 shrink-0 mt-0.5">
                        1
                      </div>
                      <div className="space-y-0.5">
                        <p className="font-semibold text-slate-200">Base Sepolia — Request Initiated</p>
                        <p className="text-[11px] text-slate-400">USDC collateral secured in PayGrix Escrow Vault on Base Sepolia</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5 text-xs text-slate-300">
                      <div className="h-5 w-5 rounded-full bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-[10px] font-bold text-purple-400 shrink-0 mt-0.5">
                        2
                      </div>
                      <div className="space-y-0.5">
                        <p className="font-semibold text-slate-200">Relaying — GenLayer Bradbury</p>
                        <p className="text-[11px] text-slate-400">Dispute statements and IPFS evidence URI dispatched to Bradbury</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5 text-xs text-slate-300">
                      <div className="h-5 w-5 rounded-full bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-[10px] font-bold text-indigo-400 shrink-0 mt-0.5">
                        3
                      </div>
                      <div className="space-y-0.5">
                        <p className="font-semibold text-slate-200">Validator Consensus — Pending / Verified</p>
                        <p className="text-[11px] text-slate-400">Non-deterministic LLM evaluation & multi-validator consensus</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5 text-xs text-slate-300">
                      <div className="h-5 w-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-[10px] font-bold text-emerald-400 shrink-0 mt-0.5">
                        4
                      </div>
                      <div className="space-y-0.5">
                        <p className="font-semibold text-slate-200">Base Sepolia — Settlement</p>
                        <p className="text-[11px] text-slate-400">Finalized verdict triggers automated collateral release or refund</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* GenLayer Action Button */}
                <Button
                  type="button"
                  disabled={isConnected}
                  onClick={() => {
                    if (!isConnected) {
                      if (availableConnector) {
                        connect({ connector: availableConnector });
                      } else {
                        alert("Please connect your EVM wallet.");
                      }
                    }
                  }}
                  className={cn(
                    "w-full h-12 text-sm font-bold text-white rounded-xl shadow-[0_4px_20px_rgba(168,85,247,0.25)] transition-all duration-300",
                    isConnected
                      ? "bg-[#111a33] border border-purple-500/30 text-purple-200 opacity-90 cursor-default"
                      : "bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 cursor-pointer"
                  )}
                >
                  {!isConnected ? "Connect EVM Wallet (Base Sepolia)" : "GenLayer Adjudication Ready (Live Contract Verified)"}
                </Button>

                <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
                  <Lock className="h-3 w-3 text-slate-500" />
                  <span>USDC remains non-custodial on Base Sepolia during dispute evaluation</span>
                </div>
              </div>
            ) : (
              /* Standard CCTP / Solana Bridge UI */
              <>
                {/* Validation Warnings */}
                {isSameChain && (
                  <div className="flex items-start gap-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3.5 text-xs text-amber-400 leading-normal">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>Source and destination chains cannot be the same. Select a different destination network.</span>
                  </div>
                )}

                {isOverBalance && (
                  <div className="flex items-start gap-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 p-3.5 text-xs text-rose-400 leading-normal">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>Insufficient balance. Enter an amount lower than or equal to {balance} {symbol}.</span>
                  </div>
                )}

                {/* Solana route warnings and connection states */}
                {isSolanaRoute && !isHybridSolanaRoute && (
                  <div className="flex items-start gap-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3.5 text-xs text-amber-400 leading-normal">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>Phase 1 supports Solana Devnet only with Arc Testnet.</span>
                  </div>
                )}

                {isSolanaRoute && isHybridSolanaRoute && (
                  <>
                    {isSolanaConnected && publicKey ? (
                      <div className="h-[60px] rounded-xl border border-white/5 bg-[#070e1c]/40 px-4.5 flex justify-between items-center text-xs">
                        <div className="flex items-center gap-3">
                          <div className="h-7 w-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                            <Wallet className="h-3.5 w-3.5 text-emerald-400" />
                          </div>
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-300 font-semibold">Solana Wallet</span>
                              <span className="text-[10px] text-emerald-400 font-medium bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">Connected</span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono block">
                              {publicKey.toBase58().slice(0, 4)}...{publicKey.toBase58().slice(-4)}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => disconnect()}
                          className="text-[10px] text-slate-400 hover:text-rose-400 transition-all font-semibold underline underline-offset-2"
                        >
                          Disconnect
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="h-[60px] rounded-xl border border-white/5 bg-[#070e1c]/40 px-4.5 flex justify-between items-center text-xs">
                          <div className="space-y-0.5 pr-2">
                            <span className="text-slate-300 font-semibold block">Solana Wallet Required</span>
                            <span className="text-[9.5px] text-slate-400 block">
                              {sourceChain === "Solana Devnet"
                                ? "Connect to bridge from Solana Devnet."
                                : "Connect to use as destination."}
                            </span>
                          </div>
                          <WalletMultiButton className="!h-[30px] !px-3.5 !text-[11px] !rounded-lg !bg-purple-600 hover:!bg-purple-500 !font-sans !font-bold !transition-all !duration-300" />
                        </div>
                        
                        {isPhantomNotDetected && (
                          <div className="text-[10px] text-rose-400 bg-rose-500/5 border border-rose-500/20 rounded-xl p-3 flex items-start gap-2 leading-normal">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            <span>Phantom wallet extension was not detected. Install or enable Phantom and refresh the page.</span>
                          </div>
                        )}
                        
                        {isPhantomInstalled && (
                          <div className="text-[10px] text-purple-400 bg-purple-500/5 border border-purple-500/20 rounded-xl p-3 flex items-start gap-2 leading-normal">
                            <Coins className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            <span>Unlock Phantom and try again.</span>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* Route details panel */}
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4.5 space-y-3 text-xs">
                  <div className="flex justify-between items-center border-b border-white/5 pb-2">
                    <span className="font-semibold text-slate-300">Route Info</span>
                    <span className="text-emerald-400 font-mono text-[10px] bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" /> CCTP Active
                    </span>
                  </div>
                  
                  <div className="space-y-2 font-mono">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Route:</span>
                      <span className="text-white font-medium">{sourceChain} → {destinationChain}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Asset:</span>
                      <span className="text-white font-medium">{symbol}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Protocol:</span>
                      <span className="text-slate-300">Circle CCTP</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Rate:</span>
                      <span className="text-white font-medium">1:1 (No Slippage)</span>
                    </div>
                    <div className="flex justify-between border-t border-white/5 pt-2 mt-1 font-sans">
                      <span className="text-slate-400">Est. Time:</span>
                      <span className="text-slate-400 font-sans">~2–10 minutes</span>
                    </div>
                  </div>
                </div>

                <Button
                  type="button"
                  disabled={(isFormInvalid && isConnected && (!isSolanaRoute || isSolanaConnected)) || (isSolanaRoute && !isSolanaConnected) || status === "preparing" || status === "waiting-wallet" || status === "bridging"}
                  onClick={() => {
                    if (isSolanaRoute && !isHybridSolanaRoute) {
                      alert("Phase 1 supports Solana Devnet only with Arc Testnet.");
                      return;
                    }
                    if (!isConnected) {
                      if (availableConnector) {
                        connect({ connector: availableConnector });
                      } else {
                        alert("Please connect your EVM wallet.");
                      }
                      return;
                    }
                    onBridge(amount);
                  }}
                  className="w-full h-12 text-sm font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:via-indigo-500 hover:to-purple-500 text-white rounded-xl shadow-[0_4px_20px_rgba(79,70,229,0.3)] transition-all duration-300 cursor-pointer disabled:opacity-50 disabled:from-slate-800 disabled:via-slate-800 disabled:to-slate-800 disabled:text-slate-200 disabled:shadow-none disabled:cursor-not-allowed"
                  style={{ textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}
                >
                  {getButtonText()}
                </Button>

                {/* Status section */}
                {status !== "idle" && (
                  <div className="border-t border-white/5 pt-4 mt-2 space-y-3">
                    <div className="text-xs font-semibold text-slate-400 mb-1 flex items-center justify-between">
                      <span>Bridge Status</span>
                      {status === "failed" && (
                        <Badge variant="secondary" className="text-[10px] py-0 px-2 bg-rose-500/10 border border-rose-500/20 text-rose-400">Failed</Badge>
                      )}
                      {status === "completed" && (
                        <Badge variant="success" className="text-[10px] py-0 px-2">Completed</Badge>
                      )}
                    </div>
                    <div className="space-y-2 bg-[#070e1c]/40 border border-white/5 rounded-xl p-3.5">
                      <div className={cn("flex items-center gap-2 text-xs", 
                        ["preparing", "waiting-wallet", "bridging", "completed"].includes(status) ? "text-slate-300" : "text-slate-500 opacity-50"
                      )}>
                        <div className={cn("h-2 w-2 rounded-full", 
                          status === "preparing" ? "bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.6)]" : 
                          ["waiting-wallet", "bridging", "completed"].includes(status) ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" : "bg-slate-600"
                        )} />
                        <span>Preparing transaction</span>
                      </div>

                      <div className={cn("flex items-center gap-2 text-xs", 
                        ["waiting-wallet", "bridging", "completed"].includes(status) ? "text-slate-300" : "text-slate-500 opacity-50"
                      )}>
                        <div className={cn("h-2 w-2 rounded-full", 
                          status === "waiting-wallet" ? "bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.6)]" : 
                          ["bridging", "completed"].includes(status) ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" : "bg-slate-600"
                        )} />
                        <span>Waiting for wallet confirmation</span>
                      </div>

                      <div className={cn("flex items-center gap-2 text-xs", 
                        (sourceTxHash || status === "completed") ? "text-slate-300" : "text-slate-500 opacity-50"
                      )}>
                        <div className={cn("h-2 w-2 rounded-full", 
                          (sourceTxHash || status === "completed") ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" : "bg-slate-600"
                        )} />
                        <span>Transaction submitted</span>
                      </div>

                      <div className={cn("flex items-center gap-2 text-xs", 
                        ["bridging", "completed"].includes(status) ? "text-slate-300" : "text-slate-500 opacity-50"
                      )}>
                        <div className={cn("h-2 w-2 rounded-full", 
                          status === "bridging" ? "bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.6)]" : 
                          status === "completed" ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" : "bg-slate-600"
                        )} />
                        <span>Bridging in progress</span>
                      </div>

                      <div className={cn("flex items-center gap-2 text-xs", 
                        status === "completed" ? "text-slate-300" : "text-slate-500 opacity-50"
                      )}>
                        <div className={cn("h-2 w-2 rounded-full", 
                          status === "completed" ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" : "bg-slate-600"
                        )} />
                        <span>Bridge completed</span>
                      </div>
                    </div>

                    {error && (
                      <div className="text-xs text-rose-400 mt-2 bg-rose-500/10 border border-rose-500/20 rounded-lg p-2.5 font-sans leading-normal">
                        Error: {error}
                      </div>
                    )}
                  </div>
                )}

                {/* Explorer links */}
                {(sourceTxHash || destTxHash) && (
                  <div className="border-t border-white/5 pt-3 mt-1 flex flex-col gap-2 text-xs text-slate-400">
                    {sourceTxHash && (
                      <div className="flex justify-between items-center bg-white/[0.01] border border-white/5 rounded-xl px-3.5 py-2">
                        <span className="text-slate-500">Source TX:</span>
                        <a
                          href={getExplorerTxUrl(sourceChain, sourceTxHash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:text-white flex items-center gap-1 transition-all font-mono font-medium"
                        >
                          {sourceTxHash.slice(0, 10)}...{sourceTxHash.slice(-8)}{" "}
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    )}
                    {destTxHash && (
                      <div className="flex justify-between items-center bg-white/[0.01] border border-white/5 rounded-xl px-3.5 py-2">
                        <span className="text-slate-500">Destination TX:</span>
                        <a
                          href={getExplorerTxUrl(destinationChain, destTxHash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:text-white flex items-center gap-1 transition-all font-mono font-medium"
                        >
                          {destTxHash.slice(0, 10)}...{destTxHash.slice(-8)}{" "}
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

          </div>
        </CardContent>
      </Card>
    </div>
  );
}

