import { Address, Abi } from "viem";
import { arcPublicClient } from "./arc-client";

export type CachePolicy = "static" | "shared" | "wallet" | "none";

export interface SafeReadContractOptions {
  cachePolicy?: CachePolicy;
  forceRefresh?: boolean;
}

export interface SafeGetBalanceOptions {
  forceRefresh?: boolean;
}

interface CacheEntry<T = unknown> {
  value: T;
  timestamp: number;
  ttl: number;
}

// Memory caches
const clientReadCache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<unknown>>();

// Cache TTL defaults
const TTL_CONFIG: Record<CachePolicy, number> = {
  static: 60 * 60 * 1000, // 60 minutes
  shared: 30 * 1000,      // 30 seconds
  wallet: 10 * 1000,      // 10 seconds
  none: 0,
};

/**
 * Generates a unique cache key based on query parameters.
 */
function generateCacheKey(
  address: string,
  functionName: string,
  args?: unknown[],
  walletAddress?: string
): string {
  const argString = args
    ? JSON.stringify(args, (_, v) => (typeof v === "bigint" ? v.toString() : v))
    : "";
  return `arc:${address.toLowerCase()}:${functionName}:${argString}:${walletAddress?.toLowerCase() || ""}`;
}

/**
 * Classifies whether a thrown error is retryable (network limits/429/timeouts)
 * and guarantees contract reverts are NOT retried.
 */
function shouldRetry(err: unknown): boolean {
  const errMsg = err instanceof Error ? err.message : String(err);
  const errMsgLower = errMsg.toLowerCase();

  const is429OrRateLimit =
    errMsgLower.includes("429") ||
    errMsgLower.includes("request limit reached") ||
    errMsgLower.includes("rate limit") ||
    errMsgLower.includes("too many requests") ||
    errMsgLower.includes("busy") ||
    errMsgLower.includes("timeout") ||
    errMsgLower.includes("network") ||
    errMsgLower.includes("fetch") ||
    errMsgLower.includes("abort") ||
    errMsgLower.includes("failed to fetch");

  const errCode = (err as { code?: number }).code;
  const isRpcRetryableCode = errCode === -32011 || errCode === -32603;

  const isRevert =
    errMsgLower.includes("revert") ||
    errMsgLower.includes("reverted") ||
    errMsgLower.includes("contractfunctionrevertederror");

  return (is429OrRateLimit || isRpcRetryableCode) && !isRevert;
}

/**
 * Sanitizes errors into short user-friendly strings without leaking details.
 */
export function sanitizeArcError(error: unknown): string {
  if (!error) return "Unable to load on-chain data. Please try again.";

  const errMsg = error instanceof Error ? error.message : String(error);
  const errMsgLower = errMsg.toLowerCase();

  // 1. Wallet rejection
  if (
    errMsgLower.includes("user rejected") ||
    errMsgLower.includes("user_rejected") ||
    errMsgLower.includes("transaction rejected") ||
    errMsgLower.includes("rejected by user") ||
    errMsgLower.includes("signature rejected") ||
    (error as { code?: number }).code === 4001
  ) {
    return "Transaction rejected by wallet.";
  }

  // 2. Wrong network
  if (
    errMsgLower.includes("chain mismatch") ||
    errMsgLower.includes("wrong chain") ||
    errMsgLower.includes("switch to arc testnet") ||
    (error as { code?: number }).code === 4902
  ) {
    return "Please switch to Arc Testnet.";
  }

  // 3. RPC rate limit
  if (
    errMsgLower.includes("429") ||
    errMsgLower.includes("request limit reached") ||
    errMsgLower.includes("rate limit") ||
    errMsgLower.includes("too many requests") ||
    errMsgLower.includes("busy") ||
    (error as { code?: number }).code === -32011
  ) {
    return "Arc Testnet RPC is temporarily busy. Please try again shortly.";
  }

  // 4. Generic fallback mapping
  return "Unable to load on-chain data. Please try again.";
}

/**
 * Safely reads contract data via arcPublicClient through /api/arc-rpc.
 * Implements deduplication, caching policies, and network cooldown retries.
 */
export async function safeArcReadContract<T = unknown>(
  parameters: {
    address: Address;
    abi: Abi | readonly unknown[];
    functionName: string;
    args?: unknown[];
    account?: Address;
  },
  options: SafeReadContractOptions = {}
): Promise<T> {
  const { cachePolicy = "none", forceRefresh = false } = options;
  const walletAddress =
    parameters.account ||
    (parameters.args?.find(
      (arg) => typeof arg === "string" && arg.startsWith("0x") && arg.length === 42
    ) as string);

  const cacheKey = generateCacheKey(
    parameters.address,
    parameters.functionName,
    parameters.args,
    walletAddress
  );

  const now = Date.now();
  const ttl = TTL_CONFIG[cachePolicy];

  if (!forceRefresh && ttl > 0) {
    const cached = clientReadCache.get(cacheKey);
    if (cached && now - cached.timestamp < cached.ttl) {
      return cached.value as T;
    }
  }

  // Request deduplication
  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey) as Promise<T>;
  }

  const promise = (async () => {
    let lastError: unknown;
    const maxRetries = 1;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const val = await arcPublicClient.readContract(parameters as unknown as Parameters<typeof arcPublicClient.readContract>[0]);
        
        if (ttl > 0) {
          clientReadCache.set(cacheKey, {
            value: val,
            timestamp: Date.now(),
            ttl,
          });
        }
        return val as T;
      } catch (err) {
        lastError = err;
        
        if (attempt < maxRetries && shouldRetry(err)) {
          // Wait 2.5 seconds before retrying
          await new Promise((resolve) => setTimeout(resolve, 2500));
          continue;
        }
        break;
      }
    }
    throw lastError;
  })().finally(() => {
    inFlightRequests.delete(cacheKey);
  });

  inFlightRequests.set(cacheKey, promise);
  return promise;
}

