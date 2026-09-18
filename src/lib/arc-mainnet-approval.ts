import {
  parseAbi,
  encodeFunctionData,
  decodeFunctionData,
  isAddress,
  isAddressEqual,
} from "viem";
import { ARC_MAINNET_TOKENS, ARC_MAINNET_UNISWAP_V4 } from "@/config/arc-mainnet";
import { arcMainnetPublicClient } from "@/lib/arc-mainnet-client";
import { BASE_BUILDER_CODE } from "@/config/base-builder-code";

export const ARC_MAINNET_CHAIN_ID = 5042;
export const BASE_BUILDER_SUFFIX_HEX = "62635f66337366326969750b00802180218021802180218021";

// Verified ERC20 approval and allowance ABI
export const erc20ApproveAbi = parseAbi([
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
]);

// Verified Canonical Permit2 ABI on Arc Mainnet
export const permit2ApproveAbi = parseAbi([
  "function approve(address token, address spender, uint160 amount, uint48 expiration) external",
  "function allowance(address user, address token, address spender) external view returns (uint160 amount, uint48 expiration, uint48 nonce)",
]);

export type ArcMainnetApprovalState =
  | "BOTH_SUFFICIENT"
  | "ERC20_APPROVAL_NEEDED"
  | "PERMIT2_APPROVAL_NEEDED"
  | "BOTH_APPROVALS_NEEDED";

export type ArcMainnetApprovalType =
  | "ERC20_TO_PERMIT2"
  | "PERMIT2_TO_UNIVERSAL_ROUTER";

export interface ArcMainnetAllowanceAuditParams {
  token: "USDC" | "EURC";
  owner: string;
  requiredAmount: string; // raw 6-decimal units string e.g. "1000000"
  chainId?: number;
}

export interface ArcMainnetAllowanceAuditResult {
  token: "USDC" | "EURC";
  tokenAddress: `0x${string}`;
  owner: `0x${string}`;
  permit2: `0x${string}`;
  universalRouter: `0x${string}`;

  requiredAmount: string;
  formattedRequiredAmount: string;

  erc20Allowance: string;
  permit2Allowance: string;
  permit2Expiration: number;
  permit2Nonce: number;
  permit2Expired: boolean;

  erc20ApprovalNeeded: boolean;
  permit2ApprovalNeeded: boolean;

  approvalRequired: boolean;
  swapReady: boolean;
  state: ArcMainnetApprovalState;

  writeExecuted: false;
}

export interface ArcMainnetPreparedApprovalTx {
  chainId: 5042;
  from: `0x${string}`;
  to: `0x${string}`;
  value: "0x0";
  data: `0x${string}`;
  approvalType: ArcMainnetApprovalType;
  token: "USDC" | "EURC";
  tokenAddress: `0x${string}`;
  spender: `0x${string}`;
  amount: string;
  formattedAmount: string;
  expiration?: number;
  network: "Arc Mainnet";
  executionSimulatedOnly: true;
  isReadyForBroadcast: false;
}

export interface ArcMainnetErc20ApprovalParams {
  token: "USDC" | "EURC";
  owner: string;
  amount: string; // raw 6-decimal units string e.g. "1000000"
  chainId?: number;
  allowUnlimited?: boolean; // strictly default false
}

export interface ArcMainnetPermit2ApprovalParams {
  token: "USDC" | "EURC";
  owner: string;
  amount: string; // raw 6-decimal units string e.g. "1000000"
  chainId?: number;
  expirationSeconds?: number; // optional duration in seconds, default 30 days
  allowUnlimited?: boolean; // strictly default false
}

export interface ArcMainnetApprovalAuditAndPreparationResult {
  audit: ArcMainnetAllowanceAuditResult;
  preparedErc20ApprovalTx: ArcMainnetPreparedApprovalTx | null;
  preparedPermit2ApprovalTx: ArcMainnetPreparedApprovalTx | null;
  executionSimulatedOnly: true;
  isReadyForBroadcast: false;
  writeExecuted: false;
}

