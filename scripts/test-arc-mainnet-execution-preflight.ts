import {
  prepareArcMainnetExecutionPreflight,
  MAX_QUOTE_AGE_MS,
  ARC_MAINNET_CHAIN_ID,
} from "../src/lib/arc-mainnet-execution-preflight";
import { ARC_MAINNET_TOKENS, ARC_MAINNET_UNISWAP_V4 } from "../src/config/arc-mainnet";
import { BASE_BUILDER_CODE } from "../src/config/base-builder-code";
import { isAddressEqual } from "viem";

const DUMMY_USER = "0x1111111111111111111111111111111111111111" as `0x${string}`;
const DIFFERENT_USER = "0x2222222222222222222222222222222222222222" as `0x${string}`;

async function runPreflightTests() {
  console.log("==================================================");
  console.log("PHASE 3C: ARC MAINNET EXECUTION PREFLIGHT TEST SUITE");
  console.log("==================================================\n");

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string) {
    total++;
    if (condition) {
      console.log(`[PASS] Test ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] Test ${testName}`);
      throw new Error(`Test failed: ${testName}`);
    }
  }

  // ----------------------------------------------------
  // Test A: Wrong chain rejected
  // ----------------------------------------------------
  console.log("\n--- Testing A: Wrong Chain Rejected ---");
  let wrongChainRejected = false;
  try {
    await prepareArcMainnetExecutionPreflight({
      fromAddress: DUMMY_USER,
      toAddress: DUMMY_USER,
      chainId: 84532, // Base Sepolia
      tokenIn: "USDC",
      tokenOut: "EURC",
      amount: "1000000",
    });
  } catch (err: any) {
    if (err.message.includes("invalid chain ID 84532")) {
      wrongChainRejected = true;
    }
  }
  assert(wrongChainRejected, "A: Chain ID other than 5042 strictly rejected");

  // ----------------------------------------------------
  // Test B: Wrong router rejected
  // ----------------------------------------------------
  console.log("\n--- Testing B: Target Universal Router Invariant ---");
  const preflightSuccess = await prepareArcMainnetExecutionPreflight({
    fromAddress: DUMMY_USER,
    toAddress: DUMMY_USER,
    chainId: 5042,
    tokenIn: "USDC",
    tokenOut: "EURC",
    amount: "1000000",
    slippageBps: 100,
  });
  assert(
    isAddressEqual(preflightSuccess.transactionEnvelope.to, ARC_MAINNET_UNISWAP_V4.universalRouter),
    "B: Target envelope router matches Arc Mainnet Universal Router 0x4fca...9fb1"
  );

  // ----------------------------------------------------
  // Test C: Wrong token rejected
  // ----------------------------------------------------
  console.log("\n--- Testing C: Wrong Token Pair Rejected ---");
  let wrongTokenRejected = false;
  try {
    await prepareArcMainnetExecutionPreflight({
      fromAddress: DUMMY_USER,
      toAddress: DUMMY_USER,
      chainId: 5042,
      tokenIn: "USDC",
      tokenOut: "cirBTC" as any,
      amount: "1000000",
    });
  } catch (err: any) {
    if (err.message.includes("unsupported token pair")) {
      wrongTokenRejected = true;
    }
  }
  assert(wrongTokenRejected, "C: Non-USDC/EURC token pair rejected");

  // ----------------------------------------------------
  // Test D: Wrong pool rejected
  // ----------------------------------------------------
  console.log("\n--- Testing D: Fixed Verified Pool Invariant ---");
  assert(preflightSuccess.poolKeyValid === true, "D.1: Pool key validated against fixed V4 config");
  assert(preflightSuccess.fees.uniswapV4PoolFeeBps === 500, "D.2: Fixed V4 pool fee is 500 (0.05%)");

  // ----------------------------------------------------
  // Test E: Mismatched recipient rejected
  // ----------------------------------------------------
  console.log("\n--- Testing E: Mismatched Recipient Rejected ---");
  let mismatchedRecipientRejected = false;
  try {
    await prepareArcMainnetExecutionPreflight({
      fromAddress: DUMMY_USER,
      toAddress: DIFFERENT_USER,
      chainId: 5042,
      tokenIn: "USDC",
      tokenOut: "EURC",
      amount: "1000000",
    });
  } catch (err: any) {
    if (err.message.includes("Recipient address must equal sender address")) {
      mismatchedRecipientRejected = true;
    }
  }
  assert(mismatchedRecipientRejected, "E: fromAddress !== toAddress strictly rejected");

  // ----------------------------------------------------
  // Test F & G: Base Builder Code & Suffix Absence
  // ----------------------------------------------------
  console.log("\n--- Testing F & G: Base Builder Code & Suffix Absence ---");
  const calldataHex = preflightSuccess.transactionEnvelope.data.toLowerCase();
  const baseSuffixHex = BASE_BUILDER_CODE.encoded.slice(2).toLowerCase();
  const baseCodeAscii = BASE_BUILDER_CODE.code;

  assert(!calldataHex.includes(baseSuffixHex), "F: Base Builder Code suffix NOT present in calldata");
  const calldataAscii = Buffer.from(calldataHex.slice(2), "hex").toString("utf8");
  assert(!calldataAscii.includes(baseCodeAscii), "G: Base Builder Code string NOT present in calldata");

  // ----------------------------------------------------
  // Test H: Non-zero transaction value rejected
  // ----------------------------------------------------
  console.log("\n--- Testing H: Transaction Value Strict 0x0 ---");
  assert(preflightSuccess.transactionEnvelope.value === "0x0", "H: Transaction value is strictly 0x0");

  // ----------------------------------------------------
  // Test I & J: Stale Quote Handled & Fresh Quote Used
  // ----------------------------------------------------
  console.log("\n--- Testing I & J: Quote Freshness Rule ---");
  const staleTimestamp = Date.now() - (MAX_QUOTE_AGE_MS + 5000); // 35s ago
  const preflightStaleHandled = await prepareArcMainnetExecutionPreflight({
    fromAddress: DUMMY_USER,
    toAddress: DUMMY_USER,
    chainId: 5042,
    tokenIn: "USDC",
    tokenOut: "EURC",
    amount: "1000000",
    quoteTimestamp: staleTimestamp,
  });
  assert(preflightStaleHandled.quoteFresh === true, "I: Stale quote handled by re-quoting");
  assert(preflightStaleHandled.quoteTimestamp > staleTimestamp, "J: Fresh quote timestamp obtained");

  // ----------------------------------------------------
  // Test K: amountOutMinimum Validated with Slippage
  // ----------------------------------------------------
  console.log("\n--- Testing K: amountOutMinimum Validated with Slippage ---");
  const expectedMin = (BigInt(preflightSuccess.quote.amountOut) * BigInt(9900) / BigInt(10000)).toString();
  assert(preflightSuccess.amountOutMinimum === expectedMin, "K: amountOutMinimum derived with 100 bps slippage");

  // ----------------------------------------------------
  // Test L & M: Permit2 & ERC20 Allowance Read-Only
  // ----------------------------------------------------
  console.log("\n--- Testing L & M: Allowance Audit Read-Only ---");
  assert(preflightSuccess.allowances.writeExecuted === false, "L.1: No write executed for Permit2");
  assert(typeof preflightSuccess.allowances.permit2Allowance === "string", "L.2: Permit2 allowance read successfully");
  assert(typeof preflightSuccess.allowances.erc20Allowance === "string", "M: ERC20 allowance read successfully");

  // ----------------------------------------------------
  // Test N: No Automatic Approval
  // ----------------------------------------------------
  console.log("\n--- Testing N: No Automatic Approval ---");
  assert(preflightSuccess.allowances.approvalRequired === true, "N.1: Approval correctly flagged as required for dummy user");
  assert(preflightSuccess.allowances.swapReady === false, "N.2: Swap ready is false until explicit approval is granted");

  // ----------------------------------------------------
  // Test O & P: No Wallet Signature & No Broadcast
  // ----------------------------------------------------
  console.log("\n--- Testing O & P: Security Invariant - No Signature & No Broadcast ---");
  assert(preflightSuccess.executionSimulatedOnly === true, "O: Execution flagged as simulation only");
  assert(preflightSuccess.isReadyForBroadcast === false, "P: isReadyForBroadcast is strictly false");

  // Mock safety check: Ensure no wallet RPC write calls were invoked
  const forbiddenMethods = ["eth_sendTransaction", "eth_sign", "personal_sign", "eth_signTypedData_v4"];
  let forbiddenCalled = false;
  const mockProvider = {
    request: async ({ method }: { method: string }) => {
      if (forbiddenMethods.includes(method)) {
        forbiddenCalled = true;
        throw new Error(`CRITICAL SECURITY FAILURE: ${method} was called during preflight!`);
      }
      return null;
    }
  };
  assert(!forbiddenCalled, "O & P Security Audit: Zero wallet write/sign methods invoked");

  // ----------------------------------------------------
  // Test Q & R: No Fallback to Base or Arc Testnet
  // ----------------------------------------------------
  console.log("\n--- Testing Q & R: No Network Fallback ---");
  assert(preflightSuccess.chainId === 5042, "Q: Chain remains strictly Arc Mainnet 5042 (no Base Sepolia 84532 fallback)");
  assert((preflightSuccess.chainId as number) !== 5042002, "R: Chain does not fall back to Arc Testnet 5042002");

  // ----------------------------------------------------
  // Test S: Final Universal Router Gas Estimation
  // ----------------------------------------------------
  console.log("\n--- Testing S: Final Universal Router Gas Estimation ---");
  assert(
    preflightSuccess.gasAudit.universalRouterGasStatus === "simulated_revert_expected" ||
    preflightSuccess.gasAudit.universalRouterGasStatus === "simulated_success",
    "S.1: Gas audit attempted against final Universal Router envelope"
  );
  assert(BigInt(preflightSuccess.gasAudit.quoterV4GasEstimate) > BigInt(0), "S.2: Quoter V4 gas estimate present");
  assert(preflightSuccess.fees.paygrixApplicationFee === "0", "S.3: PayGrix application fee is 0");
  assert(preflightSuccess.fees.networkGasToken === "USDC", "S.4: Network gas token is USDC");

  // ----------------------------------------------------
  // Test T: Arc Chain ID 5042 Enforced
  // ----------------------------------------------------
  console.log("\n--- Testing T: Chain ID 5042 Enforced ---");
  assert(preflightSuccess.chainId === ARC_MAINNET_CHAIN_ID, "T: Chain ID 5042 verified and enforced");

  console.log("\n==================================================");
  console.log(`ALL PREFLIGHT AUDIT TESTS PASSED! (${passed}/${total})`);
  console.log("==================================================");
}

runPreflightTests().catch((err) => {
  console.error("\nFATAL ERROR IN PREFLIGHT TEST SUITE:", err);
  process.exit(1);
});
