import {
  isAddress,
  isAddressEqual,
  erc20Abi,
} from "viem";
import { ARC_MAINNET_TOKENS, ARC_MAINNET_UNISWAP_V4 } from "@/config/arc-mainnet";
import { arcMainnetPublicClient } from "@/lib/arc-mainnet-client";
import { getArcMainnetV4Quote, ArcMainnetQuoteResult } from "@/lib/arc-mainnet-quote";
import {
  buildArcMainnetV4Swap,
  decodeAndValidateArcMainnetV4Calldata,
  permit2AllowanceAbi,
} from "@/lib/arc-mainnet-build";

export const ARC_MAINNET_CHAIN_ID = 5042;
export const MAX_QUOTE_AGE_MS = 30000; // 30 seconds max quote freshness

export interface ArcMainnetPreflightParams {
  fromAddress: string;
  toAddress: string;
  chainId: number;
  tokenIn: "USDC" | "EURC";
  tokenOut: "USDC" | "EURC";
  amount: string; // raw 6-decimal units string, e.g. "1000000" for 1 USDC
  slippageBps?: number;
  quoteTimestamp?: number; // timestamp in ms of existing quote, if any
}

export interface ArcMainnetAllowanceStatus {
  erc20Allowance: string;
  permit2Allowance: string;
  erc20ApprovalNeeded: boolean;
  permit2ApprovalNeeded: boolean;
  approvalRequired: boolean;
  swapReady: boolean;
  writeExecuted: false;
}

export interface ArcMainnetGasAudit {
  universalRouterGasEstimate: string | null;
  universalRouterGasStatus: "simulated_success" | "simulated_revert_expected";
  universalRouterGasError?: string;
  quoterV4GasEstimate: string;
  networkGasToken: "USDC";
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  gasPrice?: string;
}

export interface ArcMainnetExecutionPreflightResult {
  chainId: 5042;
  chainValid: true;
  recipientValid: true;
  tokenPairValid: true;
  poolKeyValid: true;
  fromAddress: `0x${string}`;
  toAddress: `0x${string}`;
  tokenInAddress: `0x${string}`;
  tokenOutAddress: `0x${string}`;
  amountIn: string;
  amountOutMinimum: string;
  slippageBps: number;
  quoteFresh: true;
  quoteTimestamp: number;
  wasExistingQuoteStale: boolean;
  quote: {
    tokenIn: "USDC" | "EURC";
    tokenOut: "USDC" | "EURC";
    amountIn: string;
    amountOut: string;
    minAmountOut: string;
    formattedAmountIn: string;
    formattedAmountOut: string;
    formattedMinAmountOut: string;
    executionPrice: string;
    feeTier: number;
    poolId: `0x${string}`;
    route: "Uniswap_V4_Direct";
  };
  allowances: ArcMainnetAllowanceStatus;
  fees: {
    paygrixApplicationFee: "0";
    uniswapV4PoolFeeBps: 500;
    networkGasToken: "USDC";
  };
  gasAudit: ArcMainnetGasAudit;
  transactionEnvelope: {
    chainId: 5042;
    from: `0x${string}`;
    to: `0x${string}`;
    value: "0x0";
    data: `0x${string}`;
  };
  calldataAudit: {
    selectorVerified: true;
    commandVerified: true;
    actionsVerified: true;
    poolVerified: true;
    deadlineValid: true;
    baseBuilderCodeAbsent: true;
    baseSuffixAbsent: true;
  };
  executionSimulatedOnly: true;
  isReadyForBroadcast: false;
}

/**
 * Prepares the complete Arc Mainnet Uniswap V4 swap execution envelope, allowance audit,
 * calldata validation, and Arc network fee estimation.
 *
 * STRICT PREPARATION ONLY:
 * - ZERO on-chain writes
 * - ZERO wallet signatures requested
 * - ZERO transaction broadcasts
 * - ZERO approve() executions
 * - ZERO Permit2 approve/permit calls
 * - ZERO Universal Router executions
 */
