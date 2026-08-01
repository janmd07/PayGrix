import { NextResponse } from "next/server";

const ARC_RPC_URL = "https://rpc.testnet.arc.network";

export async function POST(request: Request) {
  try {
    const body = await request.json();

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
      if (!req || typeof req !== "object" || !req.jsonrpc) {
        return NextResponse.json(
          { jsonrpc: "2.0", id: req?.id ?? null, error: { code: -32600, message: "Invalid JSON-RPC request" } },
          { status: 400 }
        );
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const upstreamRes = await fetch(ARC_RPC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    const data = await upstreamRes.json().catch(() => ({
      jsonrpc: "2.0",
      id: body.id ?? null,
      error: { code: -32603, message: "Internal error parsing upstream RPC response" },
    }));

    return NextResponse.json(data, {
      status: upstreamRes.status,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (err: unknown) {
    const isAbort = (err as { name?: string }).name === "AbortError";
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32603,
          message: isAbort ? "Upstream RPC request timed out" : "Internal error proxying RPC request",
        },
      },
      { status: isAbort ? 504 : 500 }
    );
  }
}
