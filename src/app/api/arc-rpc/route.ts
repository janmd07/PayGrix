import { NextResponse } from "next/server";

const ARC_RPC_URL = "https://rpc.testnet.arc.network";
const PAIR_ADDRESS = "0xf9d04bdda9c857c9440ac9ed6ebb9118686ef7b2";

// Server-side cache setup
interface CacheEntry {
  data: unknown;
  timestamp: number;
  ttl: number;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<unknown>>();

function getCacheKey(body: unknown): string | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const bodyRecord = body as Record<string, unknown>;
  if (bodyRecord.method !== "eth_call") {
    return null;
  }

  const params = bodyRecord.params;
  if (!Array.isArray(params) || params.length === 0) {
    return null;
  }

  const callObj = params[0];
  if (!callObj || typeof callObj !== "object") {
    return null;
  }
  const callObjRecord = callObj as Record<string, unknown>;

  const to = (callObjRecord.to as string)?.toLowerCase();
  const data = (callObjRecord.data as string)?.toLowerCase() || "";

  if (to !== PAIR_ADDRESS) {
    return null;
  }

  if (data.startsWith("0x0902f1ac")) {
    return "getReserves";
  }

  if (data.startsWith("0x18160ddd")) {
    return "totalSupply";
  }

  if (data.startsWith("0x70a08231")) {
    // balanceOf(address). Extracts the address (offset 10, length 64)
    const addressPart = data.slice(10).replace(/^0+/, "");
    return `balanceOf:0x${addressPart.padStart(40, "0")}`;
  }

  return null;
}

export async function POST(request: Request) {
  const TIMEOUT_LIMIT = 8500; // 8.5s limit

  try {
    const body = await request.json();

    // Check if bypass header or clear_cache method is invoked
    const bypassHeader = request.headers.get("x-bypass-cache");
    const bodyRecord = body as Record<string, unknown>;
    if (bypassHeader === "true" || (bodyRecord && bodyRecord.method === "clear_cache")) {
      cache.clear();
      if (bodyRecord && bodyRecord.method === "clear_cache") {
        return NextResponse.json({ jsonrpc: "2.0", result: "cache_cleared", id: bodyRecord.id });
      }
    }

    // Validate JSON-RPC request structure (support both single and batch requests)
    const isArray = Array.isArray(body);
    const requests = isArray ? body : [body];

    if (requests.length === 0) {
      return NextResponse.json(
        { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Empty batch request" } },
        { status: 400 }
      );
    }

    for (const req of requests) {
      const reqRecord = req as Record<string, unknown>;
      if (!req || typeof req !== "object" || !reqRecord.jsonrpc) {
        return NextResponse.json(
          { jsonrpc: "2.0", id: reqRecord?.id ?? null, error: { code: -32600, message: "Invalid JSON-RPC request" } },
          { status: 400 }
        );
      }
    }

    // Caching & Deduplication logic (only for single requests matching cache keys)
    if (!isArray) {
      const cacheKey = getCacheKey(body);
      if (cacheKey) {
        const now = Date.now();
        const cached = cache.get(cacheKey);
        if (cached && now - cached.timestamp < cached.ttl) {
          return NextResponse.json(cached.data);
        }

        // Deduplicate in-flight requests
        let promise = inFlight.get(cacheKey);
        if (!promise) {
          promise = (async () => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_LIMIT);

            try {
              const upstreamRes = await fetch(ARC_RPC_URL, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
                signal: controller.signal,
              });
              clearTimeout(timeoutId);

              const bodyText = await upstreamRes.text();

              if (upstreamRes.status !== 200) {
                throw new Error(`status: ${upstreamRes.status}`);
              }
              if (bodyText.toLowerCase().includes("request limit reached") || bodyText.toLowerCase().includes("rate limit") || bodyText.toLowerCase().includes("too many requests")) {
                throw new Error("status: 429");
              }

              const responseData = JSON.parse(bodyText);

              // Cache shared pool state for 60s, wallet balanceOf for 30s
              const ttl = cacheKey.startsWith("balanceOf:") ? 30000 : 60000;
              cache.set(cacheKey, {
                data: responseData,
                timestamp: Date.now(),
                ttl,
              });

              return responseData;
            } catch (err: unknown) {
              clearTimeout(timeoutId);
              throw err;
            }
          })();

          inFlight.set(cacheKey, promise);
        }

        try {
          const responseData = await promise;
          return NextResponse.json(responseData);
        } catch {
          inFlight.delete(cacheKey);
          console.warn(`Upstream RPC call failed for key: ${cacheKey}`);
          return NextResponse.json(
            {
              jsonrpc: "2.0",
              id: bodyRecord.id ?? null,
              error: {
                code: -32603,
                message: "Arc Testnet RPC is temporarily busy. Please try again shortly.",
              },
            },
            { status: 429 }
          );
        } finally {
          inFlight.delete(cacheKey);
        }
      }
    }

    // Forward uncached/batch requests to official Arc Testnet RPC
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_LIMIT);

    try {
      const upstreamRes = await fetch(ARC_RPC_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const bodyText = await upstreamRes.text();
      let responseData;
      try {
        responseData = JSON.parse(bodyText);
      } catch {
        const bodyArr = body as { id?: unknown }[];
        responseData = {
          jsonrpc: "2.0",
          id: isArray ? (bodyArr[0]?.id ?? null) : (bodyRecord.id ?? null),
          error: { code: -32603, message: "Internal error parsing upstream RPC response" },
        };
      }

      return NextResponse.json(responseData, {
        status: upstreamRes.status,
        headers: {
          "Content-Type": "application/json",
        },
      });
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const isTimeout = (err as { name?: string }).name === "AbortError";
      console.warn(`Upstream RPC forward failed. status: ${isTimeout ? "timeout" : "network_error"}`);
      const bodyArr = body as { id?: unknown }[];
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id: isArray ? (bodyArr[0]?.id ?? null) : (bodyRecord.id ?? null),
          error: {
            code: -32603,
            message: isTimeout ? "Upstream RPC request timed out" : "Internal error proxying RPC request",
          },
        },
        { status: isTimeout ? 504 : 500 }
      );
    }

  } catch (err) {
    console.error("ERROR IN ARC-RPC API:", err);
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32603,
          message: "Internal error proxying RPC request",
        },
      },
      { status: 500 }
    );
  }
}