// -----------------------------------------------------------------------------
// 1. Helper: Validate Arc Mainnet token
// -----------------------------------------------------------------------------
export function getArcMainnetTokenAddress(token: "USDC" | "EURC"): `0x${string}` {
  if (token === "USDC") return ARC_MAINNET_TOKENS.USDC.address;
  if (token === "EURC") return ARC_MAINNET_TOKENS.EURC.address;
  throw new Error(`Unsupported token for Arc Mainnet: ${token}. Strictly USDC and EURC are supported.`);
}

// -----------------------------------------------------------------------------
// 2. Read-Only Allowance Audit (ERC20 allowance & Permit2 allowance)
// -----------------------------------------------------------------------------
export async function auditArcMainnetAllowances(
  params: ArcMainnetAllowanceAuditParams
): Promise<ArcMainnetAllowanceAuditResult> {
  const { token, owner, requiredAmount, chainId } = params;

  // Validate chainId if supplied
  if (chainId !== undefined && chainId !== ARC_MAINNET_CHAIN_ID) {
    throw new Error(
      `Arc Mainnet chainId mismatch: expected ${ARC_MAINNET_CHAIN_ID}, received ${chainId}.`
    );
  }

  // Validate owner address
  if (!isAddress(owner)) {
    throw new Error(`Invalid owner address: ${owner}`);
  }
  const ownerAddress = owner.toLowerCase() as `0x${string}`;

  // Validate token
  const tokenAddress = getArcMainnetTokenAddress(token);

  // Validate amount
  const rawRequired = BigInt(requiredAmount);
  if (rawRequired <= BigInt(0)) {
    throw new Error(`Required amount must be positive, received: ${requiredAmount}`);
  }

  // Step A: Read ERC20 allowance: owner -> Permit2
  let erc20AllowanceBigInt = BigInt(0);
  try {
    const erc20Res = await arcMainnetPublicClient.readContract({
      address: tokenAddress,
      abi: erc20ApproveAbi,
      functionName: "allowance",
      args: [ownerAddress, ARC_MAINNET_UNISWAP_V4.permit2],
    });
    erc20AllowanceBigInt = BigInt(erc20Res);
  } catch (err) {
    console.warn("[Arc Mainnet Approval] Non-fatal error reading ERC20 allowance:", err);
  }

  // Step B: Read Permit2 allowance: owner -> Universal Router
  let permit2AllowanceBigInt = BigInt(0);
  let permit2Expiration = 0;
  let permit2Nonce = 0;
  try {
    const permit2Res = await arcMainnetPublicClient.readContract({
      address: ARC_MAINNET_UNISWAP_V4.permit2,
      abi: permit2ApproveAbi,
      functionName: "allowance",
      args: [ownerAddress, tokenAddress, ARC_MAINNET_UNISWAP_V4.universalRouter],
    });
    permit2AllowanceBigInt = BigInt(permit2Res[0]);
    permit2Expiration = Number(permit2Res[1]);
    permit2Nonce = Number(permit2Res[2]);
  } catch (err) {
    console.warn("[Arc Mainnet Approval] Non-fatal error reading Permit2 allowance:", err);
  }

  // Check Permit2 expiration
  const currentTimestampSec = Math.floor(Date.now() / 1000);
  const permit2Expired =
    permit2Expiration !== 0 && permit2Expiration <= currentTimestampSec;
  const effectivePermit2Allowance = permit2Expired ? BigInt(0) : permit2AllowanceBigInt;

  // Step C: Determine State Machine
  const erc20ApprovalNeeded = erc20AllowanceBigInt < rawRequired;
  const permit2ApprovalNeeded = effectivePermit2Allowance < rawRequired;

  let state: ArcMainnetApprovalState;
  if (!erc20ApprovalNeeded && !permit2ApprovalNeeded) {
    state = "BOTH_SUFFICIENT";
  } else if (erc20ApprovalNeeded && !permit2ApprovalNeeded) {
    state = "ERC20_APPROVAL_NEEDED";
  } else if (!erc20ApprovalNeeded && permit2ApprovalNeeded) {
    state = "PERMIT2_APPROVAL_NEEDED";
  } else {
    state = "BOTH_APPROVALS_NEEDED";
  }

  const approvalRequired = state !== "BOTH_SUFFICIENT";
  const swapReady = !approvalRequired;

  return {
    token,
    tokenAddress,
    owner: ownerAddress,
    permit2: ARC_MAINNET_UNISWAP_V4.permit2,
    universalRouter: ARC_MAINNET_UNISWAP_V4.universalRouter,
    requiredAmount,
    formattedRequiredAmount: (Number(rawRequired) / 1e6).toFixed(6),
    erc20Allowance: erc20AllowanceBigInt.toString(),
    permit2Allowance: permit2AllowanceBigInt.toString(),
    permit2Expiration,
    permit2Nonce,
    permit2Expired,
    erc20ApprovalNeeded,
    permit2ApprovalNeeded,
    approvalRequired,
    swapReady,
    state,
    writeExecuted: false,
  };
}

