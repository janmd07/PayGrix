export type SupportedLendingChain = "Arc" | "Base";

export interface LendingChainConfig {
  id: number;
  name: string;
  chainKey: string;
  lendingAddress: `0x${string}`;
  oracleAddress: `0x${string}`;
  blockExplorerUrl: string;
  collateral: {
    address: `0x${string}`;
    symbol: string;
    name: string;
    decimals: number;
  };
  debt: {
    address: `0x${string}`;
    symbol: string;
    name: string;
    decimals: number;
  };
  risk: {
    borrowLtvBps: number;
    liquidationThresholdBps: number;
  };
}

export const LENDING_CHAINS: Record<SupportedLendingChain, LendingChainConfig> = {
  Arc: {
    id: 5042002,
    name: "Arc Testnet",
    chainKey: "Arc_Testnet",
    lendingAddress: "0x800Cd0a3b737e989F45E69f64eEeB118724522aE",
    oracleAddress: "0xA17Bfb3332A83F0e247129ee9c0d1A454A332287",
    blockExplorerUrl: "https://testnet.arcscan.app",
    collateral: {
      address: "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF",
      symbol: "cirBTC",
      name: "cirBTC",
      decimals: 8,
    },
    debt: {
      address: "0x3600000000000000000000000000000000000000",
      symbol: "USDC",
      name: "USDC",
      decimals: 6,
    },
    risk: {
      borrowLtvBps: 5000,
      liquidationThresholdBps: 7500,
    },
  },
  Base: {
    id: 84532,
    name: "Base Sepolia",
    chainKey: "Base",
    lendingAddress: "0x7C5e75516D55703D564587aC35BF0D20a14e34b8",
    oracleAddress: "0x204e574eeEd81B4C766D225A3859aB7E19d17067",
    blockExplorerUrl: "https://sepolia.basescan.org",
    collateral: {
      address: "0x4200000000000000000000000000000000000006",
      symbol: "WETH",
      name: "Wrapped Ether",
      decimals: 18,
    },
    debt: {
      address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
    },
    risk: {
      borrowLtvBps: 5000,
      liquidationThresholdBps: 7500,
    },
  },
};
