import { NextResponse } from "next/server";

const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const EURC_ADDRESS = "0x89b50855aa3be2f677cd6303cec089b5f319d72a";
const CIRBTC_ADDRESS = "0xf0c4a4ce82a5746abaad9425360ab04fbba432bf";
const ARC_TESTNET_CHAIN = "Arc_Testnet";

function isValidEvmAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
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
  const tokenInAddress = searchParams.get("tokenInAddress") || "";
  const tokenInChain = searchParams.get("tokenInChain") || "";
  const tokenOutAddress = searchParams.get("tokenOutAddress") || "";
  const tokenOutChain = searchParams.get("tokenOutChain") || tokenInChain;
  const fromAddress = searchParams.get("fromAddress") || "";
  const toAddress = searchParams.get("toAddress") || "";
  const amount = searchParams.get("amount") || "";
  const slippageBps = searchParams.get("slippageBps");

  // Server-side validation
  const tokenInLower = tokenInAddress.toLowerCase();
  const tokenOutLower = tokenOutAddress.toLowerCase();

  const SUPPORTED_TOKENS = [USDC_ADDRESS, EURC_ADDRESS, CIRBTC_ADDRESS];
  const isSupportedPair =
    SUPPORTED_TOKENS.includes(tokenInLower) &&
    SUPPORTED_TOKENS.includes(tokenOutLower) &&
    tokenInLower !== tokenOutLower;

  if (!isSupportedPair) {
    return NextResponse.json(
      { error: "Unsupported token pair. Only USDC, EURC, and cirBTC swaps are supported." },
      { status: 400 }
    );
  }

  if (tokenInChain !== ARC_TESTNET_CHAIN || tokenOutChain !== ARC_TESTNET_CHAIN) {
    return NextResponse.json(
      { error: "Unsupported chain. Only Arc Testnet is supported." },
      { status: 400 }
    );
  }

  if (!amount || parseFloat(amount) <= 0 || isNaN(parseFloat(amount))) {
    return NextResponse.json(
      { error: "Invalid amount. Must be a positive value." },
      { status: 400 }
    );
  }

  if (!isValidEvmAddress(fromAddress) || !isValidEvmAddress(toAddress)) {
    return NextResponse.json(
      { error: "Invalid sender or recipient EVM address." },
      { status: 400 }
    );
  }

  const targetUrl = new URL("https://api.circle.com/v1/stablecoinKits/quote");
  targetUrl.searchParams.set("tokenInAddress", tokenInAddress);
  targetUrl.searchParams.set("tokenInChain", tokenInChain);
  targetUrl.searchParams.set("tokenOutAddress", tokenOutAddress);
  targetUrl.searchParams.set("tokenOutChain", tokenOutChain);
  targetUrl.searchParams.set("fromAddress", fromAddress);
  targetUrl.searchParams.set("toAddress", toAddress);
  targetUrl.searchParams.set("amount", amount);
  if (slippageBps) {
    targetUrl.searchParams.set("slippageBps", slippageBps);
  }

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
      const displayMsg = errorData?.message || "Error fetching quote from Circle.";
      return NextResponse.json({ error: displayMsg }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("Error in swap estimate proxy:", err);
    // Redact internal server logs/errors
    return NextResponse.json({ error: "An unexpected server error occurred." }, { status: 500 });
  }
}