// -----------------------------------------------------------------------------
// 3. Prepare ERC20 Approval Transaction (owner -> Permit2)
// -----------------------------------------------------------------------------
export function prepareArcMainnetErc20ApprovalTx(
  params: ArcMainnetErc20ApprovalParams
): ArcMainnetPreparedApprovalTx {
  const { token, owner, amount, chainId, allowUnlimited = false } = params;

  if (chainId !== undefined && chainId !== ARC_MAINNET_CHAIN_ID) {
    throw new Error(
      `Arc Mainnet chainId mismatch: expected ${ARC_MAINNET_CHAIN_ID}, received ${chainId}.`
    );
  }

  if (!isAddress(owner)) {
    throw new Error(`Invalid owner address: ${owner}`);
  }
  const ownerAddress = owner.toLowerCase() as `0x${string}`;
  const tokenAddress = getArcMainnetTokenAddress(token);

  const rawAmount = BigInt(amount);
  if (rawAmount <= BigInt(0)) {
    throw new Error(`Approval amount must be positive, received: ${amount}`);
  }

  // Section 8: Unlimited approval policy check
  // Do NOT silently grant unlimited approval. Default approval must be exactly the swap amount.
  const MAX_UINT256 = BigInt("115792089237316195423570985008687907853269984665640564039457584007913129639935");
  if (rawAmount === MAX_UINT256 && !allowUnlimited) {
    throw new Error(
      "Unlimited approval rejected: Arc Mainnet requires explicit, exact approval amounts matching the required swap amount."
    );
  }

  // Construct calldata: approve(Permit2, amount)
  const data = encodeFunctionData({
    abi: erc20ApproveAbi,
    functionName: "approve",
    args: [ARC_MAINNET_UNISWAP_V4.permit2, rawAmount],
  });

  const tx: ArcMainnetPreparedApprovalTx = {
    chainId: 5042,
    from: ownerAddress,
    to: tokenAddress,
    value: "0x0",
    data,
    approvalType: "ERC20_TO_PERMIT2",
    token,
    tokenAddress,
    spender: ARC_MAINNET_UNISWAP_V4.permit2,
    amount: rawAmount.toString(),
    formattedAmount: (Number(rawAmount) / 1e6).toFixed(6),
    network: "Arc Mainnet",
    executionSimulatedOnly: true,
    isReadyForBroadcast: false,
  };

  // Immediate pre-validation before returning
  validateArcMainnetApprovalTx(tx, {
    expectedChainId: 5042,
    expectedOwner: ownerAddress,
    expectedTarget: tokenAddress,
    expectedSpender: ARC_MAINNET_UNISWAP_V4.permit2,
    expectedAmount: rawAmount,
  });

  return tx;
}

