import { NextResponse } from "next/server";

const ARC_TESTNET_CHAIN = "Arc_Testnet";

function isValidTxHash(hash: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
}

export async function GET(request: Request) {
  const apiKey = process.env.STABLECOIN_KIT_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Circle Swap configuration is not complete on the server (missing STABLECOIN_KIT_API_KEY)." },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const txHash = searchParams.get("txHash") || "";
  const chain = searchParams.get("chain") || "";

  // Server-side validation
  if (chain !== ARC_TESTNET_CHAIN) {
    return NextResponse.json(
      { error: "Unsupported chain. Only Arc Testnet is supported." },
      { status: 400 }
    );
  }

  if (!isValidTxHash(txHash)) {
    return NextResponse.json(
      { error: "Invalid EVM transaction hash." },
      { status: 400 }
    );
  }

  const targetUrl = new URL("https://api.circle.com/v1/stablecoinKits/swap/status");
  targetUrl.searchParams.set("txHash", txHash);
  targetUrl.searchParams.set("chain", chain);

  try {
    const res = await fetch(targetUrl.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      // Redact any raw error messages containing secrets or headers
      const displayMsg = errorData?.message || "Error polling swap status from Circle.";
      return NextResponse.json({ error: displayMsg }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("Error in swap status proxy:", err);
    // Redact internal server logs/errors
    return NextResponse.json({ error: "An unexpected server error occurred." }, { status: 500 });
  }
}
