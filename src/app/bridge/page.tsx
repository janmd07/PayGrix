"use client";

import { useState, useEffect } from "react";
import { HelpCircle } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBridgeBalance } from "@/hooks/use-bridge-balance";
import { useBridge } from "@/hooks/use-bridge";
import { useSolanaBridge } from "@/hooks/use-solana-bridge";
import { useWallet } from "@solana/wallet-adapter-react";
import { useArcWallet } from "@/components/wallet/use-arc-wallet";
import { BalanceCard } from "@/components/bridge/balance-card";
import { TransferHistory, BridgeTransfer } from "@/components/bridge/transfer-history";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";

const BridgeForm = dynamic(
  () => import("@/components/bridge/bridge-form").then((mod) => mod.BridgeForm),
  { ssr: false }
);

// Swap integrations
import { SwapForm } from "@/components/bridge/swap-form";
import { SwapBalanceCard } from "@/components/bridge/swap-balance-card";
import { SwapHistory } from "@/components/bridge/swap-history";
import { useTokenBalance } from "@/hooks/use-token-balance";
import { SwapHistoryItem } from "@/hooks/use-swap";
import { SupportedSwapChain } from "@/config/swap-config";

export default function BridgePage() {
  const [activeTab, setActiveTab] = useState<"bridge" | "swap">("bridge");
  const [selectedSwapNetwork, setSelectedSwapNetwork] = useState<SupportedSwapChain>("Arc");
  
  // Bridge-specific states and hooks
  const [sourceChain, setSourceChain] = useState<string>("Arc Testnet");
  const [destinationChain, setDestinationChain] = useState<string>("Base Sepolia");
  const [transfers, setTransfers] = useState<BridgeTransfer[]>([]);

  const { address, isConnected } = useArcWallet();
  const { publicKey: solanaPublicKey } = useWallet();

  // Route flags
  const isSolanaRoute = sourceChain === "Solana Devnet" || destinationChain === "Solana Devnet";
  const isHybridSolanaRoute =
    (sourceChain === "Solana Devnet" && destinationChain === "Arc Testnet") ||
    (sourceChain === "Arc Testnet" && destinationChain === "Solana Devnet");

  // Determine active address for balance checks
  const activeAddress = sourceChain === "Solana Devnet" ? (solanaPublicKey?.toBase58() as `0x${string}`) : address;
  const { balance, symbol, isLoading, refreshBalance } = useBridgeBalance(sourceChain, activeAddress);

  // Existing EVM bridge hook
  const {
    status: evmStatus,
    sourceTxHash: evmSourceTxHash,
    destTxHash: evmDestTxHash,
    error: evmError,
    bridgeUSDC: evmBridgeUSDC,
    resetStatus: evmResetBridgeStatus,
  } = useBridge();

  // New Solana bridge hook
  const {
    status: solanaStatus,
    sourceTxHash: solanaSourceTxHash,
    destTxHash: solanaDestTxHash,
    error: solanaError,
    bridgeUSDC: solanaBridgeUSDC,
    resetStatus: solanaResetBridgeStatus,
  } = useSolanaBridge();

  // Select active state based on route
  const bridgeStatus = isSolanaRoute ? solanaStatus : evmStatus;
  const sourceTxHash = isSolanaRoute ? solanaSourceTxHash : evmSourceTxHash;
  const destTxHash = isSolanaRoute ? solanaDestTxHash : evmDestTxHash;
  const bridgeError = isSolanaRoute ? solanaError : evmError;

  // Swap-specific states and hooks
  const [swaps, setSwaps] = useState<SwapHistoryItem[]>([]);
  const {
    balance: swapUsdcBalance,
    isLoading: isLoadingUsdc,
    refreshBalance: refreshUsdc,
  } = useTokenBalance("USDC", address, selectedSwapNetwork);
  const {
    balance: swapEurcBalance,
    isLoading: isLoadingEurc,
    refreshBalance: refreshEurc,
  } = useTokenBalance("EURC", address, selectedSwapNetwork);
  const {
    balance: swapCirBtcBalance,
    isLoading: isLoadingCirBtc,
    refreshBalance: refreshCirBtc,
  } = useTokenBalance("cirBTC", address, selectedSwapNetwork);
  const {
    balance: swapEthBalance,
    isLoading: isLoadingEth,
    refreshBalance: refreshEth,
  } = useTokenBalance("ETH", address, selectedSwapNetwork);

  const handleRefreshSwapBalances = async () => {
    await Promise.all([refreshUsdc(), refreshEurc(), refreshCirBtc(), refreshEth()]);
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
      let result;
      if (isSolanaRoute) {
        if (!isHybridSolanaRoute) {
          alert("Phase 1 supports Solana Devnet only with Arc Testnet.");
          return;
        }
        result = await solanaBridgeUSDC(amount, sourceChain, destinationChain);
      } else {
        result = await evmBridgeUSDC(amount, sourceChain, destinationChain);
      }

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
    tokenIn: "USDC" | "EURC" | "cirBTC" | "ETH",
    tokenOut: "USDC" | "EURC" | "cirBTC" | "ETH",
    hash: string,
    network?: SupportedSwapChain
  ) => {
    const newSwap: SwapHistoryItem = {
      id: Math.random().toString(36).substring(2, 9),
      tokenIn,
      tokenOut,
      amountIn,
      amountOut,
      txHash: hash,
      timestamp: new Date().toLocaleString(),
      network: network || selectedSwapNetwork,
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
    if (chain === "GenLayer Bradbury" && destinationChain !== "Base Sepolia") {
      setDestinationChain("Base Sepolia");
    }
    evmResetBridgeStatus();
    solanaResetBridgeStatus();
  };

  const handleDestinationChainChange = (chain: string) => {
    setDestinationChain(chain);
    if (chain === "GenLayer Bradbury" && sourceChain !== "Base Sepolia") {
      setSourceChain("Base Sepolia");
    }
    evmResetBridgeStatus();
    solanaResetBridgeStatus();
  };

  const isGenLayerRoute = sourceChain === "GenLayer Bradbury" || destinationChain === "GenLayer Bradbury";

  return (
    <AppShell>
      <PageHeader
        eyebrow="Liquidity & Bridge"
        title="Liquidity Management"
        description="Bridge USDC tokens between networks or swap stablecoins locally on Arc Testnet and Base."
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
          Swap
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
              onRefresh={refreshBalance}
            />
          ) : (
            <SwapForm
              balanceUSDC={swapUsdcBalance}
              balanceEURC={swapEurcBalance}
              balanceCirBTC={swapCirBtcBalance}
              balanceETH={swapEthBalance}
              isLoadingBalance={isLoadingUsdc || isLoadingEurc || isLoadingCirBtc || isLoadingEth}
              selectedNetwork={selectedSwapNetwork}
              onNetworkChange={setSelectedSwapNetwork}
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
                    <HelpCircle className={cn("h-4 w-4", isGenLayerRoute ? "text-purple-400" : "text-primary")} />
                    {isGenLayerRoute ? "How GenLayer Adjudication Works" : "How Bridging Works"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3.5 text-xs text-slate-400 leading-5">
                  {isGenLayerRoute ? (
                    <>
                      <div className="flex gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-purple-500 shrink-0 mt-2" />
                        <p>
                          GenLayer Bradbury executes Intelligent Contracts powered by non-deterministic LLM evaluation and validator equivalence consensus.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-purple-500 shrink-0 mt-2" />
                        <p>
                          Base Sepolia acts as the Settlement Layer, securing USDC escrow collateral while disputes are evaluated on GenLayer.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-purple-500 shrink-0 mt-2" />
                        <p>
                          Once validator consensus is reached, the finalized verdict triggers automated collateral release or refund on Base Sepolia.
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
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
                    </>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <>
              <SwapBalanceCard
                usdcBalance={swapUsdcBalance}
                eurcBalance={swapEurcBalance}
                cirbtcBalance={swapCirBtcBalance}
                ethBalance={swapEthBalance}
                isLoading={isLoadingUsdc || isLoadingEurc || isLoadingCirBtc || isLoadingEth}
                onRefresh={handleRefreshSwapBalances}
                network={selectedSwapNetwork}
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
