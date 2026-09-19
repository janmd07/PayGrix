"use client";

import { useState, useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { arcTestnet } from "@/config/arc-testnet";
import { useArcWallet } from "@/components/wallet/use-arc-wallet";

export function UnsupportedNetworkWarning() {
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
  }, []);

  const { currentNetwork, isSwitching, isConnected, chainId, switchToArcTestnet } = useArcWallet();

  // PayGrix globally supports Arc Testnet (5042002) and Base Sepolia (84532).
  // The bridge feature additionally supports Arbitrum Sepolia (421614).
  // The swap feature additionally supports Arc Mainnet (5042).
  const isBridgePage = pathname === "/bridge";
  const isSwapPage = pathname === "/swap";
  const allowedChainIds = isBridgePage
    ? [5042002, 84532, 421614]
    : isSwapPage
    ? [5042002, 84532, 5042]
    : [5042002, 84532];
  const isUnsupported = isConnected && !allowedChainIds.includes(chainId);

  if (!mounted || !isUnsupported) {
    return null;
  }

  return (
    <Card className="mb-6 border-amber-200 bg-amber-50 text-amber-950">
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="text-sm font-semibold">Unsupported network connected</p>
            <p className="mt-1 text-sm leading-6">
              Current network: {currentNetwork?.name ?? "Unknown network"}.{" "}
              {isBridgePage
                ? "The bridge supports Arc Testnet, Base Sepolia, and Arbitrum Sepolia. Please switch to one of these networks to bridge."
                : isSwapPage
                ? "Swap supports Arc Mainnet, Arc Testnet, and Base Sepolia. Please switch to one of these networks."
                : "PayGrix supports Arc Testnet and Base Sepolia. Please switch to one of these networks."}
            </p>
          </div>
        </div>
        <Button variant="outline" disabled={isSwitching} onClick={switchToArcTestnet}>
          {isSwitching ? "Switching" : `Switch To ${arcTestnet.name}`}
        </Button>
      </CardContent>
    </Card>
  );
}

