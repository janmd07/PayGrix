export type BridgeAsset = "USDC" | "EURC";

export interface BridgeAssetConfig {
  symbol: BridgeAsset;
  name: string;
  decimals: number;
  icon: string;
  supportedChains: string[];
}

export const BRIDGE_ASSETS: Record<BridgeAsset, BridgeAssetConfig> = {
  USDC: {
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    icon: "/tokens/usdc.png",
    supportedChains: [
      "Arc Testnet",
      "Base Sepolia",
      "Arbitrum Sepolia",
      "Solana Devnet",
      "GenLayer Bradbury",
    ],
  },
  EURC: {
    symbol: "EURC",
    name: "EUR Coin",
    decimals: 6,
    icon: "/tokens/eurc.png",
    supportedChains: ["Base Sepolia", "Arc Testnet"],
  },
};

// CCTPx / Expanded-Asset Constants
export const CCTS_ADDRESS = "0x63753E722bd2C2A5DF6EE19C5106662208B81077" as const;
export const EURC_TOKEN_MANAGER = "0xE5D6eacf2eD5A7F81cC89d2a216F004092c0C2E0" as const;
export const EURC_TOKEN_ID = "0x2587821a0ee7daa174b95436b5dab1731cfa1844775b010217d3c0dd02a4eecd" as const;
export const IRIS_SANDBOX_BASE = "https://iris-api-sandbox.circle.com" as const;

export const EURC_CHAIN_CONFIG: Record<
  "Base Sepolia" | "Arc Testnet",
  {
    name: "Base Sepolia" | "Arc Testnet";
    chainId: number;
    domain: number;
    eurc: `0x${string}`;
    decimals: number;
    messageTransmitter: `0x${string}`;
    rpcUrl: string;
  }
> = {
  "Base Sepolia": {
    name: "Base Sepolia",
    chainId: 84532,
    domain: 6,
    eurc: "0x808456652fdb597867f38412077A9182bf77359F",
    decimals: 6,
    messageTransmitter: "0xe737e5cebeeba77efe34d4aa090756590b1ce275",
    rpcUrl: "https://sepolia.base.org",
  },
  "Arc Testnet": {
    name: "Arc Testnet",
    chainId: 5042002,
    domain: 26,
    eurc: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
    decimals: 6,
    messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
    rpcUrl: "https://rpc.testnet.arc.network/",
  },
};

export interface ResolvedEurcRoute {
  sourceChain: "Base Sepolia" | "Arc Testnet";
  destinationChain: "Base Sepolia" | "Arc Testnet";
  sourceChainId: number;
  destinationChainId: number;
  sourceDomain: number;
  destinationDomain: number;
  sourceEURC: `0x${string}`;
  destinationEURC: `0x${string}`;
  cctsAddress: `0x${string}`;
  tokenManagerAddress: `0x${string}`;
  tokenId: `0x${string}`;
  destMessageTransmitter: `0x${string}`;
  sourceRpcUrl: string;
  destRpcUrl: string;
}

export function isEurcSupportedRoute(fromChain: string, toChain: string): boolean {
  return (
    (fromChain === "Base Sepolia" && toChain === "Arc Testnet") ||
    (fromChain === "Arc Testnet" && toChain === "Base Sepolia")
  );
}

export function resolveEurcBridgeRoute(
  fromChain: string,
  toChain: string
): ResolvedEurcRoute {
  if (fromChain === toChain) {
    throw new Error(
      `Source and destination networks cannot be identical: ${fromChain}`
    );
  }

  const isBaseToArc = fromChain === "Base Sepolia" && toChain === "Arc Testnet";
  const isArcToBase = fromChain === "Arc Testnet" && toChain === "Base Sepolia";

  if (!isBaseToArc && !isArcToBase) {
    throw new Error(
      `Unsupported EURC bridge route: ${fromChain} -> ${toChain}. EURC Phase 3 supports only Base Sepolia <-> Arc Testnet.`
    );
  }

  const src = EURC_CHAIN_CONFIG[fromChain as "Base Sepolia" | "Arc Testnet"];
  const dst = EURC_CHAIN_CONFIG[toChain as "Base Sepolia" | "Arc Testnet"];

  return {
    sourceChain: fromChain as "Base Sepolia" | "Arc Testnet",
    destinationChain: toChain as "Base Sepolia" | "Arc Testnet",
    sourceChainId: src.chainId,
    destinationChainId: dst.chainId,
    sourceDomain: src.domain,
    destinationDomain: dst.domain,
    sourceEURC: src.eurc,
    destinationEURC: dst.eurc,
    cctsAddress: CCTS_ADDRESS,
    tokenManagerAddress: EURC_TOKEN_MANAGER,
    tokenId: EURC_TOKEN_ID,
    destMessageTransmitter: dst.messageTransmitter,
    sourceRpcUrl: src.rpcUrl,
    destRpcUrl: dst.rpcUrl,
  };
}

export const BRIDGE_EXPLORER_URLS: Record<string, string> = {
  "Arc Testnet": "https://testnet.arcscan.app",
  "Base Sepolia": "https://sepolia.basescan.org",
  "Arbitrum Sepolia": "https://sepolia.arbiscan.io",
  "Solana Devnet": "https://explorer.solana.com",
  "GenLayer Bradbury": "https://explorer-bradbury.genlayer.com",
};

export function getBridgeExplorerUrl(chain: string): string {
  return BRIDGE_EXPLORER_URLS[chain] || "https://testnet.arcscan.app";
}

export function getBridgeExplorerTxUrl(chain: string, txHash: string): string {
  if (chain === "Solana Devnet") {
    return `https://explorer.solana.com/tx/${txHash}?cluster=devnet`;
  }
  if (chain === "GenLayer Bradbury") {
    return `https://explorer-bradbury.genlayer.com/tx/${txHash}`;
  }
  return `${getBridgeExplorerUrl(chain)}/tx/${txHash}`;
}

export function getCctpDomain(chain: string): number | undefined {
  if (chain === "Base Sepolia" || chain === "Base") return 6;
  if (chain === "Arc Testnet" || chain === "Arc") return 26;
  if (chain === "Arbitrum Sepolia" || chain === "Arbitrum") return 3;
  return undefined;
}
