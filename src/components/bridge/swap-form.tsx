"use client";

import { useState, useEffect } from "react";
import {
  ArrowUpDown,
  Coins,
  Clock,
  ExternalLink,
  Activity,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useArcWallet } from "@/components/wallet/use-arc-wallet";
import { useSwap } from "@/hooks/use-swap";

interface SwapFormProps {
  balanceUSDC: string;
  balanceEURC: string;
  isLoadingBalance: boolean;
  onSwapSuccess: (amountIn: string, amountOut: string, tokenIn: "USDC" | "EURC", tokenOut: "USDC" | "EURC", hash: string) => void;
}

export function SwapForm({
  balanceUSDC,
  balanceEURC,
  isLoadingBalance,
  onSwapSuccess,
}: SwapFormProps) {
  const [tokenIn, setTokenIn] = useState<"USDC" | "EURC">("USDC");
  const [tokenOut, setTokenOut] = useState<"USDC" | "EURC">("EURC");
  const [amount, setAmount] = useState<string>("");
  const [hasQuote, setHasQuote] = useState<boolean>(false);
  const isSwapDisabled = true;

  const { isConnected, availableConnector, connect } = useArcWallet();
  const {
    status,
    estimate,
    txHash,
    error,
    getSwapEstimate,
    executeSwap,
    resetSwapState,
  } = useSwap();

  const currentBalance = tokenIn === "USDC" ? balanceUSDC : balanceEURC;
  const isOverBalance = parseFloat(amount) > parseFloat(currentBalance);
  const isValidAmount = amount !== "" && parseFloat(amount) > 0;
  const isFormInvalid = isOverBalance || !isValidAmount;

  // Recalculate quote if amount or tokens change
  useEffect(() => {
    setHasQuote(false);
    resetSwapState();
  }, [amount, tokenIn, tokenOut, resetSwapState]);

  const handleSwapDirection = () => {
    if (isSwapDisabled) return;
    const temp = tokenIn;
    setTokenIn(tokenOut);
    setTokenOut(temp);
    setAmount("");
  };

  const handleMaxClick = () => {
    if (isSwapDisabled) return;
    setAmount(currentBalance);
  };

  const handleGetQuote = async () => {
    if (isFormInvalid || isSwapDisabled) return;
    const est = await getSwapEstimate(amount, tokenIn, tokenOut);
    if (est) {
      setHasQuote(true);
    }
  };

  const handleExecuteSwap = async () => {
    if (isFormInvalid || !hasQuote || !estimate || isSwapDisabled) return;
    const result = await executeSwap(amount, tokenIn, tokenOut);
    if (result && result.txHash) {
      const outputVal = result.amountOut || estimate.estimatedOutput;
      onSwapSuccess(amount, outputVal, tokenIn, tokenOut, result.txHash);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border border-white/10 bg-[#060f24]/50 backdrop-blur-md relative overflow-hidden">
        {/* Shimmer top line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 via-pink-500 to-[#d65dfc]" />

        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
            <Coins className="h-5 w-5 text-purple-400 animate-pulse" />
            Swap on Arc
          </CardTitle>
          <CardDescription className="text-xs text-slate-400">
            Swap USDC and EURC same-chain on Arc Testnet instantly.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Coming Soon Notice */}
          <div className="flex items-start gap-3 rounded-xl bg-purple-500/10 border border-purple-500/20 p-4 text-xs text-purple-300 leading-normal">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-purple-400" />
            <div className="space-y-1">
              <p className="font-semibold text-white">Swap Feature Coming Soon</p>
              <p>Swap on Arc requires a Circle Stablecoin Kit server-side API key configuration. This service will be online shortly.</p>
            </div>
          </div>

          {/* 1. Token In (Source) */}
          <div className="space-y-1.5 opacity-50">
            <div className="flex justify-between items-center">
              <label className="block text-xs font-semibold text-slate-400">Pay With</label>
              <span className="text-[10px] text-slate-500 font-medium font-mono">
                Bal: {parseFloat(currentBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })} {tokenIn}
              </span>
            </div>
            <div className="relative">
              <select
                value={tokenIn}
                onChange={(e) => {
                  const val = e.target.value as "USDC" | "EURC";
                  setTokenIn(val);
                  setTokenOut(val === "USDC" ? "EURC" : "USDC");
                }}
                disabled={isSwapDisabled || status === "swapping" || status === "waiting-wallet"}
                className="w-full appearance-none rounded-xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all cursor-not-allowed"
              >
                <option value="USDC" className="bg-[#060f24] text-white">USDC (USD Coin)</option>
                <option value="EURC" className="bg-[#060f24] text-white">EURC (Euro Coin)</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                <ArrowUpDown className="h-4 w-4" />
              </div>
            </div>
          </div>

          {/* Reverse Button */}
          <div className="flex justify-center -my-2 relative z-10 opacity-50">
            <button
              onClick={handleSwapDirection}
              disabled={isSwapDisabled || status === "swapping" || status === "waiting-wallet"}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 border border-white/10 text-slate-400 hover:bg-white/10 hover:text-white hover:border-primary hover:shadow-[0_0_12px_rgba(109,93,252,0.3)] transition-all cursor-not-allowed active:scale-95 disabled:opacity-40"
              title="Reverse direction"
            >
              <ArrowUpDown className="h-4 w-4" />
            </button>
          </div>

          {/* 2. Token Out (Destination) */}
          <div className="space-y-1.5 opacity-50">
            <label className="block text-xs font-semibold text-slate-400">Receive</label>
            <div className="relative">
              <select
                value={tokenOut}
                onChange={(e) => {
                  const val = e.target.value as "USDC" | "EURC";
                  setTokenOut(val);
                  setTokenIn(val === "USDC" ? "EURC" : "USDC");
                }}
                disabled={isSwapDisabled || status === "swapping" || status === "waiting-wallet"}
                className="w-full appearance-none rounded-xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all cursor-not-allowed"
              >
                <option value="EURC" className="bg-[#060f24] text-white">EURC (Euro Coin)</option>
                <option value="USDC" className="bg-[#060f24] text-white">USDC (USD Coin)</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                <ArrowUpDown className="h-4 w-4" />
              </div>
            </div>
          </div>

          {/* 3. Amount Input */}
          <div className="space-y-1.5 opacity-50">
            <div className="flex justify-between items-center">
              <label className="block text-xs font-semibold text-slate-400">Amount</label>
              <button
                onClick={handleMaxClick}
                disabled={isSwapDisabled || isLoadingBalance || parseFloat(currentBalance) <= 0 || status === "swapping" || status === "waiting-wallet"}
                className="text-[10px] font-bold text-primary hover:text-white hover:bg-primary/10 border border-primary/20 px-2 py-0.5 rounded transition-all disabled:opacity-40"
              >
                MAX
              </button>
            </div>
            <div className="relative">
              <input
                type="number"
                min="0"
                step="any"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={isSwapDisabled || status === "swapping" || status === "waiting-wallet"}
                className={cn(
                  "w-full rounded-xl bg-white/5 border px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none transition-all font-mono cursor-not-allowed",
                  isOverBalance
                    ? "border-rose-500/50 focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                    : "border-white/8 focus:border-primary focus:ring-1 focus:ring-primary"
                )}
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                <span className={cn("text-xs font-bold font-mono", tokenIn === "USDC" ? "text-[#4f8cff]" : "text-purple-400")}>
                  {tokenIn}
                </span>
              </div>
            </div>
          </div>

          {/* Over-balance Warning */}
          {isOverBalance && (
            <div className="flex items-start gap-2 rounded-xl bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-400">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Insufficient balance. Enter an amount lower than or equal to {currentBalance} {tokenIn}.</span>
            </div>
          )}

          {/* 4. Estimated Output Details */}
          {hasQuote && estimate && (
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 space-y-3">
              <div className="flex justify-between items-center border-b border-white/5 pb-2">
                <span className="text-xs font-medium text-slate-400">Quote Details</span>
                <Badge variant="success" className="text-[10px] py-0 px-2 flex gap-1 items-center">
                  <Activity className="h-2.5 w-2.5" /> Live Quote
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-y-2 text-xs font-mono">
                <div className="text-slate-400">You Swap:</div>
                <div className="text-right text-white font-semibold">
                  {amount} {tokenIn}
                </div>

                <div className="text-slate-400">Estimated Output:</div>
                <div className="text-right text-white font-semibold">
                  {estimate.estimatedOutput} {tokenOut}
                </div>

                <div className="text-slate-400">Minimum Received:</div>
                <div className="text-right text-slate-300">
                  {estimate.stopLimit} {tokenOut}
                </div>

                {estimate.fees && estimate.fees.length > 0 && estimate.fees.map((fee, idx) => (
                  <div key={idx} className="contents">
                    <div className="text-slate-400 capitalize">{fee.type} Fee:</div>
                    <div className="text-right text-slate-300">
                      {fee.amount !== null ? `${parseFloat(fee.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} ${fee.token}` : "N/A"}
                    </div>
                  </div>
                ))}

                <div className="col-span-2 text-slate-400 flex items-start gap-1.5 pt-1.5 border-t border-white/5 mt-1 font-sans">
                  <Clock className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                  <span className="text-[10px] leading-4 text-slate-400">
                    Slippage tolerance is set to 1% to protect your swap rate from front-running.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 5. Swap/Quote Action Button */}
          {!hasQuote ? (
            <Button
              type="button"
              disabled={isSwapDisabled || isFormInvalid || status === "estimating"}
              variant="default"
              className="w-full text-sm font-bold animate-transition cursor-not-allowed opacity-50"
              onClick={handleGetQuote}
            >
              {status === "estimating" ? "Estimating..." : "Get Quote"}
            </Button>
          ) : (
            <Button
              type="button"
              disabled={isSwapDisabled || status === "swapping" || status === "waiting-wallet"}
              variant="default"
              className="w-full text-sm font-bold animate-transition bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 cursor-not-allowed opacity-50"
              onClick={() => {
                if (!isConnected) {
                  if (availableConnector) {
                    connect({ connector: availableConnector });
                  } else {
                    alert("Please connect your wallet using the button in the top header.");
                  }
                } else {
                  handleExecuteSwap();
                }
              }}
            >
              {!isConnected
                ? "Connect Wallet"
                : status === "waiting-wallet"
                ? "Confirm in Wallet..."
                : status === "swapping"
                ? "Swapping..."
                : `Swap ${tokenIn} to ${tokenOut}`}
            </Button>
          )}

          {/* 6. Execution Status & Errors */}
          {(status === "waiting-wallet" || status === "swapping" || status === "completed" || status === "failed") && (
            <div className="border-t border-white/5 pt-4 mt-2 space-y-3">
              <div className="text-xs font-semibold text-slate-400 mb-1 flex items-center justify-between">
                <span>Swap Status</span>
                {status === "failed" && (
                  <Badge variant="secondary" className="text-[10px] py-0 px-2 bg-rose-500/10 border border-rose-500/20 text-rose-400">Failed</Badge>
                )}
                {status === "completed" && (
                  <Badge variant="success" className="text-[10px] py-0 px-2">Completed</Badge>
                )}
              </div>

              <div className="space-y-2">
                <div className={cn("flex items-center gap-2 text-xs",
                  ["waiting-wallet", "swapping", "completed"].includes(status) ? "text-slate-300" : "text-slate-500 opacity-50"
                )}>
                  <div className={cn("h-2 w-2 rounded-full",
                    status === "waiting-wallet" ? "bg-primary animate-pulse" :
                    ["swapping", "completed"].includes(status) ? "bg-emerald-500" : "bg-slate-600"
                  )} />
                  <span>Waiting for wallet signature</span>
                </div>

                <div className={cn("flex items-center gap-2 text-xs",
                  ["swapping", "completed"].includes(status) ? "text-slate-300" : "text-slate-500 opacity-50"
                )}>
                  <div className={cn("h-2 w-2 rounded-full",
                    status === "swapping" ? "bg-primary animate-pulse" :
                    status === "completed" ? "bg-emerald-500" : "bg-slate-600"
                  )} />
                  <span>Executing swap on-chain</span>
                </div>

                <div className={cn("flex items-center gap-2 text-xs",
                  status === "completed" ? "text-slate-300" : "text-slate-500 opacity-50"
                )}>
                  <div className={cn("h-2 w-2 rounded-full",
                    status === "completed" ? "bg-emerald-500" : "bg-slate-600"
                  )} />
                  <span>Swap completed</span>
                </div>
              </div>

              {error && (
                <div className="text-xs text-rose-400 mt-2 bg-rose-500/10 border border-rose-500/20 rounded-lg p-2.5 font-sans leading-normal">
                  Error: {error}
                </div>
              )}

              {txHash && (
                <div className="border-t border-white/5 pt-3 flex justify-between items-center text-[11px] text-slate-400">
                  <span>Transaction Hash:</span>
                  <a
                    href={`https://testnet.arcscan.app/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:text-white flex items-center gap-1 transition-all font-mono"
                  >
                    {txHash.slice(0, 10)}...{txHash.slice(-8)}{" "}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
