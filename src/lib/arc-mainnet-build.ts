import {
  parseAbi,
  parseAbiParameters,
  encodeAbiParameters,
  decodeAbiParameters,
  encodeFunctionData,
  decodeFunctionData,
  erc20Abi,
  isAddress,
  isAddressEqual,
} from "viem";
import { ARC_MAINNET_TOKENS, ARC_MAINNET_UNISWAP_V4 } from "@/config/arc-mainnet";
import { arcMainnetPublicClient } from "@/lib/arc-mainnet-client";
import { getArcMainnetV4Quote } from "@/lib/arc-mainnet-quote";
import { BASE_BUILDER_CODE } from "@/config/base-builder-code";

// Universal Router V4 execute ABI
export const universalRouterV4Abi = parseAbi([
  "function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable",
]);

// Permit2 allowance ABI (read-only)
export const permit2AllowanceAbi = parseAbi([
  "function allowance(address user, address token, address spender) external view returns (uint160 amount, uint48 expiration, uint48 nonce)",
]);

// ABI parameter definitions for Uniswap V4 actions encoding
const exactInputSingleAbiParams = parseAbiParameters([
  "( (address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, bool zeroForOne, uint128 amountIn, uint128 amountOutMinimum, bytes hookData )",
]);

const currencyAndUint256AbiParams = parseAbiParameters([
  "address currency, uint256 amount",
]);

const actionsAndParamsAbiParams = parseAbiParameters([
  "bytes actions, bytes[] params",
]);

export interface ArcMainnetBuildParams {
  tokenInAddress: string;
  tokenOutAddress: string;
  tokenInChain?: string;
  tokenOutChain?: string;
  fromAddress: string;
  toAddress: string;
  amount: string; // raw 6-decimal string representation (e.g. "1000000" for 1 USDC)
  slippageBps?: number;
  deadlineSeconds?: number;
}

export interface ArcMainnetPermit2ReadState {
  address: `0x${string}`;
  token: `0x${string}`;
  spender: `0x${string}`;
  amountRequired: string;
  erc20AllowanceToPermit2: string;
  permit2AllowanceToRouter: string;
  approvalRequired: boolean;
  writeExecuted: false;
}

export interface ArcMainnetBuildResult {
  transaction: {
    routerAddress: `0x${string}`;
    to: `0x${string}`;
    data: `0x${string}`;
    value: "0x0";
    chainId: 5042;
    gasEstimate?: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
    executionParams: {
      instructions: [
        {
          target: `0x${string}`;
          data: `0x${string}`;
          value: "0";
          tokenIn: string;
          amountToApprove: string;
          tokenOut: string;
          minTokenOut: string;
        }
      ];
      tokens: [
        {
          token: string;
          beneficiary: string;
        }
      ];
      execId: "1";
      deadline: string;
      metadata: "0x";
    };
    signature: "0x";
  };
  quote: {
    tokenIn: "USDC" | "EURC";
    tokenOut: "USDC" | "EURC";
    amountIn: string;
    amountOut: string;
    minAmountOut: string;
    formattedAmountIn: string;
    formattedAmountOut: string;
    formattedMinAmountOut: string;
    gasEstimate: string;
    executionPrice: string;
    feeTier: number;
    poolId: `0x${string}`;
    route: "Uniswap_V4_Direct";
  };
  permit2: ArcMainnetPermit2ReadState;
  fees: {
    paygrixApplicationFee: "0";
    uniswapV4PoolFeeBps: 500;
    networkGasToken: "USDC";
  };
  validation: {
    isBaseBuilderCodePresent: false;
    isBaseSuffixPresent: false;
    verifiedUniversalRouter: true;
    verifiedPoolKey: true;
    verifiedCommands: true;
    verifiedActions: true;
    deadlineValid: true;
  };
  amount: string;
  estimatedAmount: string;
  minAmountOut: string;
}

