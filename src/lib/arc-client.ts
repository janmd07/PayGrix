import { createPublicClient, http, erc20Abi } from "viem";
import { arcTestnet } from "../config/arc-testnet";

// 1. Single shared Arc Testnet public client at module scope
export const arcPublicClient = createPublicClient({
  chain: arcTestnet,
  transport: http("/api/arc-rpc", {
    batch: true,
  }),
});

// 2. Request deduplication & balance caching
const inFlightRequests = new Map<string, Promise<bigint>>();
const balanceCache = new Map<string, { value: bigint; timestamp: number }>();
const CACHE_TTL_MS = 10000; // 10 seconds cache TTL

export async function fetchTokenBalanceDeduped(
  tokenAddress: `0x${string}`,
  userAddress: `0x${string}`
): Promise<bigint> {
  const cacheKey = `${tokenAddress.toLowerCase()}:${userAddress.toLowerCase()}`;
  const now = Date.now();

  // Check cache first to avoid repetitive RPC calls
  const cached = balanceCache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.value;
  }

  // Deduplicate in-flight requests for the exact same token and address
  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey)!;
  }

  const promise = (async () => {
    let lastError: unknown;
    const maxRetries = 1; // Maximum 2 attempts total (1 retry)

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const val = await arcPublicClient.readContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [userAddress],
        });
        balanceCache.set(cacheKey, { value: val, timestamp: Date.now() });
        return val;
      } catch (err: unknown) {
        lastError = err;
        const errMsg = (err as { message?: string }).message || "";
        const errCode = (err as { code?: number }).code;
        const is429 =
          errMsg.includes("request limit reached") ||
          errMsg.includes("429") ||
          errCode === -32011;

        if (is429) {
          // If rate-limited, return cached value if available, or wait 2s cooldown
          if (cached) return cached.value;
          if (attempt < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        } else if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }

    if (cached) return cached.value;
    throw lastError;
  })().finally(() => {
    inFlightRequests.delete(cacheKey);
  });

  inFlightRequests.set(cacheKey, promise);
  return promise;
}

export function clearBalanceCache(tokenAddress?: `0x${string}`, userAddress?: `0x${string}`) {
  if (tokenAddress && userAddress) {
    balanceCache.delete(`${tokenAddress.toLowerCase()}:${userAddress.toLowerCase()}`);
  } else {
    balanceCache.clear();
  }
}