// -----------------------------------------------------------------------------
// 4. Prepare Permit2 Approval Transaction (owner -> Universal Router)
// -----------------------------------------------------------------------------
export function prepareArcMainnetPermit2ApprovalTx(
  params: ArcMainnetPermit2ApprovalParams
): ArcMainnetPreparedApprovalTx {
  const { token, owner, amount, chainId, expirationSeconds = 30 * 86400, allowUnlimited = false } = params;

  if (chainId !== undefined && chainId !== ARC_MAINNET_CHAIN_ID) {
    throw new Error(
      `Arc Mainnet chainId mismatch: expected ${ARC_MAINNET_CHAIN_ID}, received ${chainId}.`
    );
  }

  if (!isAddress(owner)) {
    throw new Error(`Invalid owner address: ${owner}`);
  }
  const ownerAddress = owner.toLowerCase() as `0x${string}`;
  const tokenAddress = getArcMainnetTokenAddress(token);

  const rawAmount = BigInt(amount);
  if (rawAmount <= BigInt(0)) {
    throw new Error(`Approval amount must be positive, received: ${amount}`);
  }

  // Permit2 amount parameter is uint160
  const MAX_UINT160 = BigInt("1461501637330902918203684832716283019655932542975");
  if (rawAmount > MAX_UINT160) {
    throw new Error(`Permit2 amount exceeds uint160 max: ${amount}`);
  }

  if (rawAmount === MAX_UINT160 && !allowUnlimited) {
    throw new Error(
      "Unlimited approval rejected: Arc Mainnet requires explicit, exact approval amounts matching the required swap amount."
    );
  }

  // Calculate expiration: uint48 timestamp
  const nowSec = Math.floor(Date.now() / 1000);
  const expiration = nowSec + expirationSeconds;
  const MAX_UINT48 = 281474976710655;
  if (expiration > MAX_UINT48) {
    throw new Error(`Permit2 expiration exceeds uint48 bounds: ${expiration}`);
  }

  // Construct calldata: approve(token, UniversalRouter, amount, expiration)
  const data = encodeFunctionData({
    abi: permit2ApproveAbi,
    functionName: "approve",
    args: [tokenAddress, ARC_MAINNET_UNISWAP_V4.universalRouter, rawAmount, expiration],
  });

  const tx: ArcMainnetPreparedApprovalTx = {
    chainId: 5042,
    from: ownerAddress,
    to: ARC_MAINNET_UNISWAP_V4.permit2,
    value: "0x0",
    data,
    approvalType: "PERMIT2_TO_UNIVERSAL_ROUTER",
    token,
    tokenAddress,
    spender: ARC_MAINNET_UNISWAP_V4.universalRouter,
    amount: rawAmount.toString(),
    formattedAmount: (Number(rawAmount) / 1e6).toFixed(6),
    expiration,
    network: "Arc Mainnet",
    executionSimulatedOnly: true,
    isReadyForBroadcast: false,
  };

  // Immediate pre-validation before returning
  validateArcMainnetApprovalTx(tx, {
    expectedChainId: 5042,
    expectedOwner: ownerAddress,
    expectedTarget: ARC_MAINNET_UNISWAP_V4.permit2,
    expectedSpender: ARC_MAINNET_UNISWAP_V4.universalRouter,
    expectedAmount: rawAmount,
  });

  return tx;
}

// -----------------------------------------------------------------------------
// 5. Decode and Validate Approval Calldata
// -----------------------------------------------------------------------------
export interface DecodedApprovalCalldata {
  selector: `0x${string}`;
  target: `0x${string}`;
  spender: `0x${string}`;
  amount: bigint;
  expiration?: number;
  baseBuilderCodeAbsent: true;
  baseSuffixAbsent: true;
}