/**
 * Safely reads native balance of an address on Arc Testnet.
 */
export async function safeArcGetBalance(
  address: Address,
  options: SafeGetBalanceOptions = {}
): Promise<bigint> {
  const { forceRefresh = false } = options;
  const cacheKey = generateCacheKey("native", "getBalance", [address], address);

  const now = Date.now();
  const ttl = TTL_CONFIG.wallet; // 10 seconds

  if (!forceRefresh) {
    const cached = clientReadCache.get(cacheKey);
    if (cached && now - cached.timestamp < cached.ttl) {
      return cached.value as bigint;
    }
  }

  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey) as Promise<bigint>;
  }

  const promise = (async () => {
    let lastError: unknown;
    const maxRetries = 1;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const val = await arcPublicClient.getBalance({ address });
        
        clientReadCache.set(cacheKey, {
          value: val,
          timestamp: Date.now(),
          ttl,
        });
        return val;
      } catch (err) {
        lastError = err;
        if (attempt < maxRetries && shouldRetry(err)) {
          await new Promise((resolve) => setTimeout(resolve, 2500));
          continue;
        }
        break;
      }
    }
    throw lastError;
  })().finally(() => {
    inFlightRequests.delete(cacheKey);
  });

  inFlightRequests.set(cacheKey, promise);
  return promise;
}

/**
 * Clears cached entries and in-flight request states.
 */
export function clearArcReadCache(keyOrNamespace?: string): void {
  if (!keyOrNamespace) {
    clientReadCache.clear();
    inFlightRequests.clear();
    return;
  }

  const target = keyOrNamespace.toLowerCase();
  for (const key of clientReadCache.keys()) {
    const kLower = key.toLowerCase();
    if (kLower === target || kLower.startsWith(target) || kLower.includes(target)) {
      clientReadCache.delete(key);
    }
  }
  for (const key of inFlightRequests.keys()) {
    const kLower = key.toLowerCase();
    if (kLower === target || kLower.startsWith(target) || kLower.includes(target)) {
      inFlightRequests.delete(key);
    }
  }
}

/**
 * Sanitizes transaction and execution errors to prevent leaking raw calldata,
 * URLs, stack traces, or request bodies, mapping RPC failures to a standard message.
 */
export function sanitizeExecutionError(error: unknown): string {
  if (!error) return "An unexpected error occurred.";

  const errMsg = error instanceof Error ? error.message : String(error);
  const errMsgLower = errMsg.toLowerCase();

  // 1. Wallet rejection
  if (
    errMsgLower.includes("user rejected") ||
    errMsgLower.includes("user_rejected") ||
    errMsgLower.includes("transaction rejected") ||
    errMsgLower.includes("rejected by user") ||
    errMsgLower.includes("signature rejected") ||
    (error as { code?: number }).code === 4001
  ) {
    return "Transaction rejected by wallet.";
  }

  // 2. Contract revert
  if (
    errMsgLower.includes("revert") ||
    errMsgLower.includes("reverted") ||
    errMsgLower.includes("contractfunctionrevertederror")
  ) {
    const match = errMsg.match(/reverted with the following reason:\s*([^\n]+)/i) ||
                  errMsg.match(/execution reverted:\s*([^\n]+)/i);
    if (match && match[1]) {
      return `Transaction reverted: ${match[1].trim()}`;
    }
    return "Transaction reverted on-chain.";
  }

  // 3. Genuine RPC / Network / Connection failures
  if (
    errMsgLower.includes("429") ||
    errMsgLower.includes("request limit reached") ||
    errMsgLower.includes("rate limit") ||
    errMsgLower.includes("too many requests") ||
    errMsgLower.includes("busy") ||
    errMsgLower.includes("timeout") ||
    errMsgLower.includes("network") ||
    errMsgLower.includes("fetch") ||
    errMsgLower.includes("abort") ||
    errMsgLower.includes("failed to fetch") ||
    errMsgLower.includes("http request failed") ||
    errMsgLower.includes("connection failed") ||
    errMsgLower.includes("rpc")
  ) {
    return "Arc Testnet RPC is temporarily busy. Please try again shortly.";
  }

  // 4. Default clean fallback (avoid leaking calldata/stacktrace/URLs)
  return "An unexpected error occurred. Please try again.";
}
