import { defineChain } from "viem";

export const arcMainnet = defineChain({
  id: 5042,
  name: "Arc Mainnet",
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.mainnet.arc.io"],
    },
  },
  blockExplorers: {
    default: {
      name: "Arc Explorer",
      url: "https://explorer.arc.io",
    },
  },
  testnet: false,
});

export const ARC_MAINNET_TOKENS = {
  USDC: {
    address: "0x3600000000000000000000000000000000000000" as `0x${string}`,
    decimals: 6,
    symbol: "USDC",
    name: "USD Coin",
  },
  EURC: {
    address: "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1" as `0x${string}`,
    decimals: 6,
    symbol: "EURC",
    name: "Euro Coin",
  },
} as const;

export const ARC_MAINNET_CONFIG = {
  chainId: 5042,
  name: "Arc Mainnet",
  rpcUrl: "https://rpc.mainnet.arc.io",
  explorerUrl: "https://explorer.arc.io",
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: 18,
  },
  tokens: ARC_MAINNET_TOKENS,
} as const;

export const ARC_MAINNET_UNISWAP_V4 = {
  quoter: "0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94" as `0x${string}`,
  poolManager: "0x8366a39CC670B4001A1121B8F6A443A643e40951" as `0x${string}`,
  universalRouter: "0x4fca4a51ab4f23a7447b3284fbd7d73289a89fb1" as `0x${string}`,
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3" as `0x${string}`,
  stateView: "0xF3334192D15450CdD385c8B70e03f9A6bD9E673b" as `0x${string}`,
  usdcEurcPool: {
    currency0: "0x3600000000000000000000000000000000000000" as `0x${string}`,
    currency1: "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1" as `0x${string}`,
    fee: 500,
    tickSpacing: 10,
    hooks: "0x0000000000000000000000000000000000000000" as `0x${string}`,
    poolId: "0xeb0fd02fb8044d5514fb6e165ee134fd547eff0378bb33b76f4b81d8b03bd1ae" as `0x${string}`,
  },
} as const;
