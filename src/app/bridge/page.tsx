"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { useBridgeBalance } from "@/hooks/use-bridge-balance";
import { useBridge } from "@/hooks/use-bridge";
import { useEurcBridge } from "@/hooks/use-eurc-bridge";
import { useSolanaBridge } from "@/hooks/use-solana-bridge";
import { BridgeAsset, getCctpDomain, IRIS_SANDBOX_BASE, BRIDGE_EXPLORER_URLS } from "@/config/bridge-assets";
import { useWallet } from "@solana/wallet-adapter-react";
import { useArcWallet } from "@/components/wallet/use-arc-wallet";
import { TransferHistory, BridgeTransfer } from "@/components/bridge/transfer-history";
import {
  syncMainnetTransferToUniversalHistory,
  MainnetBridgeTransferRecord,
  padAddressToBytes32,
} from "@/hooks/use-mainnet-bridge";

if (typeof BRIDGE_EXPLORER_URLS !== "undefined") {
  BRIDGE_EXPLORER_URLS["Base Mainnet"] = "https://basescan.org";
  BRIDGE_EXPLORER_URLS["Arc Mainnet"] = "https://explorer.arc.io";
}
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";

const BridgeForm = dynamic(
  () => import("@/components/bridge/bridge-form").then((mod) => mod.BridgeForm),
  { ssr: false }
);

const MainnetBridgeForm = dynamic(
  () => import("@/components/bridge/mainnet-bridge-form").then((mod) => mod.MainnetBridgeForm),
  { ssr: false }
);

import { createPublicClient, http } from "viem";
import { arcPublicClient } from "@/lib/arc-client";
import { basePublicClient } from "@/lib/base-client";

