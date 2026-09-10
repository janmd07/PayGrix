export type SupportedPoolChain = "Arc" | "Base";

export interface PoolTokenConfig {
  address: `0x${string}`;
  decimals: number;
  symbol: string;
  name: string;
}

export interface PoolChainConfig {
  id: number;
  name: string;
  chainKey: string;
  blockExplorerUrl: string;
  factoryAddress: `0x${string}` | null;
  routerAddress: `0x${string}` | null;
  pairAddress: `0x${string}` | null;
  isDeployed: boolean;
  tokens: {
    USDC: PoolTokenConfig;
    EURC: PoolTokenConfig;
  };
}

export const POOL_CHAINS: Record<SupportedPoolChain, PoolChainConfig> = {
  Arc: {
    id: 5042002,
    name: "Arc Testnet",
    chainKey: "Arc_Testnet",
    blockExplorerUrl: "https://testnet.arcscan.app",
    factoryAddress: "0x05c69956564c556fc303Cb74C5505D0E1e8EDF2D",
    routerAddress: "0xB2A97BAABaB64B389948bebB58D639a654ABac89",
    pairAddress: "0xf9d04BDdA9C857C9440ac9eD6EbB9118686Ef7b2",
    isDeployed: true,
    tokens: {
      USDC: {
        address: "0x3600000000000000000000000000000000000000",
        decimals: 6,
        symbol: "USDC",
        name: "USD Coin",
      },
      EURC: {
        address: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
        decimals: 6,
        symbol: "EURC",
        name: "Euro Coin",
      },
    },
  },
  Base: {
    id: 84532,
    name: "Base Sepolia",
    chainKey: "Base",
    blockExplorerUrl: "https://sepolia.basescan.org",
    factoryAddress: null,
    routerAddress: null,
    pairAddress: null,
    isDeployed: false,
    tokens: {
      USDC: {
        address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        decimals: 6,
        symbol: "USDC",
        name: "USD Coin",
      },
      EURC: {
        address: "0x808456652fdb597867f38412077A9182bf77359F",
        decimals: 6,
        symbol: "EURC",
        name: "Euro Coin",
      },
    },
  },
};
