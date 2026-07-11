"use client";

import { ReactNode } from "react";
import dynamic from "next/dynamic";

const SolanaWalletProvider = dynamic(
  () => import("@/components/wallet/solana-wallet-provider").then((mod) => mod.SolanaWalletProvider),
  { ssr: false }
);

export default function BridgeLayout({ children }: { children: ReactNode }) {
  return <SolanaWalletProvider>{children}</SolanaWalletProvider>;
}
