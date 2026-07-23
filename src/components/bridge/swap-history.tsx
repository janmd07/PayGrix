"use client";

import { History, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SwapHistoryItem } from "@/hooks/use-swap";

interface SwapHistoryProps {
  swaps: SwapHistoryItem[];
}

export function SwapHistory({ swaps }: SwapHistoryProps) {
  return (
    <Card className="border border-white/10 bg-[#060f24]/50 backdrop-blur-md">
      <CardHeader className="flex flex-row items-center justify-between border-b border-white/5 pb-4">
        <div className="flex items-center gap-2">
          <History className="h-4.5 w-4.5 text-purple-400" />
          <CardTitle className="text-base font-semibold">Swap History</CardTitle>
        </div>
        {swaps.length > 0 && (
          <Badge variant="outline" className="text-xs">
            {swaps.length} Total
          </Badge>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {swaps.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-slate-500 border border-white/8">
              <History className="h-6 w-6" />
            </div>
            <h4 className="text-sm font-semibold text-white">No swap transactions yet</h4>
            <p className="mt-1 text-xs text-slate-400 max-w-xs leading-5">
              Your swap transactions will appear here once executed on Arc Testnet.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[600px] p-4 space-y-2">
              {/* Header */}
              <div className="grid grid-cols-[1.5fr_1.5fr_1.5fr_1.5fr] px-4 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <span>From (Swapped)</span>
                <span>To (Received)</span>
                <span>Transaction Hash</span>
                <span>Date</span>
              </div>

              {/* Rows */}
              {swaps.map((tx) => (
                <div
                  key={tx.id}
                  className="grid grid-cols-[1.5fr_1.5fr_1.5fr_1.5fr] items-center border border-white/5 px-4 py-3 text-xs text-white hover:bg-white/[0.02] rounded-xl transition-all"
                >
                  <div className="font-semibold text-white">
                    {parseFloat(tx.amountIn).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 6,
                    })}{" "}
                    <span className={
                      tx.tokenIn === "USDC" ? "text-[#4f8cff]" :
                      tx.tokenIn === "EURC" ? "text-purple-400" :
                      "text-amber-500"
                    }>
                      {tx.tokenIn}
                    </span>
                  </div>

                  <div className="font-semibold text-white">
                    {parseFloat(tx.amountOut).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 6,
                    })}{" "}
                    <span className={
                      tx.tokenOut === "USDC" ? "text-[#4f8cff]" :
                      tx.tokenOut === "EURC" ? "text-purple-400" :
                      "text-amber-500"
                    }>
                      {tx.tokenOut}
                    </span>
                  </div>

                  <div>
                    {tx.txHash && (
                      <a
                        href={`https://testnet.arcscan.app/tx/${tx.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-purple-400 hover:text-white flex items-center gap-1 transition-all font-mono"
                      >
                        {tx.txHash.slice(0, 10)}...{tx.txHash.slice(-8)}{" "}
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    )}
                  </div>

                  <div className="text-slate-400">{tx.timestamp}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
