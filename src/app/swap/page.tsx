"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { useArcWallet } from "@/components/wallet/use-arc-wallet";
import { SwapForm } from "@/components/bridge/swap-form";
import { SwapHistory } from "@/components/bridge/swap-history";
import { useTokenBalance } from "@/hooks/use-token-balance";
import { SwapHistoryItem } from "@/hooks/use-swap";
import { SupportedSwapChain } from "@/config/swap-config";
import { arcPublicClient } from "@/lib/arc-client";
import { basePublicClient } from "@/lib/base-client";

export default function SwapPage() {
  const [selectedSwapNetwork, setSelectedSwapNetwork] = useState<SupportedSwapChain>("Arc");
  const { address, isConnected } = useArcWallet();

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

  const getSwapInitiator = (item: SwapHistoryItem): string | undefined => {
    return item.walletAddress || item.userAddress || item.sender || item.initiator;
  };

  useEffect(() => {
    if (!isConnected || !address) {
      setSwaps([]);
      return;
    }

    let isMounted = true;
    const currentWallet = address;

    const matchesCurrentWallet = (addr?: string | null): boolean => {
      if (!addr) return false;
      return isSameAddress(addr, currentWallet);
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

    // Initial synchronous load for swap history
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

    // Asynchronously resolve legacy records with missing initiator
    const resolveLegacyRecords = async () => {
      let cacheModified = false;
      let swapsModified = false;

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
  }, [isConnected, address]);

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
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="Swap"
        title="Token Swap"
        description="Swap stablecoins and tokens same-chain on Arc Mainnet, Arc Testnet, and Base Sepolia."
      />

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

      {/* Bottom: History */}
      <div className="mt-6">
        <SwapHistory
          swaps={swaps}
          isConnected={Boolean(isConnected && address)}
        />
      </div>
    </AppShell>
  );
}
