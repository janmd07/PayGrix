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

  const availableConnector = connectors.find((c) => c.id === "injected") || connectors[0];

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
  const isArcMainnet = isConnected && chainId === 5042;
  const isBaseMainnet = isConnected && chainId === 8453;
  const isBaseSepolia = isConnected && chainId === 84532;
  const isArbitrumSepolia = isConnected && chainId === 421614;

  const supportedChainIds = [5042, 8453, 5042002, 84532, 421614];
  const isSupportedNetwork = isConnected && supportedChainIds.includes(chainId);
  const isUnsupportedNetwork = isConnected && !supportedChainIds.includes(chainId);

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
    isArcMainnet,
    isBaseMainnet,
    isBaseSepolia,
    isArbitrumSepolia,
    isConnected,
    isConnecting: isPending || isConnecting || isReconnecting,
    isSwitching,
    isSupportedNetwork,
    isUnsupportedNetwork,
    switchToArcTestnet: () => switchChain({ chainId: arcTestnet.id }),
    switchToArcTestnetAsync: () => switchChainAsync({ chainId: arcTestnet.id }),
    switchToArcMainnet: () => switchChain({ chainId: 5042 }),
    switchToArcMainnetAsync: () => switchChainAsync({ chainId: 5042 }),
    switchToBaseMainnet: () => switchChain({ chainId: 8453 }),
    switchToBaseMainnetAsync: () => switchChainAsync({ chainId: 8453 }),
    switchChainAsync,
  };
}


