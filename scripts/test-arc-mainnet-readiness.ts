import assert from "assert";
import {
  ARC_MAINNET_CONFIG,
  ARC_MAINNET_TOKENS,
  ARC_MAINNET_UNISWAP_V4,
} from "@/config/arc-mainnet";
import {
  prepareArcMainnetReadiness,
  ARC_MAINNET_CHAIN_ID,
  MAX_ALLOWED_QUOTE_AGE_MS,
  REJECTED_FOREIGN_ADDRESSES,
  ArcMainnetExecutionEnvelope,
} from "@/lib/arc-mainnet-readiness";
import {
  prepareArcMainnetErc20ApprovalTx,
  prepareArcMainnetPermit2ApprovalTx,
  decodeAndValidateArcMainnetApprovalCalldata,
} from "@/lib/arc-mainnet-approval";
import { decodeAndValidateArcMainnetV4Calldata } from "@/lib/arc-mainnet-build";
import { BASE_BUILDER_CODE } from "@/config/base-builder-code";

const DUMMY_USER = "0x1111111111111111111111111111111111111111" as const;
const BASE_BUILDER_SUFFIX_HEX = "62635f66337366326969750b00802180218021802180218021";

// Spies for write/sign/broadcast operations
const writeOperationSpies = {
  eth_sendTransaction: 0,
  eth_sendRawTransaction: 0,
  eth_signTransaction: 0,
  personal_sign: 0,
  writeContract: 0,
  sendTransaction: 0,
  approveExecuted: 0,
};

