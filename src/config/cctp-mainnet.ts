export type MainnetChainKey = "Arc Mainnet" | "Base Mainnet" | "Arbitrum One";

export interface MainnetChainCctpConfig {
  name: MainnetChainKey;
  chainId: number;
  domain: number;
  nativeUsdc: `0x${string}`;
  decimals: number;
  tokenMessengerV2: `0x${string}`;
  messageTransmitterV2: `0x${string}`;
  rpcUrl: string;
  explorerUrl: string;
  gasToken: string;
}

export const CIRCLE_IRIS_PRODUCTION_API = "https://iris-api.circle.com" as const;

// Verified Production CCTP V2 Shared Contract Addresses across EVM chains
export const CCTP_V2_TOKEN_MESSENGER = "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d" as const;
export const CCTP_V2_MESSAGE_TRANSMITTER = "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64" as const;

export const MAINNET_CHAINS: Record<MainnetChainKey, MainnetChainCctpConfig> = {
  "Arc Mainnet": {
    name: "Arc Mainnet",
    chainId: 5042,
    domain: 26,
    nativeUsdc: "0x3600000000000000000000000000000000000000",
    decimals: 6,
    tokenMessengerV2: CCTP_V2_TOKEN_MESSENGER,
    messageTransmitterV2: CCTP_V2_MESSAGE_TRANSMITTER,
    rpcUrl: "https://rpc.mainnet.arc.io",
    explorerUrl: "https://explorer.arc.io",
    gasToken: "USDC",
  },
  "Base Mainnet": {
    name: "Base Mainnet",
    chainId: 8453,
    domain: 6,
    nativeUsdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    decimals: 6,
    tokenMessengerV2: CCTP_V2_TOKEN_MESSENGER,
    messageTransmitterV2: CCTP_V2_MESSAGE_TRANSMITTER,
    rpcUrl: "https://mainnet.base.org",
    explorerUrl: "https://basescan.org",
    gasToken: "ETH",
  },
  "Arbitrum One": {
    name: "Arbitrum One",
    chainId: 42161,
    domain: 3,
    nativeUsdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    decimals: 6,
    tokenMessengerV2: CCTP_V2_TOKEN_MESSENGER,
    messageTransmitterV2: CCTP_V2_MESSAGE_TRANSMITTER,
    rpcUrl: "https://arb1.arbitrum.io/rpc",
    explorerUrl: "https://arbiscan.io",
    gasToken: "ETH",
  },
};

export interface MainnetRouteConfig {
  sourceChain: MainnetChainKey;
  destinationChain: MainnetChainKey;
  enabled: boolean;
  disabledReason?: string;
}

export const MAINNET_CCTP_ROUTES: MainnetRouteConfig[] = [
  // Production-enabled
  { sourceChain: "Arc Mainnet", destinationChain: "Base Mainnet", enabled: true },
  { sourceChain: "Base Mainnet", destinationChain: "Arc Mainnet", enabled: true },

  // Architecturally configured but strictly disabled
  {
    sourceChain: "Arc Mainnet",
    destinationChain: "Arbitrum One",
    enabled: false,
    disabledReason: "Arbitrum route coming soon",
  },
  {
    sourceChain: "Arbitrum One",
    destinationChain: "Arc Mainnet",
    enabled: false,
    disabledReason: "Arbitrum route coming soon",
  },
  {
    sourceChain: "Base Mainnet",
    destinationChain: "Arbitrum One",
    enabled: false,
    disabledReason: "Arbitrum route coming soon",
  },
  {
    sourceChain: "Arbitrum One",
    destinationChain: "Base Mainnet",
    enabled: false,
    disabledReason: "Arbitrum route coming soon",
  },
];

export interface ResolvedMainnetCctpRoute {
  sourceChain: MainnetChainKey;
  destinationChain: MainnetChainKey;
  sourceConfig: MainnetChainCctpConfig;
  destinationConfig: MainnetChainCctpConfig;
  sourceDomain: number;
  destinationDomain: number;
  sourceUsdc: `0x${string}`;
  destinationUsdc: `0x${string}`;
  sourceTokenMessenger: `0x${string}`;
  destinationMessageTransmitter: `0x${string}`;
  enabled: boolean;
  disabledReason?: string;
}

export function isMainnetChain(chain: string): chain is MainnetChainKey {
  return chain === "Arc Mainnet" || chain === "Base Mainnet" || chain === "Arbitrum One";
}

export function isMainnetRouteEnabled(fromChain: string, toChain: string): boolean {
  if (!isMainnetChain(fromChain) || !isMainnetChain(toChain)) {
    return false;
  }
  if (fromChain === toChain) {
    return false;
  }
  const route = MAINNET_CCTP_ROUTES.find(
    (r) => r.sourceChain === fromChain && r.destinationChain === toChain
  );
  return route?.enabled === true;
}

export function resolveMainnetCctpRoute(
  fromChain: string,
  toChain: string
): ResolvedMainnetCctpRoute {
  if (!isMainnetChain(fromChain)) {
    throw new Error(`Unsupported source chain: "${fromChain}". Expected one of: Arc Mainnet, Base Mainnet, Arbitrum One.`);
  }
  if (!isMainnetChain(toChain)) {
    throw new Error(`Unsupported destination chain: "${toChain}". Expected one of: Arc Mainnet, Base Mainnet, Arbitrum One.`);
  }
  if (fromChain === toChain) {
    throw new Error(`Source and destination chains cannot be identical (${fromChain}).`);
  }

  const routeDef = MAINNET_CCTP_ROUTES.find(
    (r) => r.sourceChain === fromChain && r.destinationChain === toChain
  );

  const sourceConfig = MAINNET_CHAINS[fromChain];
  const destinationConfig = MAINNET_CHAINS[toChain];

  return {
    sourceChain: fromChain,
    destinationChain: toChain,
    sourceConfig,
    destinationConfig,
    sourceDomain: sourceConfig.domain,
    destinationDomain: destinationConfig.domain,
    sourceUsdc: sourceConfig.nativeUsdc,
    destinationUsdc: destinationConfig.nativeUsdc,
    sourceTokenMessenger: sourceConfig.tokenMessengerV2,
    destinationMessageTransmitter: destinationConfig.messageTransmitterV2,
    enabled: routeDef?.enabled === true,
    disabledReason: routeDef?.disabledReason,
  };
}

export function getMainnetExplorerTxUrl(chain: MainnetChainKey, txHash: string): string {
  const config = MAINNET_CHAINS[chain];
  if (!config) return `https://explorer.arc.io/tx/${txHash}`;
  return `${config.explorerUrl}/tx/${txHash}`;
}

export function getChainByDomain(domain: number): MainnetChainKey | undefined {
  for (const [chainKey, cfg] of Object.entries(MAINNET_CHAINS)) {
    if (cfg.domain === domain) {
      return chainKey as MainnetChainKey;
    }
  }
  return undefined;
}

export const SUPPORTED_RECOVERY_DOMAINS = [6, 26] as const;

export function isSupportedRecoveryRoute(sourceDomain: number, destinationDomain: number): boolean {
  return (
    (sourceDomain === 6 && destinationDomain === 26) ||
    (sourceDomain === 26 && destinationDomain === 6)
  );
}
