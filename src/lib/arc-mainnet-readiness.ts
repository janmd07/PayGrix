import {
  isAddress,
  isAddressEqual,
} from "viem";
import {
  ARC_MAINNET_TOKENS,
  ARC_MAINNET_UNISWAP_V4,
} from "@/config/arc-mainnet";
import { arcMainnetPublicClient } from "@/lib/arc-mainnet-client";
import { getArcMainnetV4Quote, ArcMainnetQuoteResult } from "@/lib/arc-mainnet-quote";
import {
  buildArcMainnetV4Swap,
  decodeAndValidateArcMainnetV4Calldata,
} from "@/lib/arc-mainnet-build";
import {
  erc20ApproveAbi,
  permit2ApproveAbi,
  prepareArcMainnetErc20ApprovalTx,
  prepareArcMainnetPermit2ApprovalTx,
  ArcMainnetPreparedApprovalTx,
} from "@/lib/arc-mainnet-approval";
import { BASE_BUILDER_CODE } from "@/config/base-builder-code";

export const ARC_MAINNET_CHAIN_ID = 5042;
export const MAX_ALLOWED_QUOTE_AGE_MS = 30000; // 30 seconds

// Known foreign network addresses to explicitly reject
export const REJECTED_FOREIGN_ADDRESSES = [
  // Arc Testnet
  "0x0b8a6DC2E41ea6526315ee4F7b03887c3bFdcbF1", // Arc Testnet Adapter
  "0x89B489569b7a1E4A352123C461F4e3E5FCEF50B3", // Arc Testnet USDC
  "0xB327914041797B798bfe1344400EbC2064C46A29", // Arc Testnet EURC
  // Base Sepolia
  "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4", // Base Sepolia SwapRouter02
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia USDC
  "0x808456652fdb597867f38412077A9182bf77359F", // Base Sepolia EURC
  // Base Mainnet
  "0x2626664c2603336E57B271c5C0b26F421741e481", // Base Mainnet SwapRouter02
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base Mainnet USDC
  "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42", // Base Mainnet EURC
];

export type ArcMainnetReadinessApprovalState =
  | "READY"
  | "ERC20_APPROVAL_REQUIRED"
  | "PERMIT2_APPROVAL_REQUIRED"
  | "BOTH_APPROVALS_REQUIRED";

export interface ArcMainnetReadinessParams {
  fromAddress: string;
  toAddress: string;
  chainId: number;
  tokenIn: "USDC" | "EURC";
  tokenOut: "USDC" | "EURC";
  amount: string; // raw 6-decimal units string e.g. "1000000" for 1 USDC
  slippageBps?: number;
  quoteTimestamp?: number;
}

export interface ArcMainnetExecutionEnvelope {
  chainId: 5042;
  fromAddress: `0x${string}`;
  toAddress: `0x${string}`;
  target: `0x${string}`;
  value: "0x0";
  tokenIn: "USDC" | "EURC";
  tokenOut: "USDC" | "EURC";
  amountIn: string;
  quotedAmountOut: string;
  amountOutMinimum: string;
  slippageBps: number;
  gasEstimate: string | null;
  gasStatus: "simulated_success" | "simulated_revert_expected";
  gasError?: string;
  router: `0x${string}`;
  poolManager: `0x${string}`;
  permit2: `0x${string}`;
  erc20Allowance: string;
  permit2Allowance: string;
  permit2Expiration: number;
  permit2Nonce: number;
  permit2Expired: boolean;
  approvalState: ArcMainnetReadinessApprovalState;
  preparedErc20ApprovalTx: ArcMainnetPreparedApprovalTx | null;
  preparedPermit2ApprovalTx: ArcMainnetPreparedApprovalTx | null;
  calldata: `0x${string}`;
  executionSimulatedOnly: true;
  isReadyForBroadcast: false;
  writeExecuted: false;
}

/**
 * Validates that an address is not a known foreign network address.
 */
function assertNotForeignAddress(addr: string, label: string) {
  const lower = addr.toLowerCase();
  for (const foreign of REJECTED_FOREIGN_ADDRESSES) {
    if (lower === foreign.toLowerCase()) {
      throw new Error(
        `Security violation: ${label} address ${addr} matches foreign network address (Arc Testnet / Base). Arc Mainnet must remain completely isolated.`
      );
    }
  }
}

/**
 * Prepares the complete Arc Mainnet Swap execution readiness layer.
 * Enforces Steps A through J with zero write / sign operations.
 */
