"use client";

import { useState, useEffect } from "react";
import {
  ArrowUpDown,
  Coins,
  Clock,
  ExternalLink,
  AlertTriangle,
  ChevronDown,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useArcWallet } from "@/components/wallet/use-arc-wallet";
import { useSwap } from "@/hooks/use-swap";

interface TokenLogoProps {
  symbol: "USDC" | "EURC" | "cirBTC";
}

function TokenLogo({ symbol }: TokenLogoProps) {
  const [hasError, setHasError] = useState(false);
  const src =
    symbol === "USDC"
      ? "/tokens/usdc.png"
      : symbol === "EURC"
      ? "/tokens/eurc.png"
      : "/tokens/cirbtc.png";

  useEffect(() => {
    setHasError(false);
  }, [symbol]);

  if (hasError) {
    return (
      <div
        className={cn(
          "h-6 w-6 rounded-full flex items-center justify-center text-white shrink-0 font-bold text-xs select-none",
          symbol === "USDC"
            ? "bg-[#2775CA] shadow-[0_0_8px_rgba(39,117,202,0.4)]"
            : symbol === "EURC"
            ? "bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.4)]"
            : "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]"
        )}
      >
        {symbol === "USDC" ? "$" : symbol === "EURC" ? "€" : "B"}
      </div>
    );
  }

  return (
    <div className="h-6 w-6 rounded-full overflow-hidden flex items-center justify-center shrink-0 bg-transparent">
      <img
        src={src}
        alt={symbol}
        onError={() => setHasError(true)}
        className="w-full h-full object-contain bg-transparent"
        style={{ aspectRatio: "1/1" }}
      />
    </div>
  );
}

interface SwapFormProps {
  balanceUSDC: string;
  balanceEURC: string;
  balanceCirBTC: string;
  isLoadingBalance: boolean;
  onSwapSuccess: (amountIn: string, amountOut: string, tokenIn: "USDC" | "EURC" | "cirBTC", tokenOut: "USDC" | "EURC" | "cirBTC", hash: string) => void;
}