export async function prepareArcMainnetExecutionPreflight(
  params: ArcMainnetPreflightParams
): Promise<ArcMainnetExecutionPreflightResult> {
  const {
    fromAddress,
    toAddress,
    chainId,
    tokenIn,
    tokenOut,
    amount,
    slippageBps = 100,
    quoteTimestamp,
  } = params;

  // 1. Validate Arc Mainnet chain ID strictly equals 5042
  if (chainId !== ARC_MAINNET_CHAIN_ID) {
    throw new Error(
      `Arc Mainnet execution aborted: invalid chain ID ${chainId}. Connected wallet must be on Arc Mainnet (Chain ID: 5042).`
    );
  }

  // 2. Validate fromAddress
  if (!isAddress(fromAddress)) {
    throw new Error(`Arc Mainnet execution aborted: invalid fromAddress ${fromAddress}`);
  }

  // 3. Validate toAddress
  if (!isAddress(toAddress)) {
    throw new Error(`Arc Mainnet execution aborted: invalid toAddress ${toAddress}`);
  }

  // 4. Enforce fromAddress === toAddress (case-insensitive)
  if (!isAddressEqual(fromAddress as `0x${string}`, toAddress as `0x${string}`)) {
    throw new Error(
      "On Arc Mainnet Universal Router, TAKE_ALL sends swapped tokens to the transaction sender (msgSender). Recipient address must equal sender address."
    );
  }

  const fromAddrHex = fromAddress as `0x${string}`;
  const toAddrHex = toAddress as `0x${string}`;

  // 5. Validate token pair is strictly USDC <-> EURC
  const isUsdcIn = tokenIn === "USDC";
  const isEurcIn = tokenIn === "EURC";
  const isUsdcOut = tokenOut === "USDC";
  const isEurcOut = tokenOut === "EURC";

  if (!((isUsdcIn && isEurcOut) || (isEurcIn && isUsdcOut))) {
    throw new Error(
      `Arc Mainnet execution aborted: unsupported token pair ${tokenIn} -> ${tokenOut}. Only USDC <-> EURC is supported.`
    );
  }

  const tokenInAddress = ARC_MAINNET_TOKENS[tokenIn].address;
  const tokenOutAddress = ARC_MAINNET_TOKENS[tokenOut].address;

  // 6. Validate fixed V4 pool key parameters
  const fixedPool = ARC_MAINNET_UNISWAP_V4.usdcEurcPool;
  if (
    !isAddressEqual(fixedPool.currency0, ARC_MAINNET_TOKENS.USDC.address) ||
    !isAddressEqual(fixedPool.currency1, ARC_MAINNET_TOKENS.EURC.address) ||
    fixedPool.fee !== 500 ||
    fixedPool.tickSpacing !== 10 ||
    !isAddressEqual(fixedPool.hooks, "0x0000000000000000000000000000000000000000")
  ) {
    throw new Error("Arc Mainnet execution aborted: fixed pool configuration tampered or invalid.");
  }

  // Amount validation
  if (!amount || !/^\d+$/.test(amount)) {
    throw new Error("Arc Mainnet execution aborted: invalid amount format. Must be positive integer.");
  }
  const rawAmountIn = BigInt(amount);
  if (rawAmountIn <= BigInt(0)) {
    throw new Error("Arc Mainnet execution aborted: amount must be greater than zero.");
  }

  // Slippage validation
  if (slippageBps < 5 || slippageBps > 1000) {
    throw new Error("Arc Mainnet execution aborted: slippageBps must be between 5 (0.05%) and 1000 (10.00%).");
  }

  // 7. Read ERC20 allowance(owner -> Permit2) via strictly read-only eth_call
  let erc20Allowance = BigInt(0);
  try {
    erc20Allowance = await arcMainnetPublicClient.readContract({
      address: tokenInAddress,
      abi: erc20Abi,
      functionName: "allowance",
      args: [fromAddrHex, ARC_MAINNET_UNISWAP_V4.permit2],
    });
  } catch (err) {
    console.warn("[Arc Preflight] Non-fatal error reading ERC20 allowance:", err);
  }

  // 8. Read Permit2 allowance(owner, token, Universal Router) via strictly read-only eth_call
  let permit2Allowance = BigInt(0);
  try {
    const permit2Result = await arcMainnetPublicClient.readContract({
      address: ARC_MAINNET_UNISWAP_V4.permit2,
      abi: permit2AllowanceAbi,
      functionName: "allowance",
      args: [fromAddrHex, tokenInAddress, ARC_MAINNET_UNISWAP_V4.universalRouter],
    });
    permit2Allowance = BigInt(permit2Result[0]);
  } catch (err) {
    console.warn("[Arc Preflight] Non-fatal error reading Permit2 allowance:", err);
  }

  // 9. Determine approvalRequired / swapReady (DO NOT AUTOMATICALLY APPROVE)
  const erc20ApprovalNeeded = erc20Allowance < rawAmountIn;
  const permit2ApprovalNeeded = permit2Allowance < rawAmountIn;
  const approvalRequired = erc20ApprovalNeeded || permit2ApprovalNeeded;
  const swapReady = !approvalRequired;

  // 10. Obtain a FRESH Arc Mainnet V4 quote
  const now = Date.now();
  const isQuoteStale = !quoteTimestamp || now - quoteTimestamp > MAX_QUOTE_AGE_MS;

  const freshQuote: ArcMainnetQuoteResult = await getArcMainnetV4Quote({
    tokenInAddress,
    tokenOutAddress,
    amountIn: rawAmountIn,
    slippageBps,
  });

  // 11. Calculate amountOutMinimum from fresh quote
  const freshMinAmountOut = freshQuote.minAmountOut;
  if (freshMinAmountOut <= BigInt(0)) {
    throw new Error("Arc Mainnet execution aborted: calculated amountOutMinimum is zero or negative.");
  }

  // 12. Build calldata using existing Phase 3B builder
  const buildResult = await buildArcMainnetV4Swap({
    tokenInAddress,
    tokenOutAddress,
    tokenInChain: "Arc_Mainnet",
    tokenOutChain: "Arc_Mainnet",
    fromAddress: fromAddrHex,
    toAddress: toAddrHex,
    amount,
    slippageBps,
  });

  const finalCalldata = buildResult.transaction.data;

  // 13. Decode and validate the generated calldata again immediately before envelope construction
  decodeAndValidateArcMainnetV4Calldata(finalCalldata, {
    expectedTokenIn: tokenInAddress,
    expectedTokenOut: tokenOutAddress,
    expectedAmountIn: rawAmountIn,
    expectedAmountOutMinimum: freshMinAmountOut,
    expectedZeroForOne: isUsdcIn,
    minDeadline: BigInt(Math.floor(Date.now() / 1000)),
  });

  // 14. Construct the final transaction envelope
  const finalTransactionEnvelope = {
    chainId: 5042 as const,
    from: fromAddrHex,
    to: ARC_MAINNET_UNISWAP_V4.universalRouter,
    value: "0x0" as const,
    data: finalCalldata,
  };

  // 15. Estimate gas for the FINAL Universal Router transaction envelope using Arc Mainnet public client
  let universalRouterGasEstimate: string | null = null;
  let universalRouterGasStatus: "simulated_success" | "simulated_revert_expected" = "simulated_revert_expected";
  let universalRouterGasError: string | undefined;

  try {
    const gasEst = await arcMainnetPublicClient.estimateGas({
      account: fromAddrHex,
      to: ARC_MAINNET_UNISWAP_V4.universalRouter,
      data: finalCalldata,
      value: BigInt(0),
    });
    universalRouterGasEstimate = gasEst.toString();
    universalRouterGasStatus = "simulated_success";
  } catch (err: unknown) {
    universalRouterGasStatus = "simulated_revert_expected";
    universalRouterGasError = err instanceof Error ? err.message : String(err);
  }

  // Read Arc Mainnet fee parameters using the Arc client
  let maxFeePerGasStr: string | undefined;
  let maxPriorityFeePerGasStr: string | undefined;
  let gasPriceStr: string | undefined;

  try {
    const fees = await arcMainnetPublicClient.estimateFeesPerGas();
    maxFeePerGasStr = fees.maxFeePerGas?.toString();
    maxPriorityFeePerGasStr = fees.maxPriorityFeePerGas?.toString();
    const gasPrice = await arcMainnetPublicClient.getGasPrice();
    gasPriceStr = gasPrice.toString();
  } catch (feeErr) {
    console.warn("[Arc Preflight] Non-fatal error reading Arc fee parameters:", feeErr);
  }

  // 16. Return complete preflight audit result
  return {
    chainId: 5042,
    chainValid: true,
    recipientValid: true,
    tokenPairValid: true,
    poolKeyValid: true,
    fromAddress: fromAddrHex,
    toAddress: toAddrHex,
    tokenInAddress,
    tokenOutAddress,
    amountIn: amount,
    amountOutMinimum: freshMinAmountOut.toString(),
    slippageBps,
    quoteFresh: true,
    quoteTimestamp: Date.now(),
    wasExistingQuoteStale: isQuoteStale,
    quote: {
      tokenIn,
      tokenOut,
      amountIn: freshQuote.amountIn.toString(),
      amountOut: freshQuote.amountOut.toString(),
      minAmountOut: freshMinAmountOut.toString(),
      formattedAmountIn: freshQuote.formattedAmountIn,
      formattedAmountOut: freshQuote.formattedAmountOut,
      formattedMinAmountOut: freshQuote.formattedMinAmountOut,
      executionPrice: freshQuote.executionPrice,
      feeTier: freshQuote.feeTier,
      poolId: freshQuote.poolId,
      route: freshQuote.route,
    },
    allowances: {
      erc20Allowance: erc20Allowance.toString(),
      permit2Allowance: permit2Allowance.toString(),
      erc20ApprovalNeeded,
      permit2ApprovalNeeded,
      approvalRequired,
      swapReady,
      writeExecuted: false,
    },
    fees: {
      paygrixApplicationFee: "0",
      uniswapV4PoolFeeBps: 500,
      networkGasToken: "USDC",
    },
    gasAudit: {
      universalRouterGasEstimate,
      universalRouterGasStatus,
      universalRouterGasError,
      quoterV4GasEstimate: freshQuote.gasEstimate.toString(),
      networkGasToken: "USDC",
      maxFeePerGas: maxFeePerGasStr,
      maxPriorityFeePerGas: maxPriorityFeePerGasStr,
      gasPrice: gasPriceStr,
    },
    transactionEnvelope: finalTransactionEnvelope,
    calldataAudit: {
      selectorVerified: true,
      commandVerified: true,
      actionsVerified: true,
      poolVerified: true,
      deadlineValid: true,
      baseBuilderCodeAbsent: true,
      baseSuffixAbsent: true,
    },
    executionSimulatedOnly: true,
    isReadyForBroadcast: false,
  };
}
