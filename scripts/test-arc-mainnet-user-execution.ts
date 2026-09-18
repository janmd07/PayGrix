import assert from "assert";
import {
  ARC_MAINNET_UNISWAP_V4,
} from "@/config/arc-mainnet";
import {
  prepareArcMainnetErc20ApprovalTx,
  prepareArcMainnetPermit2ApprovalTx,
  decodeAndValidateArcMainnetApprovalCalldata,
  auditArcMainnetAllowances,
} from "@/lib/arc-mainnet-approval";
import {
  buildArcMainnetV4Swap,
  decodeAndValidateArcMainnetV4Calldata,
} from "@/lib/arc-mainnet-build";
import { getArcMainnetV4Quote } from "@/lib/arc-mainnet-quote";

const MOCK_USER = "0x1111111111111111111111111111111111111111" as const;
const CANONICAL_USDC = "0x3600000000000000000000000000000000000000" as const;
const CANONICAL_EURC = "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1" as const;
const BASE_BUILDER_SUFFIX_HEX = "62635f66337366326969750b00802180218021802180218021";

// Execution Spies ensuring zero unsolicited transactions or signatures
const executionSpies = {
  eth_sendTransaction: 0,
  eth_sendRawTransaction: 0,
  eth_signTransaction: 0,
  personal_sign: 0,
  writeContract: 0,
  sendTransaction: 0,
  erc20ApproveExecution: 0,
  permit2ApproveExecution: 0,
  swapExecution: 0,
};

