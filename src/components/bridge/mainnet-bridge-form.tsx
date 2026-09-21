"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowDownUp,
  CheckCircle2,
  ExternalLink,
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
}> = [
  { name: "Arc Mainnet", enabled: true, logo: "/chains/arc.png" },
  { name: "Base Mainnet", enabled: true, logo: "/chains/base.png" },
  { name: "Arbitrum One", enabled: false, tag: "Coming Soon", logo: "/chains/arbitrum.png" },
];

export function MainnetBridgeForm() {
  const { address, isConnected } = useAccount();
  const { connectors, connect } = useConnect();
  const availableConnector = connectors[0];

  const [sourceChain, setSourceChain] = useState<MainnetChainKey>("Arc Mainnet");
  const [destinationChain, setDestinationChain] = useState<MainnetChainKey>("Base Mainnet");
  const [amount, setAmount] = useState<string>("");
  const [recipientAddress, setRecipientAddress] = useState<string>("");

  const {
    status,
    burnTxHash,
    mintTxHash,
    sourceBalance,
    destBalance,
    isLoadingBalance,
    error,
    refreshBalances,
    resetBridgeState,
    startSourceBridgeFlow,
    completeDestinationMint,
  } = useMainnetBridge();

  useEffect(() => {
    if (address && !recipientAddress) {
      setRecipientAddress(address);
    }
  }, [address, recipientAddress]);

  useEffect(() => {
    refreshBalances(sourceChain, destinationChain);
  }, [sourceChain, destinationChain, refreshBalances]);

  const parsedAmount = parseFloat(amount || "0");
  const parsedSourceBalance = parseFloat(sourceBalance || "0");
  const isAmountValid = !isNaN(parsedAmount) && parsedAmount >= 0.01;
  const isOverBalance = isAmountValid && parsedAmount > parsedSourceBalance;
  const isRecipientValid = recipientAddress ? isAddress(recipientAddress.trim()) : false;
  const isRouteAllowed = isMainnetRouteEnabled(sourceChain, destinationChain);

  const isFormInvalid =
    !isAmountValid ||
    isOverBalance ||
    !isRecipientValid ||
    !isRouteAllowed ||
    sourceChain === destinationChain;

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

  const currentSourceConfig = MAINNET_CHAINS[sourceChain];
  const currentDestConfig = MAINNET_CHAINS[destinationChain];

  return (
    <Card className="border border-white/10 bg-[#060f24]/70 backdrop-blur-xl shadow-2xl relative overflow-hidden">
      {/* Glow Effect */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-emerald-500/10 via-blue-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />

      <CardHeader className="border-b border-white/5 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                Arc Mainnet Bridge
              </CardTitle>
              <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5">
                Circle CCTP V2
              </Badge>
            </div>
            <CardDescription className="text-xs text-slate-400">
              Direct, non-custodial cross-chain USDC transfer between Arc Mainnet and Base Mainnet.
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refreshBalances(sourceChain, destinationChain)}
            disabled={isLoadingBalance}
            className="h-8 px-2.5 text-xs text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all"
          >
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isLoadingBalance && "animate-spin text-emerald-400")} />
            Refresh Balances
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-6 space-y-6">
        {/* Network Selection Row */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-center">
          {/* Source Network */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Source Network
            </label>
            <select
              value={sourceChain}
              onChange={(e) => setSourceChain(e.target.value as MainnetChainKey)}
              disabled={status !== "idle" && status !== "complete" && status !== "failed"}
              className="w-full bg-[#070e1c] border border-white/10 rounded-xl px-3.5 py-3 text-sm text-white font-medium focus:outline-none focus:border-emerald-500 transition-all cursor-pointer"
            >
              {SELECTABLE_CHAINS.map((c) => (
                <option key={c.name} value={c.name} disabled={!c.enabled}>
                  {c.name} {c.tag ? `(${c.tag})` : ""}
                </option>
              ))}
            </select>
            <div className="flex justify-between items-center text-[11px] text-slate-400 px-1 font-mono">
              <span>Domain {currentSourceConfig.domain}</span>
              <span>
                Balance:{" "}
                <span className="text-slate-200 font-semibold">
                  {isLoadingBalance ? "..." : `${sourceBalance} USDC`}
                </span>
              </span>
            </div>
          </div>

          {/* Swap Chains Button */}
          <div className="flex md:pt-6 justify-center">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleSwapChains}
              disabled={status !== "idle" && status !== "complete" && status !== "failed"}
              className="h-10 w-10 rounded-xl border-white/10 bg-[#0a1532] hover:bg-[#12214d] text-slate-300 hover:text-white transition-all shadow-md"
              title="Swap networks"
            >
              <ArrowDownUp className="h-4 w-4" />
            </Button>
          </div>

          {/* Destination Network */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Destination Network
            </label>
            <select
              value={destinationChain}
              onChange={(e) => setDestinationChain(e.target.value as MainnetChainKey)}
              disabled={status !== "idle" && status !== "complete" && status !== "failed"}
              className="w-full bg-[#070e1c] border border-white/10 rounded-xl px-3.5 py-3 text-sm text-white font-medium focus:outline-none focus:border-emerald-500 transition-all cursor-pointer"
            >
              {SELECTABLE_CHAINS.map((c) => (
                <option key={c.name} value={c.name} disabled={!c.enabled}>
                  {c.name} {c.tag ? `(${c.tag})` : ""}
                </option>
              ))}
            </select>
            <div className="flex justify-between items-center text-[11px] text-slate-400 px-1 font-mono">
              <span>Domain {currentDestConfig.domain}</span>
              <span>
                Balance:{" "}
                <span className="text-slate-200 font-semibold">
                  {isLoadingBalance ? "..." : `${destBalance} USDC`}
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* Disabled Route Warning */}
        {!isRouteAllowed && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-300 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Arbitrum route is architected but currently disabled. Production bridging is currently enabled for Arc Mainnet ↔ Base Mainnet.
            </span>
          </div>
        )}

        {/* Amount Input */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs">
            <label className="font-semibold text-slate-400 uppercase tracking-wider">
              Transfer Amount (USDC)
            </label>
            <button
              type="button"
              onClick={handleMaxClick}
              disabled={status !== "idle" && status !== "complete" && status !== "failed"}
              className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold transition-colors"
            >
              USE MAX
            </button>
          </div>
          <div className="relative">
            <input
              type="number"
              step="any"
              min="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAmount(e.target.value)}
              disabled={status !== "idle" && status !== "complete" && status !== "failed"}
              className="w-full bg-[#070e1c] border border-white/10 rounded-xl px-4 py-3.5 text-lg font-bold text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-all"
            />
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 font-mono">
              USDC
            </div>
          </div>
          {isOverBalance && (
            <p className="text-[11px] text-rose-400 font-medium">
              Insufficient balance on {sourceChain}. (Available: {sourceBalance} USDC)
            </p>
          )}
        </div>

        {/* Recipient Address */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex justify-between items-center">
            <span>Destination Recipient Address</span>
            <span className="text-[10px] text-slate-500 lowercase">left-padded to 32 bytes</span>
          </label>
          <input
            type="text"
            placeholder="0x..."
            value={recipientAddress}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRecipientAddress(e.target.value)}
            disabled={status !== "idle" && status !== "complete" && status !== "failed"}
            className="w-full bg-[#070e1c] border border-white/10 rounded-xl px-4 py-3 text-xs font-mono text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-all"
          />
          {recipientAddress && !isRecipientValid && (
            <p className="text-[11px] text-rose-400 font-medium">
              Invalid EVM address format. Must be a valid 20-byte hex address.
            </p>
          )}
        </div>

        {/* Route Details Panel */}
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 space-y-2 text-xs font-mono">
          <div className="flex justify-between text-slate-400">
            <span>Protocol:</span>
            <span className="text-slate-200">Circle CCTP V2 (1:1 Native Burn/Mint)</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Source Spender:</span>
            <span className="text-slate-300 font-mono text-[11px]">
              TokenMessengerV2 ({currentSourceConfig.tokenMessengerV2.slice(0, 8)}...{currentSourceConfig.tokenMessengerV2.slice(-6)})
            </span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Destination Mint:</span>
            <span className="text-slate-300 font-mono text-[11px]">
              MessageTransmitterV2 ({currentDestConfig.messageTransmitterV2.slice(0, 8)}...{currentDestConfig.messageTransmitterV2.slice(-6)})
            </span>
          </div>
          <div className="flex justify-between text-slate-400 border-t border-white/5 pt-2 mt-1">
            <span>Estimated Time:</span>
            <span className="text-emerald-400 font-sans">~2–8 minutes (Finality + Attestation)</span>
          </div>
        </div>

        {/* Status Stepper (Visible when active or complete) */}
        {status !== "idle" && (
          <div className="rounded-xl border border-white/10 bg-[#070e1c] p-4 space-y-3">
            <div className="flex justify-between items-center text-xs font-semibold border-b border-white/5 pb-2">
              <span className="text-slate-300">Bridge Progress</span>
              <Badge
                className={cn(
                  "text-[10px] px-2 py-0.5 uppercase",
                  status === "complete"
                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                    : status === "failed"
                    ? "bg-rose-500/20 text-rose-400 border-rose-500/30"
                    : "bg-blue-500/20 text-blue-400 border-blue-500/30 animate-pulse"
                )}
              >
                {status.replace("-", " ")}
              </Badge>
            </div>

            <div className="space-y-2 text-xs">
              {/* Step 1: Approval */}
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "h-2 w-2 rounded-full",
                    status === "approving"
                      ? "bg-blue-500 animate-ping"
                      : ["burning", "attesting", "waiting-destination-wallet", "minting", "verifying", "complete"].includes(status)
                      ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                      : "bg-slate-700"
                  )}
                />
                <span className={status === "approving" ? "text-white font-medium" : "text-slate-400"}>
                  1. Authorize TokenMessengerV2 on {sourceChain}
                </span>
              </div>

              {/* Step 2: Burn */}
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "h-2 w-2 rounded-full",
                    status === "burning"
                      ? "bg-blue-500 animate-ping"
                      : ["attesting", "waiting-destination-wallet", "minting", "verifying", "complete"].includes(status)
                      ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                      : "bg-slate-700"
                  )}
                />
                <span className={status === "burning" ? "text-white font-medium" : "text-slate-400"}>
                  2. Deposit for burn on {sourceChain}
                </span>
              </div>

              {/* Step 3: Attestation */}
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "h-2 w-2 rounded-full",
                    status === "attesting"
                      ? "bg-amber-500 animate-ping"
                      : ["waiting-destination-wallet", "minting", "verifying", "complete"].includes(status)
                      ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                      : "bg-slate-700"
                  )}
                />
                <span className={status === "attesting" ? "text-white font-medium" : "text-slate-400"}>
                  3. Query Circle Production Iris Attestation
                </span>
              </div>

              {/* Step 4: Mint */}
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "h-2 w-2 rounded-full",
                    status === "minting" || status === "waiting-destination-wallet"
                      ? "bg-purple-500 animate-ping"
                      : ["verifying", "complete"].includes(status)
                      ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                      : "bg-slate-700"
                  )}
                />
                <span
                  className={
                    status === "minting" || status === "waiting-destination-wallet"
                      ? "text-white font-medium"
                      : "text-slate-400"
                  }
                >
                  4. Receive & Mint USDC on {destinationChain}
                </span>
              </div>

              {/* Step 5: Verification */}
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "h-2 w-2 rounded-full",
                    status === "verifying"
                      ? "bg-emerald-400 animate-ping"
                      : status === "complete"
                      ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                      : "bg-slate-700"
                  )}
                />
                <span className={status === "complete" ? "text-emerald-400 font-bold" : "text-slate-400"}>
                  5. Destination balance verified on-chain
                </span>
              </div>
            </div>

            {/* Transaction Links */}
            {(burnTxHash || mintTxHash) && (
              <div className="border-t border-white/5 pt-2.5 space-y-1.5 text-[11px] font-mono">
                {burnTxHash && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Source Burn Tx:</span>
                    <a
                      href={getMainnetExplorerTxUrl(sourceChain, burnTxHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-semibold"
                    >
                      {burnTxHash.slice(0, 8)}...{burnTxHash.slice(-6)}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
                {mintTxHash && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Destination Mint Tx:</span>
                    <a
                      href={getMainnetExplorerTxUrl(destinationChain, mintTxHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-semibold"
                    >
                      {mintTxHash.slice(0, 8)}...{mintTxHash.slice(-6)}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-2.5 text-xs text-rose-400 leading-relaxed font-sans">
                {error}
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        {!isConnected ? (
          <Button
            type="button"
            onClick={() => availableConnector && connect({ connector: availableConnector })}
            className="w-full h-12 rounded-xl bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 text-white font-bold text-sm shadow-lg shadow-emerald-500/20"
          >
            <Wallet className="h-4 w-4 mr-2" /> Connect Wallet
          </Button>
        ) : status === "waiting-destination-wallet" ? (
          <Button
            type="button"
            onClick={() =>
              completeDestinationMint({
                sourceChain,
                destinationChain,
                amount,
                recipientAddress: recipientAddress as `0x${string}`,
              })
            }
            className="w-full h-12 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold text-sm shadow-lg shadow-purple-500/20 animate-pulse"
          >
            Switch to {destinationChain} & Complete Mint
          </Button>
        ) : status === "complete" ? (
          <Button
            type="button"
            onClick={resetBridgeState}
            className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-500/20"
          >
            <CheckCircle2 className="h-4 w-4 mr-2" /> Bridge Another Amount
          </Button>
        ) : (
          <Button
            type="button"
            disabled={isFormInvalid || status !== "idle"}
            onClick={() =>
              startSourceBridgeFlow({
                sourceChain,
                destinationChain,
                amount,
                recipientAddress: recipientAddress as `0x${string}`,
              })
            }
            className={cn(
              "w-full h-12 rounded-xl font-bold text-sm transition-all duration-300",
              isFormInvalid || status !== "idle"
                ? "bg-slate-800 text-slate-400 cursor-not-allowed"
                : "bg-gradient-to-r from-emerald-600 via-teal-600 to-blue-600 hover:from-emerald-500 hover:via-teal-500 hover:to-blue-500 text-white shadow-lg shadow-emerald-500/25"
            )}
          >
            {status === "approving" ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Authorizing USDC in Wallet...
              </span>
            ) : status === "burning" ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Burning on {sourceChain}...
              </span>
            ) : status === "attesting" ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Awaiting Circle Attestation...
              </span>
            ) : status === "minting" ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Minting on {destinationChain}...
              </span>
            ) : status === "verifying" ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Verifying Destination Balance...
              </span>
            ) : !isRouteAllowed ? (
              "Arbitrum Route Coming Soon"
            ) : isOverBalance ? (
              "Insufficient USDC Balance"
            ) : !isAmountValid ? (
              "Enter USDC Amount (Min 0.01)"
            ) : (
              `Bridge ${amount} USDC (${sourceChain} → ${destinationChain})`
            )}
          </Button>
        )}

        {/* Non-custodial Security Guarantee */}
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 text-center">
          <Lock className="h-3 w-3 text-slate-500" />
          <span>Non-custodial transfer via Circle CCTP V2 official smart contracts.</span>
        </div>
      </CardContent>
    </Card>
  );
}
