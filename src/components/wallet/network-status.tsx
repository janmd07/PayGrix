"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, PlugZap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useArcWallet } from "@/components/wallet/use-arc-wallet";

export function NetworkStatus() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const {
    currentNetwork,
    isConnected,
    chainId,
  } = useArcWallet();

  const isArc = chainId === 5042002;
  const isBase = chainId === 84532;
  const isSupported = isArc || isBase;

  const networkName = isBase
    ? "Base Sepolia"
    : isArc
    ? "Arc Testnet"
    : (currentNetwork?.name ?? "Unsupported Network");

  if (!mounted || !isConnected) {
    return (
      <Badge variant="secondary">
        <PlugZap className="mr-1 h-3 w-3" />
        Arc Testnet
      </Badge>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={isSupported ? "success" : "warning"}>
        {isSupported ? (
          <PlugZap className="mr-1 h-3 w-3" />
        ) : (
          <AlertTriangle className="mr-1 h-3 w-3" />
        )}
        {networkName}
      </Badge>
    </div>
  );
}
