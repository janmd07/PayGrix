import { NextResponse } from "next/server";
import { createPublicClient, http, parseAbi } from "viem";
import { arcTestnet } from "@/config/arc-testnet";

const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const EURC_ADDRESS = "0x89b50855aa3be2f677cd6303cec089b5f319d72a";
const CIRBTC_ADDRESS = "0xf0c4a4ce82a5746abaad9425360ab04fbba432bf";
const ARC_TESTNET_CHAIN = "Arc_Testnet";
const ROUTER_ADDRESS = "0xB2A97BAABaB64B389948bebB58D639a654ABac89" as const;

const routerAbi = parseAbi([
  "function getAmountsOut(uint256 amountIn, address[] memory path) public view returns (uint256[] memory amounts)",
]);

const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http("https://rpc.testnet.arc.network"),
});

function isValidEvmAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export async function GET(request: Request) {
  const apiKey = process.env.STABLECOIN_KIT_API_KEY;

  const { searchParams } = new URL(request.url);
  const tokenInAddress = searchParams.get("tokenInAddress") || "";
  const tokenInChain = searchParams.get("tokenInChain") || "";
  const tokenOutAddress = searchParams.get("tokenOutAddress") || "";
  const tokenOutChain = searchParams.get("tokenOutChain") || tokenInChain;
  const fromAddress = searchParams.get("fromAddress") || "";
  const toAddress = searchParams.get("toAddress") || "";
  const amount = searchParams.get("amount") || "";
  const slippageBps = searchParams.get("slippageBps") || "100";

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

  // 1. Try Circle API if key is available
  if (apiKey) {
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
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        return NextResponse.json(data);
      }
    } catch {
      // Fallthrough to on-chain DEX router quote fallback
    }
  }

  // 2. Fallback: On-Chain DEX Router Quote on Arc Testnet (PayGrixArcRouter)
  try {
    const rawAmountIn = BigInt(amount);
    const path = [tokenInAddress as `0x${string}`, tokenOutAddress as `0x${string}`];

    const amounts = await publicClient.readContract({
      address: ROUTER_ADDRESS,
      abi: routerAbi,
      functionName: "getAmountsOut",
      args: [rawAmountIn, path],
    });

    const estOut = amounts[amounts.length - 1];
    const slipBps = BigInt(slippageBps);
    const minOut = (estOut * (BigInt(10000) - slipBps)) / BigInt(10000);

    return NextResponse.json({
      quote: {
        estimatedAmount: estOut.toString(),
        minAmount: minOut.toString(),
      },
      fees: [
        {
          token: "USDC",
          amount: "0.00",
          type: "swap",
        },
      ],
    });
  } catch (err) {
    console.error("Error fetching on-chain DEX quote from PayGrixArcRouter:", err);
    return NextResponse.json(
      { error: "No route available for selected pair and amount on Arc Testnet." },
      { status: 404 }
    );
  }
}
