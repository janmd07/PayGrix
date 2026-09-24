"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Coins,
  ExternalLink,
  Globe,
  Loader2,
  Lock,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAccount, useConnect } from "wagmi";
import {
  MainnetChainKey,
  MAINNET_CHAINS,
  isMainnetRouteEnabled,
  getMainnetExplorerTxUrl,
} from "@/config/cctp-mainnet";
import { useMainnetBridge } from "@/hooks/use-mainnet-bridge";
import { isAddress } from "viem";

const SELECTABLE_CHAINS: Array<{
  name: MainnetChainKey;
  enabled: boolean;
  tag?: string;
  logo: string;
  dotColor: string;
  dotShadow: string;
}> = [
  {
    name: "Arc Mainnet",
    enabled: true,
    logo: "/chains/arc.png",
    dotColor: "bg-blue-400",
    dotShadow: "shadow-[0_0_8px_rgba(96,165,250,0.5)]",
  },
  {
    name: "Base Mainnet",
    enabled: true,
    logo: "/chains/base.png",
    dotColor: "bg-emerald-400",
    dotShadow: "shadow-[0_0_8px_rgba(52,211,153,0.5)]",
  },
  {
    name: "Arbitrum One",
    enabled: false,
    tag: "Coming Soon",
    logo: "/chains/arbitrum.png",
    dotColor: "bg-purple-400",
    dotShadow: "shadow-[0_0_8px_rgba(192,132,252,0.5)]",
  },
];

