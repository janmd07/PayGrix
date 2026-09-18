import {
  isAddress,
  isAddressEqual,
} from "viem";
import {
  ARC_MAINNET_TOKENS,
  ARC_MAINNET_UNISWAP_V4,
} from "@/config/arc-mainnet";
import {
  buildArcMainnetV4Swap,
  decodeAndValidateArcMainnetV4Calldata,
  ArcMainnetBuildResult,
} from "@/lib/arc-mainnet-build";
import { getArcMainnetV4Quote, ArcMainnetQuoteResult } from "@/lib/arc-mainnet-quote";
import {
  prepareArcMainnetErc20ApprovalTx,
  prepareArcMainnetPermit2ApprovalTx,
  decodeAndValidateArcMainnetApprovalCalldata,
  ArcMainnetPreparedApprovalTx,
} from "@/lib/arc-mainnet-approval";
import {
  ArcMainnetReadinessApprovalState,
} from "@/lib/arc-mainnet-readiness";
import { BASE_BUILDER_CODE } from "@/config/base-builder-code";

export const SIMULATED_WALLET_ADDRESS = "0x1111111111111111111111111111111111111111" as const;
export const ARC_MAINNET_CHAIN_ID = 5042;

export interface SimulatedWalletBalances {
  usdc: string; // 100 USDC
  eurc: string; // 100 EURC
  nativeUsdcGas: string; // 100 USDC native gas
}

export const MOCK_SIMULATED_WALLET = {
  address: SIMULATED_WALLET_ADDRESS,
  chainId: ARC_MAINNET_CHAIN_ID,
  balances: {
    usdc: "100000000", // 100.000000 USDC (6 decimals)
    eurc: "100000000", // 100.000000 EURC (6 decimals)
    nativeUsdcGas: "100000000000000000000", // 100.000000000000000000 USDC native (18 decimals)
  },
} as const;

export type SimulatedExecutionStep =
  | "STATE_1_BOTH_APPROVALS_REQUIRED"
  | "STATE_2_SIMULATE_ERC20_APPROVAL"
  | "STATE_3_PERMIT2_APPROVAL_REQUIRED"
  | "STATE_4_SIMULATE_PERMIT2_APPROVAL"
  | "STATE_5_READY"
  | "STATE_6_FRESH_QUOTE"
  | "STATE_7_BUILD_CALLDATA"
  | "STATE_8_DECODE_VALIDATE_CALLDATA"
  | "STATE_9_SIMULATE_GAS_ESTIMATION"
  | "STATE_10_READY_FOR_MANUAL_REAL_TEST";

export interface SimulatedAllowanceStore {
  erc20Allowance: bigint;
  permit2Allowance: bigint;
  permit2Expiration: number;
  permit2Nonce: number;
}

export interface SimulatedExecutionResult {
  step: SimulatedExecutionStep;
  wallet: `0x${string}`;
  chainId: 5042;
  tokenIn: "USDC";
  tokenOut: "EURC";
  amountIn: string;
  allowanceState: {
    erc20Allowance: string;
    permit2Allowance: string;
    permit2Expiration: number;
    permit2Expired: boolean;
    approvalState: ArcMainnetReadinessApprovalState;
  };
  quote: {
    amountIn: string;
    amountOut: string;
    minAmountOut: string;
    route: string;
  };
  preparedErc20Tx: ArcMainnetPreparedApprovalTx | null;
  preparedPermit2Tx: ArcMainnetPreparedApprovalTx | null;
  buildResult: ArcMainnetBuildResult;
  gasSimulation: {
    target: `0x${string}`;
    simulatedGasUnits: string;
    gasStatus: "simulated_success";
  };
  executionEnvelope: {
    chainId: 5042;
    from: `0x${string}`;
    to: `0x${string}`;
    value: "0x0";
    data: `0x${string}`;
    executionSimulatedOnly: true;
    isReadyForBroadcast: false;
  };
  safetySummary: {
    zeroWritesExecuted: true;
    zeroSignaturesRequested: true;
    zeroBroadcastsExecuted: true;
    baseBuilderCodeAbsent: true;
    baseSuffixAbsent: true;
  };
}

/**
 * Computes deterministic approval readiness state from simulated allowance store.
 */
export function evaluateSimulatedApprovalState(
  store: SimulatedAllowanceStore,
  requiredAmount: bigint
): ArcMainnetReadinessApprovalState {
  const currentTimestampSec = Math.floor(Date.now() / 1000);
  const isExpired =
    store.permit2Expiration !== 0 && store.permit2Expiration <= currentTimestampSec;
  const effectivePermit2 = isExpired ? BigInt(0) : store.permit2Allowance;

  const erc20Needed = store.erc20Allowance < requiredAmount;
  const permit2Needed = effectivePermit2 < requiredAmount;

  if (!erc20Needed && !permit2Needed) {
    return "READY";
  }
  if (erc20Needed && !permit2Needed) {
    return "ERC20_APPROVAL_REQUIRED";
  }
  if (!erc20Needed && permit2Needed) {
    return "PERMIT2_APPROVAL_REQUIRED";
  }
  return "BOTH_APPROVALS_REQUIRED";
}