export function SwapForm({
  balanceUSDC,
  balanceEURC,
  balanceCirBTC,
  isLoadingBalance,
  onSwapSuccess,
}: SwapFormProps) {
  const [tokenIn, setTokenIn] = useState<"USDC" | "EURC" | "cirBTC">("USDC");
  const [tokenOut, setTokenOut] = useState<"USDC" | "EURC" | "cirBTC">("EURC");
  const [amount, setAmount] = useState<string>("");
  const [hasQuote, setHasQuote] = useState<boolean>(false);
  const [isEnabled, setIsEnabled] = useState<boolean>(false);
  const [isLoadingStatus, setIsLoadingStatus] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [openSelectorSlot, setOpenSelectorSlot] = useState<"in" | "out" | null>(null);

  useEffect(() => {
    const now = new Date();
    setLastUpdated(now.toTimeString().split(" ")[0]);
  }, []);

  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await fetch("/api/swap/status");
        const data = await res.json();
        setIsEnabled(!!data.enabled);
      } catch (err) {
        console.error("Failed to check swap status:", err);
        setIsEnabled(false);
      } finally {
        setIsLoadingStatus(false);
      }
    }
    checkStatus();
  }, []);

  const isSwapDisabled = !isEnabled;

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

  const currentBalance =
    tokenIn === "USDC"
      ? balanceUSDC
      : tokenIn === "EURC"
      ? balanceEURC
      : balanceCirBTC;
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
      const now = new Date();
      setLastUpdated(now.toTimeString().split(" ")[0]);
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

  const isSelectDisabled = isSwapDisabled || status === "swapping" || status === "waiting-wallet";

  const renderTokenSelector = (
    value: "USDC" | "EURC" | "cirBTC",
    onChangeHandler: (val: "USDC" | "EURC" | "cirBTC") => void,
    slot: "in" | "out"
  ) => {
    const isOpen = openSelectorSlot === slot;

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenSelectorSlot(null);
      }
    };

    return (
      <div className="relative" onKeyDown={handleKeyDown}>
        <button
          type="button"
          onClick={() => {
            if (!isSelectDisabled) {
              setOpenSelectorSlot(isOpen ? null : slot);
            }
          }}
          disabled={isSelectDisabled}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          className={cn(
            "flex items-center bg-[#070f21] border border-white/8 hover:bg-white/[0.04] rounded-full pl-2.5 pr-4 py-2 text-white hover:border-purple-500/30 transition-all duration-200 cursor-pointer select-none focus:outline-none focus:ring-1 focus:ring-purple-500/50",
            isSelectDisabled && "opacity-50 cursor-not-allowed pointer-events-none"
          )}
        >
          <TokenLogo symbol={value} />
          <span className="font-bold text-sm tracking-wider ml-2 mr-1">{value}</span>
          <ChevronDown className={cn("h-4 w-4 text-slate-400 shrink-0 transition-transform duration-200", isOpen && "rotate-180")} />
        </button>

        {isOpen && (
          <>
            {/* Click outside overlay */}
            <div 
              className="fixed inset-0 z-30 cursor-default" 
              onClick={(e) => {
                e.stopPropagation();
                setOpenSelectorSlot(null);
              }}
            />
            <div 
              role="listbox"
              className="absolute right-0 mt-2 w-36 rounded-2xl border border-purple-500/30 bg-[#070f21] p-1.5 shadow-[0_8px_24px_rgba(7,15,33,0.8)] z-40 animate-in fade-in slide-in-from-top-2 duration-150"
            >
              {(["USDC", "EURC", "cirBTC"] as const).map((option) => {
                const isSelected = value === option;
                return (
                  <button
                    key={option}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChangeHandler(option);
                      setOpenSelectorSlot(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onChangeHandler(option);
                        setOpenSelectorSlot(null);
                      } else if (e.key === "Escape") {
                        setOpenSelectorSlot(null);
                      }
                    }}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left text-xs font-semibold tracking-wider hover:bg-white/[0.04] transition-all duration-150 focus:outline-none focus:bg-white/[0.04]",
                      isSelected ? "bg-purple-500/20 text-purple-400 border border-purple-500/20" : "text-slate-300 border border-transparent"
                    )}
                  >
                    <TokenLogo symbol={option} />
                    <span>{option}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  };

  const rate = hasQuote && estimate && amount && parseFloat(amount) > 0
    ? (parseFloat(estimate.estimatedOutput) / parseFloat(amount)).toFixed(6)
    : null;

  return (
    <div className="space-y-6">
      <Card className="border border-white/10 bg-[#060f24]/60 backdrop-blur-lg relative overflow-hidden shadow-[0_8px_32px_rgba(6,15,36,0.5)]">
        {/* Elegant top gradient accent line */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#4f8cff] via-[#9d4edd] to-[#7b2cbf]" />

        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
            <Coins className="h-5 w-5 text-purple-400 animate-pulse" />
            Swap on Arc
          </CardTitle>
          <CardDescription className="text-xs text-slate-400">
            Swap stablecoins and cirBTC same-chain on Arc Testnet instantly.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Centered Compact Swap Widget */}
          <div className="mx-auto w-full max-w-[500px] space-y-4">
            {/* Top row: Last updated indicator & refresh icon button */}
            <div className="flex justify-end items-center gap-2 text-xs text-slate-500 font-mono pr-1">
              <span>Last updated: {lastUpdated || "--:--:--"}</span>
              <button
                onClick={handleGetQuote}
                disabled={isSwapDisabled || isFormInvalid || status === "estimating"}
                className="p-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white transition-all disabled:opacity-40"
                title="Refresh quote"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", status === "estimating" && "animate-spin")} />
              </button>
            </div>

            {/* Coming Soon / Setup Required Notice */}
            {!isEnabled && !isLoadingStatus && (
              <div className="flex items-start gap-3 rounded-xl bg-purple-500/10 border border-purple-500/20 p-4 text-xs text-purple-300 leading-normal">
                <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-purple-400" />
                <div className="space-y-1">
                  <p className="font-semibold text-white">Setup Required</p>
                  <p>Swap on Arc requires a Circle Stablecoin Kit server-side API key configuration. Please set the <code>STABLECOIN_KIT_API_KEY</code> environment variable on your server to enable swapping.</p>
                </div>
              </div>
            )}

            {isLoadingStatus && (
              <div className="flex items-center justify-center py-4">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            )}

            {/* Swap Cards Section */}
            <div className={cn("relative space-y-1.5", isSwapDisabled && "opacity-50")}>
              {/* 1. Pay/Sell Input Card */}
              <div className={cn(
                "bg-[#070e1c] border rounded-2xl p-5 space-y-3.5 transition-all duration-200",
                isOverBalance
                  ? "border-rose-500/30 bg-rose-500/5 focus-within:border-rose-500/50"
                  : "border-white/5 focus-within:border-purple-500/30"
              )}>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Sell</span>
                  <div className="flex items-center gap-2 text-slate-500 font-mono">
                    <span>Balance: {parseFloat(currentBalance).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 })}</span>
                    <button
                      onClick={handleMaxClick}
                      disabled={isSwapDisabled || isLoadingBalance || parseFloat(currentBalance) <= 0 || status === "swapping" || status === "waiting-wallet"}
                      className="rounded-md bg-[#000000] border border-white/10 hover:bg-white/5 px-2.5 py-1 text-[10px] font-bold text-white transition-all disabled:opacity-40"
                    >
                      MAX
                    </button>
                  </div>
                </div>

                <div className="flex justify-between items-center gap-4 pt-1">
                  <div className="flex-1 min-w-0">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="0"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      disabled={isSwapDisabled || status === "swapping" || status === "waiting-wallet"}
                      className="w-full bg-transparent text-4xl font-bold text-white placeholder-slate-700 focus:outline-none transition-all font-mono"
                    />
                  </div>

                  <div className="shrink-0">
                    {renderTokenSelector(tokenIn, (val) => {
                      setTokenIn(val);
                      if (tokenOut === val) {
                        setTokenOut(val === "USDC" ? "EURC" : "USDC");
                      }
                    }, "in")}
                  </div>
                </div>
              </div>

              {/* 2. Switch Control Button */}
              <div className="flex justify-center -my-4.5 relative z-10">
                <button
                  onClick={handleSwapDirection}
                  disabled={isSwapDisabled || status === "swapping" || status === "waiting-wallet"}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full bg-[#070e1c] border border-white/10 text-slate-400 hover:text-white hover:border-purple-500/50 hover:shadow-[0_0_10px_rgba(157,78,221,0.4)] transition-all duration-200 active:scale-95 disabled:opacity-40",
                    isSwapDisabled ? "cursor-not-allowed" : "cursor-pointer"
                  )}
                  title="Switch direction"
                >
                  <ArrowUpDown className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* 3. Receive/Buy Output Card */}
              <div className="bg-[#070e1c] border border-white/5 rounded-2xl p-5 space-y-3.5 transition-all duration-200 focus-within:border-purple-500/30">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-400 uppercase tracking-wider">Buy</span>
                </div>

                <div className="flex justify-between items-center gap-4 pt-1">
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      readOnly
                      placeholder="0"
                      value={hasQuote && estimate ? estimate.estimatedOutput : ""}
                      className="w-full bg-transparent text-4xl font-bold text-white placeholder-slate-700 focus:outline-none font-mono cursor-default"
                    />
                  </div>

                  <div className="shrink-0">
                    {renderTokenSelector(tokenOut, (val) => {
                      setTokenOut(val);
                      if (tokenIn === val) {
                        setTokenIn(val === "USDC" ? "EURC" : "USDC");
                      }
                    }, "out")}
                  </div>
                </div>
              </div>
            </div>

            {/* Daily Swaps Remaining / Info Row */}
            <div className="flex justify-between items-center text-xs text-slate-400 px-1 py-1.5 border-t border-b border-white/5">
              <div className="flex items-center gap-1.5">
                <div className="h-4 w-4 rounded-full border border-slate-500/30 flex items-center justify-center text-[10px] text-slate-500 font-bold shrink-0">i</div>
                <span>Daily swaps remaining</span>
              </div>
              <span className="font-semibold text-white">10 / 10</span>
            </div>

            {/* Over-balance Warning */}
            {isOverBalance && (
              <div className="flex items-start gap-2 rounded-xl bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-400">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>Insufficient balance. Enter an amount lower than or equal to {currentBalance} {tokenIn}.</span>
              </div>
            )}

            {/* 4. Estimated Output Details (Quote Info) */}
            {hasQuote && estimate && (
              <div className="rounded-2xl border border-white/5 bg-[#070e1c] p-4.5 space-y-2 text-xs">
                <div className="flex justify-between items-center border-b border-white/5 pb-2">
                  <span className="font-semibold text-slate-300">Quote Details</span>
                  <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Live Quote
                  </span>
                </div>

                <div className="space-y-1.5 pt-1">
                  {rate && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Rate</span>
                      <span className="text-white font-mono font-medium">1 {tokenIn} ≈ {rate} {tokenOut}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">You Swap</span>
                    <span className="text-white font-mono font-medium">{amount} {tokenIn}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Estimated Output</span>
                    <span className="text-white font-mono font-medium">{estimate.estimatedOutput} {tokenOut}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Minimum Received</span>
                    <span className="text-slate-300 font-mono">{estimate.stopLimit} {tokenOut}</span>
                  </div>

                  {estimate.fees && estimate.fees.length > 0 && estimate.fees.map((fee, idx) => (
                    <div key={idx} className="flex justify-between items-center">
                      <span className="text-slate-400 capitalize">{fee.type} Fee</span>
                      <span className="text-slate-300 font-mono">
                        {fee.amount !== null ? `${parseFloat(fee.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} ${fee.token}` : "N/A"}
                      </span>
                    </div>
                  ))}

                  <div className="pt-1.5 border-t border-white/5 text-[10px] text-slate-500 flex items-center gap-1">
                    <Clock className="h-3 w-3 text-purple-400 shrink-0" />
                    <span>Slippage tolerance is set to 1% to protect your rate.</span>
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
                className={cn(
                  "w-full text-sm font-bold py-3.5 rounded-xl transition-all duration-300 active:scale-[0.98]",
                  "bg-gradient-to-r from-[#4f8cff] via-[#9d4edd] to-[#7b2cbf] hover:from-[#3b7cff] hover:via-[#8c3ed9] hover:to-[#6a1cb0]",
                  "text-white shadow-[0_4px_14px_rgba(157,78,221,0.3)] hover:shadow-[0_4px_20px_rgba(157,78,221,0.5)]",
                  (isSwapDisabled || isFormInvalid || status === "estimating") && "opacity-50 cursor-not-allowed hover:shadow-none hover:from-[#4f8cff] hover:via-[#9d4edd] hover:to-[#7b2cbf]"
                )}
                onClick={handleGetQuote}
              >
                {amount === "" || parseFloat(amount) <= 0
                  ? "Enter Amount"
                  : isOverBalance
                  ? "Insufficient Balance"
                  : status === "estimating"
                  ? "Estimating..."
                  : "Get Quote"}
              </Button>
            ) : (
              <Button
                type="button"
                disabled={isSwapDisabled || status === "swapping" || status === "waiting-wallet"}
                variant="default"
                className={cn(
                  "w-full text-sm font-bold py-3.5 rounded-xl transition-all duration-300 active:scale-[0.98]",
                  "bg-gradient-to-r from-[#4f8cff] via-[#9d4edd] to-[#7b2cbf] hover:from-[#3b7cff] hover:via-[#8c3ed9] hover:to-[#6a1cb0]",
                  "text-white shadow-[0_4px_14px_rgba(157,78,221,0.3)] hover:shadow-[0_4px_20px_rgba(157,78,221,0.5)]",
                  (isSwapDisabled || status === "swapping" || status === "waiting-wallet") && "opacity-50 cursor-not-allowed hover:shadow-none hover:from-[#4f8cff] hover:via-[#9d4edd] hover:to-[#7b2cbf]"
                )}
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
              <div className="border-t border-white/5 pt-3.5 mt-2 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
                  <span>Swap Status</span>
                  {status === "failed" && (
                    <span className="text-[10px] font-medium text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">Failed</span>
                  )}
                  {status === "completed" && (
                    <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">Completed</span>
                  )}
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className={cn("flex items-center gap-2",
                    ["waiting-wallet", "swapping", "completed"].includes(status) ? "text-slate-300" : "text-slate-500 opacity-50"
                  )}>
                    <span className={cn("h-1.5 w-1.5 rounded-full",
                      status === "waiting-wallet" ? "bg-purple-500 animate-pulse" :
                      ["swapping", "completed"].includes(status) ? "bg-emerald-400" : "bg-slate-700"
                    )} />
                    <span>Waiting for wallet signature</span>
                  </div>

                  <div className={cn("flex items-center gap-2",
                    ["swapping", "completed"].includes(status) ? "text-slate-300" : "text-slate-500 opacity-50"
                  )}>
                    <span className={cn("h-1.5 w-1.5 rounded-full",
                      status === "swapping" ? "bg-purple-500 animate-pulse" :
                      status === "completed" ? "bg-emerald-400" : "bg-slate-700"
                    )} />
                    <span>Executing swap on-chain</span>
                  </div>

                  <div className={cn("flex items-center gap-2",
                    status === "completed" ? "text-slate-300" : "text-slate-500 opacity-50"
                  )}>
                    <span className={cn("h-1.5 w-1.5 rounded-full",
                      status === "completed" ? "bg-emerald-400" : "bg-slate-700"
                    )} />
                    <span>Swap completed</span>
                  </div>
                </div>

                {error && (
                  <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 leading-normal font-sans">
                    Error: {error}
                  </div>
                )}

                {txHash && (
                  <div className="flex justify-between items-center text-[10px] text-slate-500 pt-2 border-t border-white/5">
                    <span>Transaction Hash</span>
                    <a
                      href={`https://testnet.arcscan.app/tx/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-400 hover:text-white flex items-center gap-1 transition-all font-mono"
                    >
                      {txHash.slice(0, 8)}...{txHash.slice(-6)}{" "}
                      <ExternalLink className="h-3 w-3" />
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
