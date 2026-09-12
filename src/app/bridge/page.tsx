"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { useBridgeBalance } from "@/hooks/use-bridge-balance";
import { useBridge } from "@/hooks/use-bridge";
import { useEurcBridge } from "@/hooks/use-eurc-bridge";
import { useSolanaBridge } from "@/hooks/use-solana-bridge";
import { BridgeAsset, getCctpDomain, IRIS_SANDBOX_BASE } from "@/config/bridge-assets";
import { useWallet } from "@solana/wallet-adapter-react";
import { useArcWallet } from "@/components/wallet/use-arc-wallet";
import { TransferHistory, BridgeTransfer } from "@/components/bridge/transfer-history";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";

const BridgeForm = dynamic(
  () => import("@/components/bridge/bridge-form").then((mod) => mod.BridgeForm),
  { ssr: false }
);

import { createPublicClient, http } from "viem";
import { arcPublicClient } from "@/lib/arc-client";
import { basePublicClient } from "@/lib/base-client";

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
  const [selectedAsset, setSelectedAsset] = useState<BridgeAsset>("USDC");
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
  const { balance, symbol, isLoading, refreshBalance } = useBridgeBalance(sourceChain, activeAddress, selectedAsset);

  // Existing EVM bridge hook
  const {
    status: evmStatus,
    sourceTxHash: evmSourceTxHash,
    destTxHash: evmDestTxHash,
    error: evmError,
    bridgeUSDC: evmBridgeUSDC,
    resetStatus: evmResetBridgeStatus,
  } = useBridge();

  // Dedicated EURC CCTPx bridge hook
  const {
    status: eurcStatus,
    sourceTxHash: eurcSourceTxHash,
    destTxHash: eurcDestTxHash,
    error: eurcError,
    bridgeEURC,
    resetStatus: eurcResetBridgeStatus,
  } = useEurcBridge();

  // New Solana bridge hook
  const {
    status: solanaStatus,
    sourceTxHash: solanaSourceTxHash,
    destTxHash: solanaDestTxHash,
    error: solanaError,
    bridgeUSDC: solanaBridgeUSDC,
    resetStatus: solanaResetBridgeStatus,
  } = useSolanaBridge();

  // Select active state based on selected asset and route
  const bridgeStatus = selectedAsset === "EURC" ? eurcStatus : (isSolanaRoute ? solanaStatus : evmStatus);
  const sourceTxHash = selectedAsset === "EURC" ? eurcSourceTxHash : (isSolanaRoute ? solanaSourceTxHash : evmSourceTxHash);
  const destTxHash = selectedAsset === "EURC" ? eurcDestTxHash : (isSolanaRoute ? solanaDestTxHash : evmDestTxHash);
  const bridgeError = selectedAsset === "EURC" ? eurcError : (isSolanaRoute ? solanaError : evmError);

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

  const isSameAddress = (a?: string | null, b?: string | null): boolean => {
    if (!a || !b) return false;
    const cleanA = a.trim();
    const cleanB = b.trim();
    if (cleanA.startsWith("0x") && cleanB.startsWith("0x")) {
      return cleanA.toLowerCase() === cleanB.toLowerCase();
    }
    return cleanA === cleanB || cleanA.toLowerCase() === cleanB.toLowerCase();
  };

  const getBridgeInitiator = (item: BridgeTransfer): string | undefined => {
    return item.walletAddress || item.userAddress || item.sender || item.initiator;
  };

  const getSwapInitiator = (item: SwapHistoryItem): string | undefined => {
    return item.walletAddress || item.userAddress || item.sender || item.initiator;
  };

  useEffect(() => {
    if (!isConnected || !address) {
      setTransfers([]);
      setSwaps([]);
      return;
    }

    let isMounted = true;
    const currentWallet = address;
    const solanaWallet = activeAddress;

    const matchesCurrentWallet = (addr?: string | null): boolean => {
      if (!addr) return false;
      return (
        isSameAddress(addr, currentWallet) ||
        (solanaWallet ? isSameAddress(addr, solanaWallet) : false)
      );
    };

    // Load tx owner cache from localStorage to avoid redundant RPC calls
    let ownerCache: Record<string, string> = {};
    try {
      const cached = localStorage.getItem("paygrix_tx_owner_cache");
      if (cached) {
        ownerCache = JSON.parse(cached) || {};
      }
    } catch {
      ownerCache = {};
    }

    // 1. Initial synchronous load for bridge transfers
    let allTransfers: BridgeTransfer[] = [];
    try {
      const savedTransfers = localStorage.getItem("bridge_transfers");
      if (savedTransfers) {
        const parsed = JSON.parse(savedTransfers);
        if (Array.isArray(parsed)) {
          let sanitized = false;
          allTransfers = parsed.map((item) => {
            const sHash = item.sourceTxHash || item.sourceTx;
            const dHash = item.destinationTxHash || item.destTx;
            const isCorrupted = Boolean(
              dHash && sHash && dHash.toLowerCase() === sHash.toLowerCase()
            );
            if (isCorrupted) {
              sanitized = true;
            }
            const cleanDest = isCorrupted ? undefined : dHash;
            return {
              ...item,
              sourceTx: sHash,
              sourceTxHash: sHash,
              destTx: cleanDest,
              destinationTxHash: cleanDest,
            };
          });
          if (sanitized) {
            try {
              localStorage.setItem("bridge_transfers", JSON.stringify(allTransfers));
            } catch {}
          }
        }
      }
    } catch (err) {
      console.error("Error parsing saved transfers:", err);
    }

    const initialTransfers = allTransfers.filter((item) => {
      const initiator = getBridgeInitiator(item);
      if (initiator) {
        return matchesCurrentWallet(initiator);
      }
      if (item.sourceTx && ownerCache[item.sourceTx.toLowerCase()]) {
        return matchesCurrentWallet(ownerCache[item.sourceTx.toLowerCase()]);
      }
      return false;
    });
    setTransfers(initialTransfers);

    // 2. Initial synchronous load for swap history
    let allSwaps: SwapHistoryItem[] = [];
    try {
      const savedSwaps = localStorage.getItem("swap_history");
      if (savedSwaps) {
        const parsed = JSON.parse(savedSwaps);
        if (Array.isArray(parsed)) {
          allSwaps = parsed;
        }
      }
    } catch (err) {
      console.error("Error parsing saved swaps:", err);
    }

    const initialSwaps = allSwaps.filter((item) => {
      const initiator = getSwapInitiator(item);
      if (initiator) {
        return matchesCurrentWallet(initiator);
      }
      if (item.txHash && ownerCache[item.txHash.toLowerCase()]) {
        return matchesCurrentWallet(ownerCache[item.txHash.toLowerCase()]);
      }
      return false;
    });
    setSwaps(initialSwaps);

    // 3. Asynchronously resolve legacy records with missing initiator
    const resolveLegacyRecords = async () => {
      let cacheModified = false;
      let transfersModified = false;
      let swapsModified = false;

      // Identify bridge items with a hash but no known initiator
      const unresolvedTransfers = allTransfers.filter((item) => {
        const initiator = getBridgeInitiator(item);
        return !initiator && item.sourceTx && !ownerCache[item.sourceTx.toLowerCase()];
      });

      for (const item of unresolvedTransfers) {
        if (!isMounted) return;
        const hash = item.sourceTx!;
        try {
          let client;
          if (item.fromChain === "Base Sepolia" || item.fromChain === "Base") {
            client = basePublicClient;
          } else if (item.fromChain === "Arbitrum Sepolia") {
            client = createPublicClient({ transport: http("https://sepolia-rollup.arbitrum.io/rpc") });
          } else {
            client = arcPublicClient;
          }
          const tx = await client.getTransaction({ hash: hash as `0x${string}` });
          if (tx && tx.from) {
            ownerCache[hash.toLowerCase()] = tx.from;
            item.walletAddress = tx.from;
            item.userAddress = tx.from;
            cacheModified = true;
            transfersModified = true;
          }
        } catch {
          // Transaction not found or pruned; do not guess ownership
        }
      }

      // Asynchronously resolve missing destination hashes for CCTP / EURC transfers via Iris
      const pendingDestTransfers = allTransfers.filter((item) => {
        const sHash = item.sourceTxHash || item.sourceTx;
        const dHash = item.destinationTxHash || item.destTx;
        const domain = getCctpDomain(item.fromChain);
        return Boolean(sHash && !dHash && domain !== undefined);
      });

      for (const item of pendingDestTransfers) {
        if (!isMounted) return;
        const sHash = item.sourceTxHash || item.sourceTx!;
        const domain = getCctpDomain(item.fromChain);
        if (domain === undefined) continue;

        try {
          const res = await fetch(`${IRIS_SANDBOX_BASE}/v2/messages/${domain}?transactionHash=${sHash}`);
          if (res.ok) {
            const data = await res.json();
            const msg = data?.messages?.[0];
            const candidate = msg?.forwardTxHash || msg?.destinationMintTxHash;
            if (
              candidate &&
              typeof candidate === "string" &&
              candidate.startsWith("0x") &&
              candidate.toLowerCase() !== sHash.toLowerCase()
            ) {
              item.destTx = candidate;
              item.destinationTxHash = candidate;
              transfersModified = true;
            }
          }
        } catch {
          // Transient Iris lookup failure; will retry on subsequent mount
        }
      }

      // Identify swap items with a hash but no known initiator
      const unresolvedSwaps = allSwaps.filter((item) => {
        const initiator = getSwapInitiator(item);
        return !initiator && item.txHash && !ownerCache[item.txHash.toLowerCase()];
      });

      for (const item of unresolvedSwaps) {
        if (!isMounted) return;
        const hash = item.txHash;
        try {
          const client = item.network === "Base" ? basePublicClient : arcPublicClient;
          const tx = await client.getTransaction({ hash: hash as `0x${string}` });
          if (tx && tx.from) {
            ownerCache[hash.toLowerCase()] = tx.from;
            item.walletAddress = tx.from;
            item.userAddress = tx.from;
            cacheModified = true;
            swapsModified = true;
          }
        } catch {
          // Transaction not found; do not guess ownership
        }
      }

      if (!isMounted) return;

      if (cacheModified) {
        try {
          localStorage.setItem("paygrix_tx_owner_cache", JSON.stringify(ownerCache));
        } catch {}
      }

      if (transfersModified) {
        try {
          localStorage.setItem("bridge_transfers", JSON.stringify(allTransfers));
        } catch {}
        const finalTransfers = allTransfers.filter((item) => {
          const initiator = getBridgeInitiator(item);
          if (initiator) return matchesCurrentWallet(initiator);
          if (item.sourceTx && ownerCache[item.sourceTx.toLowerCase()]) {
            return matchesCurrentWallet(ownerCache[item.sourceTx.toLowerCase()]);
          }
          return false;
        });
        setTransfers(finalTransfers);
      }

      if (swapsModified) {
        try {
          localStorage.setItem("swap_history", JSON.stringify(allSwaps));
        } catch {}
        const finalSwaps = allSwaps.filter((item) => {
          const initiator = getSwapInitiator(item);
          if (initiator) return matchesCurrentWallet(initiator);
          if (item.txHash && ownerCache[item.txHash.toLowerCase()]) {
            return matchesCurrentWallet(ownerCache[item.txHash.toLowerCase()]);
          }
          return false;
        });
        setSwaps(finalSwaps);
      }
    };

    resolveLegacyRecords();

    return () => {
      isMounted = false;
    };
  }, [isConnected, address, activeAddress]);

  const handleBridge = async (amount: string) => {
    try {
      let result;
      if (selectedAsset === "EURC") {
        result = await bridgeEURC(amount, sourceChain, destinationChain);
      } else if (isSolanaRoute) {
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

        const realSourceHash =
          burnStep?.txHash ||
          (result as { sourceTxHash?: string })?.sourceTxHash ||
          sourceTxHash ||
          undefined;

        let realDestHash: string | undefined = undefined;
        const candidateDestHash =
          mintStep?.txHash ||
          (result as { destTxHash?: string })?.destTxHash ||
          destTxHash;

        if (
          candidateDestHash &&
          (!realSourceHash || candidateDestHash.toLowerCase() !== realSourceHash.toLowerCase())
        ) {
          realDestHash = candidateDestHash;
        }

        const currentWallet = (sourceChain === "Solana Devnet" ? activeAddress : address) || address;
        const newTransfer: BridgeTransfer = {
          id: Math.random().toString(36).substring(2, 9),
          fromChain: sourceChain,
          toChain: destinationChain,
          amount: amount,
          token: selectedAsset,
          asset: selectedAsset,
          status: "Completed",
          date: new Date().toLocaleString(),
          sourceTx: realSourceHash,
          sourceTxHash: realSourceHash,
          destTx: realDestHash,
          destinationTxHash: realDestHash,
          walletAddress: currentWallet,
          userAddress: currentWallet,
          sender: currentWallet,
          initiator: currentWallet,
        };

        try {
          if (realSourceHash) {
            sessionStorage.setItem("paygrix_last_source_tx", realSourceHash);
          }
          if (realDestHash) {
            sessionStorage.setItem("paygrix_last_dest_tx", realDestHash);
          }
        } catch {}

        try {
          const savedTransfers = localStorage.getItem("bridge_transfers");
          const allTransfers: BridgeTransfer[] = savedTransfers ? JSON.parse(savedTransfers) : [];
          const updatedAll = [newTransfer, ...(Array.isArray(allTransfers) ? allTransfers.filter((t) => t.id !== newTransfer.id) : [])];
          localStorage.setItem("bridge_transfers", JSON.stringify(updatedAll));
        } catch {
          localStorage.setItem("bridge_transfers", JSON.stringify([newTransfer]));
        }

        setTransfers((prev) => [newTransfer, ...prev]);

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
    const currentWallet = address;
    const newSwap: SwapHistoryItem = {
      id: Math.random().toString(36).substring(2, 9),
      tokenIn,
      tokenOut,
      amountIn,
      amountOut,
      txHash: hash,
      timestamp: new Date().toLocaleString(),
      network: network || selectedSwapNetwork,
      walletAddress: currentWallet,
      userAddress: currentWallet,
      sender: currentWallet,
      initiator: currentWallet,
    };

    try {
      const savedSwaps = localStorage.getItem("swap_history");
      const allSwaps: SwapHistoryItem[] = savedSwaps ? JSON.parse(savedSwaps) : [];
      const updatedAll = [newSwap, ...(Array.isArray(allSwaps) ? allSwaps.filter((s) => s.id !== newSwap.id) : [])];
      localStorage.setItem("swap_history", JSON.stringify(updatedAll));
    } catch {
      localStorage.setItem("swap_history", JSON.stringify([newSwap]));
    }

    setSwaps((prev) => [newSwap, ...prev]);

    // Refresh balances
    handleRefreshSwapBalances();
    refreshBalance();
  };

  const handleAssetChange = (asset: BridgeAsset) => {
    setSelectedAsset(asset);
    if (asset === "EURC") {
      if (sourceChain !== "Base Sepolia" && sourceChain !== "Arc Testnet") {
        setSourceChain("Base Sepolia");
        setDestinationChain("Arc Testnet");
      } else if (destinationChain !== "Base Sepolia" && destinationChain !== "Arc Testnet") {
        setDestinationChain(sourceChain === "Base Sepolia" ? "Arc Testnet" : "Base Sepolia");
      } else if (sourceChain === destinationChain) {
        setDestinationChain(sourceChain === "Base Sepolia" ? "Arc Testnet" : "Base Sepolia");
      }
    }
    evmResetBridgeStatus();
    solanaResetBridgeStatus();
    eurcResetBridgeStatus();
  };

  const handleSourceChainChange = (chain: string) => {
    setSourceChain(chain);
    if (chain === "GenLayer Bradbury" && destinationChain !== "Base Sepolia") {
      setDestinationChain("Base Sepolia");
    }
    evmResetBridgeStatus();
    solanaResetBridgeStatus();
    eurcResetBridgeStatus();
  };

  const handleDestinationChainChange = (chain: string) => {
    setDestinationChain(chain);
    if (chain === "GenLayer Bradbury" && sourceChain !== "Base Sepolia") {
      setSourceChain("Base Sepolia");
    }
    evmResetBridgeStatus();
    solanaResetBridgeStatus();
    eurcResetBridgeStatus();
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="Liquidity & Bridge"
        title="Liquidity Management"
        description="Bridge USDC and EURC tokens between networks or swap stablecoins locally on Arc Testnet and Base."
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
          Bridge
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

      {activeTab === "bridge" ? (
        <div className="space-y-6">
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
            selectedAsset={selectedAsset}
            onAssetChange={handleAssetChange}
          />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
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
          </div>

          <div className="space-y-6">
            <SwapBalanceCard
              usdcBalance={swapUsdcBalance}
              eurcBalance={swapEurcBalance}
              cirbtcBalance={swapCirBtcBalance}
              ethBalance={swapEthBalance}
              isLoading={isLoadingUsdc || isLoadingEurc || isLoadingCirBtc || isLoadingEth}
              onRefresh={handleRefreshSwapBalances}
              network={selectedSwapNetwork}
            />
          </div>
        </div>
      )}

      {/* Bottom: History */}
      <div className="mt-6">
        {activeTab === "bridge" ? (
          <TransferHistory
            transfers={transfers}
            isConnected={Boolean(
              (sourceChain === "Solana Devnet" ? solanaPublicKey : (isConnected && address)) ||
              (isConnected && address)
            )}
          />
        ) : (
          <SwapHistory
            swaps={swaps}
            isConnected={Boolean(isConnected && address)}
          />
        )}
      </div>
    </AppShell>
  );
}