export interface DecodedArcMainnetV4Calldata {
  functionName: string;
  commands: `0x${string}`;
  actions: `0x${string}`;
  deadline: bigint;
  swapParams: {
    poolKey: {
      currency0: `0x${string}`;
      currency1: `0x${string}`;
      fee: number;
      tickSpacing: number;
      hooks: `0x${string}`;
    };
    zeroForOne: boolean;
    amountIn: bigint;
    amountOutMinimum: bigint;
    hookData: `0x${string}`;
  };
  settle: {
    currency: `0x${string}`;
    amount: bigint;
  };
  take: {
    currency: `0x${string}`;
    amount: bigint;
  };
}

/**
 * Builds a validated Arc Mainnet Uniswap V4 swap transaction request.
 * Strictly BUILD-ONLY: does not broadcast any transaction, request signatures,
 * or perform on-chain approvals.
 */
export async function buildArcMainnetV4Swap(
  params: ArcMainnetBuildParams
): Promise<ArcMainnetBuildResult> {
  const {
    tokenInAddress,
    tokenOutAddress,
    tokenInChain = "Arc_Mainnet",
    tokenOutChain = "Arc_Mainnet",
    fromAddress,
    toAddress,
    amount,
    slippageBps = 100,
    deadlineSeconds = 1200,
  } = params;

  // 1. Chain validation (Strictly Arc Mainnet 5042)
  if (tokenInChain !== "Arc_Mainnet" || tokenOutChain !== "Arc_Mainnet") {
    throw new Error(
      `Invalid chain for Arc Mainnet build. Expected tokenInChain and tokenOutChain to be 'Arc_Mainnet', got in=${tokenInChain}, out=${tokenOutChain}`
    );
  }

  // 2. EVM address validations
  if (!isAddress(fromAddress)) {
    throw new Error(`Invalid sender EVM address: ${fromAddress}`);
  }
  if (!isAddress(toAddress)) {
    throw new Error(`Invalid recipient EVM address: ${toAddress}`);
  }
  if (!isAddressEqual(fromAddress as `0x${string}`, toAddress as `0x${string}`)) {
    throw new Error(
      "On Arc Mainnet Universal Router, TAKE_ALL sends swapped tokens to the transaction sender (msgSender). Recipient address must equal sender address."
    );
  }

  // 3. Token validation: Exactly Arc Mainnet USDC and EURC
  const verifiedUsdc = ARC_MAINNET_TOKENS.USDC.address;
  const verifiedEurc = ARC_MAINNET_TOKENS.EURC.address;

  const isTokenInUsdc = isAddressEqual(tokenInAddress as `0x${string}`, verifiedUsdc);
  const isTokenInEurc = isAddressEqual(tokenInAddress as `0x${string}`, verifiedEurc);
  const isTokenOutUsdc = isAddressEqual(tokenOutAddress as `0x${string}`, verifiedUsdc);
  const isTokenOutEurc = isAddressEqual(tokenOutAddress as `0x${string}`, verifiedEurc);

  if ((!isTokenInUsdc && !isTokenInEurc) || (!isTokenOutUsdc && !isTokenOutEurc)) {
    throw new Error(
      "Unsupported token for Arc Mainnet Uniswap V4 build. Only verified USDC and EURC are supported."
    );
  }

  if (isAddressEqual(tokenInAddress as `0x${string}`, tokenOutAddress as `0x${string}`)) {
    throw new Error("Input and output tokens must be different.");
  }

  // 4. Amount validation: Positive integer bounded within uint128
  if (!amount || !/^\d+$/.test(amount)) {
    throw new Error("Invalid amount. Must be a positive integer in token units (6 decimals).");
  }

  const rawAmountIn = BigInt(amount);
  if (rawAmountIn <= BigInt(0)) {
    throw new Error("Amount must be greater than zero.");
  }

  const maxUint128 = (BigInt(1) << BigInt(128)) - BigInt(1);
  if (rawAmountIn > maxUint128) {
    throw new Error("Amount exceeds maximum uint128 range.");
  }

  // 5. Slippage validation: Bounded between 5 bps (0.05%) and 1000 bps (10.0%)
  if (
    typeof slippageBps !== "number" ||
    isNaN(slippageBps) ||
    slippageBps < 5 ||
    slippageBps > 1000
  ) {
    throw new Error(
      "Invalid slippageBps. Must be between 5 (0.05%) and 1000 (10.00%)."
    );
  }

  // 6. Bounded transaction deadline
  if (
    typeof deadlineSeconds !== "number" ||
    isNaN(deadlineSeconds) ||
    deadlineSeconds < 60 ||
    deadlineSeconds > 3600
  ) {
    throw new Error(
      "Invalid deadlineSeconds. Must be between 60 seconds and 3600 seconds (1 hour)."
    );
  }

  const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));
  const deadline = currentTimestamp + BigInt(deadlineSeconds);

  // 7. Fresh on-chain simulated quote
  const quote = await getArcMainnetV4Quote({
    tokenInAddress,
    tokenOutAddress,
    amountIn: rawAmountIn,
    slippageBps,
  });

  const rawAmountOutMin = quote.minAmountOut;
  if (rawAmountOutMin <= BigInt(0)) {
    throw new Error("Calculated minimum output amount must be greater than zero.");
  }

  // 8. Fixed verified pool configuration
  const fixedPool = ARC_MAINNET_UNISWAP_V4.usdcEurcPool;
  const poolKey = {
    currency0: fixedPool.currency0,
    currency1: fixedPool.currency1,
    fee: fixedPool.fee,
    tickSpacing: fixedPool.tickSpacing,
    hooks: fixedPool.hooks,
  };

  const zeroForOne = isTokenInUsdc; // true: USDC -> EURC, false: EURC -> USDC

  // 9. Encode Universal Router V4 actions:
  // Actions:
  // 0x06: SWAP_EXACT_IN_SINGLE
  // 0x0c: SETTLE_ALL
  // 0x0f: TAKE_ALL
  const actions: `0x${string}` = "0x060c0f";

  const param0 = encodeAbiParameters(exactInputSingleAbiParams, [
    {
      poolKey,
      zeroForOne,
      amountIn: rawAmountIn,
      amountOutMinimum: rawAmountOutMin,
      hookData: "0x",
    },
  ]);

  const param1 = encodeAbiParameters(currencyAndUint256AbiParams, [
    (isTokenInUsdc ? verifiedUsdc : verifiedEurc),
    rawAmountIn,
  ]);

  const param2 = encodeAbiParameters(currencyAndUint256AbiParams, [
    (isTokenInUsdc ? verifiedEurc : verifiedUsdc),
    rawAmountOutMin,
  ]);

  const inputs0 = encodeAbiParameters(actionsAndParamsAbiParams, [
    actions,
    [param0, param1, param2],
  ]);

  const commands: `0x${string}` = "0x10"; // Commands.V4_SWAP
  const inputs: `0x${string}`[] = [inputs0];

  // 10. Encode UniversalRouter.execute(commands, inputs, deadline)
  const calldata = encodeFunctionData({
    abi: universalRouterV4Abi,
    functionName: "execute",
    args: [commands, inputs, deadline],
  });

  // 11. Decode and strictly validate calldata
  decodeAndValidateArcMainnetV4Calldata(
    calldata,
    {
      expectedTokenIn: isTokenInUsdc ? verifiedUsdc : verifiedEurc,
      expectedTokenOut: isTokenInUsdc ? verifiedEurc : verifiedUsdc,
      expectedAmountIn: rawAmountIn,
      expectedAmountOutMinimum: rawAmountOutMin,
      expectedZeroForOne: zeroForOne,
      minDeadline: currentTimestamp,
    }
  );

  // 12. Read current Permit2 & ERC20 allowance state via strictly read-only eth_call
  let erc20Allowance = BigInt(0);
  let permit2Allowance = BigInt(0);

  try {
    erc20Allowance = await arcMainnetPublicClient.readContract({
      address: (isTokenInUsdc ? verifiedUsdc : verifiedEurc),
      abi: erc20Abi,
      functionName: "allowance",
      args: [fromAddress as `0x${string}`, ARC_MAINNET_UNISWAP_V4.permit2],
    });

    const permit2Result = await arcMainnetPublicClient.readContract({
      address: ARC_MAINNET_UNISWAP_V4.permit2,
      abi: permit2AllowanceAbi,
      functionName: "allowance",
      args: [
        fromAddress as `0x${string}`,
        (isTokenInUsdc ? verifiedUsdc : verifiedEurc),
        ARC_MAINNET_UNISWAP_V4.universalRouter,
      ],
    });

    permit2Allowance = BigInt(permit2Result[0]);
  } catch (readErr) {
    console.warn("[Arc Mainnet Build] Non-fatal error reading allowances:", readErr);
  }

  const approvalRequired =
    erc20Allowance < rawAmountIn || permit2Allowance < rawAmountIn;

  // 13. Query live Arc network fee estimates (optional gas metrics for display)
  let gasEstimateStr: string | undefined;
  let maxFeePerGasStr: string | undefined;
  let maxPriorityFeePerGasStr: string | undefined;

  try {
    const feesPerGas = await arcMainnetPublicClient.estimateFeesPerGas();
    maxFeePerGasStr = feesPerGas.maxFeePerGas?.toString();
    maxPriorityFeePerGasStr = feesPerGas.maxPriorityFeePerGas?.toString();
    gasEstimateStr = quote.gasEstimate?.toString();
  } catch {
    // Gracefully continue without failing build
  }

  const universalRouterAddress = ARC_MAINNET_UNISWAP_V4.universalRouter;

  return {
    transaction: {
      routerAddress: universalRouterAddress,
      to: universalRouterAddress,
      data: calldata,
      value: "0x0", // Strictly 0 for ERC20 swaps
      chainId: 5042,
      gasEstimate: gasEstimateStr,
      maxFeePerGas: maxFeePerGasStr,
      maxPriorityFeePerGas: maxPriorityFeePerGasStr,
      executionParams: {
        instructions: [
          {
            target: universalRouterAddress,
            data: calldata,
            value: "0",
            tokenIn: tokenInAddress,
            amountToApprove: amount,
            tokenOut: tokenOutAddress,
            minTokenOut: rawAmountOutMin.toString(),
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
    quote: {
      tokenIn: quote.tokenIn,
      tokenOut: quote.tokenOut,
      amountIn: quote.amountIn.toString(),
      amountOut: quote.amountOut.toString(),
      minAmountOut: quote.minAmountOut.toString(),
      formattedAmountIn: quote.formattedAmountIn,
      formattedAmountOut: quote.formattedAmountOut,
      formattedMinAmountOut: quote.formattedMinAmountOut,
      gasEstimate: quote.gasEstimate.toString(),
      executionPrice: quote.executionPrice,
      feeTier: quote.feeTier,
      poolId: quote.poolId,
      route: quote.route,
    },
    permit2: {
      address: ARC_MAINNET_UNISWAP_V4.permit2,
      token: (isTokenInUsdc ? verifiedUsdc : verifiedEurc),
      spender: universalRouterAddress,
      amountRequired: rawAmountIn.toString(),
      erc20AllowanceToPermit2: erc20Allowance.toString(),
      permit2AllowanceToRouter: permit2Allowance.toString(),
      approvalRequired,
      writeExecuted: false,
    },
    fees: {
      paygrixApplicationFee: "0",
      uniswapV4PoolFeeBps: 500,
      networkGasToken: "USDC",
    },
    validation: {
      isBaseBuilderCodePresent: false,
      isBaseSuffixPresent: false,
      verifiedUniversalRouter: true,
      verifiedPoolKey: true,
      verifiedCommands: true,
      verifiedActions: true,
      deadlineValid: true,
    },
    amount,
    estimatedAmount: quote.amountOut.toString(),
    minAmountOut: rawAmountOutMin.toString(),
  };
}

/**
 * Decodes and rigorously validates an Arc Mainnet Universal Router V4 calldata payload.
 * Throws an explicit error if any validation check fails.
 */
export function decodeAndValidateArcMainnetV4Calldata(
  calldata: `0x${string}`,
  expectations: {
    expectedTokenIn: `0x${string}`;
    expectedTokenOut: `0x${string}`;
    expectedAmountIn: bigint;
    expectedAmountOutMinimum: bigint;
    expectedZeroForOne: boolean;
    minDeadline: bigint;
  }
): DecodedArcMainnetV4Calldata {
  // 1. Check for absence of Base Builder Code and Base suffix
  const baseSuffixHex = BASE_BUILDER_CODE.encoded.slice(2).toLowerCase();
  const baseCodeAscii = BASE_BUILDER_CODE.code;

  if (calldata.toLowerCase().includes(baseSuffixHex)) {
    throw new Error(
      "CALlDATA VALIDATION FAILURE: Base Builder Code suffix detected in Arc Mainnet calldata!"
    );
  }

  // Convert hex to string to search for literal ASCII "bc_f3sf2iiu"
  const rawHex = calldata.startsWith("0x") ? calldata.slice(2) : calldata;
  const decodedAscii = Buffer.from(rawHex, "hex").toString("utf8");
  if (decodedAscii.includes(baseCodeAscii)) {
    throw new Error(
      "CALlDATA VALIDATION FAILURE: Base Builder Code string detected in Arc Mainnet calldata!"
    );
  }

  // 2. Decode execute(bytes commands, bytes[] inputs, uint256 deadline)
  let decodedExecute;
  try {
    decodedExecute = decodeFunctionData({
      abi: universalRouterV4Abi,
      data: calldata,
    });
  } catch (err) {
    throw new Error(`Failed to decode execute calldata: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (decodedExecute.functionName !== "execute") {
    throw new Error(`Unexpected function name: ${decodedExecute.functionName}`);
  }

  const [commandsHex, inputsList, deadlineBigInt] = decodedExecute.args;

  // 3. Validate command: Exactly V4_SWAP (0x10)
  if (commandsHex.toLowerCase() !== "0x10") {
    throw new Error(`Invalid command: expected 0x10 (V4_SWAP), received ${commandsHex}`);
  }

  if (!inputsList || inputsList.length !== 1) {
    throw new Error(`Invalid inputs length: expected 1, received ${inputsList?.length}`);
  }

  // 4. Validate deadline
  if (deadlineBigInt <= expectations.minDeadline) {
    throw new Error(
      `Deadline expired or invalid: deadline=${deadlineBigInt}, minDeadline=${expectations.minDeadline}`
    );
  }

  // 5. Decode inputs[0]: abi.decode(inputs[0], (bytes actions, bytes[] params))
  let decodedInputs;
  try {
    decodedInputs = decodeAbiParameters(actionsAndParamsAbiParams, inputsList[0]);
  } catch (err) {
    throw new Error(`Failed to decode actions and params: ${err instanceof Error ? err.message : String(err)}`);
  }

  const [actionsBytes, paramsList] = decodedInputs;

  // 6. Validate action sequence: Exactly 0x060c0f
  if (actionsBytes.toLowerCase() !== "0x060c0f") {
    throw new Error(
      `Invalid action sequence: expected 0x060c0f (SWAP_EXACT_IN_SINGLE + SETTLE_ALL + TAKE_ALL), received ${actionsBytes}`
    );
  }

  if (!paramsList || paramsList.length !== 3) {
    throw new Error(`Invalid params array length: expected 3, received ${paramsList?.length}`);
  }

  // 7. Decode and validate Action 0 (SWAP_EXACT_IN_SINGLE)
  let decodedSwapParams;
  try {
    const [swapStruct] = decodeAbiParameters(exactInputSingleAbiParams, paramsList[0]);
    decodedSwapParams = swapStruct;
  } catch (err) {
    throw new Error(`Failed to decode ExactInputSingleParams: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Verify poolKey against fixed Arc Mainnet V4 pool
  const expectedPool = ARC_MAINNET_UNISWAP_V4.usdcEurcPool;
  if (!isAddressEqual(decodedSwapParams.poolKey.currency0, expectedPool.currency0)) {
    throw new Error(
      `Pool currency0 mismatch: expected ${expectedPool.currency0}, got ${decodedSwapParams.poolKey.currency0}`
    );
  }
  if (!isAddressEqual(decodedSwapParams.poolKey.currency1, expectedPool.currency1)) {
    throw new Error(
      `Pool currency1 mismatch: expected ${expectedPool.currency1}, got ${decodedSwapParams.poolKey.currency1}`
    );
  }
  if (decodedSwapParams.poolKey.fee !== expectedPool.fee) {
    throw new Error(`Pool fee mismatch: expected ${expectedPool.fee}, got ${decodedSwapParams.poolKey.fee}`);
  }
  if (decodedSwapParams.poolKey.tickSpacing !== expectedPool.tickSpacing) {
    throw new Error(
      `Pool tickSpacing mismatch: expected ${expectedPool.tickSpacing}, got ${decodedSwapParams.poolKey.tickSpacing}`
    );
  }
  if (!isAddressEqual(decodedSwapParams.poolKey.hooks, expectedPool.hooks)) {
    throw new Error(
      `Pool hooks mismatch: expected ${expectedPool.hooks}, got ${decodedSwapParams.poolKey.hooks}`
    );
  }

  // Verify swap parameters
  if (decodedSwapParams.zeroForOne !== expectations.expectedZeroForOne) {
    throw new Error(
      `Swap direction mismatch: expected zeroForOne=${expectations.expectedZeroForOne}, got ${decodedSwapParams.zeroForOne}`
    );
  }
  if (decodedSwapParams.amountIn !== expectations.expectedAmountIn) {
    throw new Error(
      `Swap amountIn mismatch: expected ${expectations.expectedAmountIn}, got ${decodedSwapParams.amountIn}`
    );
  }
  if (decodedSwapParams.amountOutMinimum !== expectations.expectedAmountOutMinimum) {
    throw new Error(
      `Swap amountOutMinimum mismatch: expected ${expectations.expectedAmountOutMinimum}, got ${decodedSwapParams.amountOutMinimum}`
    );
  }

  // 8. Decode and validate Action 1 (SETTLE_ALL)
  let decodedSettle;
  try {
    const [currency, amount] = decodeAbiParameters(currencyAndUint256AbiParams, paramsList[1]);
    decodedSettle = { currency, amount };
  } catch (err) {
    throw new Error(`Failed to decode SETTLE_ALL params: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!isAddressEqual(decodedSettle.currency, expectations.expectedTokenIn)) {
    throw new Error(
      `SETTLE_ALL currency mismatch: expected ${expectations.expectedTokenIn}, got ${decodedSettle.currency}`
    );
  }
  if (decodedSettle.amount !== expectations.expectedAmountIn) {
    throw new Error(
      `SETTLE_ALL amount mismatch: expected ${expectations.expectedAmountIn}, got ${decodedSettle.amount}`
    );
  }

  // 9. Decode and validate Action 2 (TAKE_ALL)
  let decodedTake;
  try {
    const [currency, amount] = decodeAbiParameters(currencyAndUint256AbiParams, paramsList[2]);
    decodedTake = { currency, amount };
  } catch (err) {
    throw new Error(`Failed to decode TAKE_ALL params: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!isAddressEqual(decodedTake.currency, expectations.expectedTokenOut)) {
    throw new Error(
      `TAKE_ALL currency mismatch: expected ${expectations.expectedTokenOut}, got ${decodedTake.currency}`
    );
  }
  if (decodedTake.amount !== expectations.expectedAmountOutMinimum) {
    throw new Error(
      `TAKE_ALL amount mismatch: expected ${expectations.expectedAmountOutMinimum}, got ${decodedTake.amount}`
    );
  }

  return {
    functionName: decodedExecute.functionName,
    commands: commandsHex as `0x${string}`,
    actions: actionsBytes as `0x${string}`,
    deadline: deadlineBigInt,
    swapParams: decodedSwapParams,
    settle: decodedSettle,
    take: decodedTake,
  };
}
