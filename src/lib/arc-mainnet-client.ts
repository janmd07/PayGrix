import { createPublicClient, http, erc20Abi } from "viem";
import { arcMainnet } from "@/config/arc-mainnet";

// 1. Single shared Arc Mainnet public read client at module scope
export const arcMainnetPublicClient = createPublicClient({
  chain: arcMainnet,
  transport: http("https://rpc.mainnet.arc.io", {
    batch: false,
  }),
});

// 2. Request deduplication & balance caching for Arc Mainnet tokens
const inFlightRequests = new Map<string, Promise<bigint>>();
const balanceCache = new Map<string, { value: bigint; timestamp: number }>();
const CACHE_TTL_MS = 10000; // 10 seconds cache TTL

export async function fetchArcMainnetTokenBalanceDeduped(
  tokenAddress: `0x${string}`,
  userAddress: `0x${string}`
): Promise<bigint> {
  const cacheKey = `arc_mainnet:${tokenAddress.toLowerCase()}:${userAddress.toLowerCase()}`;
  const now = Date.now();

  const cached = balanceCache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.value;
  }

  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey)!;
  }

  const promise = (async () => {
    try {
      const val = await arcMainnetPublicClient.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [userAddress],
      });
      balanceCache.set(cacheKey, { value: val, timestamp: Date.now() });
      return val;
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, promise);
  return promise;
}

export function clearArcMainnetBalanceCache(tokenAddress?: `0x${string}`, userAddress?: `0x${string}`) {
  if (tokenAddress && userAddress) {
    balanceCache.delete(`arc_mainnet:${tokenAddress.toLowerCase()}:${userAddress.toLowerCase()}`);
  } else {
    balanceCache.clear();
  }
}