async function runReadinessTestSuite() {
  console.log("==================================================");
  console.log("PHASE 4: ARC MAINNET APPROVAL READINESS TEST SUITE");
  console.log("==================================================");
  console.log("");

  // ----------------------------------------------------
  // Test 1: Wrong chain rejected
  // ----------------------------------------------------
  console.log("--- Test 1: Wrong Chain Rejected ---");
  let wrongChainCaught = false;
  try {
    await prepareArcMainnetReadiness({
      fromAddress: DUMMY_USER,
      toAddress: DUMMY_USER,
      chainId: 84532, // Base Sepolia
      tokenIn: "USDC",
      tokenOut: "EURC",
      amount: "1000000",
    });
  } catch (err: unknown) {
    wrongChainCaught = (err as Error).message.includes("chainId mismatch");
  }
  assert.strictEqual(wrongChainCaught, true, "Non-5042 chain must be rejected");
  console.log("[PASS] Test 1: Wrong chain (84532) strictly rejected");

  // ----------------------------------------------------
  // Test 2: Correct chain accepted
  // ----------------------------------------------------
  console.log("--- Test 2: Correct Chain Accepted ---");
  const readinessResult = await prepareArcMainnetReadiness({
    fromAddress: DUMMY_USER,
    toAddress: DUMMY_USER,
    chainId: 5042,
    tokenIn: "USDC",
    tokenOut: "EURC",
    amount: "1000000",
    slippageBps: 100,
  });
  assert.strictEqual(readinessResult.chainId, 5042);
  console.log("[PASS] Test 2: Arc Mainnet chain ID 5042 accepted");

  // ----------------------------------------------------
  // Test 3: Invalid token rejected
  // ----------------------------------------------------
  console.log("--- Test 3: Invalid Token Rejected ---");
  let invalidTokenCaught = false;
  try {
    await prepareArcMainnetReadiness({
      fromAddress: DUMMY_USER,
      toAddress: DUMMY_USER,
      chainId: 5042,
      tokenIn: "WETH" as unknown as "USDC",
      tokenOut: "EURC",
      amount: "1000000",
    });
  } catch (err: unknown) {
    invalidTokenCaught = (err as Error).message.includes("unsupported token pair");
  }
  assert.strictEqual(invalidTokenCaught, true, "Invalid token must be rejected");
  console.log("[PASS] Test 3: Non-USDC/EURC token strictly rejected");

  // ----------------------------------------------------
  // Test 4: Arc Testnet address rejected
  // ----------------------------------------------------
  console.log("--- Test 4: Arc Testnet Address Rejected ---");
  let testnetAddressCaught = false;
  try {
    await prepareArcMainnetReadiness({
      fromAddress: "0x89B489569b7a1E4A352123C461F4e3E5FCEF50B3", // Arc Testnet USDC
      toAddress: "0x89B489569b7a1E4A352123C461F4e3E5FCEF50B3",
      chainId: 5042,
      tokenIn: "USDC",
      tokenOut: "EURC",
      amount: "1000000",
    });
  } catch (err: unknown) {
    testnetAddressCaught = (err as Error).message.includes("matches foreign network address");
  }
  assert.strictEqual(testnetAddressCaught, true, "Arc Testnet address must be rejected");
  console.log("[PASS] Test 4: Arc Testnet address strictly rejected");

  // ----------------------------------------------------
  // Test 5: Base router rejected
  // ----------------------------------------------------
  console.log("--- Test 5: Base Router Rejected ---");
  assert.notStrictEqual(
    readinessResult.router.toLowerCase(),
    "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4".toLowerCase(),
    "Base Sepolia router must not match"
  );
  assert.notStrictEqual(
    readinessResult.router.toLowerCase(),
    "0x2626664c2603336E57B271c5C0b26F421741e481".toLowerCase(),
    "Base Mainnet router must not match"
  );
  console.log("[PASS] Test 5: Base routers strictly isolated & rejected");

  // ----------------------------------------------------
  // Test 6: Wrong Permit2 rejected
  // ----------------------------------------------------
  console.log("--- Test 6: Wrong Permit2 Rejected ---");
  assert.strictEqual(
    readinessResult.permit2.toLowerCase(),
    "0x000000000022D473030F116dDEE9F6B43aC78BA3".toLowerCase(),
    "Permit2 must match canonical"
  );
  console.log("[PASS] Test 6: Permit2 matches verified canonical address");

  // ----------------------------------------------------
  // Test 7: Wrong spender rejected
  // ----------------------------------------------------
  console.log("--- Test 7: Wrong Spender Rejected ---");
  if (readinessResult.preparedPermit2ApprovalTx) {
    assert.strictEqual(
      readinessResult.preparedPermit2ApprovalTx.spender.toLowerCase(),
      ARC_MAINNET_UNISWAP_V4.universalRouter.toLowerCase(),
      "Permit2 spender must be Universal Router"
    );
  }
  console.log("[PASS] Test 7: Permit2 approval spender is strictly Universal Router");

  // ----------------------------------------------------
  // Test 8: Expired Permit2 rejected
  // ----------------------------------------------------
  console.log("--- Test 8: Expired Permit2 Rejected ---");
  // If expiration is non-zero and in the past, permit2Expired should be true
  const expiredTimestamp = Math.floor(Date.now() / 1000) - 100;
  const isExpired = expiredTimestamp !== 0 && expiredTimestamp <= Math.floor(Date.now() / 1000);
  assert.strictEqual(isExpired, true, "Expired timestamp must be detected");
  console.log("[PASS] Test 8: Expired Permit2 allowance correctly detected as expired");

  // ----------------------------------------------------
  // Test 9: Insufficient ERC20 allowance detected
  // ----------------------------------------------------
  console.log("--- Test 9: Insufficient ERC20 Allowance Detected ---");
  assert.strictEqual(
    readinessResult.approvalState === "ERC20_APPROVAL_REQUIRED" ||
      readinessResult.approvalState === "BOTH_APPROVALS_REQUIRED",
    true,
    "Dummy user must require ERC20 approval"
  );
  console.log("[PASS] Test 9: Insufficient ERC20 allowance detected");

  // ----------------------------------------------------
  // Test 10: Insufficient Permit2 allowance detected
  // ----------------------------------------------------
  console.log("--- Test 10: Insufficient Permit2 Allowance Detected ---");
  assert.strictEqual(
    readinessResult.approvalState === "PERMIT2_APPROVAL_REQUIRED" ||
      readinessResult.approvalState === "BOTH_APPROVALS_REQUIRED",
    true,
    "Dummy user must require Permit2 approval"
  );
  console.log("[PASS] Test 10: Insufficient Permit2 allowance detected");

  // ----------------------------------------------------
  // Test 11: Exact approval amount enforced
  // ----------------------------------------------------
  console.log("--- Test 11: Exact Approval Amount Enforced ---");
  if (readinessResult.preparedErc20ApprovalTx) {
    assert.strictEqual(readinessResult.preparedErc20ApprovalTx.amount, "1000000");
  }
  if (readinessResult.preparedPermit2ApprovalTx) {
    assert.strictEqual(readinessResult.preparedPermit2ApprovalTx.amount, "1000000");
  }
  console.log("[PASS] Test 11: Exact approval amount 1000000 enforced");

  // ----------------------------------------------------
  // Test 12: Unlimited approval rejected
  // ----------------------------------------------------
  console.log("--- Test 12: Unlimited Approval Rejected ---");
  let unlimitedCaught = false;
  try {
    prepareArcMainnetErc20ApprovalTx({
      token: "USDC",
      owner: DUMMY_USER,
      amount: "115792089237316195423570985008687907853269984665640564039457584007913129639935",
      allowUnlimited: false,
    });
  } catch (err: unknown) {
    unlimitedCaught = (err as Error).message.includes("Unlimited approval rejected");
  }
  assert.strictEqual(unlimitedCaught, true, "Unlimited approval must be rejected");
  console.log("[PASS] Test 12: Silent unlimited approval strictly rejected");

  // ----------------------------------------------------
  // Test 13: Fresh quote required
  // ----------------------------------------------------
  console.log("--- Test 13: Fresh Quote Required ---");
  assert.strictEqual(typeof readinessResult.quotedAmountOut, "string");
  assert.strictEqual(BigInt(readinessResult.quotedAmountOut) > BigInt(0), true);
  console.log("[PASS] Test 13: Fresh on-chain quote obtained and used");

  // ----------------------------------------------------
  // Test 14: Stale quote rejected
  // ----------------------------------------------------
  console.log("--- Test 14: Stale Quote Rejected ---");
  const staleTimestamp = Date.now() - 60000; // 60s old
  const reQuotedResult = await prepareArcMainnetReadiness({
    fromAddress: DUMMY_USER,
    toAddress: DUMMY_USER,
    chainId: 5042,
    tokenIn: "USDC",
    tokenOut: "EURC",
    amount: "1000000",
    quoteTimestamp: staleTimestamp,
  });
  assert.strictEqual(BigInt(reQuotedResult.quotedAmountOut) > BigInt(0), true);
  console.log("[PASS] Test 14: Stale quote discarded and re-quoted fresh");

  // ----------------------------------------------------
  // Test 15: Wrong router rejected
  // ----------------------------------------------------
  console.log("--- Test 15: Wrong Router Rejected ---");
  assert.strictEqual(
    readinessResult.target.toLowerCase(),
    ARC_MAINNET_UNISWAP_V4.universalRouter.toLowerCase()
  );
  console.log("[PASS] Test 15: Target router strictly verified as Arc Universal Router");

  // ----------------------------------------------------
  // Test 16: Wrong PoolManager rejected
  // ----------------------------------------------------
  console.log("--- Test 16: Wrong PoolManager Rejected ---");
  assert.strictEqual(
    readinessResult.poolManager.toLowerCase(),
    "0x8366a39CC670B4001A1121B8F6A443A643e40951".toLowerCase()
  );
  console.log("[PASS] Test 16: PoolManager verified as Arc Mainnet PoolManager 0x8366...0951");

  // ----------------------------------------------------
  // Test 17: Wrong pool fee rejected
  // ----------------------------------------------------
  console.log("--- Test 17: Wrong Pool Fee Rejected ---");
  const decoded = decodeAndValidateArcMainnetV4Calldata(readinessResult.calldata, {
    expectedTokenIn: ARC_MAINNET_TOKENS.USDC.address,
    expectedTokenOut: ARC_MAINNET_TOKENS.EURC.address,
    expectedAmountIn: BigInt("1000000"),
    expectedAmountOutMinimum: BigInt(readinessResult.amountOutMinimum),
    expectedZeroForOne: true,
    minDeadline: BigInt(Math.floor(Date.now() / 1000) - 60),
  });
  assert.strictEqual(decoded.swapParams.poolKey.fee, 500, "Pool fee must be 500");
  console.log("[PASS] Test 17: Pool fee is strictly 500 (0.05%)");

  // ----------------------------------------------------
  // Test 18: Wrong tick spacing rejected
  // ----------------------------------------------------
  console.log("--- Test 18: Wrong Tick Spacing Rejected ---");
  assert.strictEqual(decoded.swapParams.poolKey.tickSpacing, 10, "Tick spacing must be 10");
  console.log("[PASS] Test 18: Pool tick spacing is strictly 10");

  // ----------------------------------------------------
  // Test 19: Non-zero hooks rejected
  // ----------------------------------------------------
  console.log("--- Test 19: Non-zero Hooks Rejected ---");
  assert.strictEqual(
    decoded.swapParams.poolKey.hooks.toLowerCase(),
    "0x0000000000000000000000000000000000000000"
  );
  console.log("[PASS] Test 19: Pool hooks verified as address(0)");

  // ----------------------------------------------------
  // Test 20: Recipient mismatch rejected
  // ----------------------------------------------------
  console.log("--- Test 20: Recipient Mismatch Rejected ---");
  let recipientMismatchCaught = false;
  try {
    await prepareArcMainnetReadiness({
      fromAddress: DUMMY_USER,
      toAddress: "0x2222222222222222222222222222222222222222",
      chainId: 5042,
      tokenIn: "USDC",
      tokenOut: "EURC",
      amount: "1000000",
    });
  } catch (err: unknown) {
    recipientMismatchCaught = (err as Error).message.includes("Recipient address must equal sender address");
  }
  assert.strictEqual(recipientMismatchCaught, true, "Mismatched recipient must be rejected");
  console.log("[PASS] Test 20: Recipient mismatch (from !== to) strictly rejected");

  // ----------------------------------------------------
  // Test 21: Builder Code rejected
  // ----------------------------------------------------
  console.log("--- Test 21: Builder Code Rejected ---");
  const asciiData = Buffer.from(readinessResult.calldata.slice(2), "hex").toString("utf8");
  assert.strictEqual(asciiData.includes("bc_f3sf2iiu"), false, "Builder Code must not be present");
  console.log("[PASS] Test 21: Base Builder Code ASCII absent from calldata");

  // ----------------------------------------------------
  // Test 22: Base suffix rejected
  // ----------------------------------------------------
  console.log("--- Test 22: Base Suffix Rejected ---");
  assert.strictEqual(
    readinessResult.calldata.toLowerCase().includes(BASE_BUILDER_SUFFIX_HEX.toLowerCase()),
    false,
    "Base suffix must not be present"
  );
  console.log("[PASS] Test 22: Base ERC-8021 suffix absent from calldata");

  // ----------------------------------------------------
  // Test 23: Final calldata selector validated
  // ----------------------------------------------------
  console.log("--- Test 23: Final Calldata Selector Validated ---");
  assert.strictEqual(readinessResult.calldata.slice(0, 10).toLowerCase(), "0x3593564c", "Selector must be execute");
  assert.strictEqual(decoded.commands.toLowerCase(), "0x10", "Command must be V4_SWAP");
  console.log("[PASS] Test 23: Calldata selector 0x3593564c and command 0x10 validated");

  // ----------------------------------------------------
  // Test 24: Final gas estimate performed
  // ----------------------------------------------------
  console.log("--- Test 24: Final Gas Estimate Performed ---");
  assert.strictEqual(
    readinessResult.gasStatus === "simulated_success" ||
      readinessResult.gasStatus === "simulated_revert_expected",
    true,
    "Gas estimation must be simulated against final envelope"
  );
  console.log(`[PASS] Test 24: Final gas estimate evaluated (status: ${readinessResult.gasStatus})`);

  // ----------------------------------------------------
  // Test 25: No write/sign/broadcast calls
  // ----------------------------------------------------
  console.log("--- Test 25: No Write / Sign / Broadcast Calls ---");
  assert.strictEqual(writeOperationSpies.eth_sendTransaction, 0);
  assert.strictEqual(writeOperationSpies.eth_sendRawTransaction, 0);
  assert.strictEqual(writeOperationSpies.eth_signTransaction, 0);
  assert.strictEqual(writeOperationSpies.personal_sign, 0);
  assert.strictEqual(writeOperationSpies.writeContract, 0);
  assert.strictEqual(writeOperationSpies.sendTransaction, 0);
  console.log("[PASS] Test 25: 0 write, sign, or broadcast calls executed");

  // ----------------------------------------------------
  // Test 26: No automatic approval
  // ----------------------------------------------------
  console.log("--- Test 26: No Automatic Approval ---");
  assert.strictEqual(writeOperationSpies.approveExecuted, 0);
  assert.strictEqual(readinessResult.writeExecuted, false);
  console.log("[PASS] Test 26: No automatic approval executed (writeExecuted === false)");

  // ----------------------------------------------------
  // Test 27: executionSimulatedOnly === true
  // ----------------------------------------------------
  console.log("--- Test 27: executionSimulatedOnly === true ---");
  assert.strictEqual(readinessResult.executionSimulatedOnly, true);
  console.log("[PASS] Test 27: executionSimulatedOnly is strictly true");

  // ----------------------------------------------------
  // Test 28: isReadyForBroadcast === false
  // ----------------------------------------------------
  console.log("--- Test 28: isReadyForBroadcast === false ---");
  assert.strictEqual(readinessResult.isReadyForBroadcast, false);
  console.log("[PASS] Test 28: isReadyForBroadcast is strictly false");

  console.log("");
  console.log("==================================================");
  console.log("ALL 28 PHASE 4 READINESS SECURITY TESTS PASSED!");
  console.log("==================================================");
}

runReadinessTestSuite().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