export default function BridgePage() {
  const [activeTab, setActiveTab] = useState<"bridge" | "bridge-mainnet">("bridge");
  
  // Bridge-specific states and hooks
  const [selectedAsset, setSelectedAsset] = useState<BridgeAsset>("USDC");
  const [sourceChain, setSourceChain] = useState<string>("Arc Testnet");
  const [destinationChain, setDestinationChain] = useState<string>("Base Sepolia");
  const [transfers, setTransfers] = useState<BridgeTransfer[]>([]);

  const { address, isConnected, chainId } = useArcWallet();
  const { publicKey: solanaPublicKey } = useWallet();

  // Automatically switch to Mainnet Bridge when wallet is connected to Arc Mainnet or Base Mainnet
  useEffect(() => {
    if (isConnected && (chainId === 5042 || chainId === 8453)) {
      setActiveTab("bridge-mainnet");
    }
  }, [isConnected, chainId]);

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

  useEffect(() => {
    evmResetBridgeStatus();
    solanaResetBridgeStatus();
    eurcResetBridgeStatus();
  }, [isConnected, address, solanaPublicKey, sourceChain, evmResetBridgeStatus, solanaResetBridgeStatus, eurcResetBridgeStatus]);

  const isSyncingRef = useRef(false);

  const loadHistory = useCallback(() => {
    if (typeof window === "undefined" || !window.localStorage) return [];

    const hasActiveWallet = Boolean(
      (sourceChain === "Solana Devnet" ? (solanaPublicKey && activeAddress) : (isConnected && address)) ||
      (isConnected && address)
    );

    if (!hasActiveWallet) {
      setTransfers([]);
      return [];
    }

    if (isSyncingRef.current) return [];
    isSyncingRef.current = true;

    try {
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

      // Merge existing wallet-scoped Mainnet transfers into universal history on load/wallet switch
      if (currentWallet) {
        const keysToScan: string[] = [
          `paygrix_mainnet_bridge_transfers_${currentWallet.toLowerCase()}`,
        ];
        try {
          const padded = padAddressToBytes32(currentWallet).toLowerCase();
          const paddedKey = `paygrix_mainnet_bridge_transfers_${padded}`;
          if (!keysToScan.includes(paddedKey)) {
            keysToScan.push(paddedKey);
          }
        } catch {
          // Ignore invalid address formatting for padding
        }

        for (const key of keysToScan) {
          try {
            const mainnetSaved = localStorage.getItem(key);
            if (mainnetSaved) {
              const mainnetList: MainnetBridgeTransferRecord[] = JSON.parse(mainnetSaved);
              if (Array.isArray(mainnetList)) {
                mainnetList.forEach((mRec) => {
                  syncMainnetTransferToUniversalHistory(mRec, currentWallet);
                });
              }
            }
          } catch (err) {
            console.error(`Error syncing mainnet transfers to universal history from ${key}:`, err);
          }
        }
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
      return allTransfers;
    } finally {
      isSyncingRef.current = false;
    }
  }, [isConnected, address, activeAddress, sourceChain, solanaPublicKey]);

  useEffect(() => {
    let isMounted = true;
    const allTransfers = loadHistory();

    const handleHistoryUpdate = () => {
      if (isMounted) {
        loadHistory();
      }
    };

    const handleStorage = (e: StorageEvent) => {
      if (
        isMounted &&
        (!e.key ||
          e.key === "bridge_transfers" ||
          e.key.startsWith("paygrix_mainnet_bridge_transfers"))
      ) {
        loadHistory();
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("paygrix_bridge_history_updated", handleHistoryUpdate);
      window.addEventListener("storage", handleStorage);
    }

    const currentWallet = address;
    const solanaWallet = activeAddress;

    const matchesCurrentWallet = (addr?: string | null): boolean => {
      if (!addr) return false;
      return (
        isSameAddress(addr, currentWallet) ||
        (solanaWallet ? isSameAddress(addr, solanaWallet) : false)
      );
    };

    let ownerCache: Record<string, string> = {};
    try {
      const cached = localStorage.getItem("paygrix_tx_owner_cache");
      if (cached) {
        ownerCache = JSON.parse(cached) || {};
      }
    } catch {
      ownerCache = {};
    }

    // 2. Asynchronously resolve legacy records with missing initiator
    const resolveLegacyRecords = async () => {
      if (!allTransfers || allTransfers.length === 0) return;
      let cacheModified = false;
      let transfersModified = false;

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
        const isMainnet = item.fromChain === "Base Mainnet" || item.fromChain === "Arc Mainnet";
        return Boolean(sHash && !dHash && (domain !== undefined || isMainnet));
      });

      for (const item of pendingDestTransfers) {
        if (!isMounted) return;
        const sHash = item.sourceTxHash || item.sourceTx!;
        const isMainnet = item.fromChain === "Base Mainnet" || item.fromChain === "Arc Mainnet";
        const domain = isMainnet
          ? (item.fromChain === "Base Mainnet" ? 6 : 26)
          : getCctpDomain(item.fromChain);
        if (domain === undefined) continue;

        const irisBaseUrl = isMainnet ? "https://iris-api.circle.com" : IRIS_SANDBOX_BASE;

        try {
          const res = await fetch(`${irisBaseUrl}/v2/messages/${domain}?transactionHash=${sHash}`);
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
              if (item.status !== "Completed") {
                item.status = "Completed";
              }
              transfersModified = true;
            }
          }
        } catch {
          // Transient Iris lookup failure; will retry on subsequent mount
        }
      }

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
        if (isMounted) {
          setTransfers(finalTransfers);
        }
      }
    };

    resolveLegacyRecords();

    return () => {
      isMounted = false;
      if (typeof window !== "undefined") {
        window.removeEventListener("paygrix_bridge_history_updated", handleHistoryUpdate);
        window.removeEventListener("storage", handleStorage);
      }
    };
  }, [loadHistory, activeTab, address, activeAddress]);

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
          if (currentWallet) {
            const wKey = currentWallet.toLowerCase();
            if (realSourceHash) {
              sessionStorage.setItem(`paygrix_last_source_tx_${wKey}`, realSourceHash);
            }
            if (realDestHash) {
              sessionStorage.setItem(`paygrix_last_dest_tx_${wKey}`, realDestHash);
            }
          }
          sessionStorage.removeItem("paygrix_last_source_tx");
          sessionStorage.removeItem("paygrix_last_dest_tx");
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
        description="Bridge USDC and EURC tokens seamlessly across supported Mainnet and Testnet networks."
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
          Bridge (Testnet)
        </button>
        <button
          onClick={() => setActiveTab("bridge-mainnet")}
          className={cn(
            "px-4 py-2 text-sm font-semibold rounded-lg transition-all flex items-center gap-1.5",
            activeTab === "bridge-mainnet"
              ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          )}
        >
          <span>Bridge</span>
          <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            Mainnet
          </span>
        </button>
      </div>

      {activeTab === "bridge-mainnet" ? (
        <div className="space-y-6">
          <MainnetBridgeForm />
        </div>
      ) : (
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
      )}

      {/* Bottom: History */}
      <div className="mt-6">
        <TransferHistory
          transfers={transfers}
          isConnected={Boolean(
            (sourceChain === "Solana Devnet" ? solanaPublicKey : (isConnected && address)) ||
            (isConnected && address)
          )}
        />
      </div>
    </AppShell>
  );
}
