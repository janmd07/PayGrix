"use client";

import React, { FC, ReactNode, useMemo, useEffect } from "react";
import { ConnectionProvider, WalletProvider, useWallet } from "@solana/wallet-adapter-react";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";

import "@solana/wallet-adapter-react-ui/styles.css";

interface SolanaWalletProviderProps {
  children: ReactNode;
}

// Temporary diagnostics component to dump state to the dev console
function SolanaDiagnostics() {
  const { wallets, wallet, connecting, connected, publicKey } = useWallet();

  useEffect(() => {
    console.log("=== Solana Wallet Diagnostics ===");
    console.log("Available Wallets in Context:", wallets.map(w => ({
      name: w.adapter.name,
      readyState: w.readyState,
    })));
    console.log("Selected Wallet Name:", wallet?.adapter.name || "None");
    console.log("Connecting state:", connecting);
    console.log("Connected state:", connected);
    console.log("Connected Public Key:", publicKey?.toBase58() || "None");
    console.log("=================================");
  }, [wallets, wallet, connecting, connected, publicKey]);

  return null;
}

export const SolanaWalletProvider: FC<SolanaWalletProviderProps> = ({ children }) => {
  const network = WalletAdapterNetwork.Devnet;

  // Use the standard devnet RPC endpoint
  const endpoint = useMemo(() => clusterApiUrl(network), [network]);

  // Explicitly instantiating the required adapters
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>
          <SolanaDiagnostics />
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};
