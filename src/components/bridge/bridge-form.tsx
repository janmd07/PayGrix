"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Coins,
  ExternalLink,
  Globe,
  RefreshCw,
  ChevronDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useArcWallet } from "@/components/wallet/use-arc-wallet";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

const CHAINS = ["Arc Testnet", "Base Sepolia", "Arbitrum Sepolia", "Solana Devnet"];

const EXPLORER_URLS: Record<string, string> = {
  "Arc Testnet": "https://testnet.arcscan.app",
  "Base Sepolia": "https://sepolia.basescan.org",
  "Arbitrum Sepolia": "https://sepolia.arbiscan.io",
  "Solana Devnet": "https://explorer.solana.com",
};

export function getExplorerUrl(chain: string): string {
  return EXPLORER_URLS[chain] || "https://testnet.arcscan.app";
}

export function getExplorerTxUrl(chain: string, txHash: string): string {
  if (chain === "Solana Devnet") {
    return `https://explorer.solana.com/tx/${txHash}?cluster=devnet`;
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
  const { connected: isSolanaConnected, wallets } = useWallet();

  const phantomWallet = wallets.find((w) => w.adapter.name === "Phantom");
  const isPhantomNotDetected = phantomWallet?.readyState === "NotDetected";
  const isPhantomInstalled = phantomWallet?.readyState === "Installed" || phantomWallet?.readyState === "Loadable";

  const isSolanaRoute = sourceChain === "Solana Devnet" || destinationChain === "Solana Devnet";
  const isHybridSolanaRoute =
    (sourceChain === "Solana Devnet" && destinationChain === "Arc Testnet") ||
    (sourceChain === "Arc Testnet" && destinationChain === "Solana Devnet");

  const isSameChain = sourceChain === destinationChain;
  const isOverBalance = parseFloat(amount) > parseFloat(balance);
  const isValidAmount = amount !== "" && parseFloat(amount) > 0;
  const isFormInvalid = isSameChain || isOverBalance || !isValidAmount || (isSolanaRoute && !isHybridSolanaRoute);

  const handleSwapChains = () => {
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
    onChangeHandler: (val: string) => void
  ) => {
    return (
      <div className="relative shrink-0">
        <div className={cn(
          "flex items-center bg-[#070f21] border border-white/8 hover:bg-white/[0.04] rounded-full pl-3 pr-4 py-2 text-white hover:border-primary/30 transition-all duration-200 cursor-pointer select-none",
          isSelectDisabled && "opacity-50 cursor-not-allowed pointer-events-none"
        )}>
          <div className={cn(
            "h-2 w-2 rounded-full mr-2 shrink-0",
            value === "Arc Testnet" ? "bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.5)]" :
            value === "Base Sepolia" ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" :
            value === "Arbitrum Sepolia" ? "bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.5)]" :
            "bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.5)]"
          )} />
          <span className="font-bold text-xs tracking-wider uppercase text-slate-200">{value}</span>
          <ChevronDown className="h-4 w-4 text-slate-400 shrink-0 ml-1.5" />
        </div>
        <select
          value={value}
          onChange={(e) => onChangeHandler(e.target.value)}
          disabled={isSelectDisabled}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-20"
        >
          {CHAINS.map((c) => (
            <option key={c} value={c} className="bg-[#060f24] text-white">
              {c}
            </option>
          ))}
        </select>
      </div>
    );
  };

  const getButtonText = () => {
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
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />

        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
            <Coins className="h-5 w-5 text-indigo-400 animate-pulse" />
            Bridge USDC
          </CardTitle>
          <CardDescription className="text-xs text-slate-400">
            Transfer USDC tokens across testnets instantly.
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
                : "border-white/5 focus-within:border-primary/30"
            )}>
              <div className="flex justify-between items-center text-xs">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">From</span>
                <div className="flex items-center gap-1.5 text-slate-500 font-mono">
                  <span>Balance:</span>
                  {isLoadingBalance ? (
                    <span className="h-3 w-12 animate-pulse rounded bg-white/10" />
                  ) : (
                    <span className="text-slate-300 font-semibold">{parseFloat(balance).toFixed(2)}</span>
                  )}
                  <span>{symbol}</span>
                  <button
                    onClick={handleMaxClick}
                    disabled={isLoadingBalance || parseFloat(balance) <= 0 || isSelectDisabled}
                    className="ml-1.5 text-[10px] font-bold text-primary hover:text-white hover:bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded transition-all disabled:opacity-40"
                  >
                    MAX
                  </button>
                </div>
              </div>

              <div className="flex justify-between items-center gap-3">
                {renderChainSelector(sourceChain, onSourceChainChange)}

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
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[#070f21] border border-white/8 text-slate-400 hover:bg-white/[0.04] hover:text-white hover:border-primary/40 hover:shadow-[0_0_15px_rgba(79,70,229,0.4)] transition-all duration-200 cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Swap chains"
              >
                <Globe className="h-4 w-4 text-primary animate-pulse" />
              </button>
            </div>

            {/* Destination card */}
            <div className="bg-[#070e1c] border border-white/5 rounded-2xl p-5 space-y-4 transition-all duration-200">
              <div className="flex justify-between items-center text-xs">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">To</span>
                <span className="text-slate-500 font-mono">1:1 {symbol} Bridge</span>
              </div>

              <div className="flex justify-between items-center gap-3">
                {renderChainSelector(destinationChain, onDestinationChainChange)}

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
              <div className="space-y-2">
                <div className="rounded-xl border border-purple-500/20 bg-purple-950/10 p-3.5 flex justify-between items-center text-xs shadow-[0_4px_20px_rgba(147,51,234,0.05)]">
                  <div className="space-y-0.5 pr-2">
                    <span className="text-slate-300 font-semibold block">Solana Wallet Required</span>
                    <span className="text-[10px] text-slate-400">
                      {sourceChain === "Solana Devnet"
                        ? "Connect your Solana wallet to bridge USDC from Solana Devnet."
                        : "Connect your Solana wallet to use its address as the destination."}
                    </span>
                  </div>
                  <WalletMultiButton />
                </div>
                
                {isPhantomNotDetected && (
                  <div className="text-[10px] text-rose-400 bg-rose-500/5 border border-rose-500/20 rounded-xl p-3 flex items-start gap-2 leading-normal">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>Phantom wallet extension was not detected. Install or enable Phantom and refresh the page.</span>
                  </div>
                )}
                
                {isPhantomInstalled && !isSolanaConnected && (
                  <div className="text-[10px] text-purple-400 bg-purple-500/5 border border-purple-500/20 rounded-xl p-3 flex items-start gap-2 leading-normal">
                    <Coins className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>Unlock Phantom and try again.</span>
                  </div>
                )}
              </div>
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

          </div>
        </CardContent>
      </Card>
    </div>
  );
}

