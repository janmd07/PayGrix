import { createPublicClient, http, fallback, erc20Abi } from "viem";
import { base } from "../config/wagmi";

// 1. Single shared Base Mainnet public client at module scope with fallback transport
export const basePublicClient = createPublicClient({
  chain: base,
  transport: fallback([
    http("https://base-rpc.publicnode.com"),
    http("https://mainnet.base.org"),
  ]),
});

// 2. Request deduplication & balance caching for Base tokens
const inFlightRequests = new Map<string, Promise<bigint>>();
const balanceCache = new Map<string, { value: bigint; timestamp: number }>();
const CACHE_TTL_MS = 10000; // 10 seconds cache TTL

export async function fetchBaseTokenBalanceDeduped(
  tokenAddress: `0x${string}`,
  userAddress: `0x${string}`
): Promise<bigint> {
  const cacheKey = `base:${tokenAddress.toLowerCase()}:${userAddress.toLowerCase()}`;
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
      const val = await basePublicClient.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [userAddress],
      });
      balanceCache.set(cacheKey, { value: val, timestamp: Date.now() });
      return val;
    } catch (err) {
      if (cached) return cached.value;
      throw err;
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, promise);
  return promise;
}

export function clearBaseBalanceCache() {
  balanceCache.clear();
}
