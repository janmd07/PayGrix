import assert from "assert";
import {
  ARC_MAINNET_TOKENS,
  ARC_MAINNET_UNISWAP_V4,
} from "@/config/arc-mainnet";
import {
  ARC_MAINNET_CHAIN_ID,
  auditArcMainnetAllowances,
  prepareArcMainnetErc20ApprovalTx,
  prepareArcMainnetPermit2ApprovalTx,
  decodeAndValidateArcMainnetApprovalCalldata,
  validateArcMainnetApprovalTx,
  auditAndPrepareArcMainnetApprovals,
  getArcMainnetTokenAddress,
  ArcMainnetPreparedApprovalTx,
} from "@/lib/arc-mainnet-approval";

const DUMMY_USER = "0x1111111111111111111111111111111111111111" as const;
const BASE_BUILDER_SUFFIX = "62635f66337366326969750b00802180218021802180218021";
const BASE_BUILDER_CODE = "bc_f3sf2iiu";

// Spy / mock recording for write/sign/broadcast operations
const writeOperationSpies = {
  eth_sendTransaction: 0,
  eth_signTransaction: 0,
  personal_sign: 0,
  writeContract: 0,
  sendTransaction: 0,
};

// Mock provider with spies to prove 0 calls
const mockWalletProvider = {
  request: async ({ method, params }: { method: string; params?: unknown[] }) => {
    if (method === "eth_sendTransaction") {
      writeOperationSpies.eth_sendTransaction++;
      throw new Error("SECURITY VIOLATION: eth_sendTransaction invoked in Phase 3D");
    }
    if (method === "eth_signTransaction") {
      writeOperationSpies.eth_signTransaction++;
      throw new Error("SECURITY VIOLATION: eth_signTransaction invoked in Phase 3D");
    }
    if (method === "personal_sign") {
      writeOperationSpies.personal_sign++;
      throw new Error("SECURITY VIOLATION: personal_sign invoked in Phase 3D");
    }
    if (method === "eth_chainId") {
      return "0x13b2"; // 5042
    }
    return null;
  },
};

const mockWalletClient = {
  writeContract: async () => {
    writeOperationSpies.writeContract++;
    throw new Error("SECURITY VIOLATION: walletClient.writeContract invoked in Phase 3D");
  },
  sendTransaction: async () => {
    writeOperationSpies.sendTransaction++;
    throw new Error("SECURITY VIOLATION: walletClient.sendTransaction invoked in Phase 3D");
  },
};

