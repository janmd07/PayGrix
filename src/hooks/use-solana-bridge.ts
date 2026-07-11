"use client";

import { useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { useWallet } from "@solana/wallet-adapter-react";
import { AppKit } from "@circle-fin/app-kit";
import { createSolanaAdapterFromProvider } from "@circle-fin/adapter-solana";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import { ArcTestnet, SolanaDevnet } from "@circle-fin/app-kit/chains";
import { EIP1193Provider } from "viem";

export type BridgeStatus =
  | "idle"
  | "preparing"
  | "waiting-wallet"
  | "bridging"
  | "completed"
  | "failed";

const APP_KIT_CHAINS: Record<string, unknown> = {
  "Arc Testnet": ArcTestnet,
  "Solana Devnet": SolanaDevnet,
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

export function useSolanaBridge() {
  const [status, setStatus] = useState<BridgeStatus>("idle");
  const [sourceTxHash, setSourceTxHash] = useState<string>("");
  const [destTxHash, setDestTxHash] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // EVM account hook
  const { connector: evmConnector, isConnected: isEvmConnected } = useAccount();

  // Solana wallet hook
  const { wallet: solanaWallet, connected: isSolanaConnected, publicKey: solanaPublicKey } = useWallet();

  const bridgeUSDC = useCallback(async (amount: string, fromChain: string, toChain: string) => {
    if (!amount || parseFloat(amount) <= 0) return;

    setError(null);
    setSourceTxHash("");
    setDestTxHash("");
    setStatus("preparing");

    // Task 4: Address and wallet validation
    if (!isEvmConnected || !evmConnector) {
      setError("EVM wallet not connected");
      setStatus("failed");
      return;
    }

    if (!isSolanaConnected || !solanaWallet?.adapter || !solanaPublicKey) {
      setError("Solana wallet not connected");
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

    // Initialize EVM Adapter
    let evmAdapter;
    try {
      const provider = (await evmConnector.getProvider()) as EIP1193Provider;
      evmAdapter = await createViemAdapterFromProvider({ provider });
    } catch (err) {
      console.error("Error creating EVM adapter:", err);
      setError("Failed to initialize EVM wallet provider.");
      setStatus("failed");
      return;
    }

    // Initialize Solana Adapter with custom adapter wrapper
    let solanaAdapter;
    try {
      const adapter = solanaWallet.adapter as unknown as {
        connected: boolean;
        publicKey: { toString(): string } | null;
        connect(): Promise<void>;
        disconnect(): Promise<void>;
        signTransaction(tx: never): Promise<never>;
        signAllTransactions?(txs: never[]): Promise<never[]>;
        signMessage?(msg: Uint8Array): Promise<Uint8Array>;
      };

      // Map standard adapter to the SolanaWalletProvider interface required by Circle
      const circleSolanaProvider = {
        isConnected: adapter.connected,
        publicKey: adapter.publicKey ? {
          toString() {
            return adapter.publicKey!.toString();
          }
        } : undefined,
        connect: async () => {
          await adapter.connect();
          if (!adapter.publicKey) {
            throw new Error("Solana wallet not connected");
          }
          return {
            publicKey: {
              toString() {
                return adapter.publicKey!.toString();
              }
            }
          };
        },
        disconnect: async () => {
          await adapter.disconnect();
        },
        signTransaction: async (tx: unknown) => {
          return await adapter.signTransaction(tx as never);
        },
        signAllTransactions: adapter.signAllTransactions
          ? async (txs: unknown[]) => await adapter.signAllTransactions!(txs as never[])
          : undefined,
        signMessage: adapter.signMessage
          ? async (msg: Uint8Array) => {
              const signature = await adapter.signMessage!(msg);
              return { signature };
            }
          : undefined,
      };

      solanaAdapter = await createSolanaAdapterFromProvider({
        provider: circleSolanaProvider,
      });
    } catch (err) {
      console.error("Error creating Solana adapter:", err);
      setError("Failed to initialize Solana wallet provider.");
      setStatus("failed");
      return;
    }

    const kit = new AppKit();

    // Set up step-by-step event listeners
    const approveHandler = (payload: BridgeEventPayload) => {
      console.log("Solana Bridge: bridge.approve event", payload);
      setStatus("waiting-wallet");
    };

    const burnHandler = (payload: BridgeEventPayload) => {
      console.log("Solana Bridge: bridge.burn event", payload);
      setStatus("bridging");
      if (payload?.values?.txHash) {
        setSourceTxHash(payload.values.txHash);
      }
    };

    const fetchAttestationHandler = (payload: BridgeEventPayload) => {
      console.log("Solana Bridge: bridge.fetchAttestation event", payload);
      setStatus("bridging");
    };

    const mintHandler = (payload: BridgeEventPayload) => {
      console.log("Solana Bridge: bridge.mint event", payload);
      if (payload?.values?.txHash) {
        setDestTxHash(payload.values.txHash);
      }
    };

    kit.on("bridge.approve", approveHandler);
    kit.on("bridge.burn", burnHandler);
    kit.on("bridge.fetchAttestation", fetchAttestationHandler);
    kit.on("bridge.mint", mintHandler);

    try {
      setStatus("waiting-wallet");

      // Task 3: Adapter mapping based on direction
      const fromConfig = fromChain === "Solana Devnet"
        ? { adapter: solanaAdapter, chain: SolanaDevnet }
        : { adapter: evmAdapter, chain: ArcTestnet };

      const toConfig = toChain === "Solana Devnet"
        ? { adapter: solanaAdapter, chain: SolanaDevnet }
        : { adapter: evmAdapter, chain: ArcTestnet };

      // We use direct two-wallet execution (Task 8: Forwarder not configured/proven)
      const rawResult = await kit.bridge({
        from: fromConfig as never,
        to: toConfig as never,
        amount,
      });

      console.log("Solana Bridge execution result:", rawResult);
      const result = rawResult as AppKitBridgeResult;

      if (result.state === "success" || result.state === "completed") {
        setStatus("completed");

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
      console.error("Solana Bridge execution error:", err);
      const errMsg = err instanceof Error ? err.message : "An unexpected error occurred during the bridge process";
      if (errMsg.includes("rejected") || errMsg.includes("User rejected")) {
        setError("User rejected the transaction");
      } else {
        setError(errMsg);
      }
      setStatus("failed");
    } finally {
      kit.off("bridge.approve", approveHandler);
      kit.off("bridge.burn", burnHandler);
      kit.off("bridge.fetchAttestation", fetchAttestationHandler);
      kit.off("bridge.mint", mintHandler);
    }
  }, [evmConnector, isEvmConnected, solanaWallet, isSolanaConnected, solanaPublicKey]);

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