export function MainnetBridgeForm() {
  const { address, isConnected } = useAccount();
  const { connectors, connect } = useConnect();
  const availableConnector = connectors[0];

  const [sourceChain, setSourceChain] = useState<MainnetChainKey>("Arc Mainnet");
  const [destinationChain, setDestinationChain] = useState<MainnetChainKey>("Base Mainnet");
  const [amount, setAmount] = useState<string>("");
  const [recipientAddress, setRecipientAddress] = useState<string>("");
  const [isCustomRecipientOpen, setIsCustomRecipientOpen] = useState<boolean>(false);
  const [activeDropdown, setActiveDropdown] = useState<"source" | "destination" | null>(null);
  const [failedLogos, setFailedLogos] = useState<Record<string, boolean>>({});

  const {
    status,
    burnTxHash,
    mintTxHash,
    sourceBalance,
    destBalance,
    isLoadingBalance,
    error,
    pendingTransfers,
    refreshBalances,
    resetBridgeState,
    startSourceBridgeFlow,
    resumeExistingTransfer,
    completeDestinationMint,
  } = useMainnetBridge();

  const [manualRecoveryTx, setManualRecoveryTx] = useState<string>("");
  const [isRecovering, setIsRecovering] = useState<boolean>(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  useEffect(() => {
    setRecipientAddress(address || "");
    setIsCustomRecipientOpen(false);
  }, [address]);

  useEffect(() => {
    refreshBalances(sourceChain, destinationChain);
  }, [sourceChain, destinationChain, refreshBalances]);

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

  const isSameChain = sourceChain === destinationChain;
  const parsedAmount = parseFloat(amount || "0");
  const parsedSourceBalance = parseFloat(sourceBalance || "0");
  const isValidAmount = amount !== "" && !isNaN(parsedAmount) && parsedAmount >= 0.01;
  const isOverBalance = isValidAmount && !isNaN(parsedSourceBalance) && parsedAmount > parsedSourceBalance;
  const effectiveRecipient = (isCustomRecipientOpen ? recipientAddress : (address || recipientAddress || "")).trim();
  const isRecipientValid = effectiveRecipient !== "" && isAddress(effectiveRecipient);
  const isRouteAllowed = isMainnetRouteEnabled(sourceChain, destinationChain);

  const isFormInvalid =
    !isValidAmount ||
    isOverBalance ||
    !isRecipientValid ||
    !isRouteAllowed ||
    isSameChain;

  const handleSwapChains = () => {
    if (sourceChain === "Arbitrum One" || destinationChain === "Arbitrum One") return;
    const temp = sourceChain;
    setSourceChain(destinationChain);
    setDestinationChain(temp);
  };

  const handleMaxClick = () => {
    if (sourceBalance && parseFloat(sourceBalance) > 0) {
      setAmount(sourceBalance);
    }
  };

  const handleToggleCustomRecipient = () => {
    if (isSelectDisabled) return;
    if (isCustomRecipientOpen) {
      setIsCustomRecipientOpen(false);
      setRecipientAddress(address || "");
    } else {
      setIsCustomRecipientOpen(true);
    }
  };

  const currentSourceConfig = MAINNET_CHAINS[sourceChain];
  const currentDestConfig = MAINNET_CHAINS[destinationChain];
  const isSelectDisabled = status !== "idle" && status !== "complete" && status !== "failed";

  const renderChainSelector = (
    value: MainnetChainKey,
    onChangeHandler: (val: MainnetChainKey) => void,
    type: "source" | "destination"
  ) => {
    const isOpen = activeDropdown === type;
    const hasFailed = failedLogos[value];
    const chainItem = SELECTABLE_CHAINS.find((c) => c.name === value);
    const logoUrl = chainItem?.logo;

    const handleSelectChain = (c: MainnetChainKey) => {
      onChangeHandler(c);
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
            <div
              className={cn(
                "h-2 w-2 rounded-full mr-2 shrink-0 ml-1.5",
                chainItem?.dotColor || "bg-blue-400",
                chainItem?.dotShadow || "shadow-[0_0_8px_rgba(96,165,250,0.5)]"
              )}
            />
          )}
          <span className="font-bold text-xs tracking-wider uppercase text-slate-200">{value}</span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-slate-400 shrink-0 ml-1.5 transition-transform duration-200",
              isOpen && "rotate-180 text-white"
            )}
          />
        </button>

        {isOpen && (
          <div
            role="listbox"
            className="absolute top-full mt-2 left-0 z-50 min-w-[220px] bg-[#070f21] border border-white/10 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] p-1.5 animate-in fade-in slide-in-from-top-1 duration-100"
          >
            {SELECTABLE_CHAINS.map((c) => {
              const isOptionSelected = c.name === value;
              const optionHasFailed = failedLogos[c.name];
              const optionLogoUrl = c.logo;

              return (
                <div
                  key={c.name}
                  role="option"
                  aria-selected={isOptionSelected}
                  aria-disabled={!c.enabled}
                  tabIndex={c.enabled ? 0 : -1}
                  onClick={() => {
                    if (!c.enabled) return;
                    handleSelectChain(c.name);
                  }}
                  onKeyDown={(e) => {
                    if (!c.enabled) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleSelectChain(c.name);
                    }
                  }}
                  className={cn(
                    "flex items-center justify-between w-full px-2 py-1.5 text-xs font-semibold rounded-lg transition-colors select-none outline-none mb-0.5 last:mb-0",
                    !c.enabled
                      ? "opacity-50 cursor-not-allowed text-slate-500"
                      : "text-slate-300 hover:bg-[#0d1b3a] hover:text-white cursor-pointer focus:bg-[#0d1b3a] focus:text-white",
                    isOptionSelected && "bg-[#11244e] text-white font-bold border border-white/5"
                  )}
                >
                  <div className="flex items-center min-w-0">
                    {!optionHasFailed && optionLogoUrl ? (
                      <div className="relative flex items-center justify-center h-6 w-6 rounded-full bg-[#030712] border border-white/10 overflow-hidden mr-2.5 shrink-0">
                        <Image
                          src={optionLogoUrl}
                          alt={c.name}
                          width={24}
                          height={24}
                          className="h-full w-full object-contain"
                          onError={() => {
                            setFailedLogos((prev) => ({ ...prev, [c.name]: true }));
                          }}
                        />
                      </div>
                    ) : (
                      <div
                        className={cn(
                          "h-2 w-2 rounded-full mr-2.5 shrink-0 ml-2",
                          c.dotColor,
                          c.dotShadow
                        )}
                      />
                    )}
                    <span className="tracking-wide text-slate-200 truncate">{c.name}</span>
                  </div>
                  {c.tag && (
                    <span className="ml-2 text-[10px] bg-white/5 border border-white/10 text-slate-400 px-1.5 py-0.5 rounded font-mono shrink-0">
                      {c.tag}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const getButtonContent = () => {
    if (!isConnected) {
      return (
        <span className="flex items-center justify-center gap-2">
          <Wallet className="h-4 w-4" /> Connect EVM Wallet
        </span>
      );
    }
    if (status === "ReadyToClaim") {
      return (
        <span className="flex items-center justify-center gap-2">
          <CheckCircle2 className="h-4 w-4" /> Claim Transfer
        </span>
      );
    }
    if (status === "complete") {
      return (
        <span className="flex items-center justify-center gap-2">
          <CheckCircle2 className="h-4 w-4" /> Bridge Another Amount
        </span>
      );
    }
    if (status === "ReconciliationRequired") {
      return (
        <span className="flex items-center justify-center gap-2">
          <RefreshCw className="h-4 w-4" /> Reconcile Consumed Transfer
        </span>
      );
    }
    if (status === "approving") {
      return (
        <span className="flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Authorizing TokenMessengerV2 in Wallet...
        </span>
      );
    }
    if (status === "burning") {
      return (
        <span className="flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Burning USDC on {sourceChain}...
        </span>
      );
    }
    if (status === "attesting") {
      return (
        <span className="flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Awaiting Circle Iris Attestation...
        </span>
      );
    }
    if (status === "minting") {
      return (
        <span className="flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Minting USDC on {destinationChain}...
        </span>
      );
    }
    if (status === "verifying") {
      return (
        <span className="flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Verifying Destination Balance...
        </span>
      );
    }
    if (!isRouteAllowed) return "Arbitrum Route Coming Soon";
    if (isSameChain) return "Invalid Route (Same Chain)";
    if (isOverBalance) return "Insufficient USDC Balance";
    if (!isValidAmount) return "Enter USDC Amount (Min 0.01)";
    if (!isRecipientValid) return "Enter Valid Destination Recipient";
    return `Bridge ${amount} USDC (${sourceChain} → ${destinationChain})`;
  };

  return (
    <div className="space-y-6">
      <Card className="border border-white/10 bg-[#060f24]/60 backdrop-blur-lg relative overflow-hidden shadow-[0_8px_32px_rgba(6,15,36,0.5)] w-full max-w-[500px] mx-auto">
        {/* Elegant top gradient accent line */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />

        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
              <Coins className="h-5 w-5 text-indigo-400 animate-pulse" />
              Bridge USDC
            </CardTitle>
            <Badge
              variant="outline"
              className="text-[10px] bg-emerald-500/10 border-emerald-500/30 text-emerald-300 font-mono"
            >
              Circle CCTP V2
            </Badge>
          </div>
          <CardDescription className="text-xs text-slate-400">
            Direct, non-custodial cross-chain USDC transfer between Arc &amp; Base mainnets.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="w-full space-y-4">
            {/* Top row: Refresh balances */}
            <div className="flex justify-end items-center gap-2 pr-1">
              <button
                type="button"
                onClick={() => refreshBalances(sourceChain, destinationChain)}
                disabled={isLoadingBalance || isSelectDisabled}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-slate-400 hover:text-white text-xs transition-all disabled:opacity-40 cursor-pointer"
                title="Refresh balances"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", isLoadingBalance && "animate-spin text-emerald-400")} />
                <span className="text-[11px] font-medium">Refresh Balances</span>
              </button>
            </div>

            {/* Source Card (From) */}
            <div
              className={cn(
                "bg-[#070e1c] border rounded-2xl p-5 space-y-4 transition-all duration-200",
                isOverBalance
                  ? "border-rose-500/30 bg-rose-500/5 focus-within:border-rose-500/50"
                  : "border-white/5 focus-within:border-primary/30"
              )}
            >
              <div className="flex justify-between items-center text-xs">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">From</span>
                <div className="flex items-center gap-1.5 text-slate-500 font-mono">
                  <span>Balance:</span>
                  {isLoadingBalance ? (
                    <span className="h-3 w-12 animate-pulse rounded bg-white/10" />
                  ) : (
                    <span className="text-slate-300 font-semibold">
                      {sourceBalance ? parseFloat(sourceBalance).toFixed(2) : "0.00"}
                    </span>
                  )}
                  <span>USDC</span>
                  <button
                    type="button"
                    onClick={handleMaxClick}
                    disabled={isLoadingBalance || parseFloat(sourceBalance || "0") <= 0 || isSelectDisabled}
                    className="ml-1.5 text-[10px] font-bold border px-1.5 py-0.5 rounded transition-all disabled:opacity-40 text-primary hover:text-white hover:bg-primary/10 border-primary/20 cursor-pointer"
                  >
                    MAX
                  </button>
                </div>
              </div>

              <div className="flex justify-between items-center gap-3">
                {renderChainSelector(sourceChain, setSourceChain, "source")}

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
                    <Image
                      src="/tokens/usdc.png"
                      alt="USDC"
                      width={20}
                      height={20}
                      className="w-5 h-5 object-contain bg-transparent"
                    />
                    <span className="text-xs font-bold text-slate-200">USDC</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Circular Bridge Route Swap Button */}
            <div className="flex justify-center -my-3.5 relative z-10">
              <button
                type="button"
                onClick={handleSwapChains}
                disabled={isSelectDisabled}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[#070f21] border border-white/8 text-slate-400 hover:bg-white/[0.04] hover:text-white hover:border-primary/40 hover:shadow-[0_0_15px_rgba(79,70,229,0.4)] transition-all duration-200 cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Swap chains"
              >
                <Globe className="h-4 w-4 text-primary animate-pulse" />
              </button>
            </div>

            {/* Destination Card (To) */}
            <div className="bg-[#070e1c] border border-white/5 rounded-2xl p-5 space-y-4 transition-all duration-200">
              <div className="flex justify-between items-center text-xs">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">To</span>
                <div className="flex items-center gap-1.5 text-slate-500 font-mono">
                  <span>Balance:</span>
                  {isLoadingBalance ? (
                    <span className="h-3 w-12 animate-pulse rounded bg-white/10" />
                  ) : (
                    <span className="text-slate-300 font-semibold">
                      {destBalance ? parseFloat(destBalance).toFixed(2) : "0.00"}
                    </span>
                  )}
                  <span>USDC</span>
                </div>
              </div>

              <div className="flex justify-between items-center gap-3">
                {renderChainSelector(destinationChain, setDestinationChain, "destination")}

                <div className="flex items-center gap-2.5 flex-1 justify-end">
                  <span className="text-2xl font-bold font-mono text-slate-400 text-right w-full block truncate">
                    {amount && parseFloat(amount) > 0
                      ? parseFloat(amount).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 6,
                        })
                      : "0.00"}
                  </span>
                  <div className="flex items-center gap-1.5 bg-white/5 border border-white/8 rounded-full px-2.5 py-1 select-none shrink-0">
                    <Image
                      src="/tokens/usdc.png"
                      alt="USDC"
                      width={20}
                      height={20}
                      className="w-5 h-5 object-contain bg-transparent"
                    />
                    <span className="text-xs font-bold text-slate-200">USDC</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Destination Recipient Section (Collapsed by Default) */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleToggleCustomRecipient}
                disabled={isSelectDisabled}
                className={cn(
                  "flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer select-none py-0.5 group",
                  isSelectDisabled && "opacity-50 cursor-not-allowed"
                )}
              >
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 text-slate-500 group-hover:text-white transition-transform duration-200",
                    isCustomRecipientOpen && "rotate-180 text-white"
                  )}
                />
                <span className="font-medium">Send to a different address</span>
                {!isCustomRecipientOpen && address && (
                  <span className="text-[11px] text-slate-500 font-mono ml-1">
                    (Default: {address.slice(0, 6)}...{address.slice(-4)})
                  </span>
                )}
              </button>

              {isCustomRecipientOpen && (
                <div className="rounded-xl border border-white/5 bg-[#070e1c]/40 p-3.5 space-y-2 animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="flex justify-between items-center text-xs">
                    <label
                      htmlFor="mainnet-recipient-input"
                      className="font-semibold text-slate-200 flex items-center gap-1.5"
                    >
                      <Wallet className="h-3.5 w-3.5 text-indigo-400" />
                      Destination Recipient
                    </label>
                    <span className="text-[10px] text-slate-500 font-mono">left-padded to 32 bytes</span>
                  </div>
                  <input
                    id="mainnet-recipient-input"
                    type="text"
                    placeholder="0x..."
                    value={recipientAddress}
                    onChange={(e) => setRecipientAddress(e.target.value)}
                    disabled={isSelectDisabled}
                    className="w-full bg-[#040814]/80 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-primary/50 transition-all"
                  />
                  {recipientAddress && !isRecipientValid ? (
                    <p className="text-[10.5px] text-rose-400">
                      Invalid EVM address format. Must be a valid 20-byte hex address.
                    </p>
                  ) : recipientAddress && isRecipientValid ? (
                    <p className="text-[10.5px] text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Valid destination address on {destinationChain}.
                    </p>
                  ) : (
                    <p className="text-[10.5px] text-slate-500">Enter custom recipient 0x address.</p>
                  )}
                </div>
              )}
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
                <span>
                  Insufficient balance. Enter an amount lower than or equal to{" "}
                  {parseFloat(sourceBalance || "0").toFixed(2)} USDC.
                </span>
              </div>
            )}

            {!isRouteAllowed && (
              <div className="flex items-start gap-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3.5 text-xs text-amber-400 leading-normal">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Arbitrum route is architected but currently disabled. Production bridging is currently enabled for Arc
                  Mainnet ↔ Base Mainnet.
                </span>
              </div>
            )}

            {/* Route Details Panel */}
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4.5 space-y-3 text-xs">
              <div className="flex justify-between items-center border-b border-white/5 pb-2">
                <span className="font-semibold text-slate-300">Route Info</span>
                <span className="text-emerald-400 font-mono text-[10px] bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" /> CCTP V2 Active
                </span>
              </div>

              <div className="space-y-2 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Route:</span>
                  <span className="text-white font-medium">
                    {sourceChain} (Domain {currentSourceConfig.domain}) → {destinationChain} (Domain{" "}
                    {currentDestConfig.domain})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Asset:</span>
                  <span className="text-white font-medium">USDC</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Protocol:</span>
                  <span className="text-slate-300 font-sans">Circle CCTP V2 (1:1 Burn/Mint)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">TokenMessengerV2:</span>
                  <span className="text-slate-300 font-mono text-[11px]">
                    {currentSourceConfig.tokenMessengerV2.slice(0, 6)}...{currentSourceConfig.tokenMessengerV2.slice(-4)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">MessageTransmitterV2:</span>
                  <span className="text-slate-300 font-mono text-[11px]">
                    {currentDestConfig.messageTransmitterV2.slice(0, 6)}...
                    {currentDestConfig.messageTransmitterV2.slice(-4)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Rate:</span>
                  <span className="text-white font-medium">1:1 (No Slippage)</span>
                </div>
                <div className="flex justify-between border-t border-white/5 pt-2 mt-1 font-sans">
                  <span className="text-slate-400">Est. Time:</span>
                  <span className="text-emerald-400 font-sans font-medium">
                    ~2–8 minutes (Finality + Attestation)
                  </span>
                </div>
              </div>
            </div>

            {/* Double-burn Prevention Warning Banner */}
            {pendingTransfers.length > 0 && status === "idle" && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3.5 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <span className="font-semibold text-amber-300 block">
                    Active Transfer Detected ({pendingTransfers.length})
                  </span>
                  <span className="text-slate-400 block leading-relaxed">
                    You have an existing in-flight transfer. To prevent double-burning USDC, claim or resume your transfer below before bridging again.
                  </span>
                </div>
              </div>
            )}

            {/* Action Button */}
            <Button
              type="button"
              disabled={
                !isConnected
                  ? false
                  : status === "ReadyToClaim"
                  ? false
                  : status === "complete"
                  ? false
                  : status === "ReconciliationRequired"
                  ? false
                  : isFormInvalid || status !== "idle"
              }
              onClick={() => {
                if (!isConnected) {
                  if (availableConnector) {
                    connect({ connector: availableConnector });
                  } else {
                    alert("Please connect your EVM wallet.");
                  }
                  return;
                }
                if (status === "ReadyToClaim") {
                  completeDestinationMint({
                    sourceChain,
                    destinationChain,
                    amount,
                    recipientAddress: effectiveRecipient as `0x${string}`,
                  });
                  return;
                }
                if (status === "complete") {
                  resetBridgeState();
                  return;
                }
                if (status === "ReconciliationRequired") {
                  if (burnTxHash) {
                    resumeExistingTransfer(burnTxHash as `0x${string}`);
                  }
                  return;
                }
                if (isFormInvalid || status !== "idle") return;

                startSourceBridgeFlow({
                  sourceChain,
                  destinationChain,
                  amount,
                  recipientAddress: effectiveRecipient as `0x${string}`,
                });
              }}
              className={cn(
                "w-full h-12 text-sm font-bold text-white rounded-xl shadow-[0_4px_20px_rgba(79,70,229,0.3)] transition-all duration-300 cursor-pointer disabled:opacity-50 disabled:from-slate-800 disabled:via-slate-800 disabled:to-slate-800 disabled:text-slate-200 disabled:shadow-none disabled:cursor-not-allowed",
                status === "ReadyToClaim"
                  ? "bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 animate-pulse shadow-[0_4px_20px_rgba(168,85,247,0.3)]"
                  : status === "complete"
                  ? "bg-emerald-600 hover:bg-emerald-500 shadow-[0_4px_20px_rgba(16,185,129,0.3)]"
                  : status === "ReconciliationRequired"
                  ? "bg-amber-600 hover:bg-amber-500 shadow-[0_4px_20px_rgba(245,158,11,0.3)]"
                  : !isConnected || !isFormInvalid
                  ? "bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:via-indigo-500 hover:to-purple-500"
                  : "bg-slate-800 text-slate-400"
              )}
              style={{ textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}
            >
              {getButtonContent()}
            </Button>

            {/* Status Section */}
            {status !== "idle" && (
              <div className="border-t border-white/5 pt-4 mt-2 space-y-3">
                <div className="text-xs font-semibold text-slate-400 mb-1 flex items-center justify-between">
                  <span>Bridge Status</span>
                  {status === "failed" && (
                    <Badge
                      variant="secondary"
                      className="text-[10px] py-0 px-2 bg-rose-500/10 border border-rose-500/20 text-rose-400"
                    >
                      Failed
                    </Badge>
                  )}
                  {status === "complete" && (
                    <Badge
                      variant="outline"
                      className="text-[10px] py-0 px-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-semibold"
                    >
                      Completed
                    </Badge>
                  )}
                  {status === "ReconciliationRequired" && (
                    <Badge
                      variant="outline"
                      className="text-[10px] py-0 px-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 font-semibold"
                    >
                      Reconciliation Required
                    </Badge>
                  )}
                  {["approving", "burning", "attesting", "ReadyToClaim", "minting", "verifying"].includes(
                    status
                  ) && (
                    <Badge className="text-[10px] py-0 px-2 bg-blue-500/20 text-blue-400 border border-blue-500/30 animate-pulse font-mono">
                      {status === "ReadyToClaim" ? "READY TO CLAIM" : status.toUpperCase()}
                    </Badge>
                  )}
                </div>

                <div className="space-y-2 bg-[#070e1c]/40 border border-white/5 rounded-xl p-3.5">
                  {/* Step 1: Authorization */}
                  <div
                    className={cn(
                      "flex items-center gap-2 text-xs",
                      [
                        "approving",
                        "burning",
                        "attesting",
                        "ReadyToClaim",
                        "minting",
                        "verifying",
                        "complete",
                      ].includes(status)
                        ? "text-slate-300"
                        : "text-slate-500 opacity-50"
                    )}
                  >
                    <div
                      className={cn(
                        "h-2 w-2 rounded-full",
                        status === "approving"
                          ? "bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.6)]"
                          : [
                              "burning",
                              "attesting",
                              "ReadyToClaim",
                              "minting",
                              "verifying",
                              "complete",
                            ].includes(status)
                          ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                          : "bg-slate-600"
                      )}
                    />
                    <span>1. Authorize TokenMessengerV2 on {sourceChain}</span>
                  </div>

                  {/* Step 2: Burn */}
                  <div
                    className={cn(
                      "flex items-center gap-2 text-xs",
                      [
                        "burning",
                        "attesting",
                        "ReadyToClaim",
                        "minting",
                        "verifying",
                        "complete",
                      ].includes(status)
                        ? "text-slate-300"
                        : "text-slate-500 opacity-50"
                    )}
                  >
                    <div
                      className={cn(
                        "h-2 w-2 rounded-full",
                        status === "burning"
                          ? "bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.6)]"
                          : [
                              "attesting",
                              "ReadyToClaim",
                              "minting",
                              "verifying",
                              "complete",
                            ].includes(status)
                          ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                          : "bg-slate-600"
                      )}
                    />
                    <span>2. Deposit for burn on {sourceChain}</span>
                  </div>

                  {/* Step 3: Iris Attestation */}
                  <div
                    className={cn(
                      "flex items-center gap-2 text-xs",
                      ["attesting", "ReadyToClaim", "minting", "verifying", "complete"].includes(status)
                        ? "text-slate-300"
                        : "text-slate-500 opacity-50"
                    )}
                  >
                    <div
                      className={cn(
                        "h-2 w-2 rounded-full",
                        status === "attesting"
                          ? "bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.6)]"
                          : ["ReadyToClaim", "minting", "verifying", "complete"].includes(status)
                          ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                          : "bg-slate-600"
                      )}
                    />
                    <span>3. Query Circle Production Iris Attestation</span>
                  </div>

                  {/* Step 4: Mint */}
                  <div
                    className={cn(
                      "flex items-center gap-2 text-xs",
                      ["ReadyToClaim", "minting", "verifying", "complete"].includes(status)
                        ? "text-slate-300"
                        : "text-slate-500 opacity-50"
                    )}
                  >
                    <div
                      className={cn(
                        "h-2 w-2 rounded-full",
                        status === "ReadyToClaim" || status === "minting"
                          ? "bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.6)]"
                          : ["verifying", "complete"].includes(status)
                          ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                          : "bg-slate-600"
                      )}
                    />
                    <span>4. Receive &amp; Mint USDC on {destinationChain}</span>
                  </div>

                  {/* Step 5: Verification */}
                  <div
                    className={cn(
                      "flex items-center gap-2 text-xs",
                      ["verifying", "complete"].includes(status) ? "text-slate-300" : "text-slate-500 opacity-50"
                    )}
                  >
                    <div
                      className={cn(
                        "h-2 w-2 rounded-full",
                        status === "verifying"
                          ? "bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.6)]"
                          : status === "complete"
                          ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                          : "bg-slate-600"
                      )}
                    />
                    <span>5. Destination balance verified on-chain</span>
                  </div>
                </div>

                {error && (
                  <div className="text-xs text-rose-400 mt-2 bg-rose-500/10 border border-rose-500/20 rounded-lg p-2.5 font-sans leading-normal">
                    Error: {error}
                  </div>
                )}
              </div>
            )}

            {/* Explicit Two-Row Transaction Display */}
            {(burnTxHash ||
              mintTxHash ||
              [
                "burning",
                "attesting",
                "ReadyToClaim",
                "minting",
                "verifying",
                "complete",
              ].includes(status)) && (
              <div className="border-t border-white/5 pt-3 mt-1 flex flex-col gap-2.5 text-xs">
                {/* Source Transaction Row */}
                <div className="flex justify-between items-center bg-white/[0.02] border border-white/5 rounded-xl px-3.5 py-2.5">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] font-medium text-slate-400">Source Transaction</span>
                    <span className="text-xs text-slate-200 font-semibold">{sourceChain}</span>
                  </div>
                  {burnTxHash ? (
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-slate-300">
                        {burnTxHash.slice(0, 8)}...{burnTxHash.slice(-6)}
                      </span>
                      <a
                        href={getMainnetExplorerTxUrl(sourceChain, burnTxHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:text-white flex items-center gap-1 transition-all font-medium text-xs bg-primary/10 hover:bg-primary/20 px-2 py-1 rounded-md"
                      >
                        <span>
                          View on{" "}
                          {sourceChain.includes("Arc")
                            ? "ArcScan"
                            : sourceChain.includes("Base")
                            ? "BaseScan"
                            : "Explorer"}
                        </span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-500 italic">Pending source confirmation</span>
                  )}
                </div>

                {/* Destination Transaction Row */}
                <div className="flex justify-between items-center bg-white/[0.02] border border-white/5 rounded-xl px-3.5 py-2.5">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] font-medium text-slate-400">Destination Transaction</span>
                    <span className="text-xs text-slate-200 font-semibold">{destinationChain}</span>
                  </div>
                  {mintTxHash ? (
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-slate-300">
                        {mintTxHash.slice(0, 8)}...{mintTxHash.slice(-6)}
                      </span>
                      <a
                        href={getMainnetExplorerTxUrl(destinationChain, mintTxHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:text-white flex items-center gap-1 transition-all font-medium text-xs bg-primary/10 hover:bg-primary/20 px-2 py-1 rounded-md"
                      >
                        <span>
                          View on{" "}
                          {destinationChain.includes("Arc")
                            ? "ArcScan"
                            : destinationChain.includes("Base")
                            ? "BaseScan"
                            : "Explorer"}
                        </span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  ) : status === "complete" ? (
                    <span className="text-xs text-emerald-400 font-medium">Completed</span>
                  ) : status === "ReconciliationRequired" ? (
                    <span className="text-xs text-amber-400 font-medium">
                      Destination nonce consumed — reconciliation required
                    </span>
                  ) : status === "burning" ? (
                    <span className="text-xs text-slate-400 italic">
                      Awaiting source burn confirmation
                    </span>
                  ) : status === "attesting" ? (
                    <div className="flex items-center gap-1.5 text-blue-400 text-xs">
                      <Loader2 className="h-3 w-3 animate-spin shrink-0 text-blue-400" />
                      <span>Awaiting Circle Iris attestation</span>
                    </div>
                  ) : status === "ReadyToClaim" ? (
                    <span className="text-xs text-indigo-400 font-medium">
                      Ready for destination claim (switch network)
                    </span>
                  ) : status === "minting" || status === "verifying" ? (
                    <div className="flex items-center gap-1.5 text-amber-400/90 text-xs">
                      <Loader2 className="h-3 w-3 animate-spin text-amber-400 shrink-0" />
                      <span>Destination transaction pending</span>
                    </div>
                  ) : status === "failed" ? (
                    <span className="text-xs text-rose-400 italic">
                      Destination not submitted (source failed or paused)
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500 italic">
                      Pending destination submission
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Non-custodial Security Guarantee */}
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 pt-1">
              <Lock className="h-3 w-3 text-slate-500 shrink-0" />
              <span>Non-custodial transfer via Circle CCTP V2 official smart contracts.</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pending & Recoverable Transfers Section */}
      <Card className="w-full max-w-lg bg-[#040814]/90 border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl rounded-2xl overflow-hidden mt-4">
        <CardHeader className="p-5 pb-3 border-b border-white/5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-primary" />
              <span>Pending &amp; Recoverable Transfers</span>
            </CardTitle>
            <Badge variant="outline" className="text-[10px] text-slate-400 border-white/10">
              CCTP V2 Recovery
            </Badge>
          </div>
          <CardDescription className="text-xs text-slate-400 pt-1">
            Transfers are restored automatically for your connected wallet. You can also manually resume any transaction by hash.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 space-y-4">
          {/* List of active transfers */}
          {pendingTransfers.length === 0 ? (
            <div className="text-center py-4 text-xs text-slate-500 bg-white/[0.01] border border-white/5 rounded-xl">
              No pending transfers detected for this wallet.
            </div>
          ) : (
            <div className="space-y-2.5">
              {pendingTransfers.map((tx) => (
                <div
                  key={tx.id}
                  className="bg-white/[0.02] border border-white/5 hover:border-white/10 rounded-xl p-3 flex flex-col gap-2 transition-all"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-200">
                        {tx.sourceChain} → {tx.destinationChain}
                      </span>
                      <span className="text-emerald-400 font-mono font-medium">
                        {tx.amount} USDC
                      </span>
                    </div>
                    <Badge
                      className={cn(
                        "text-[10px] py-0 px-2 font-mono",
                        tx.status === "ReadyToClaim"
                          ? "bg-purple-500/20 text-purple-300 border border-purple-500/30 animate-pulse"
                          : tx.status === "Attesting"
                          ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                          : tx.status === "ReconciliationRequired"
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          : "bg-slate-500/20 text-slate-400 border border-slate-500/30"
                      )}
                    >
                      {tx.status === "ReconciliationRequired" ? "Reconcile Needed" : tx.status}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <div className="flex items-center gap-1 font-mono">
                      <span>Tx: {tx.burnTxHash.slice(0, 10)}...{tx.burnTxHash.slice(-8)}</span>
                      <a
                        href={getMainnetExplorerTxUrl(tx.sourceChain, tx.burnTxHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:text-white"
                      >
                        <ExternalLink className="h-3 w-3 inline" />
                      </a>
                    </div>

                    <div>
                      {tx.status === "ReadyToClaim" ? (
                        <Button
                          size="sm"
                          className="h-7 text-xs bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-lg px-3 shadow-[0_2px_10px_rgba(168,85,247,0.3)] cursor-pointer"
                          onClick={() => completeDestinationMint({ transferRecord: tx })}
                        >
                          Claim Transfer
                        </Button>
                      ) : tx.status === "ReconciliationRequired" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-amber-500/30 hover:bg-amber-500/10 text-amber-300 rounded-lg px-3 cursor-pointer"
                          onClick={() => resumeExistingTransfer(tx.burnTxHash)}
                        >
                          Reconcile
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-white/10 hover:bg-white/5 text-slate-300 rounded-lg px-3 cursor-pointer"
                          onClick={() => resumeExistingTransfer(tx.burnTxHash)}
                        >
                          Check Status
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Manual Recovery Input */}
          <div className="border-t border-white/5 pt-3.5 space-y-2">
            <span className="text-xs font-semibold text-slate-300 block">
              Recover by Transaction Hash
            </span>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="0x... (Base or Arc burn transaction hash)"
                value={manualRecoveryTx}
                onChange={(e) => {
                  setManualRecoveryTx(e.target.value.trim());
                  setRecoveryError(null);
                }}
                className="flex-1 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-primary font-mono"
              />
              <Button
                type="button"
                disabled={!manualRecoveryTx || isRecovering}
                onClick={async () => {
                  if (!manualRecoveryTx) return;
                  setIsRecovering(true);
                  setRecoveryError(null);
                  try {
                    const ok = await resumeExistingTransfer(manualRecoveryTx);
                    if (ok) {
                      setManualRecoveryTx("");
                    }
                  } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    setRecoveryError(msg);
                  } finally {
                    setIsRecovering(false);
                  }
                }}
                className="h-9 px-4 text-xs font-bold bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 rounded-xl cursor-pointer disabled:opacity-50"
              >
                {isRecovering ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" /> Recovering...
                  </span>
                ) : (
                  "Recover Transfer"
                )}
              </Button>
            </div>

            {recoveryError && (
              <div className="text-[11px] text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg p-2 font-sans">
                {recoveryError}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
