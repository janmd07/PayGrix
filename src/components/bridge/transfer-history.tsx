"use client";

import { History, ExternalLink, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";

export type BridgeTransfer = {
  id: string;
  fromChain: string;
  toChain: string;
  amount: string;
  status: "Completed" | "Pending" | "Failed";
  date: string;
  sourceTx?: string;
  destTx?: string;
  walletAddress?: string;
  userAddress?: string;
  sender?: string;
  initiator?: string;
};

interface TransferHistoryProps {
  transfers: BridgeTransfer[];
  isConnected?: boolean;
}

const EXPLORER_URLS: Record<string, string> = {
  "Arc Testnet": "https://testnet.arcscan.app",
  "Base Sepolia": "https://sepolia.basescan.org",
  "Arbitrum Sepolia": "https://sepolia.arbiscan.io",
};

function getExplorerUrl(chain: string): string {
  return EXPLORER_URLS[chain] || "https://testnet.arcscan.app";
}

export function TransferHistory({ transfers, isConnected = false }: TransferHistoryProps) {
  return (
    <Card className="border border-white/10 bg-[#060f24]/50 backdrop-blur-md">
      <CardHeader className="flex flex-row items-center justify-between border-b border-white/5 pb-4">
        <div className="flex items-center gap-2">
          <History className="h-4.5 w-4.5 text-primary" />
          <CardTitle className="text-base font-semibold">Recent Transfers</CardTitle>
        </div>
        {isConnected && transfers.length > 0 && (
          <Badge variant="outline" className="text-xs">
            {transfers.length} Total
          </Badge>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {!isConnected ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-slate-400 border border-white/10">
              <Wallet className="h-6 w-6 text-[#4f8cff]" />
            </div>
            <h4 className="text-sm font-semibold text-white">Wallet not connected</h4>
            <p className="mt-1.5 text-xs text-slate-400 max-w-xs leading-5">
              Connect your wallet to view your transaction history.
            </p>
            <div className="mt-4">
              <ConnectWalletButton size="sm" />
            </div>
          </div>
        ) : transfers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-slate-500 border border-white/8">
              <History className="h-6 w-6" />
            </div>
            <h4 className="text-sm font-semibold text-white">No bridge transactions yet</h4>
            <p className="mt-1 text-xs text-slate-400 max-w-xs leading-5">
              Your recent bridging history will appear here once you make a transfer.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[600px] p-4 space-y-2">
              {/* Header */}
              <div className="grid grid-cols-[1.2fr_1.2fr_1fr_1fr_1.2fr] px-4 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <span>From</span>
                <span>To</span>
                <span>Amount</span>
                <span>Status</span>
                <span>Date</span>
              </div>

              {/* Rows */}
              {transfers.map((tx) => (
                <div
                  key={tx.id}
                  className="grid grid-cols-[1.2fr_1.2fr_1fr_1fr_1.2fr] items-center border border-white/5 px-4 py-3 text-xs text-white hover:bg-white/[0.02] rounded-xl transition-all"
                >
                  <div>
                    <div className="font-medium text-slate-300">{tx.fromChain}</div>
                    {tx.sourceTx && (
                      <a
                        href={`${getExplorerUrl(tx.fromChain)}/tx/${tx.sourceTx}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-primary hover:text-white flex items-center gap-0.5 mt-0.5 transition-all font-mono"
                      >
                        {tx.sourceTx.slice(0, 6)}...{tx.sourceTx.slice(-4)}{" "}
                        <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                      </a>
                    )}
                  </div>
                  <div>
                    <div className="font-medium text-slate-300">{tx.toChain}</div>
                    {tx.destTx && (
                      <a
                        href={`${getExplorerUrl(tx.toChain)}/tx/${tx.destTx}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-primary hover:text-white flex items-center gap-0.5 mt-0.5 transition-all font-mono"
                      >
                        {tx.destTx.slice(0, 6)}...{tx.destTx.slice(-4)}{" "}
                        <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                      </a>
                    )}
                  </div>
                  <div className="font-semibold text-white">
                    {parseFloat(tx.amount).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 6,
                    })}{" "}
                    USDC
                  </div>
                  <div>
                    <Badge
                      variant={
                        tx.status === "Completed"
                          ? "success"
                          : tx.status === "Pending"
                          ? "warning"
                          : "secondary"
                      }
                      className="text-[10px] px-2 py-0.5"
                    >
                      {tx.status}
                    </Badge>
                  </div>
                  <div className="text-slate-400">{tx.date}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

