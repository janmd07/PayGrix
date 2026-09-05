import { NextResponse } from "next/server";
import { createPublicClient, http, encodeFunctionData, parseAbi, encodePacked } from "viem";
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
const BASE_ROUTER_ADDRESS = SWAP_CHAINS.Base.routerAddress; // SwapRouter02
const BASE_QUOTER_ADDRESS = SWAP_CHAINS.Base.quoterAddress!;
const BASE_POOL_FEE = SWAP_CHAINS.Base.feeTier || 500;
const BASE_ETH_USDC_FEE = 3000;

const arcRouterAbi = parseAbi([
  "function getAmountsOut(uint256 amountIn, address[] memory path) public view returns (uint256[] memory amounts)",
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)",
]);

const baseQuoterAbi = parseAbi([
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
  "function quoteExactInput(bytes path, uint256 amountIn) external returns (uint256 amountOut, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate)",
]);

const baseSwapRouterAbi = parseAbi([
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)",
  "function exactInput((bytes path, address recipient, uint256 amountIn, uint256 amountOutMinimum)) external payable returns (uint256 amountOut)",
  "function unwrapWETH9(uint256 amountMinimum, address recipient) external payable",
  "function multicall(bytes[] data) external payable returns (bytes[] results)",
]);

const arcPublicClient = createPublicClient({
  chain: arcTestnet,
  transport: http("https://rpc.testnet.arc.network"),
});

function isValidEvmAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export async function POST(request: Request) {
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

  // ROUTE 1: BASE SEPOLIA (Uniswap v3 SwapRouter02)
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

      // 1. Pre-flight quote verification
      if (isUsdcEurc) {
        const quoteRes = await basePublicClient.simulateContract({
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
        estOut = quoteRes.result[0];
      } else if (isWethUsdc) {
        const quoteRes = await basePublicClient.simulateContract({
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
        estOut = quoteRes.result[0];
      } else {
        // Multi-hop: WETH <-> EURC
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

        const quoteRes = await basePublicClient.simulateContract({
          address: BASE_QUOTER_ADDRESS,
          abi: baseQuoterAbi,
          functionName: "quoteExactInput",
          args: [path, rawAmountIn],
        });
        estOut = quoteRes.result[0];
      }

      const slipBps = BigInt(slippageBps);
      const minOut = (estOut * (BigInt(10000) - slipBps)) / BigInt(10000);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200); // 20 mins

      // 2. Build swap transaction calldata & value
      let swapData: `0x${string}`;
      let txValue: string = "0x0";
      let amountToApprove: string = amount;

      const isEthIn = tokenInLower === BASE_WETH_ADDRESS;
      const isEthOut = tokenOutLower === BASE_WETH_ADDRESS;

      if (isEthIn) {
        // Native ETH in -> value sent with tx, no approval needed
        txValue = `0x${rawAmountIn.toString(16)}`;
        amountToApprove = "0";

        if (isWethUsdc) {
          // ETH -> USDC (single-hop)
          swapData = encodeFunctionData({
            abi: baseSwapRouterAbi,
            functionName: "exactInputSingle",
            args: [
              {
                tokenIn: tokenInAddress as `0x${string}`,
                tokenOut: tokenOutAddress as `0x${string}`,
                fee: BASE_ETH_USDC_FEE,
                recipient: toAddress as `0x${string}`,
                amountIn: rawAmountIn,
                amountOutMinimum: minOut,
                sqrtPriceLimitX96: BigInt(0),
              },
            ],
          });
        } else {
          // ETH -> EURC (multi-hop)
          const path = encodePacked(
            ["address", "uint24", "address", "uint24", "address"],
            [tokenInAddress as `0x${string}`, BASE_ETH_USDC_FEE, SWAP_CHAINS.Base.tokens.USDC.address, BASE_POOL_FEE, tokenOutAddress as `0x${string}`]
          );
          swapData = encodeFunctionData({
            abi: baseSwapRouterAbi,
            functionName: "exactInput",
            args: [
              {
                path,
                recipient: toAddress as `0x${string}`,
                amountIn: rawAmountIn,
                amountOutMinimum: minOut,
              },
            ],
          });
        }
      } else if (isEthOut) {
        // ERC20 in -> Native ETH out (unwrapWETH9 via multicall)
        txValue = "0x0";
        amountToApprove = amount;

        let innerSwapCall: `0x${string}`;
        if (isWethUsdc) {
          // USDC -> ETH (single-hop)
          innerSwapCall = encodeFunctionData({
            abi: baseSwapRouterAbi,
            functionName: "exactInputSingle",
            args: [
              {
                tokenIn: tokenInAddress as `0x${string}`,
                tokenOut: tokenOutAddress as `0x${string}`,
                fee: BASE_ETH_USDC_FEE,
                recipient: BASE_ROUTER_ADDRESS,
                amountIn: rawAmountIn,
                amountOutMinimum: minOut,
                sqrtPriceLimitX96: BigInt(0),
              },
            ],
          });
        } else {
          // EURC -> ETH (multi-hop)
          const path = encodePacked(
            ["address", "uint24", "address", "uint24", "address"],
            [tokenInAddress as `0x${string}`, BASE_POOL_FEE, SWAP_CHAINS.Base.tokens.USDC.address, BASE_ETH_USDC_FEE, tokenOutAddress as `0x${string}`]
          );
          innerSwapCall = encodeFunctionData({
            abi: baseSwapRouterAbi,
            functionName: "exactInput",
            args: [
              {
                path,
                recipient: BASE_ROUTER_ADDRESS,
                amountIn: rawAmountIn,
                amountOutMinimum: minOut,
              },
            ],
          });
        }

        const unwrapCall = encodeFunctionData({
          abi: baseSwapRouterAbi,
          functionName: "unwrapWETH9",
          args: [minOut, toAddress as `0x${string}`],
        });

        swapData = encodeFunctionData({
          abi: baseSwapRouterAbi,
          functionName: "multicall",
          args: [[innerSwapCall, unwrapCall]],
        });
      } else {
        // USDC <-> EURC (existing single-hop)
        txValue = "0x0";
        amountToApprove = amount;
        swapData = encodeFunctionData({
          abi: baseSwapRouterAbi,
          functionName: "exactInputSingle",
          args: [
            {
              tokenIn: tokenInAddress as `0x${string}`,
              tokenOut: tokenOutAddress as `0x${string}`,
              fee: BASE_POOL_FEE,
              recipient: toAddress as `0x${string}`,
              amountIn: rawAmountIn,
              amountOutMinimum: minOut,
              sqrtPriceLimitX96: BigInt(0),
            },
          ],
        });
      }

      return NextResponse.json({
        transaction: {
          routerAddress: BASE_ROUTER_ADDRESS,
          to: BASE_ROUTER_ADDRESS,
          data: swapData,
          value: txValue,
          chainId: 84532,
          executionParams: {
            instructions: [
              {
                target: BASE_ROUTER_ADDRESS,
                data: swapData,
                value: txValue === "0x0" ? "0" : rawAmountIn.toString(),
                tokenIn: tokenInAddress,
                amountToApprove,
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
      console.error("Error building on-chain swap transaction for Base SwapRouter02:", err);
      return NextResponse.json(
        { error: "Failed to build transaction for selected pair and amount on Base." },
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

      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200); // 20 mins

      const swapData = encodeFunctionData({
        abi: arcRouterAbi,
        functionName: "swapExactTokensForTokens",
        args: [rawAmountIn, minOut, path, toAddress as `0x${string}`, deadline],
      });

      return NextResponse.json({
        transaction: {
          routerAddress: ARC_ROUTER_ADDRESS,
          to: ARC_ROUTER_ADDRESS,
          data: swapData,
          value: "0x0",
          chainId: 5042002,
          executionParams: {
            instructions: [
              {
                target: ARC_ROUTER_ADDRESS,
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

  return NextResponse.json(
    { error: "Unsupported chain. Supported chains are Arc_Testnet and Base." },
    { status: 400 }
  );
}

