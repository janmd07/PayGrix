export type SupportedSwapChain = "ArcMainnet" | "BaseMainnet" | "Base";

export interface SwapChainConfig {
  id: number;
  name: string;
  chainKey: string; // for API routes ("Base" | "Arc_Mainnet" | "Base_Mainnet")
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
  BaseMainnet: {
    id: 8453,
    name: "Base Mainnet",
    chainKey: "Base_Mainnet",
    rpcUrls: ["https://mainnet.base.org", "https://base.llamarpc.com"],
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