export function decodeAndValidateArcMainnetApprovalCalldata(
  tx: ArcMainnetPreparedApprovalTx
): DecodedApprovalCalldata {
  const { data, to, approvalType, tokenAddress } = tx;

  // 1. Selector check
  const selector = data.slice(0, 10).toLowerCase() as `0x${string}`;

  // 2. Base Builder Code check
  if (
    data.toLowerCase().includes(BASE_BUILDER_SUFFIX_HEX.toLowerCase()) ||
    data.toLowerCase().includes(BASE_BUILDER_CODE.encoded.slice(2).toLowerCase())
  ) {
    throw new Error(
      "Security invariant violated: Base Builder Code ERC-8021 suffix found in Arc Mainnet approval calldata."
    );
  }
  const asciiData = Buffer.from(data.slice(2), "hex").toString("utf8");
  if (asciiData.includes(BASE_BUILDER_CODE.code) || asciiData.includes("bc_f3sf2iiu")) {
    throw new Error(
      "Security invariant violated: Base Builder Code ASCII found in Arc Mainnet approval calldata."
    );
  }

  // 3. Decode based on approval type
  if (approvalType === "ERC20_TO_PERMIT2") {
    if (selector !== "0x095ea7b3") {
      throw new Error(`Invalid ERC20 approve selector: expected 0x095ea7b3, got ${selector}`);
    }

    // Verify ERC20 approve never targets Universal Router
    if (isAddressEqual(to, ARC_MAINNET_UNISWAP_V4.universalRouter)) {
      throw new Error(
        "Security invariant violated: ERC20 approve target must NEVER be the Universal Router on Arc Mainnet."
      );
    }

    if (!isAddressEqual(to, tokenAddress)) {
      throw new Error(
        `ERC20 approve target mismatch: expected token ${tokenAddress}, got ${to}`
      );
    }

    const decoded = decodeFunctionData({
      abi: erc20ApproveAbi,
      data,
    });

    if (decoded.functionName !== "approve") {
      throw new Error(`Unexpected ERC20 function name: ${decoded.functionName}`);
    }

    const [decodedSpender, decodedAmount] = decoded.args as [`0x${string}`, bigint];

    if (!isAddressEqual(decodedSpender, ARC_MAINNET_UNISWAP_V4.permit2)) {
      throw new Error(
        `ERC20 approve spender mismatch: expected Permit2 (${ARC_MAINNET_UNISWAP_V4.permit2}), got ${decodedSpender}`
      );
    }

    return {
      selector,
      target: to,
      spender: decodedSpender,
      amount: decodedAmount,
      baseBuilderCodeAbsent: true,
      baseSuffixAbsent: true,
    };
  } else if (approvalType === "PERMIT2_TO_UNIVERSAL_ROUTER") {
    if (selector !== "0x87517c45") {
      throw new Error(`Invalid Permit2 approve selector: expected 0x87517c45, got ${selector}`);
    }

    if (!isAddressEqual(to, ARC_MAINNET_UNISWAP_V4.permit2)) {
      throw new Error(
        `Permit2 approve target mismatch: expected Permit2 (${ARC_MAINNET_UNISWAP_V4.permit2}), got ${to}`
      );
    }

    const decoded = decodeFunctionData({
      abi: permit2ApproveAbi,
      data,
    });

    if (decoded.functionName !== "approve") {
      throw new Error(`Unexpected Permit2 function name: ${decoded.functionName}`);
    }

    const [decodedToken, decodedSpender, decodedAmount, decodedExpiration] = decoded.args as [
      `0x${string}`,
      `0x${string}`,
      bigint,
      number
    ];

    if (!isAddressEqual(decodedToken, tokenAddress)) {
      throw new Error(
        `Permit2 approve token mismatch: expected ${tokenAddress}, got ${decodedToken}`
      );
    }

    if (!isAddressEqual(decodedSpender, ARC_MAINNET_UNISWAP_V4.universalRouter)) {
      throw new Error(
        `Permit2 approve spender mismatch: expected Universal Router (${ARC_MAINNET_UNISWAP_V4.universalRouter}), got ${decodedSpender}`
      );
    }

    return {
      selector,
      target: to,
      spender: decodedSpender,
      amount: decodedAmount,
      expiration: decodedExpiration,
      baseBuilderCodeAbsent: true,
      baseSuffixAbsent: true,
    };
  }

  throw new Error(`Unknown approval type: ${approvalType}`);
}

