"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { AlertTriangle, PlugZap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useArcWallet } from "@/components/wallet/use-arc-wallet";

function ChainBadgeLogo({ chainId }: { chainId: number }) {
  const [hasError, setHasError] = useState(false);
  const logoUrl = chainId === 84532 ? "/chains/base.png" : chainId === 5042002 ? "/chains/arc.png" : null;
  const alt = chainId === 84532 ? "Base Sepolia" : "Arc Testnet";

  if (!logoUrl || hasError) {
    return <PlugZap className="mr-1 h-3.5 w-3.5 shrink-0" />;
  }

  return (
    <div className="relative mr-1.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center overflow-hidden rounded-full">
      <Image
        src={logoUrl}
        alt={alt}
        width={14}
        height={14}
        className="h-full w-full object-contain"
        onError={() => setHasError(true)}
      />
    </div>
  );
}

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

  if (!mounted || !isConnected) {
    return (
      <Badge variant="secondary" className="gap-1.5 text-xs">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
        Not Connected
      </Badge>
    );
  }

  const isArc = chainId === 5042002;
  const isBase = chainId === 84532;
  const isSupported = isArc || isBase;

  const networkName = isBase
    ? "Base Sepolia"
    : isArc
    ? "Arc Testnet"
    : (currentNetwork?.name ?? "Unsupported Network");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={isSupported ? "success" : "warning"} className="text-xs">
        {isSupported ? (
          <ChainBadgeLogo chainId={chainId} />
        ) : (
          <AlertTriangle className="mr-1 h-3.5 w-3.5 shrink-0" />
        )}
        {networkName}
      </Badge>
    </div>
  );
}
