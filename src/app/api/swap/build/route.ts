import { NextResponse } from "next/server";
import { createPublicClient, http, encodeFunctionData, parseAbi } from "viem";
import { arcTestnet } from "@/config/arc-testnet";

const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const EURC_ADDRESS = "0x89b50855aa3be2f677cd6303cec089b5f319d72a";
const CIRBTC_ADDRESS = "0xf0c4a4ce82a5746abaad9425360ab04fbba432bf";
const ARC_TESTNET_CHAIN = "Arc_Testnet";
const ROUTER_ADDRESS = "0xB2A97BAABaB64B389948bebB58D639a654ABac89" as const;

const routerAbi = parseAbi([
  "function getAmountsOut(uint256 amountIn, address[] memory path) public view returns (uint256[] memory amounts)",
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)",
]);

const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http("https://rpc.testnet.arc.network"),
});

function isValidEvmAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export async function POST(request: Request) {
  const apiKey = process.env.STABLECOIN_KIT_API_KEY;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  const tokenInAddress = (body.tokenInAddress as string) || "";
  const tokenInChain = (body.tokenInChain as string) || "";
  const tokenOutAddress = (body.tokenOutAddress as string) || "";
  const tokenOutChain = (body.tokenOutChain as string) || tokenInChain;
  const fromAddress = (body.fromAddress as string) || "";
  const toAddress = (body.toAddress as string) || "";
  const amount = (body.amount as string) || "";
  const slippageBps = body.slippageBps !== undefined ? Number(body.slippageBps) : 100;

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

  // 1. Try Circle API if key is set
  if (apiKey) {
    try {
      const res = await fetch("https://api.circle.com/v1/stablecoinKits/swap", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          tokenInAddress,
          tokenInChain,
          tokenOutAddress,
          tokenOutChain,
          fromAddress,
          toAddress,
          amount,
          slippageBps,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        return NextResponse.json(data);
      }
    } catch {
      // Fallthrough to on-chain PayGrixArcRouter build
    }
  }

  // 2. Fallback: On-Chain DEX Swap Execution Params for PayGrixArcRouter
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

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200); // 20 mins

    const swapData = encodeFunctionData({
      abi: routerAbi,
      functionName: "swapExactTokensForTokens",
      args: [rawAmountIn, minOut, path, toAddress as `0x${string}`, deadline],
    });

    return NextResponse.json({
      transaction: {
        routerAddress: ROUTER_ADDRESS,
        executionParams: {
          instructions: [
            {
              target: ROUTER_ADDRESS,
              data: swapData,
              value: "0",
              tokenIn: tokenInAddress,
              amountToApprove: amount,
              tokenOut: tokenOutAddress,
              minTokenOut: minOut.toString(),
            },
          ],
          tokens: [
            {
              token: tokenInAddress,
              beneficiary: toAddress,
            },
          ],
          execId: "1",
          deadline: deadline.toString(),
          metadata: "0x",
        },
        signature: "0x",
      },
      amount: amount,
      estimatedAmount: estOut.toString(),
    });
  } catch (err) {
    console.error("Error building on-chain swap transaction for PayGrixArcRouter:", err);
    return NextResponse.json(
      { error: "Failed to build transaction for selected pair and amount on Arc Testnet." },
      { status: 404 }
    );
  }
}
