export type SupportedSwapChain = "Arc" | "ArcMainnet" | "Base";

export interface SwapChainConfig {
  id: number;
  name: string;
  chainKey: string; // for API routes ("Arc_Testnet" | "Base" | "Arc_Mainnet")
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
  ArcMainnet: {
    id: 5042,
    name: "Arc Mainnet",
    chainKey: "Arc_Mainnet",
    rpcUrls: ["https://rpc.mainnet.arc.io"],
    blockExplorerUrl: "https://explorer.arc.io",
    routerAddress: "0x4fca4a51ab4f23a7447b3284fbd7d73289a89fb1", // Universal Router (V4)
    quoterAddress: "0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94", // Quoter (V4)
    poolAddress: "0xeb0fd02fb8044d5514fb6e165ee134fd547eff0378bb33b76f4b81d8b03bd1ae",
    feeTier: 500, // 0.05% Uniswap V4 pool
    tokens: {
      USDC: {
        address: "0x3600000000000000000000000000000000000000",
        decimals: 6,
        symbol: "USDC",
      },
      EURC: {
        address: "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1",
        decimals: 6,
        symbol: "EURC",
      },
    },
  },
  Base: {
    id: 84532,
    name: "Base Sepolia",
    chainKey: "Base",
    rpcUrls: ["https://sepolia.base.org", "https://base-sepolia-rpc.publicnode.com"],
    blockExplorerUrl: "https://sepolia.basescan.org",
    routerAddress: "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4", // SwapRouter02
    quoterAddress: "0xC5290058841028F1614F3A6F0F5816cAd0df5E27", // QuoterV2
    poolAddress: "0x43047A302cD99DDb32E32B2886B40935b60aD2C1", // USDC/EURC 0.05%
    feeTier: 500, // 0.05% Uniswap v3 pool
    tokens: {
      ETH: {
        address: "0x4200000000000000000000000000000000000006",
        decimals: 18,
        symbol: "ETH",
      },
      USDC: {
        address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        decimals: 6,
        symbol: "USDC",
      },
      EURC: {
        address: "0x808456652fdb597867f38412077A9182bf77359F",
        decimals: 6,
        symbol: "EURC",
      },
    },
  },
};