export async function prepareArcMainnetReadiness(
  params: ArcMainnetReadinessParams
): Promise<ArcMainnetExecutionEnvelope> {
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

  // ----------------------------------------------------
  // Step A: WRONG NETWORK (chainId !== 5042 -> BLOCK)
  // ----------------------------------------------------
  if (chainId !== ARC_MAINNET_CHAIN_ID) {
    throw new Error(
      `Arc Mainnet execution readiness blocked: chainId mismatch (expected ${ARC_MAINNET_CHAIN_ID}, got ${chainId}).`
    );
  }

  // ----------------------------------------------------
  // Step B: INVALID ADDRESS & FOREIGN ADDRESS CHECKS
  // ----------------------------------------------------
  assertNotForeignAddress(fromAddress, "sender");
  assertNotForeignAddress(toAddress, "recipient");

  if (!isAddress(fromAddress.toLowerCase())) {
    throw new Error(`Arc Mainnet execution readiness blocked: invalid fromAddress: ${fromAddress}`);
  }
  if (!isAddress(toAddress.toLowerCase())) {
    throw new Error(`Arc Mainnet execution readiness blocked: invalid toAddress: ${toAddress}`);
  }
  const fromAddrHex = fromAddress.toLowerCase() as `0x${string}`;
  const toAddrHex = toAddress.toLowerCase() as `0x${string}`;

  // Enforce recipient safety: fromAddress === toAddress
  if (!isAddressEqual(fromAddrHex, toAddrHex)) {
    throw new Error(
      "On Arc Mainnet Universal Router, TAKE_ALL sends swapped tokens to the transaction sender (msgSender). Recipient address must equal sender address."
    );
  }

  // ----------------------------------------------------
  // Step C: TOKEN PAIR INVALID (Only USDC <-> EURC)
  // ----------------------------------------------------
  if (
    (tokenIn !== "USDC" && tokenIn !== "EURC") ||
    (tokenOut !== "USDC" && tokenOut !== "EURC")
  ) {
    throw new Error(
      `Arc Mainnet execution readiness blocked: unsupported token pair ${tokenIn} -> ${tokenOut}. Strictly USDC and EURC are supported.`
    );
  }

  if (tokenIn === tokenOut) {
    throw new Error(
      `Arc Mainnet execution readiness blocked: same-token swap ${tokenIn} -> ${tokenOut} is not permitted.`
    );
  }

  const tokenInAddress = ARC_MAINNET_TOKENS[tokenIn].address;
  const tokenOutAddress = ARC_MAINNET_TOKENS[tokenOut].address;

  assertNotForeignAddress(tokenInAddress, "tokenIn");
  assertNotForeignAddress(tokenOutAddress, "tokenOut");

  const rawAmountIn = BigInt(amount);
  if (rawAmountIn <= BigInt(0)) {
    throw new Error(`Arc Mainnet execution readiness blocked: amount must be > 0, got: ${amount}`);
  }

  // ----------------------------------------------------
  // Step D: ERC20 -> Permit2 allowance (read-only)
  // ----------------------------------------------------
  let erc20Allowance = BigInt(0);
  try {
    const res = await arcMainnetPublicClient.readContract({
      address: tokenInAddress,
      abi: erc20ApproveAbi,
      functionName: "allowance",
      args: [fromAddrHex, ARC_MAINNET_UNISWAP_V4.permit2],
    });
    erc20Allowance = BigInt(res);
  } catch (err) {
    console.warn("[Arc Readiness] Non-fatal error reading ERC20 allowance:", err);
  }

  // ----------------------------------------------------
  // Step E: Permit2 -> Universal Router allowance (read-only)
  // ----------------------------------------------------
  let permit2Allowance = BigInt(0);
  let permit2Expiration = 0;
  let permit2Nonce = 0;
  try {
    const res = await arcMainnetPublicClient.readContract({
      address: ARC_MAINNET_UNISWAP_V4.permit2,
      abi: permit2ApproveAbi,
      functionName: "allowance",
      args: [fromAddrHex, tokenInAddress, ARC_MAINNET_UNISWAP_V4.universalRouter],
    });
    permit2Allowance = BigInt(res[0]);
    permit2Expiration = Number(res[1]);
    permit2Nonce = Number(res[2]);
  } catch (err) {
    console.warn("[Arc Readiness] Non-fatal error reading Permit2 allowance:", err);
  }

  const currentTimestampSec = Math.floor(Date.now() / 1000);
  const permit2Expired =
    permit2Expiration !== 0 && permit2Expiration <= currentTimestampSec;
  const effectivePermit2Allowance = permit2Expired ? BigInt(0) : permit2Allowance;

  // Determine Approval State
  const erc20Insufficient = erc20Allowance < rawAmountIn;
  const permit2Insufficient = effectivePermit2Allowance < rawAmountIn;

  let approvalState: ArcMainnetReadinessApprovalState;
  if (!erc20Insufficient && !permit2Insufficient) {
    approvalState = "READY";
  } else if (erc20Insufficient && !permit2Insufficient) {
    approvalState = "ERC20_APPROVAL_REQUIRED";
  } else if (!erc20Insufficient && permit2Insufficient) {
    approvalState = "PERMIT2_APPROVAL_REQUIRED";
  } else {
    approvalState = "BOTH_APPROVALS_REQUIRED";
  }

  // Prepare approval transactions if required (PREPARATION ONLY, ZERO WRITES)
  let preparedErc20ApprovalTx: ArcMainnetPreparedApprovalTx | null = null;
  let preparedPermit2ApprovalTx: ArcMainnetPreparedApprovalTx | null = null;

  if (erc20Insufficient) {
    preparedErc20ApprovalTx = prepareArcMainnetErc20ApprovalTx({
      token: tokenIn,
      owner: fromAddrHex,
      amount,
      chainId: 5042,
    });
  }

  if (permit2Insufficient) {
    preparedPermit2ApprovalTx = prepareArcMainnetPermit2ApprovalTx({
      token: tokenIn,
      owner: fromAddrHex,
      amount,
      chainId: 5042,
    });
  }

  // ----------------------------------------------------
  // Step F: FRESH QUOTE (Do not reuse stale cached quote)
  // ----------------------------------------------------
  const now = Date.now();
  if (quoteTimestamp && now - quoteTimestamp > MAX_ALLOWED_QUOTE_AGE_MS) {
    console.log("[Arc Readiness] Stale quote discarded. Obtaining fresh on-chain quote...");
  }

  const freshQuote: ArcMainnetQuoteResult = await getArcMainnetV4Quote({
    tokenInAddress,
    tokenOutAddress,
    amountIn: rawAmountIn,
    slippageBps,
  });

  const freshMinAmountOut = freshQuote.minAmountOut;
  if (freshMinAmountOut <= BigInt(0)) {
    throw new Error("Arc Mainnet execution readiness blocked: calculated amountOutMinimum is zero or negative.");
  }

  // ----------------------------------------------------
  // Step G: BUILD exact calldata using arc-mainnet-build.ts
  // ----------------------------------------------------
  const buildResult = await buildArcMainnetV4Swap({
    tokenInAddress,
    tokenOutAddress,
    fromAddress: fromAddrHex,
    toAddress: toAddrHex,
    amount,
    slippageBps,
  });

  const finalCalldata = buildResult.transaction.data;

  // ----------------------------------------------------
  // Step H: FINAL VALIDATION
  // ----------------------------------------------------
  const nowTimestampSec = BigInt(Math.floor(Date.now() / 1000));
  const zeroForOne = isAddressEqual(tokenInAddress, ARC_MAINNET_TOKENS.USDC.address);

  const decodedCalldata = decodeAndValidateArcMainnetV4Calldata(finalCalldata, {
    expectedTokenIn: tokenInAddress,
    expectedTokenOut: tokenOutAddress,
    expectedAmountIn: rawAmountIn,
    expectedAmountOutMinimum: BigInt(buildResult.minAmountOut),
    expectedZeroForOne: zeroForOne,
    minDeadline: nowTimestampSec - BigInt(60),
  });

  // Validate chainId === 5042
  if (buildResult.transaction.chainId !== 5042) {
    throw new Error(`Calldata chainId mismatch: expected 5042, got ${buildResult.transaction.chainId}`);
  }

  // Validate target === Arc Mainnet Universal Router
  if (!isAddressEqual(buildResult.transaction.to, ARC_MAINNET_UNISWAP_V4.universalRouter)) {
    throw new Error(
      `Calldata target mismatch: expected Universal Router ${ARC_MAINNET_UNISWAP_V4.universalRouter}, got ${buildResult.transaction.to}`
    );
  }

  // Validate value === 0
  if (buildResult.transaction.value !== "0x0") {
    throw new Error(`Calldata value mismatch: expected 0x0, got ${buildResult.transaction.value}`);
  }

  // Validate selector === 0x3593564c
  const calldataSelector = finalCalldata.slice(0, 10).toLowerCase();
  if (calldataSelector !== "0x3593564c") {
    throw new Error(`Calldata selector mismatch: expected 0x3593564c, got ${calldataSelector}`);
  }

  // Validate command includes V4_SWAP (0x10)
  if (decodedCalldata.commands.toLowerCase() !== "0x10") {
    throw new Error(`Calldata command mismatch: expected V4_SWAP (0x10), got ${decodedCalldata.commands}`);
  }

  // Validate poolManager is Arc Mainnet PoolManager
  const expectedPoolManager = ARC_MAINNET_UNISWAP_V4.poolManager;
  assertNotForeignAddress(expectedPoolManager, "poolManager");

  const poolKey = decodedCalldata.swapParams.poolKey;

  // Validate USDC/EURC currencies, fee, tickSpacing, hooks
  if (!isAddressEqual(poolKey.currency0, ARC_MAINNET_TOKENS.USDC.address)) {
    throw new Error(`Pool currency0 mismatch: expected USDC, got ${poolKey.currency0}`);
  }
  if (!isAddressEqual(poolKey.currency1, ARC_MAINNET_TOKENS.EURC.address)) {
    throw new Error(`Pool currency1 mismatch: expected EURC, got ${poolKey.currency1}`);
  }
  if (poolKey.fee !== 500) {
    throw new Error(`Pool fee mismatch: expected 500, got ${poolKey.fee}`);
  }
  if (poolKey.tickSpacing !== 10) {
    throw new Error(`Pool tickSpacing mismatch: expected 10, got ${poolKey.tickSpacing}`);
  }
  if (!isAddressEqual(poolKey.hooks, "0x0000000000000000000000000000000000000000")) {
    throw new Error(`Pool hooks mismatch: expected 0x0, got ${poolKey.hooks}`);
  }

  // Validate amountIn and amountOutMinimum
  if (decodedCalldata.swapParams.amountIn !== rawAmountIn) {
    throw new Error(`Amount in mismatch: expected ${rawAmountIn}, got ${decodedCalldata.swapParams.amountIn}`);
  }
  if (decodedCalldata.swapParams.amountOutMinimum !== freshMinAmountOut) {
    throw new Error(
      `Amount out minimum mismatch: expected ${freshMinAmountOut}, got ${decodedCalldata.swapParams.amountOutMinimum}`
    );
  }

  // Validate Base Builder Code absence
  if (
    finalCalldata.toLowerCase().includes("62635f66337366326969750b00802180218021802180218021") ||
    finalCalldata.toLowerCase().includes(BASE_BUILDER_CODE.encoded.slice(2).toLowerCase())
  ) {
    throw new Error("Security violation: Base Builder Code ERC-8021 suffix found in Arc Mainnet calldata.");
  }
  const asciiData = Buffer.from(finalCalldata.slice(2), "hex").toString("utf8");
  if (asciiData.includes(BASE_BUILDER_CODE.code) || asciiData.includes("bc_f3sf2iiu")) {
    throw new Error("Security violation: Base Builder Code ASCII found in Arc Mainnet calldata.");
  }

  // ----------------------------------------------------
  // Step I: FINAL GAS ESTIMATE
  // ----------------------------------------------------
  let gasEstimate: string | null = null;
  let gasStatus: "simulated_success" | "simulated_revert_expected" = "simulated_success";
  let gasError: string | undefined;

  try {
    const est = await arcMainnetPublicClient.estimateGas({
      account: fromAddrHex,
      to: ARC_MAINNET_UNISWAP_V4.universalRouter,
      data: finalCalldata,
      value: BigInt(0),
    });
    gasEstimate = est.toString();
    gasStatus = "simulated_success";
  } catch (err: unknown) {
    gasStatus = "simulated_revert_expected";
    gasError = err instanceof Error ? err.message : String(err);
  }

  // ----------------------------------------------------
  // Step J: FINAL EXECUTION ENVELOPE (PREPARATION ONLY)
  // ----------------------------------------------------
  return {
    chainId: 5042,
    fromAddress: fromAddrHex,
    toAddress: toAddrHex,
    target: ARC_MAINNET_UNISWAP_V4.universalRouter,
    value: "0x0",
    tokenIn,
    tokenOut,
    amountIn: rawAmountIn.toString(),
    quotedAmountOut: freshQuote.amountOut.toString(),
    amountOutMinimum: freshMinAmountOut.toString(),
    slippageBps,
    gasEstimate,
    gasStatus,
    gasError,
    router: ARC_MAINNET_UNISWAP_V4.universalRouter,
    poolManager: ARC_MAINNET_UNISWAP_V4.poolManager,
    permit2: ARC_MAINNET_UNISWAP_V4.permit2,
    erc20Allowance: erc20Allowance.toString(),
    permit2Allowance: permit2Allowance.toString(),
    permit2Expiration,
    permit2Nonce,
    permit2Expired,
    approvalState,
    preparedErc20ApprovalTx,
    preparedPermit2ApprovalTx,
    calldata: finalCalldata,
    executionSimulatedOnly: true,
    isReadyForBroadcast: false,
    writeExecuted: false,
  };
}
