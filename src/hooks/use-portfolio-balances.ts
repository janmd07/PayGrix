"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useBridgeBalance } from "@/hooks/use-bridge-balance";

export interface ChainBalanceInfo {
  network: string;
  token: string;
  balance: string;
  usdValue: string; // placeholder/computed
  status: "connected" | "disconnected" | "loading" | "unavailable";
}

export function usePortfolioBalances(evmAddress?: `0x${string}`, isEvmConnected?: boolean) {
  // Fetch EVM balances using existing hook
  const arcBalance = useBridgeBalance("Arc Testnet", evmAddress);
  const baseBalance = useBridgeBalance("Base Sepolia", evmAddress);
  const arbitrumBalance = useBridgeBalance("Arbitrum Sepolia", evmAddress);

  // Solana Specifics - Reuse existing integration connection from context provider
  const { connection } = useConnection();
  const { publicKey: solanaPublicKey, connected: isSolanaConnected } = useWallet();
  const [solanaBal, setSolanaBal] = useState<string>("0.00");
  const [isSolanaLoading, setIsSolanaLoading] = useState<boolean>(false);
  const [solanaError, setSolanaError] = useState<boolean>(false);

  const fetchSolanaBalance = useCallback(async () => {
    if (!solanaPublicKey || !isSolanaConnected || !connection) {
      setSolanaBal("0.00");
      setIsSolanaLoading(false);
      setSolanaError(false);
      return;
    }

    setIsSolanaLoading(true);
    setSolanaError(false);

    try {
      const usdcMint = new PublicKey("4zMMC9zXn6pD48W4WXb9h9V274Dkw7xvk7WR33KWjKu3");

      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        solanaPublicKey,
        { mint: usdcMint }
      );

      if (tokenAccounts.value.length === 0) {
        setSolanaBal("0.00");
      } else {
        const info = tokenAccounts.value[0].account.data.parsed.info;
        const uiAmount = info.tokenAmount.uiAmountString;
        setSolanaBal(uiAmount || "0.00");
      }
    } catch (err) {
      console.error("Failed to fetch Solana Devnet USDC balance:", err);
      setSolanaError(true);
      setSolanaBal("0.00");
    } finally {
      setIsSolanaLoading(false);
    }
  }, [solanaPublicKey, isSolanaConnected, connection]);

  // Fetch Solana balance once when wallet status/key changes, avoid loop polling
  useEffect(() => {
    fetchSolanaBalance();
  }, [solanaPublicKey, isSolanaConnected, fetchSolanaBalance]);

  const refreshAll = useCallback(() => {
    arcBalance.refreshBalance();
    baseBalance.refreshBalance();
    arbitrumBalance.refreshBalance();
    fetchSolanaBalance();
  }, [arcBalance, baseBalance, arbitrumBalance, fetchSolanaBalance]);

  // Aggregate results
  const balances: ChainBalanceInfo[] = [
    {
      network: "Arc Testnet",
      token: "USDC",
      balance: isEvmConnected && evmAddress ? arcBalance.balance : "0.00",
      usdValue: isEvmConnected && evmAddress ? `$${parseFloat(arcBalance.balance).toFixed(2)}` : "—",
      status: !isEvmConnected
        ? "disconnected"
        : arcBalance.isLoading
        ? "loading"
        : "connected",
    },
    {
      network: "Base Sepolia",
      token: "USDC",
      balance: isEvmConnected && evmAddress ? baseBalance.balance : "0.00",
      usdValue: isEvmConnected && evmAddress ? `$${parseFloat(baseBalance.balance).toFixed(2)}` : "—",
      status: !isEvmConnected
        ? "disconnected"
        : baseBalance.isLoading
        ? "loading"
        : "connected",
    },
    {
      network: "Arbitrum Sepolia",
      token: "USDC",
      balance: isEvmConnected && evmAddress ? arbitrumBalance.balance : "0.00",
      usdValue: isEvmConnected && evmAddress ? `$${parseFloat(arbitrumBalance.balance).toFixed(2)}` : "—",
      status: !isEvmConnected
        ? "disconnected"
        : arbitrumBalance.isLoading
        ? "loading"
        : "connected",
    },
    {
      network: "Solana Devnet",
      token: "USDC",
      balance: isSolanaConnected && solanaPublicKey ? solanaBal : "0.00",
      usdValue: isSolanaConnected && solanaPublicKey && !solanaError ? `$${parseFloat(solanaBal).toFixed(2)}` : "—",
      status: !isSolanaConnected
        ? "disconnected"
        : isSolanaLoading
        ? "loading"
        : solanaError
        ? "unavailable"
        : "connected",
    },
  ];

  return {
    balances,
    isLoading:
      arcBalance.isLoading ||
      baseBalance.isLoading ||
      arbitrumBalance.isLoading ||
      isSolanaLoading,
    refreshAll,
  };
}
