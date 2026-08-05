"use client";

import { useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import { ArcTestnet, BaseSepolia, ArbitrumSepolia } from "@circle-fin/app-kit/chains";

export type BridgeStatus =
  | "idle"
  | "preparing"
  | "waiting-wallet"
  | "bridging"
  | "completed"
  | "failed";

import { EIP1193Provider, createPublicClient, http } from "viem";
import { clearArcReadCache, sanitizeExecutionError } from "@/lib/arc-read-infra";
import { arcPublicClient } from "@/lib/arc-client";

const APP_KIT_CHAINS: Record<
  string,
  typeof ArcTestnet | typeof BaseSepolia | typeof ArbitrumSepolia
> = {
  "Arc Testnet": ArcTestnet,
  "Base Sepolia": BaseSepolia,
  "Arbitrum Sepolia": ArbitrumSepolia,
};

interface BridgeEventPayload {
  values?: {
    txHash?: string;
  };
}

interface BridgeStep {
  name: string;
  txHash?: string;
}

interface AppKitBridgeResult {
  state?: string;
  error?: string;
  steps?: BridgeStep[];
}

export function useBridge() {
  const [status, setStatus] = useState<BridgeStatus>("idle");
  const [sourceTxHash, setSourceTxHash] = useState<string>("");
  const [destTxHash, setDestTxHash] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const { connector, isConnected } = useAccount();

  const bridgeUSDC = useCallback(async (amount: string, fromChain: string, toChain: string) => {
    if (!amount || parseFloat(amount) <= 0) return;
    
    setError(null);
    setSourceTxHash("");
    setDestTxHash("");
    setStatus("preparing");
    
    if (!isConnected || !connector) {
      setError("Wallet not connected");
      setStatus("failed");
      return;
    }

    const fromChainObj = APP_KIT_CHAINS[fromChain];
    const toChainObj = APP_KIT_CHAINS[toChain];

    if (!fromChainObj || !toChainObj) {
      setError(`Unsupported chain mapping: ${fromChain} -> ${toChain}`);
      setStatus("failed");
      return;
    }

    const kit = new AppKit();
    let provider: EIP1193Provider;
    try {
      provider = (await connector.getProvider()) as EIP1193Provider;
    } catch (err) {
      console.error("Error getting provider:", err);
      setError("Failed to initialize wallet provider.");
      setStatus("failed");
      return;
    }

    let adapter;
    try {
      adapter = await createViemAdapterFromProvider({
        provider,
        getPublicClient: ({ chain }) => {
          if (chain.id === 5042002) {
            return arcPublicClient;
          }
          return createPublicClient({
            chain,
            transport: http(),
          });
        },
      });
    } catch (err) {
      console.error("Error creating viem adapter:", err);
      setError("Failed to connect wallet to Circle App Kit.");
      setStatus("failed");
      return;
    }

    // Set up step-by-step event listeners
    const approveHandler = (payload: BridgeEventPayload) => {
      console.log("App Kit: bridge.approve event", payload);
      setStatus("waiting-wallet");
    };

    const burnHandler = (payload: BridgeEventPayload) => {
      console.log("App Kit: bridge.burn event", payload);
      setStatus("bridging");
      if (payload?.values?.txHash) {
        setSourceTxHash(payload.values.txHash);
      }
      clearArcReadCache("arc:0x3600000000000000000000000000000000000000");
      clearArcReadCache("arc:native");
    };
 
    const fetchAttestationHandler = (payload: BridgeEventPayload) => {
      console.log("App Kit: bridge.fetchAttestation event", payload);
      setStatus("bridging");
    };
 
    const mintHandler = (payload: BridgeEventPayload) => {
      console.log("App Kit: bridge.mint event", payload);
      if (payload?.values?.txHash) {
        setDestTxHash(payload.values.txHash);
      }
    };
 
    kit.on("bridge.approve", approveHandler);
    kit.on("bridge.burn", burnHandler);
    kit.on("bridge.fetchAttestation", fetchAttestationHandler);
    kit.on("bridge.mint", mintHandler);
 
    try {
      // Prompt user for initial step
      setStatus("waiting-wallet");
      const rawResult = await kit.bridge({
        from: { adapter, chain: fromChainObj },
        to: { adapter, chain: toChainObj },
        amount,
      });
 
      console.log("App Kit: bridge result", rawResult);
 
      const result = rawResult as AppKitBridgeResult;
 
      if (result.state === "success" || result.state === "completed") {
        setStatus("completed");
        clearArcReadCache("arc:0x3600000000000000000000000000000000000000");
        clearArcReadCache("arc:native");
        
        // Extract hashes as fallback if event handlers missed them
        const burnStep = result.steps?.find((s) => s.name === "burn" || s.name === "execute");
        const mintStep = result.steps?.find((s) => s.name === "mint" || s.name === "claim");
        
        if (burnStep?.txHash) {
          setSourceTxHash(burnStep.txHash);
        }
        if (mintStep?.txHash) {
          setDestTxHash(mintStep.txHash);
        }
 
        return result;
      } else {
        throw new Error(result.error || "Bridge execution failed without success status");
      }
    } catch (err) {
      console.error("Bridge execution error:", err);
      setError(sanitizeExecutionError(err));
      setStatus("failed");
    } finally {
      // Clean up event listeners
      kit.off("bridge.approve", approveHandler);
      kit.off("bridge.burn", burnHandler);
      kit.off("bridge.fetchAttestation", fetchAttestationHandler);
      kit.off("bridge.mint", mintHandler);
    }
  }, [connector, isConnected]);

  const resetStatus = useCallback(() => {
    setStatus("idle");
    setSourceTxHash("");
    setDestTxHash("");
    setError(null);
  }, []);

  return {
    status,
    sourceTxHash,
    destTxHash,
    error,
    bridgeUSDC,
    resetStatus,
  };
}

