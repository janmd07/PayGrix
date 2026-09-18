import { parseAbi, formatUnits } from "viem";
import { arcMainnetPublicClient } from "@/lib/arc-mainnet-client";
import { ARC_MAINNET_TOKENS, ARC_MAINNET_UNISWAP_V4 } from "@/config/arc-mainnet";

export const quoterV4Abi = parseAbi([
  "function quoteExactInputSingle(((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, bool zeroForOne, uint128 exactAmount, bytes hookData)) external returns (uint256 amountOut, uint256 gasEstimate)",
]);

export interface ArcMainnetQuoteParams {
  tokenInAddress: string;
  tokenOutAddress: string;
  amountIn: bigint;
  slippageBps?: number;
}

export interface ArcMainnetQuoteResult {
  tokenIn: "USDC" | "EURC";
  tokenOut: "USDC" | "EURC";
  amountIn: bigint;
  amountOut: bigint;
  minAmountOut: bigint;
  formattedAmountIn: string;
  formattedAmountOut: string;
  formattedMinAmountOut: string;
  gasEstimate: bigint;
  executionPrice: string;
  feeTier: number;
  poolId: `0x${string}`;
  route: "Uniswap_V4_Direct";
}

const USDC_ADDRESS = ARC_MAINNET_TOKENS.USDC.address.toLowerCase();
const EURC_ADDRESS = ARC_MAINNET_TOKENS.EURC.address.toLowerCase();

/**
 * Executes a strictly read-only on-chain quote simulation against Uniswap V4 Quoter on Arc Mainnet.
 * Does not send transactions, touch approvals, or mutate any state.
 */
export async function getArcMainnetV4Quote(
  params: ArcMainnetQuoteParams
): Promise<ArcMainnetQuoteResult> {
  const { tokenInAddress, tokenOutAddress, amountIn, slippageBps = 100 } = params;

  const tokenInLower = tokenInAddress.toLowerCase();
  const tokenOutLower = tokenOutAddress.toLowerCase();

  const isUsdcToEurc = tokenInLower === USDC_ADDRESS && tokenOutLower === EURC_ADDRESS;
  const isEurcToUsdc = tokenInLower === EURC_ADDRESS && tokenOutLower === USDC_ADDRESS;

  if (!isUsdcToEurc && !isEurcToUsdc) {
    throw new Error(
      "Unsupported token pair on Arc Mainnet. Supported tokens are USDC and EURC."
    );
  }

  if (amountIn <= BigInt(0)) {
    throw new Error("Amount must be greater than zero.");
  }

  // Maximum uint128 check for Uniswap V4 exactAmount
  const maxUint128 = (BigInt(1) << BigInt(128)) - BigInt(1);
  if (amountIn > maxUint128) {
    throw new Error("Amount exceeds maximum uint128 range.");
  }

  const zeroForOne = isUsdcToEurc;

  const poolKey = {
    currency0: ARC_MAINNET_UNISWAP_V4.usdcEurcPool.currency0,
    currency1: ARC_MAINNET_UNISWAP_V4.usdcEurcPool.currency1,
    fee: ARC_MAINNET_UNISWAP_V4.usdcEurcPool.fee,
    tickSpacing: ARC_MAINNET_UNISWAP_V4.usdcEurcPool.tickSpacing,
    hooks: ARC_MAINNET_UNISWAP_V4.usdcEurcPool.hooks,
  };

  // Pure read-only simulation via eth_call against Quoter V4
  const simulation = await arcMainnetPublicClient.simulateContract({
    address: ARC_MAINNET_UNISWAP_V4.quoter,
    abi: quoterV4Abi,
    functionName: "quoteExactInputSingle",
    args: [
      {
        poolKey,
        zeroForOne,
        exactAmount: amountIn,
        hookData: "0x",
      },
    ],
  });

  const [amountOut, gasEstimate] = simulation.result;

  // Slippage application (default 100 bps = 1.00%), zero additional protocol fee
  const slipBpsBigInt = BigInt(slippageBps);
  const minAmountOut = (amountOut * (BigInt(10000) - slipBpsBigInt)) / BigInt(10000);

  // Both USDC and EURC on Arc Mainnet have 6 decimals
  const formattedIn = formatUnits(amountIn, 6);
  const formattedOut = formatUnits(amountOut, 6);
  const formattedMinOut = formatUnits(minAmountOut, 6);

  const parsedIn = parseFloat(formattedIn);
  const parsedOut = parseFloat(formattedOut);
  const executionPrice = parsedIn > 0 ? (parsedOut / parsedIn).toFixed(6) : "0";

  return {
    tokenIn: isUsdcToEurc ? "USDC" : "EURC",
    tokenOut: isUsdcToEurc ? "EURC" : "USDC",
    amountIn,
    amountOut,
    minAmountOut,
    formattedAmountIn: formattedIn,
    formattedAmountOut: formattedOut,
    formattedMinAmountOut: formattedMinOut,
    gasEstimate,
    executionPrice,
    feeTier: ARC_MAINNET_UNISWAP_V4.usdcEurcPool.fee,
    poolId: ARC_MAINNET_UNISWAP_V4.usdcEurcPool.poolId,
    route: "Uniswap_V4_Direct",
  };
}
