"use client";

import { useMemo } from "react";
import {
  useAccount,
  useChains,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from "wagmi";

import { arcTestnet } from "@/config/arc-testnet";

export function shortenAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function useArcWallet() {
  const chains = useChains();
  const {
    address,
    connector,
    isConnected,
    isConnecting,
    isReconnecting,
    chainId: accountChainId,
    chain: accountChain,
  } = useAccount();
  const { connectors, connect, error: connectError, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, switchChainAsync, isPending: isSwitching } = useSwitchChain();

  const availableConnector = connectors[0];

  const chainId = isConnected && accountChainId ? accountChainId : arcTestnet.id;

  const currentNetwork = useMemo(() => {
    if (!isConnected) {
      return null;
    }

    return (
      accountChain ??
      chains.find((chain) => chain.id === chainId) ?? {
        id: chainId,
        name: `Unsupported network (${chainId})`,
      }
    );
  }, [accountChain, chainId, chains, isConnected]);

  const isArcTestnet = isConnected && chainId === arcTestnet.id;
  const isUnsupportedNetwork = isConnected && !isArcTestnet;

  return {
    address,
    availableConnector,
    chainId,
    connect,
    connectError,
    connector,
    currentNetwork,
    disconnect,
    isArcTestnet,
    isConnected,
    isConnecting: isPending || isConnecting || isReconnecting,
    isSwitching,
    isUnsupportedNetwork,
    switchToArcTestnet: () => switchChain({ chainId: arcTestnet.id }),
    switchToArcTestnetAsync: () => switchChainAsync({ chainId: arcTestnet.id }),
    switchChainAsync,
  };
}