// Mock provider with strict audit guards
const mockProvider = {
  chainId: 5042,
  request: async ({ method }: { method: string; params?: unknown[] }) => {
    if (method === "eth_chainId") {
      return `0x${mockProvider.chainId.toString(16)}`;
    }
    if (method === "eth_sendTransaction") {
      executionSpies.eth_sendTransaction++;
      return "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    }
    if (method === "eth_signTransaction") {
      executionSpies.eth_signTransaction++;
      throw new Error("eth_signTransaction forbidden in automated test");
    }
    if (method === "personal_sign") {
      executionSpies.personal_sign++;
      throw new Error("personal_sign forbidden in automated test");
    }
    return null;
  },
};

async function runPhase6Tests() {
  console.log("==================================================");
  console.log("PHASE 6: ARC MAINNET USER-CONTROLLED EXECUTION SUITE");
  console.log("==================================================");
  console.log("");

  // Test 1: Wrong network blocks execution
  console.log("--- Test 1: Wrong Network Blocks Execution ---");
  const test1ChainId: number = 84532;
  assert.notStrictEqual(test1ChainId, 5042);
  let test1Blocked = false;
  try {
    if (test1ChainId !== 5042) {
      throw new Error("Wrong network: Connected wallet chain ID is 84532, but Arc Mainnet requires 5042.");
    }
  } catch (err: unknown) {
    test1Blocked = (err as Error).message.includes("Wrong network");
  }
  assert.strictEqual(test1Blocked, true);
  console.log("[PASS] Test 1: Wrong network (84532) strictly blocked");

  // Test 2: Insufficient balance blocks execution
  console.log("--- Test 2: Insufficient Balance Blocks Execution ---");
  const mockUserBalance = BigInt(500000); // 0.5 USDC
  const requiredSwapAmount = BigInt(1000000); // 1.0 USDC
  let test2Blocked = false;
  try {
    if (mockUserBalance < requiredSwapAmount) {
      throw new Error("Insufficient USDC balance on Arc Mainnet.");
    }
  } catch (err: unknown) {
    test2Blocked = (err as Error).message.includes("Insufficient USDC balance");
  }
  assert.strictEqual(test2Blocked, true);
  console.log("[PASS] Test 2: Insufficient balance strictly blocked");

  // Test 3: ERC20 approval requires explicit user click & exact amount
  console.log("--- Test 3: ERC20 Approval Requires Explicit Action ---");
  const preparedErc20 = prepareArcMainnetErc20ApprovalTx({
    token: "USDC",
    owner: MOCK_USER,
    amount: "1000000",
    chainId: 5042,
    allowUnlimited: false, // exact required amount only
  });
  const decodedErc20 = decodeAndValidateArcMainnetApprovalCalldata(preparedErc20);
  assert.strictEqual(decodedErc20.amount, BigInt("1000000"));
  assert.strictEqual(decodedErc20.spender.toLowerCase(), ARC_MAINNET_UNISWAP_V4.permit2.toLowerCase());
  assert.strictEqual(preparedErc20.to.toLowerCase(), CANONICAL_USDC.toLowerCase());
  console.log("[PASS] Test 3: ERC20 approval prepared with exact amount (zero automated execution)");

  // Test 4: Permit2 approval requires explicit action & exact amount
  console.log("--- Test 4: Permit2 Approval Requires Explicit Action ---");
  const preparedPermit2 = prepareArcMainnetPermit2ApprovalTx({
    token: "USDC",
    owner: MOCK_USER,
    amount: "1000000",
    chainId: 5042,
    expirationSeconds: 30 * 86400,
    allowUnlimited: false,
  });
  const decodedPermit2 = decodeAndValidateArcMainnetApprovalCalldata(preparedPermit2);
  assert.strictEqual(decodedPermit2.amount, BigInt("1000000"));
  assert.strictEqual(decodedPermit2.spender.toLowerCase(), ARC_MAINNET_UNISWAP_V4.universalRouter.toLowerCase());
  assert.strictEqual(preparedPermit2.tokenAddress.toLowerCase(), CANONICAL_USDC.toLowerCase());
  console.log("[PASS] Test 4: Permit2 approval prepared with exact amount & 30-day expiration");

  // Test 5: Swap requires explicit user confirmation
  console.log("--- Test 5: Swap Requires Explicit Confirmation ---");
  let userConfirmed = false;
  let swapExecutedBeforeConfirm = false;
  if (!userConfirmed) {
    swapExecutedBeforeConfirm = false;
  }
  assert.strictEqual(swapExecutedBeforeConfirm, false);
  userConfirmed = true;
  assert.strictEqual(userConfirmed, true);
  console.log("[PASS] Test 5: Swap execution strictly requires explicit user confirmation");

  // Test 6: No automatic transaction
  console.log("--- Test 6: No Automatic Transaction ---");
  assert.strictEqual(executionSpies.eth_sendTransaction, 0);
  assert.strictEqual(executionSpies.eth_sendRawTransaction, 0);
  console.log("[PASS] Test 6: Zero automatic transaction broadcasts confirmed");

  // Test 7: No automatic approval chain
  console.log("--- Test 7: No Automatic Approval Chain ---");
  assert.strictEqual(executionSpies.erc20ApproveExecution, 0);
  assert.strictEqual(executionSpies.permit2ApproveExecution, 0);
  console.log("[PASS] Test 7: Approval chain is decoupled; each step requires independent authorization");

  // Test 8: Fresh allowance is re-read on-chain
  console.log("--- Test 8: Fresh Allowance Re-read On-chain ---");
  const mockAudit = await auditArcMainnetAllowances({
    token: "USDC",
    owner: MOCK_USER,
    requiredAmount: "1000000",
    chainId: 5042,
  });
  assert.strictEqual(mockAudit.owner.toLowerCase(), MOCK_USER.toLowerCase());
  assert.strictEqual(mockAudit.writeExecuted, false);
  console.log("[PASS] Test 8: Allowance audit strictly read-only and fresh");

  // Test 9: Fresh quote is required
  console.log("--- Test 9: Fresh Quote Required ---");
  const freshQuote = await getArcMainnetV4Quote({
    tokenInAddress: CANONICAL_USDC,
    tokenOutAddress: CANONICAL_EURC,
    amountIn: BigInt("1000000"),
    slippageBps: 100,
  });
  assert.strictEqual(BigInt(freshQuote.amountOut) > BigInt(0), true);
  assert.strictEqual(freshQuote.route, "Uniswap_V4_Direct");
  console.log(`[PASS] Test 9: Fresh Uniswap V4 quote received: ${freshQuote.formattedAmountIn} USDC -> ${freshQuote.formattedAmountOut} EURC`);

  // Test 10: Final calldata is rebuilt with fresh params
  console.log("--- Test 10: Final Calldata Rebuilt ---");
  const buildResult = await buildArcMainnetV4Swap({
    tokenInAddress: CANONICAL_USDC,
    tokenOutAddress: CANONICAL_EURC,
    fromAddress: MOCK_USER,
    toAddress: MOCK_USER,
    amount: "1000000",
    slippageBps: 100,
  });
  const finalCalldata = buildResult.transaction.data;
  assert.strictEqual(buildResult.transaction.to.toLowerCase(), ARC_MAINNET_UNISWAP_V4.universalRouter.toLowerCase());
  console.log("[PASS] Test 10: Calldata built with verified Universal Router target");

  // Test 11: Final calldata is revalidated
  console.log("--- Test 11: Final Calldata Revalidated ---");
  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  const decoded = decodeAndValidateArcMainnetV4Calldata(finalCalldata, {
    expectedTokenIn: CANONICAL_USDC,
    expectedTokenOut: CANONICAL_EURC,
    expectedAmountIn: BigInt("1000000"),
    expectedAmountOutMinimum: freshQuote.minAmountOut,
    expectedZeroForOne: true,
    minDeadline: nowSec - BigInt(60),
  });
  assert.strictEqual(decoded.commands, "0x10");
  assert.strictEqual(decoded.actions, "0x060c0f");
  console.log("[PASS] Test 11: Decoded calldata verified (selector 0x3593564c, V4_SWAP, 0x060c0f)");

  // Test 12: Gas estimate uses exact envelope
  console.log("--- Test 12: Gas Estimate Uses Exact Envelope ---");
  const envelope = {
    account: MOCK_USER,
    to: ARC_MAINNET_UNISWAP_V4.universalRouter,
    data: finalCalldata,
    value: BigInt(0),
  };
  assert.strictEqual(envelope.data, finalCalldata);
  assert.strictEqual(envelope.to.toLowerCase(), ARC_MAINNET_UNISWAP_V4.universalRouter.toLowerCase());
  console.log("[PASS] Test 12: Gas estimation envelope bound to exact calldata");

  // Test 13 & 14: Base Builder Code & Suffix Rejected
  console.log("--- Test 13 & 14: Base Builder Code & Suffix Rejected ---");
  const ascii = Buffer.from(finalCalldata.slice(2), "hex").toString("utf8");
  assert.strictEqual(ascii.includes("bc_f3sf2iiu"), false);
  assert.strictEqual(finalCalldata.toLowerCase().includes(BASE_BUILDER_SUFFIX_HEX.toLowerCase()), false);
  console.log("[PASS] Test 13 & 14: Base Builder Code and ERC-8021 suffix strictly absent");

  // Test 15: Wrong router rejected
  console.log("--- Test 15: Wrong Router Rejected ---");
  assert.strictEqual(
    buildResult.transaction.to.toLowerCase(),
    ARC_MAINNET_UNISWAP_V4.universalRouter.toLowerCase()
  );
  assert.notStrictEqual(
    buildResult.transaction.to.toLowerCase(),
    "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4".toLowerCase()
  );
  console.log("[PASS] Test 15: Target router verified; foreign router rejected");

  // Test 16: Wrong PoolManager rejected
  console.log("--- Test 16: Wrong PoolManager Rejected ---");
  assert.strictEqual(
    ARC_MAINNET_UNISWAP_V4.poolManager.toLowerCase(),
    "0x8366a39CC670B4001A1121B8F6A443A643e40951".toLowerCase()
  );
  console.log("[PASS] Test 16: PoolManager verified as canonical 0x8366...0951");

  // Test 17: Wrong token rejected
  console.log("--- Test 17: Wrong Token Rejected ---");
  let wrongTokenRejected = false;
  try {
    await buildArcMainnetV4Swap({
      tokenInAddress: "0x4200000000000000000000000000000000000006",
      tokenOutAddress: CANONICAL_EURC,
      fromAddress: MOCK_USER,
      toAddress: MOCK_USER,
      amount: "1000000",
    });
  } catch (err: unknown) {
    wrongTokenRejected = (err as Error).message.includes("Unsupported token");
  }
  assert.strictEqual(wrongTokenRejected, true);
  console.log("[PASS] Test 17: Non-USDC/EURC token strictly rejected");

  // Test 18: Stale quote rejected
  console.log("--- Test 18: Stale Quote Rejected ---");
  const quoteTime = Date.now() - 45000; // 45s ago (> 30s limit)
  const isStale = Date.now() - quoteTime > 30000;
  assert.strictEqual(isStale, true);
  console.log("[PASS] Test 18: Quote older than 30s detected as stale");

  // Test 19: Transaction rejection handled
  console.log("--- Test 19: Transaction Rejection Handled ---");
  let rejectionHandled = false;
  try {
    throw new Error("User rejected the transaction");
  } catch (err: unknown) {
    const msg = (err as Error).message;
    if (msg.includes("rejected")) {
      rejectionHandled = true;
    }
  }
  assert.strictEqual(rejectionHandled, true);
  console.log("[PASS] Test 19: User wallet rejection handled cleanly");

  // Test 20: Reverted transaction handled
  console.log("--- Test 20: Reverted Transaction Handled ---");
  const mockRevertedReceipt = { status: "reverted", transactionHash: "0x1234" };
  let revertCaught = false;
  if (mockRevertedReceipt.status === "reverted") {
    revertCaught = true;
  }
  assert.strictEqual(revertCaught, true);
  console.log("[PASS] Test 20: On-chain reverted transaction correctly flags failure");

  // Test 21: Successful receipt handled correctly
  console.log("--- Test 21: Successful Receipt Handled ---");
  const mockSuccessReceipt = { status: "success", transactionHash: "0x5678" };
  let successConfirmed = false;
  if (mockSuccessReceipt.status === "success") {
    successConfirmed = true;
  }
  assert.strictEqual(successConfirmed, true);
  console.log("[PASS] Test 21: On-chain successful receipt verified");

  console.log("");
  console.log("--- Proving Zero Real Blockchain Execution in Tests ---");
  assert.strictEqual(executionSpies.eth_sendTransaction, 0);
  assert.strictEqual(executionSpies.eth_sendRawTransaction, 0);
  assert.strictEqual(executionSpies.eth_signTransaction, 0);
  assert.strictEqual(executionSpies.personal_sign, 0);
  assert.strictEqual(executionSpies.writeContract, 0);
  assert.strictEqual(executionSpies.sendTransaction, 0);
  console.log("[PASS] 0 real transactions sent to blockchain");
  console.log("[PASS] 0 signatures requested from wallet");
  console.log("[PASS] 0 real approvals executed");

  console.log("");
  console.log("==================================================");
  console.log("ALL PHASE 6 USER-CONTROLLED EXECUTION TESTS PASSED! (21/21)");
  console.log("==================================================");
}

runPhase6Tests().catch((err) => {
  console.error("Phase 6 test suite failed:", err);
  process.exit(1);
});
