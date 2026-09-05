import { NextResponse } from "next/server";
import { createPublicClient, http, parseAbi, encodePacked } from "viem";
import { arcTestnet } from "@/config/arc-testnet";
import { SWAP_CHAINS } from "@/config/swap-config";
import { basePublicClient } from "@/lib/base-client";

// Arc Testnet Configuration
const ARC_USDC_ADDRESS = SWAP_CHAINS.Arc.tokens.USDC.address.toLowerCase();
const ARC_EURC_ADDRESS = SWAP_CHAINS.Arc.tokens.EURC.address.toLowerCase();
const ARC_CIRBTC_ADDRESS = SWAP_CHAINS.Arc.tokens.cirBTC.address.toLowerCase();
const ARC_TESTNET_CHAIN = "Arc_Testnet";
const ARC_ROUTER_ADDRESS = SWAP_CHAINS.Arc.routerAddress;

// Base Sepolia Configuration
const BASE_WETH_ADDRESS = "0x4200000000000000000000000000000000000006".toLowerCase();
const BASE_USDC_ADDRESS = SWAP_CHAINS.Base.tokens.USDC.address.toLowerCase();
const BASE_EURC_ADDRESS = SWAP_CHAINS.Base.tokens.EURC.address.toLowerCase();
const BASE_CHAIN = "Base";
const BASE_QUOTER_ADDRESS = SWAP_CHAINS.Base.quoterAddress!;
const BASE_POOL_FEE = SWAP_CHAINS.Base.feeTier || 500;
const BASE_ETH_USDC_FEE = 3000;

const arcRouterAbi = parseAbi([
  "function getAmountsOut(uint256 amountIn, address[] memory path) public view returns (uint256[] memory amounts)",
]);

const baseQuoterAbi = parseAbi([
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
  "function quoteExactInput(bytes path, uint256 amountIn) external returns (uint256 amountOut, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate)",
]);

const arcPublicClient = createPublicClient({
  chain: arcTestnet,
  transport: http("https://rpc.testnet.arc.network"),
});

function isValidEvmAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export async function GET(request: Request) {
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

  if (tokenInLower === tokenOutLower) {
    return NextResponse.json(
      { error: "Input and output tokens must be different." },
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

  // ROUTE 1: BASE SEPOLIA (Uniswap v3 QuoterV2)
  if (tokenInChain === BASE_CHAIN && tokenOutChain === BASE_CHAIN) {
    const isUsdcEurc =
      (tokenInLower === BASE_USDC_ADDRESS && tokenOutLower === BASE_EURC_ADDRESS) ||
      (tokenInLower === BASE_EURC_ADDRESS && tokenOutLower === BASE_USDC_ADDRESS);

    const isWethUsdc =
      (tokenInLower === BASE_WETH_ADDRESS && tokenOutLower === BASE_USDC_ADDRESS) ||
      (tokenInLower === BASE_USDC_ADDRESS && tokenOutLower === BASE_WETH_ADDRESS);

    const isWethEurc =
      (tokenInLower === BASE_WETH_ADDRESS && tokenOutLower === BASE_EURC_ADDRESS) ||
      (tokenInLower === BASE_EURC_ADDRESS && tokenOutLower === BASE_WETH_ADDRESS);

    if (!isUsdcEurc && !isWethUsdc && !isWethEurc) {
      return NextResponse.json(
        { error: "Unsupported token pair on Base. Supported tokens are ETH, USDC, EURC." },
        { status: 400 }
      );
    }

    try {
      const rawAmountIn = BigInt(amount);
      let estOut: bigint;

      if (isUsdcEurc) {
        const res = await basePublicClient.simulateContract({
          address: BASE_QUOTER_ADDRESS,
          abi: baseQuoterAbi,
          functionName: "quoteExactInputSingle",
          args: [
            {
              tokenIn: tokenInAddress as `0x${string}`,
              tokenOut: tokenOutAddress as `0x${string}`,
              amountIn: rawAmountIn,
              fee: BASE_POOL_FEE,
              sqrtPriceLimitX96: BigInt(0),
            },
          ],
        });
        estOut = res.result[0];
      } else if (isWethUsdc) {
        const res = await basePublicClient.simulateContract({
          address: BASE_QUOTER_ADDRESS,
          abi: baseQuoterAbi,
          functionName: "quoteExactInputSingle",
          args: [
            {
              tokenIn: tokenInAddress as `0x${string}`,
              tokenOut: tokenOutAddress as `0x${string}`,
              amountIn: rawAmountIn,
              fee: BASE_ETH_USDC_FEE,
              sqrtPriceLimitX96: BigInt(0),
            },
          ],
        });
        estOut = res.result[0];
      } else {
        // Multi-hop: WETH <-> EURC through USDC
        const path =
          tokenInLower === BASE_WETH_ADDRESS
            ? encodePacked(
                ["address", "uint24", "address", "uint24", "address"],
                [tokenInAddress as `0x${string}`, BASE_ETH_USDC_FEE, SWAP_CHAINS.Base.tokens.USDC.address, BASE_POOL_FEE, tokenOutAddress as `0x${string}`]
              )
            : encodePacked(
                ["address", "uint24", "address", "uint24", "address"],
                [tokenInAddress as `0x${string}`, BASE_POOL_FEE, SWAP_CHAINS.Base.tokens.USDC.address, BASE_ETH_USDC_FEE, tokenOutAddress as `0x${string}`]
              );

        const res = await basePublicClient.simulateContract({
          address: BASE_QUOTER_ADDRESS,
          abi: baseQuoterAbi,
          functionName: "quoteExactInput",
          args: [path, rawAmountIn],
        });
        estOut = res.result[0];
      }

      const slipBps = BigInt(slippageBps);
      const minOut = (estOut * (BigInt(10000) - slipBps)) / BigInt(10000);

      return NextResponse.json({
        quote: {
          estimatedAmount: estOut.toString(),
          minAmount: minOut.toString(),
        },
        fees: [
          {
            token: tokenInLower === BASE_WETH_ADDRESS ? "ETH" : "USDC",
            amount: "0.00",
            type: "swap",
          },
        ],
      });
    } catch (err) {
      console.error("Error fetching on-chain DEX quote from Uniswap v3 QuoterV2 on Base:", err);
      return NextResponse.json(
        { error: "No route or insufficient liquidity for selected pair and amount on Base." },
        { status: 404 }
      );
    }
  }

  // ROUTE 2: ARC TESTNET (PayGrixArcRouter)
  if (tokenInChain === ARC_TESTNET_CHAIN && tokenOutChain === ARC_TESTNET_CHAIN) {
    const ARC_SUPPORTED_TOKENS = [ARC_USDC_ADDRESS, ARC_EURC_ADDRESS, ARC_CIRBTC_ADDRESS];
    const isArcSupportedPair =
      ARC_SUPPORTED_TOKENS.includes(tokenInLower) &&
      ARC_SUPPORTED_TOKENS.includes(tokenOutLower);

    if (!isArcSupportedPair) {
      return NextResponse.json(
        { error: "Unsupported token pair. Only USDC, EURC, and cirBTC swaps are supported on Arc Testnet." },
        { status: 400 }
      );
    }

    try {
      const rawAmountIn = BigInt(amount);
      const path = [tokenInAddress as `0x${string}`, tokenOutAddress as `0x${string}`];

      const amounts = await arcPublicClient.readContract({
        address: ARC_ROUTER_ADDRESS,
        abi: arcRouterAbi,
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

  return NextResponse.json(
    { error: "Unsupported chain. Supported chains are Arc_Testnet and Base." },
    { status: 400 }
  );
}