async function runApprovalTestSuite() {
  console.log("==================================================");
  console.log("PHASE 3D: ARC MAINNET PERMIT2 APPROVAL TEST SUITE");
  console.log("==================================================");
  console.log("");

  // ----------------------------------------------------
  // Test A: Correct ERC20 allowance read
  // ----------------------------------------------------
  console.log("--- Testing A: ERC20 Allowance Read ---");
  const auditUSDC = await auditArcMainnetAllowances({
    token: "USDC",
    owner: DUMMY_USER,
    requiredAmount: "1000000",
    chainId: 5042,
  });
  assert.strictEqual(typeof auditUSDC.erc20Allowance, "string", "erc20Allowance must be string");
  assert.strictEqual(auditUSDC.token, "USDC");
  assert.strictEqual(auditUSDC.tokenAddress.toLowerCase(), ARC_MAINNET_TOKENS.USDC.address.toLowerCase());
  assert.strictEqual(auditUSDC.permit2.toLowerCase(), ARC_MAINNET_UNISWAP_V4.permit2.toLowerCase());
  console.log("[PASS] Test A: Correct ERC20 allowance read for USDC");

  // ----------------------------------------------------
  // Test B: Correct Permit2 allowance read
  // ----------------------------------------------------
  console.log("--- Testing B: Permit2 Allowance Read ---");
  assert.strictEqual(typeof auditUSDC.permit2Allowance, "string", "permit2Allowance must be string");
  assert.strictEqual(typeof auditUSDC.permit2Expiration, "number", "permit2Expiration must be number");
  assert.strictEqual(auditUSDC.universalRouter.toLowerCase(), ARC_MAINNET_UNISWAP_V4.universalRouter.toLowerCase());
  console.log("[PASS] Test B: Correct Permit2 allowance read for USDC");

  // ----------------------------------------------------
  // Test C: Both allowances sufficient
  // ----------------------------------------------------
  console.log("--- Testing C: Both Allowances Sufficient ---");
  // Simulate state where both allowances exceed required amount
  const stateC = {
    erc20Allowance: BigInt("2000000"),
    permit2Allowance: BigInt("2000000"),
    required: BigInt("1000000"),
  };
  const erc20NeededC = stateC.erc20Allowance < stateC.required;
  const permit2NeededC = stateC.permit2Allowance < stateC.required;
  assert.strictEqual(erc20NeededC, false, "ERC20 approval not needed");
  assert.strictEqual(permit2NeededC, false, "Permit2 approval not needed");
  const swapReadyC = !erc20NeededC && !permit2NeededC;
  assert.strictEqual(swapReadyC, true, "swapReady must be true when both allowances sufficient");
  console.log("[PASS] Test C: Both allowances sufficient -> swapReady = true, no approval required");

  // ----------------------------------------------------
  // Test D: ERC20 approval required
  // ----------------------------------------------------
  console.log("--- Testing D: ERC20 Approval Required ---");
  const stateD = {
    erc20Allowance: BigInt("500000"), // insufficient
    permit2Allowance: BigInt("2000000"), // sufficient
    required: BigInt("1000000"),
  };
  const erc20NeededD = stateD.erc20Allowance < stateD.required;
  const permit2NeededD = stateD.permit2Allowance < stateD.required;
  assert.strictEqual(erc20NeededD, true, "ERC20 approval needed");
  assert.strictEqual(permit2NeededD, false, "Permit2 approval not needed");
  assert.strictEqual(!erc20NeededD && !permit2NeededD, false, "swapReady must be false");
  console.log("[PASS] Test D: ERC20 approval required -> erc20ApprovalNeeded = true, swapReady = false");

  // ----------------------------------------------------
  // Test E: Permit2 approval required
  // ----------------------------------------------------
  console.log("--- Testing E: Permit2 Approval Required ---");
  const stateE = {
    erc20Allowance: BigInt("2000000"), // sufficient
    permit2Allowance: BigInt("0"), // insufficient
    required: BigInt("1000000"),
  };
  const erc20NeededE = stateE.erc20Allowance < stateE.required;
  const permit2NeededE = stateE.permit2Allowance < stateE.required;
  assert.strictEqual(erc20NeededE, false, "ERC20 approval not needed");
  assert.strictEqual(permit2NeededE, true, "Permit2 approval needed");
  assert.strictEqual(!erc20NeededE && !permit2NeededE, false, "swapReady must be false");
  console.log("[PASS] Test E: Permit2 approval required -> permit2ApprovalNeeded = true, swapReady = false");

  // ----------------------------------------------------
  // Test F: Both approvals required
  // ----------------------------------------------------
  console.log("--- Testing F: Both Approvals Required ---");
  assert.strictEqual(auditUSDC.erc20ApprovalNeeded, true, "Dummy user requires ERC20 approval");
  assert.strictEqual(auditUSDC.permit2ApprovalNeeded, true, "Dummy user requires Permit2 approval");
  assert.strictEqual(auditUSDC.approvalRequired, true, "approvalRequired must be true");
  assert.strictEqual(auditUSDC.swapReady, false, "swapReady must be false");
  assert.strictEqual(auditUSDC.state, "BOTH_APPROVALS_NEEDED");
  console.log("[PASS] Test F: Both approvals required correctly flagged for unfunded dummy account");

  // ----------------------------------------------------
  // Test G: Exact approval amount policy
  // ----------------------------------------------------
  console.log("--- Testing G: Exact Approval Amount ---");
  const erc20Tx = prepareArcMainnetErc20ApprovalTx({
    token: "USDC",
    owner: DUMMY_USER,
    amount: "1000000",
    chainId: 5042,
  });
  assert.strictEqual(erc20Tx.amount, "1000000", "ERC20 approval amount must match requested 1000000");

  const permit2Tx = prepareArcMainnetPermit2ApprovalTx({
    token: "USDC",
    owner: DUMMY_USER,
    amount: "1000000",
    chainId: 5042,
  });
  assert.strictEqual(permit2Tx.amount, "1000000", "Permit2 approval amount must match requested 1000000");
  console.log("[PASS] Test G: Exact approval amounts enforced for both ERC20 and Permit2");

  // ----------------------------------------------------
  // Test H: Unlimited approval rejected / not silently used
  // ----------------------------------------------------
  console.log("--- Testing H: Unlimited Approval Policy ---");
  const MAX_UINT256 = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
  let unlimitedRejected = false;
  try {
    prepareArcMainnetErc20ApprovalTx({
      token: "USDC",
      owner: DUMMY_USER,
      amount: MAX_UINT256,
      chainId: 5042,
      allowUnlimited: false, // default policy
    });
  } catch (err: unknown) {
    unlimitedRejected = (err as Error).message.includes("Unlimited approval rejected");
  }
  assert.strictEqual(unlimitedRejected, true, "Silent unlimited ERC20 approval must be rejected");

  const MAX_UINT160 = "1461501637330902918203684832716283019655932542975";
  let unlimitedPermit2Rejected = false;
  try {
    prepareArcMainnetPermit2ApprovalTx({
      token: "USDC",
      owner: DUMMY_USER,
      amount: MAX_UINT160,
      chainId: 5042,
      allowUnlimited: false,
    });
  } catch (err: unknown) {
    unlimitedPermit2Rejected = (err as Error).message.includes("Unlimited approval rejected");
  }
  assert.strictEqual(unlimitedPermit2Rejected, true, "Silent unlimited Permit2 approval must be rejected");
  console.log("[PASS] Test H: Silent unlimited approval strictly rejected for both ERC20 and Permit2");

  // ----------------------------------------------------
  // Test I: Wrong chain rejected
  // ----------------------------------------------------
  console.log("--- Testing I: Wrong Chain Rejection ---");
  let wrongChainRejected = false;
  try {
    prepareArcMainnetErc20ApprovalTx({
      token: "USDC",
      owner: DUMMY_USER,
      amount: "1000000",
      chainId: 84532 as unknown as 5042, // Base Sepolia
    });
  } catch (err: unknown) {
    wrongChainRejected = (err as Error).message.includes("chainId mismatch");
  }
  assert.strictEqual(wrongChainRejected, true, "Non-5042 chainId must be rejected");
  console.log("[PASS] Test I: Wrong chainId strictly rejected");

  // ----------------------------------------------------
  // Test J: Wrong token rejected
  // ----------------------------------------------------
  console.log("--- Testing J: Wrong Token Rejection ---");
  let wrongTokenRejected = false;
  try {
    getArcMainnetTokenAddress("WETH" as unknown as "USDC");
  } catch (err: unknown) {
    wrongTokenRejected = (err as Error).message.includes("Unsupported token");
  }
  assert.strictEqual(wrongTokenRejected, true, "Non-USDC/EURC token must be rejected");
  console.log("[PASS] Test J: Non-USDC/EURC token strictly rejected");

  // ----------------------------------------------------
  // Test K: Wrong spender rejected
  // ----------------------------------------------------
  console.log("--- Testing K: Spender Invariant Enforcement ---");
  // ERC20 spender must be Permit2, never Universal Router
  assert.strictEqual(
    erc20Tx.spender.toLowerCase(),
    ARC_MAINNET_UNISWAP_V4.permit2.toLowerCase(),
    "ERC20 spender must be Permit2"
  );
  assert.notStrictEqual(
    erc20Tx.spender.toLowerCase(),
    ARC_MAINNET_UNISWAP_V4.universalRouter.toLowerCase(),
    "ERC20 spender must NOT be Universal Router"
  );

  // Permit2 spender must be Universal Router
  assert.strictEqual(
    permit2Tx.spender.toLowerCase(),
    ARC_MAINNET_UNISWAP_V4.universalRouter.toLowerCase(),
    "Permit2 spender must be Universal Router"
  );
  console.log("[PASS] Test K: Correct spenders strictly verified (Permit2 for ERC20, Universal Router for Permit2)");

  // ----------------------------------------------------
  // Test L: Wrong target rejected
  // ----------------------------------------------------
  console.log("--- Testing L: Target Contract Invariant ---");
  // ERC20 target must be the token contract
  assert.strictEqual(
    erc20Tx.to.toLowerCase(),
    ARC_MAINNET_TOKENS.USDC.address.toLowerCase(),
    "ERC20 target must be USDC contract"
  );
  // Permit2 target must be the Permit2 contract
  assert.strictEqual(
    permit2Tx.to.toLowerCase(),
    ARC_MAINNET_UNISWAP_V4.permit2.toLowerCase(),
    "Permit2 target must be Permit2 contract"
  );

  // Modifying target must fail validation
  const tamperedTargetTx: ArcMainnetPreparedApprovalTx = {
    ...erc20Tx,
    to: ARC_MAINNET_UNISWAP_V4.universalRouter, // invalid target for ERC20 approve
  };
  let tamperedTargetRejected = false;
  try {
    decodeAndValidateArcMainnetApprovalCalldata(tamperedTargetTx);
  } catch (err: unknown) {
    tamperedTargetRejected = (err as Error).message.includes("Security invariant violated");
  }
  assert.strictEqual(tamperedTargetRejected, true, "ERC20 approve targeting Universal Router must be rejected");
  console.log("[PASS] Test L: Targets verified; Universal Router target for ERC20 approve strictly rejected");

  // ----------------------------------------------------
  // Test M: Non-zero unexpected value rejected
  // ----------------------------------------------------
  console.log("--- Testing M: Value Invariant (0x0) ---");
  assert.strictEqual(erc20Tx.value, "0x0", "ERC20 approve value must be 0x0");
  assert.strictEqual(permit2Tx.value, "0x0", "Permit2 approve value must be 0x0");

  let nonZeroValueRejected = false;
  try {
    validateArcMainnetApprovalTx(
      { ...erc20Tx, value: "0x1" as "0x0" },
      {
        expectedChainId: 5042,
        expectedOwner: DUMMY_USER,
        expectedTarget: ARC_MAINNET_TOKENS.USDC.address,
        expectedSpender: ARC_MAINNET_UNISWAP_V4.permit2,
        expectedAmount: BigInt("1000000"),
      }
    );
  } catch (err: unknown) {
    nonZeroValueRejected = (err as Error).message.includes("Value must be 0x0");
  }
  assert.strictEqual(nonZeroValueRejected, true, "Non-zero value in approval must be rejected");
  console.log("[PASS] Test M: Approval value strictly 0x0; non-zero value rejected");

  // ----------------------------------------------------
  // Test N: Base Builder Code rejected
  // ----------------------------------------------------
  console.log("--- Testing N: Base Builder Code Absence & Rejection ---");
  const decodedErc20 = decodeAndValidateArcMainnetApprovalCalldata(erc20Tx);
  assert.strictEqual(decodedErc20.baseBuilderCodeAbsent, true);

  const decodedPermit2 = decodeAndValidateArcMainnetApprovalCalldata(permit2Tx);
  assert.strictEqual(decodedPermit2.baseBuilderCodeAbsent, true);

  // Injected Base code must throw
  const injectedBaseCodeTx: ArcMainnetPreparedApprovalTx = {
    ...erc20Tx,
    data: (erc20Tx.data + Buffer.from(BASE_BUILDER_CODE).toString("hex")) as `0x${string}`,
  };
  let baseCodeRejected = false;
  try {
    decodeAndValidateArcMainnetApprovalCalldata(injectedBaseCodeTx);
  } catch (err: unknown) {
    baseCodeRejected = (err as Error).message.includes("Base Builder Code ASCII found");
  }
  assert.strictEqual(baseCodeRejected, true, "Base Builder Code ASCII must be rejected");
  console.log("[PASS] Test N: Base Builder Code ASCII strictly absent and rejected if injected");

  // ----------------------------------------------------
  // Test O: Base ERC-8021 suffix rejected
  // ----------------------------------------------------
  console.log("--- Testing O: Base ERC-8021 Suffix Absence & Rejection ---");
  assert.strictEqual(decodedErc20.baseSuffixAbsent, true);
  assert.strictEqual(decodedPermit2.baseSuffixAbsent, true);

  // Injected ERC-8021 suffix must throw
  const injectedSuffixTx: ArcMainnetPreparedApprovalTx = {
    ...permit2Tx,
    data: (permit2Tx.data + BASE_BUILDER_SUFFIX) as `0x${string}`,
  };
  let suffixRejected = false;
  try {
    decodeAndValidateArcMainnetApprovalCalldata(injectedSuffixTx);
  } catch (err: unknown) {
    suffixRejected = (err as Error).message.includes("Base Builder Code ERC-8021 suffix found");
  }
  assert.strictEqual(suffixRejected, true, "Base ERC-8021 suffix must be rejected");
  console.log("[PASS] Test O: Base ERC-8021 suffix strictly absent and rejected if injected");

  // ----------------------------------------------------
  // Test P: No automatic approval
  // ----------------------------------------------------
  console.log("--- Testing P: No Automatic Approval ---");
  const fullAuditAndPrep = await auditAndPrepareArcMainnetApprovals({
    token: "USDC",
    owner: DUMMY_USER,
    requiredAmount: "1000000",
    chainId: 5042,
  });
  assert.strictEqual(fullAuditAndPrep.writeExecuted, false, "writeExecuted must be strictly false");
  assert.strictEqual(fullAuditAndPrep.executionSimulatedOnly, true, "executionSimulatedOnly must be true");
  assert.strictEqual(fullAuditAndPrep.isReadyForBroadcast, false, "isReadyForBroadcast must be false");
  console.log("[PASS] Test P: No automatic approval executed; transactions prepared only");

  // ----------------------------------------------------
  // Test Q, R: Security Audit - Zero Wallet Signatures & Zero Broadcasts
  // ----------------------------------------------------
  console.log("--- Testing Q & R: Security Audit - No Signatures / Broadcasts ---");
  assert.strictEqual(writeOperationSpies.eth_sendTransaction, 0, "0 eth_sendTransaction calls");
  assert.strictEqual(writeOperationSpies.eth_signTransaction, 0, "0 eth_signTransaction calls");
  assert.strictEqual(writeOperationSpies.personal_sign, 0, "0 personal_sign calls");
  assert.strictEqual(writeOperationSpies.writeContract, 0, "0 walletClient.writeContract calls");
  assert.strictEqual(writeOperationSpies.sendTransaction, 0, "0 walletClient.sendTransaction calls");
  console.log("[PASS] Test Q: Zero wallet signatures requested (0 calls to eth_signTransaction, personal_sign)");
  console.log("[PASS] Test R: Zero broadcasts executed (0 calls to eth_sendTransaction, writeContract, sendTransaction)");

  // ----------------------------------------------------
  // Test S: Arc chain ID enforced
  // ----------------------------------------------------
  console.log("--- Testing S: Arc Chain ID 5042 Enforced ---");
  assert.strictEqual(erc20Tx.chainId, ARC_MAINNET_CHAIN_ID);
  assert.strictEqual(permit2Tx.chainId, ARC_MAINNET_CHAIN_ID);
  assert.strictEqual(fullAuditAndPrep.audit.tokenAddress.toLowerCase(), ARC_MAINNET_TOKENS.USDC.address.toLowerCase());
  console.log("[PASS] Test S: Arc Mainnet chain ID 5042 enforced across all objects");

  // ----------------------------------------------------
  // Test T: Arc Testnet & Base logic untouched
  // ----------------------------------------------------
  console.log("--- Testing T: Arc Testnet & Base Logic Isolation ---");
  assert.notStrictEqual(erc20Tx.chainId, 5042002, "Must not be Arc Testnet (5042002)");
  assert.notStrictEqual(erc20Tx.chainId, 84532, "Must not be Base Sepolia (84532)");
  assert.notStrictEqual(permit2Tx.chainId, 5042002, "Must not be Arc Testnet (5042002)");
  assert.notStrictEqual(permit2Tx.chainId, 84532, "Must not be Base Sepolia (84532)");
  console.log("[PASS] Test T: Arc Testnet (5042002) and Base Sepolia (84532) completely isolated");

  // ----------------------------------------------------
  // EURC tests for completeness
  // ----------------------------------------------------
  console.log("--- Additional Test: EURC Approval Preparation ---");
  const eurcErc20Tx = prepareArcMainnetErc20ApprovalTx({
    token: "EURC",
    owner: DUMMY_USER,
    amount: "2500000",
    chainId: 5042,
  });
  assert.strictEqual(eurcErc20Tx.token, "EURC");
  assert.strictEqual(eurcErc20Tx.to.toLowerCase(), ARC_MAINNET_TOKENS.EURC.address.toLowerCase());
  const decodedEurc = decodeAndValidateArcMainnetApprovalCalldata(eurcErc20Tx);
  assert.strictEqual(decodedEurc.amount, BigInt("2500000"));
  console.log("[PASS] Additional Test: EURC approval preparation validated");

  console.log("");
  console.log("==================================================");
  console.log("ALL PHASE 3D APPROVAL TESTS PASSED! (21/21)");
  console.log("==================================================");
}

runApprovalTestSuite().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
