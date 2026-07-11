"use client";

import { useState, useEffect } from "react";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

export function SolanaConnectButton() {
  const { publicKey, disconnect, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button
        className="gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white border border-indigo-500/30 h-8 rounded-lg text-xs"
        size="sm"
      >
        <Wallet className="h-3.5 w-3.5" />
        Connect Solana
      </Button>
    );
  }

  if (connected && publicKey) {
    const address = publicKey.toBase58();
    const shortAddress = `${address.slice(0, 4)}...${address.slice(-4)}`;
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => disconnect()}
        className="gap-2 h-8 rounded-lg border-purple-500/30 text-purple-300 hover:bg-purple-950/20 hover:text-white text-xs font-mono"
        title="Click to disconnect"
      >
        <div className="h-1.5 w-1.5 rounded-full bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.5)] shrink-0" />
        Solana: {shortAddress}
      </Button>
    );
  }

  return (
    <Button
      className="gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white border border-indigo-500/30 shadow-[0_0_15px_rgba(147,51,234,0.15)] h-8 rounded-lg text-xs"
      size="sm"
      onClick={() => setVisible(true)}
    >
      <Wallet className="h-3.5 w-3.5" />
      Connect Solana
    </Button>
  );
}