// -----------------------------------------------------------------------------
// 6. Pre-Sign Validation
// -----------------------------------------------------------------------------
export interface ApprovalValidationContext {
  expectedChainId: 5042;
  expectedOwner: `0x${string}`;
  expectedTarget: `0x${string}`;
  expectedSpender: `0x${string}`;
  expectedAmount: bigint;
}

export function validateArcMainnetApprovalTx(
  tx: ArcMainnetPreparedApprovalTx,
  context: ApprovalValidationContext
): void {
  // 1. Chain ID
  if (tx.chainId !== 5042 || context.expectedChainId !== 5042) {
    throw new Error(`Chain ID must be 5042, got ${tx.chainId}`);
  }

  // 2. Connected wallet equals expected owner
  if (!isAddressEqual(tx.from, context.expectedOwner)) {
    throw new Error(`Sender mismatch: expected ${context.expectedOwner}, got ${tx.from}`);
  }

  // 3. Target contract equals expected contract
  if (!isAddressEqual(tx.to, context.expectedTarget)) {
    throw new Error(`Target mismatch: expected ${context.expectedTarget}, got ${tx.to}`);
  }

  // 4. Token check (must be USDC or EURC)
  if (tx.token !== "USDC" && tx.token !== "EURC") {
    throw new Error(`Token must be USDC or EURC, got ${tx.token}`);
  }

  // 5. Spender check
  if (!isAddressEqual(tx.spender, context.expectedSpender)) {
    throw new Error(`Spender mismatch: expected ${context.expectedSpender}, got ${tx.spender}`);
  }

  // 6. Amount check
  const rawTxAmount = BigInt(tx.amount);
  if (rawTxAmount !== context.expectedAmount) {
    throw new Error(
      `Amount mismatch: expected ${context.expectedAmount}, got ${rawTxAmount}`
    );
  }

  // 7. Value check
  if (tx.value !== "0x0") {
    throw new Error(`Value must be 0x0, got ${tx.value}`);
  }

  // 8. Calldata decode and validation
  const decoded = decodeAndValidateArcMainnetApprovalCalldata(tx);
  if (decoded.amount !== context.expectedAmount) {
    throw new Error(
      `Calldata amount mismatch: expected ${context.expectedAmount}, got ${decoded.amount}`
    );
  }
}

// -----------------------------------------------------------------------------
// 7. Complete Audit & Preparation Pipeline
// -----------------------------------------------------------------------------
export async function auditAndPrepareArcMainnetApprovals(
  params: ArcMainnetAllowanceAuditParams
): Promise<ArcMainnetApprovalAuditAndPreparationResult> {
  const audit = await auditArcMainnetAllowances(params);

  let preparedErc20ApprovalTx: ArcMainnetPreparedApprovalTx | null = null;
  let preparedPermit2ApprovalTx: ArcMainnetPreparedApprovalTx | null = null;

  if (audit.erc20ApprovalNeeded) {
    preparedErc20ApprovalTx = prepareArcMainnetErc20ApprovalTx({
      token: params.token,
      owner: params.owner,
      amount: params.requiredAmount,
      chainId: params.chainId,
    });
  }

  if (audit.permit2ApprovalNeeded) {
    preparedPermit2ApprovalTx = prepareArcMainnetPermit2ApprovalTx({
      token: params.token,
      owner: params.owner,
      amount: params.requiredAmount,
      chainId: params.chainId,
    });
  }

  return {
    audit,
    preparedErc20ApprovalTx,
    preparedPermit2ApprovalTx,
    executionSimulatedOnly: true,
    isReadyForBroadcast: false,
    writeExecuted: false,
  };
}
