"use client";

import { useState } from "react";
import { Database, ExternalLink, Network, Shield, Copy, Check } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { isSupabaseConfigured } from "@/lib/supabase";

const settings = [
  { label: "Chain name", value: "Arc Testnet", icon: Network },
  { label: "Chain ID", value: "5042002", icon: Shield },
  { label: "RPC URL", value: "https://rpc.testnet.arc.network", icon: ExternalLink },
  { label: "Explorer", value: "https://testnet.arcscan.app", icon: ExternalLink },
];

const contracts = [
  { name: "Factory Address", address: "0x05c69956564c556fc303Cb74C5505D0E1e8EDF2D" },
  { name: "Router Address", address: "0xB2A97BAABaB64B389948bebB58D639a654ABac89" },
  { name: "USDC/EURC Pair Address", address: "0xf9d04BDdA9C857C9440ac9eD6EbB9118686Ef7b2" },
  { name: "USDC Address", address: "0x3600000000000000000000000000000000000000" },
  { name: "EURC Address", address: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" },
];

export default function SettingsPage() {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="Settings"
        title="Workspace configuration"
        description="Project-level configuration for Arc Testnet, Supabase, and wallet infrastructure."
      />
      <div className="flex flex-col gap-6">
        <div className="grid gap-4 xl:grid-cols-[1fr_0.8fr]">
          <Card>
            <CardHeader>
              <CardTitle>Arc network</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {settings.map((setting) => (
                <div key={setting.label} className="grid gap-3 rounded-md border p-3 sm:grid-cols-[180px_1fr]">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <setting.icon className="h-4 w-4" />
                    {setting.label}
                  </div>
                  <p className="break-words text-sm font-medium">{setting.value}</p>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Supabase</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-md border p-3">
                <div className="flex items-center gap-3">
                  <Database className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Client configuration</p>
                    <p className="text-xs text-muted-foreground">Uses public URL and anon key env vars</p>
                  </div>
                </div>
                <Badge variant={isSupabaseConfigured ? "success" : "warning"}>
                  {isSupabaseConfigured ? "Ready" : "Missing env"}
                </Badge>
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                Data tables, auth flows, and payroll logic are intentionally left for the next phase.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card id="protocol-contracts">
          <CardHeader>
            <CardTitle>Protocol Contracts</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Deployed PayGrix liquidity infrastructure on Arc Testnet.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              {contracts.map((contract) => (
                <div
                  key={contract.name}
                  className="flex flex-col justify-between gap-3 rounded-md border p-3 sm:flex-row sm:items-center"
                >
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-muted-foreground block">
                      {contract.name}
                    </span>
                    <span className="font-mono text-sm font-semibold text-white bg-white/5 px-2 py-0.5 rounded border border-white/5 inline-block">
                      {formatAddress(contract.address)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopy(contract.name, contract.address)}
                      className="h-8 rounded-lg text-xs font-semibold border-white/10 hover:bg-white/5 hover:text-white transition-all"
                    >
                      {copiedId === contract.name ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-400 mr-1" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5 mr-1" />
                          Copy
                        </>
                      )}
                    </Button>
                    <a
                      href={`https://testnet.arcscan.app/address/${contract.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-lg text-xs font-semibold border-white/10 hover:bg-white/5 hover:text-white transition-all"
                      >
                        <ExternalLink className="h-3.5 w-3.5 mr-1" />
                        ArcScan
                      </Button>
                    </a>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-md border p-3 bg-white/[0.02]">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground block mb-0.5">Network</span>
                  <span className="font-semibold text-white">Arc Testnet</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block mb-0.5">Chain ID</span>
                  <span className="font-semibold text-white">5042002</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