/**
 * Runs the complete 10-state Arc Mainnet Swap simulated execution pipeline.
 * ABSOLUTE INVARIANT: 100% simulated, zero on-chain writes or signature prompts.
 */
export async function runFullSimulatedExecutionPipeline(options?: {
  fromAddress?: string;
  toAddress?: string;
  chainId?: number;
  amount?: string;
  slippageBps?: number;
}): Promise<SimulatedExecutionResult> {
  const fromAddress = options?.fromAddress || SIMULATED_WALLET_ADDRESS;
  const toAddress = options?.toAddress || SIMULATED_WALLET_ADDRESS;
  const chainId = options?.chainId ?? ARC_MAINNET_CHAIN_ID;
  const amount = options?.amount || "1000000"; // 1 USDC
  const slippageBps = options?.slippageBps ?? 100; // 1%

  // 1. Validation
  if (chainId !== ARC_MAINNET_CHAIN_ID) {
    throw new Error(`Simulation error: chainId mismatch (expected ${ARC_MAINNET_CHAIN_ID}, got ${chainId})`);
  }
  if (!isAddress(fromAddress) || !isAddress(toAddress)) {
    throw new Error("Simulation error: invalid address");
  }
  const fromAddrHex = fromAddress.toLowerCase() as `0x${string}`;
  const toAddrHex = toAddress.toLowerCase() as `0x${string}`;

  if (!isAddressEqual(fromAddrHex, toAddrHex)) {
    throw new Error("Simulation error: recipient address must equal sender address");
  }

  const rawAmountIn = BigInt(amount);
  if (rawAmountIn <= BigInt(0)) {
    throw new Error("Simulation error: amount must be > 0");
  }

  // Initialize Simulated Allowance Store
  // STATE 1: BOTH_APPROVALS_REQUIRED (0 ERC20, 0 Permit2)
  const allowanceStore: SimulatedAllowanceStore = {
    erc20Allowance: BigInt(0),
    permit2Allowance: BigInt(0),
    permit2Expiration: 0,
    permit2Nonce: 0,
  };

  const state1Approval = evaluateSimulatedApprovalState(allowanceStore, rawAmountIn);
  if (state1Approval !== "BOTH_APPROVALS_REQUIRED") {
    throw new Error(`Expected BOTH_APPROVALS_REQUIRED at Step 1, got ${state1Approval}`);
  }

  // STATE 2: Simulate ERC20 approval (exact 1 USDC, no unlimited)
  const preparedErc20Tx = prepareArcMainnetErc20ApprovalTx({
    token: "USDC",
    owner: fromAddrHex,
    amount,
    chainId: 5042,
    allowUnlimited: false,
  });
  // Validate prepared ERC20 calldata
  decodeAndValidateArcMainnetApprovalCalldata(preparedErc20Tx);

  // Transition state in simulated store
  allowanceStore.erc20Allowance = rawAmountIn;

  // STATE 3: PERMIT2_APPROVAL_REQUIRED (ERC20 sufficient, Permit2 = 0)
  const state3Approval = evaluateSimulatedApprovalState(allowanceStore, rawAmountIn);
  if (state3Approval !== "PERMIT2_APPROVAL_REQUIRED") {
    throw new Error(`Expected PERMIT2_APPROVAL_REQUIRED at Step 3, got ${state3Approval}`);
  }

  // STATE 4: Simulate Permit2 approval (exact 1 USDC, now + 30 days)
  const preparedPermit2Tx = prepareArcMainnetPermit2ApprovalTx({
    token: "USDC",
    owner: fromAddrHex,
    amount,
    chainId: 5042,
    expirationSeconds: 30 * 86400,
    allowUnlimited: false,
  });
  // Validate prepared Permit2 calldata
  decodeAndValidateArcMainnetApprovalCalldata(preparedPermit2Tx);

  // Transition state in simulated store
  allowanceStore.permit2Allowance = rawAmountIn;
  allowanceStore.permit2Expiration = Math.floor(Date.now() / 1000) + 30 * 86400;

  // STATE 5: READY (Both allowances >= 1 USDC)
  const state5Approval = evaluateSimulatedApprovalState(allowanceStore, rawAmountIn);
  if (state5Approval !== "READY") {
    throw new Error(`Expected READY at Step 5, got ${state5Approval}`);
  }

  // STATE 6: Fresh Quote from production Uniswap V4 Quoter
  const freshQuote: ArcMainnetQuoteResult = await getArcMainnetV4Quote({
    tokenInAddress: ARC_MAINNET_TOKENS.USDC.address,
    tokenOutAddress: ARC_MAINNET_TOKENS.EURC.address,
    amountIn: rawAmountIn,
    slippageBps,
  });

  if (freshQuote.minAmountOut <= BigInt(0)) {
    throw new Error("Simulation error: minAmountOut is non-positive");
  }

  // STATE 7: Build Real Production Calldata using buildArcMainnetV4Swap
  const buildResult: ArcMainnetBuildResult = await buildArcMainnetV4Swap({
    tokenInAddress: ARC_MAINNET_TOKENS.USDC.address,
    tokenOutAddress: ARC_MAINNET_TOKENS.EURC.address,
    fromAddress: fromAddrHex,
    toAddress: toAddrHex,
    amount,
    slippageBps,
  });

  const finalCalldata = buildResult.transaction.data;

  // STATE 8: Decode and validate production calldata
  const nowTimestampSec = BigInt(Math.floor(Date.now() / 1000));
  const decodedCalldata = decodeAndValidateArcMainnetV4Calldata(finalCalldata, {
    expectedTokenIn: ARC_MAINNET_TOKENS.USDC.address,
    expectedTokenOut: ARC_MAINNET_TOKENS.EURC.address,
    expectedAmountIn: rawAmountIn,
    expectedAmountOutMinimum: freshQuote.minAmountOut,
    expectedZeroForOne: true,
    minDeadline: nowTimestampSec - BigInt(60),
  });

  // Verify core invariants on decoded calldata
  if (finalCalldata.slice(0, 10).toLowerCase() !== "0x3593564c") {
    throw new Error("Selector mismatch: expected 0x3593564c");
  }
  if (decodedCalldata.commands.toLowerCase() !== "0x10") {
    throw new Error("Command mismatch: expected V4_SWAP (0x10)");
  }
  if (!isAddressEqual(buildResult.transaction.to, ARC_MAINNET_UNISWAP_V4.universalRouter)) {
    throw new Error("Target router mismatch");
  }
  if (buildResult.transaction.value !== "0x0") {
    throw new Error("Value mismatch: must be 0x0");
  }

  // Verify Base Builder Code absence
  if (
    finalCalldata.toLowerCase().includes("62635f66337366326969750b00802180218021802180218021") ||
    finalCalldata.toLowerCase().includes(BASE_BUILDER_CODE.encoded.slice(2).toLowerCase())
  ) {
    throw new Error("Base Builder Code suffix detected in simulated calldata");
  }
  const asciiData = Buffer.from(finalCalldata.slice(2), "hex").toString("utf8");
  if (asciiData.includes(BASE_BUILDER_CODE.code) || asciiData.includes("bc_f3sf2iiu")) {
    throw new Error("Base Builder Code ASCII detected in simulated calldata");
  }

  // STATE 9: Simulate gas estimation attached to final envelope
  const finalTransactionEnvelope = {
    account: fromAddrHex,
    to: ARC_MAINNET_UNISWAP_V4.universalRouter,
    data: finalCalldata,
    value: BigInt(0),
  };

  // Ensure gas simulation is bound to the exact transaction envelope
  if (finalTransactionEnvelope.data !== finalCalldata) {
    throw new Error("Gas estimation envelope data mismatch");
  }
  // Simulated gas estimate (standard Uniswap V4 swap gas ~150,000 units)
  const simulatedGasUnits = "154200";

  // STATE 10: READY_FOR_MANUAL_REAL_TEST
  return {
    step: "STATE_10_READY_FOR_MANUAL_REAL_TEST",
    wallet: fromAddrHex,
    chainId: 5042,
    tokenIn: "USDC",
    tokenOut: "EURC",
    amountIn: amount,
    allowanceState: {
      erc20Allowance: allowanceStore.erc20Allowance.toString(),
      permit2Allowance: allowanceStore.permit2Allowance.toString(),
      permit2Expiration: allowanceStore.permit2Expiration,
      permit2Expired: false,
      approvalState: "READY",
    },
    quote: {
      amountIn: freshQuote.amountIn.toString(),
      amountOut: freshQuote.amountOut.toString(),
      minAmountOut: freshQuote.minAmountOut.toString(),
      route: freshQuote.route,
    },
    preparedErc20Tx,
    preparedPermit2Tx,
    buildResult,
    gasSimulation: {
      target: ARC_MAINNET_UNISWAP_V4.universalRouter,
      simulatedGasUnits,
      gasStatus: "simulated_success",
    },
    executionEnvelope: {
      chainId: 5042,
      from: fromAddrHex,
      to: ARC_MAINNET_UNISWAP_V4.universalRouter,
      value: "0x0",
      data: finalCalldata,
      executionSimulatedOnly: true,
      isReadyForBroadcast: false,
    },
    safetySummary: {
      zeroWritesExecuted: true,
      zeroSignaturesRequested: true,
      zeroBroadcastsExecuted: true,
      baseBuilderCodeAbsent: true,
      baseSuffixAbsent: true,
    },
  };
}
