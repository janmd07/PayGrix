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
