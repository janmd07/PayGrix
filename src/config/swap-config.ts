export type SupportedSwapChain = "Arc" | "Base";

export interface SwapChainConfig {
  id: number;
  name: string;
  chainKey: string; // for API routes ("Arc_Testnet" | "Base")
  rpcUrls: string[];
  blockExplorerUrl: string;
  routerAddress: `0x${string}`;
  quoterAddress?: `0x${string}`;
  poolAddress?: `0x${string}`;
  feeTier?: number;
  tokens: {
    [symbol: string]: {
      address: `0x${string}`;
      decimals: number;
      symbol: string;
    };
  };
}

export const SWAP_CHAINS: Record<SupportedSwapChain, SwapChainConfig> = {
  Arc: {
    id: 5042002,
    name: "Arc Testnet",
    chainKey: "Arc_Testnet",
    rpcUrls: ["https://rpc.testnet.arc.network"],
    blockExplorerUrl: "https://testnet.arcscan.app",
    routerAddress: "0xB2A97BAABaB64B389948bebB58D639a654ABac89",
    tokens: {
      USDC: {
        address: "0x3600000000000000000000000000000000000000",
        decimals: 6,
        symbol: "USDC",
      },
      EURC: {
        address: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
        decimals: 6,
        symbol: "EURC",
      },
      cirBTC: {
        address: "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF",
        decimals: 8,
        symbol: "cirBTC",
      },
    },
  },
  Base: {
    id: 8453,
    name: "Base",
    chainKey: "Base",
    rpcUrls: ["https://base-rpc.publicnode.com", "https://mainnet.base.org"],
    blockExplorerUrl: "https://basescan.org",
    routerAddress: "0x2626664c2603336E57B271c5C0b26F421741e481", // SwapRouter02
    quoterAddress: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a", // QuoterV2
    poolAddress: "0x7279c08A36333e12c3Fc81747963264c100D66fB", // USDC/EURC 0.05%
    feeTier: 500, // 0.05% Uniswap v3 pool
    tokens: {
      USDC: {
        address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        decimals: 6,
        symbol: "USDC",
      },
      EURC: {
        address: "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42",
        decimals: 6,
        symbol: "EURC",
      },
    },
  },
};
