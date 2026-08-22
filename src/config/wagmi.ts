import { http, createConfig, fallback } from "wagmi";
import { injected } from "wagmi/connectors";
import { defineChain } from "viem";

import { arcTestnet } from "@/config/arc-testnet";

export const baseSepolia = defineChain({
  id: 84532,
  name: "Base Sepolia",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [
        "https://base-sepolia.drpc.org",
        "https://base-sepolia-rpc.publicnode.com",
        "https://sepolia.base.org",
      ],
    },
  },
  blockExplorers: {
    default: {
      name: "Basescan",
      url: "https://sepolia.basescan.org",
    },
  },
  testnet: true,
});

export const arbitrumSepolia = defineChain({
  id: 421614,
  name: "Arbitrum Sepolia",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://sepolia-rollup.arbitrum.io/rpc"],
    },
  },
  blockExplorers: {
    default: {
      name: "Arbiscan",
      url: "https://sepolia.arbiscan.io",
    },
  },
  testnet: true,
});
export const mainnet = defineChain({
  id: 1,
  name: "Ethereum",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://cloudflare-eth.com"],
    },
  },
  blockExplorers: {
    default: {
      name: "Etherscan",
      url: "https://etherscan.io",
    },
  },
});

export const base = defineChain({
  id: 8453,
  name: "Base",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://mainnet.base.org"],
    },
  },
  blockExplorers: {
    default: {
      name: "Basescan",
      url: "https://basescan.org",
    },
  },
});

export const genlayerBradbury = defineChain({
  id: 4221,
  name: "GenLayer Bradbury",
  nativeCurrency: {
    name: "GEN",
    symbol: "GEN",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://rpc-bradbury.genlayer.com"],
    },
  },
  blockExplorers: {
    default: {
      name: "GenLayer Explorer",
      url: "https://explorer-bradbury.genlayer.com",
    },
  },
  testnet: true,
});

export const wagmiConfig = createConfig({
  chains: [arcTestnet, baseSepolia, arbitrumSepolia, mainnet, base, genlayerBradbury],
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: http(arcTestnet.rpcUrls.default.http[0]),
    [baseSepolia.id]: fallback([
      http("https://base-sepolia.drpc.org"),
      http("https://base-sepolia-rpc.publicnode.com"),
      http("https://sepolia.base.org"),
    ]),
    [arbitrumSepolia.id]: http(arbitrumSepolia.rpcUrls.default.http[0]),
    [mainnet.id]: http(mainnet.rpcUrls.default.http[0]),
    [base.id]: http(base.rpcUrls.default.http[0]),
    [genlayerBradbury.id]: http(genlayerBradbury.rpcUrls.default.http[0]),
  },
  ssr: true,
});

