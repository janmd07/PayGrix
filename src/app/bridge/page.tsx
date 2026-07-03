"use client";

import { useState, useEffect } from "react";
import { HelpCircle } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBridgeBalance } from "@/hooks/use-bridge-balance";
import { useBridge } from "@/hooks/use-bridge";
import { useArcWallet } from "@/components/wallet/use-arc-wallet";
import { BalanceCard } from "@/components/bridge/balance-card";
import { BridgeForm } from "@/components/bridge/bridge-form";
import { TransferHistory, BridgeTransfer } from "@/components/bridge/transfer-history";
import { cn } from "@/lib/utils";

// Swap integrations
import { SwapForm } from "@/components/bridge/swap-form";
import { SwapBalanceCard } from "@/components/bridge/swap-balance-card";
import { SwapHistory } from "@/components/bridge/swap-history";
import { useTokenBalance } from "@/hooks/use-token-balance";
import { SwapHistoryItem } from "@/hooks/use-swap";

export default function BridgePage() {
  const [activeTab, setActiveTab] = useState<"bridge" | "swap">("bridge");
  
  // Bridge-specific states and hooks
  const [sourceChain, setSourceChain] = useState<string>("Arc Testnet");
  const [destinationChain, setDestinationChain] = useState<string>("Base Sepolia");
  const [transfers, setTransfers] = useState<BridgeTransfer[]>([]);

  const { address, isConnected } = useArcWallet();
  const { balance, symbol, isLoading, refreshBalance } = useBridgeBalance(sourceChain, address);

  const {
    status: bridgeStatus,
    sourceTxHash,
    destTxHash,
    error: bridgeError,
    bridgeUSDC,
    resetStatus: resetBridgeStatus,
  } = useBridge();

  // Swap-specific states and hooks
  const [swaps, setSwaps] = useState<SwapHistoryItem[]>([]);
  const {
    balance: swapUsdcBalance,
    isLoading: isLoadingUsdc,
    refreshBalance: refreshUsdc,
  } = useTokenBalance("USDC", address);
  const {
    balance: swapEurcBalance,
    isLoading: isLoadingEurc,
    refreshBalance: refreshEurc,
  } = useTokenBalance("EURC", address);

  const handleRefreshSwapBalances = async () => {
    await Promise.all([refreshUsdc(), refreshEurc()]);
  };

  useEffect(() => {
    // Load bridge history
    const savedTransfers = localStorage.getItem("bridge_transfers");
    if (savedTransfers) {
      try {
        setTransfers(JSON.parse(savedTransfers));
      } catch (err) {
        console.error("Error parsing saved transfers:", err);
      }
    }

    // Load swap history
    const savedSwaps = localStorage.getItem("swap_history");
    if (savedSwaps) {
      try {
        setSwaps(JSON.parse(savedSwaps));
      } catch (err) {
        console.error("Error parsing saved swaps:", err);
      }
    }
  }, []);

  const handleBridge = async (amount: string) => {
    try {
      const result = await bridgeUSDC(amount, sourceChain, destinationChain);
      if (result) {
        interface BridgeStep {
          name: string;
          txHash?: string;
        }
        const burnStep = result.steps?.find((s: BridgeStep) => s.name === "burn" || s.name === "execute");
        const mintStep = result.steps?.find((s: BridgeStep) => s.name === "mint" || s.name === "claim");

        const newTransfer: BridgeTransfer = {
          id: Math.random().toString(36).substring(2, 9),
          fromChain: sourceChain,
          toChain: destinationChain,
          amount: amount,
          status: "Completed",
          date: new Date().toLocaleString(),
          sourceTx: burnStep?.txHash || sourceTxHash,
          destTx: mintStep?.txHash || destTxHash,
        };

        const updated = [newTransfer, ...transfers];
        setTransfers(updated);
        localStorage.setItem("bridge_transfers", JSON.stringify(updated));

        // Refresh balance automatically after successful bridge completion
        refreshBalance();
      }
    } catch (err) {
      console.error("Bridge handler error:", err);
    }
  };

  const handleSwapSuccess = (
    amountIn: string,
    amountOut: string,
    tokenIn: "USDC" | "EURC",
    tokenOut: "USDC" | "EURC",
    hash: string
  ) => {
    const newSwap: SwapHistoryItem = {
      id: Math.random().toString(36).substring(2, 9),
      tokenIn,
      tokenOut,
      amountIn,
      amountOut,
      txHash: hash,
      timestamp: new Date().toLocaleString(),
    };

    const updated = [newSwap, ...swaps];
    setSwaps(updated);
    localStorage.setItem("swap_history", JSON.stringify(updated));

    // Refresh balances
    handleRefreshSwapBalances();
    refreshBalance();
  };

  const handleSourceChainChange = (chain: string) => {
    setSourceChain(chain);
    resetBridgeStatus();
  };

  const handleDestinationChainChange = (chain: string) => {
    setDestinationChain(chain);
    resetBridgeStatus();
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="Liquidity & Bridge"
        title="Liquidity Management"
        description="Bridge USDC tokens between networks or swap stablecoins locally on the Arc Testnet."
      />

      {/* Tab Switcher */}
      <div className="flex gap-2 border-b border-white/5 pb-4 mb-6">
        <button
          onClick={() => setActiveTab("bridge")}
          className={cn(
            "px-4 py-2 text-sm font-semibold rounded-lg transition-all",
            activeTab === "bridge"
              ? "bg-primary text-white shadow-lg shadow-primary/20"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          )}
        >
          Bridge USDC
        </button>
        <button
          onClick={() => setActiveTab("swap")}
          className={cn(
            "px-4 py-2 text-sm font-semibold rounded-lg transition-all",
            activeTab === "swap"
              ? "bg-purple-600 text-white shadow-lg shadow-purple-600/20"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          )}
        >
          Swap on Arc
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        {/* Left: Form Widget */}
        <div className="space-y-6">
          {activeTab === "bridge" ? (
            <BridgeForm
              balance={balance}
              symbol={symbol}
              isLoadingBalance={isLoading}
              sourceChain={sourceChain}
              destinationChain={destinationChain}
              onSourceChainChange={handleSourceChainChange}
              onDestinationChainChange={handleDestinationChainChange}
              status={bridgeStatus}
              sourceTxHash={sourceTxHash}
              destTxHash={destTxHash}
              error={bridgeError}
              onBridge={handleBridge}
              isConnected={isConnected}
            />
          ) : (
            <SwapForm
              balanceUSDC={swapUsdcBalance}
              balanceEURC={swapEurcBalance}
              isLoadingBalance={isLoadingUsdc || isLoadingEurc}
              onSwapSuccess={handleSwapSuccess}
            />
          )}
        </div>

        {/* Right: Balance & Information */}
        <div className="space-y-6">
          {activeTab === "bridge" ? (
            <>
              <BalanceCard
                chain={sourceChain}
                balance={balance}
                symbol={symbol}
                isLoading={isLoading}
                onRefresh={refreshBalance}
              />

              <Card className="border border-white/10 bg-[#060f24]/50 backdrop-blur-md">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <HelpCircle className="h-4 w-4 text-primary" />
                    How Bridging Works
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3.5 text-xs text-slate-400 leading-5">
                  <div className="flex gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0 mt-2" />
                    <p>
                      USDC transfers use the Circle Cross-Chain Transfer Protocol (CCTP) to safely burn on the source network and mint on the destination network.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0 mt-2" />
                    <p>
                      No slippage or exchange pools: all transfers are minted 1:1, meaning you receive exactly the amount of USDC you sent.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0 mt-2" />
                    <p>
                      Wallet balances update automatically upon block confirmation. Keep an eye on network status icons for real-time congestion warnings.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <>
              <SwapBalanceCard
                usdcBalance={swapUsdcBalance}
                eurcBalance={swapEurcBalance}
                isLoading={isLoadingUsdc || isLoadingEurc}
                onRefresh={handleRefreshSwapBalances}
              />

              <Card className="border border-white/10 bg-[#060f24]/50 backdrop-blur-md">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <HelpCircle className="h-4 w-4 text-purple-400" />
                    How Swapping Works
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3.5 text-xs text-slate-400 leading-5">
                  <div className="flex gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-purple-500 shrink-0 mt-2" />
                    <p>
                      Same-chain swaps execute instantly in a single transaction on the Arc Testnet.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-purple-500 shrink-0 mt-2" />
                    <p>
                      USDC and EURC liquidity pool is routed automatically using Circle App Kit integrations.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-purple-500 shrink-0 mt-2" />
                    <p>
                      The app automatically checks allowances and triggers token approvals in-line if needed. No manual steps are required.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* Bottom: History */}
      <div className="mt-6">
        {activeTab === "bridge" ? (
          <TransferHistory transfers={transfers} />
        ) : (
          <SwapHistory swaps={swaps} />
        )}
      </div>
    </AppShell>
  );
}
