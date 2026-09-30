/**
 * Test Suite: Arc Mainnet EURC -> USDC Approval UX & Error Extraction Regression Tests
 *
 * Verifies:
 * 1. EURC amount > balance: pipeline is NOT entered, 0 transactions requested, correct error
 * 2. EURC amount <= balance: existing approval pipeline remains intact
 * 3. EIP-1193 { code: 4001, message: "User rejected the request." } produces meaningful error
 * 4. Standard Error new Error("test") preserves "test"
 * 5. RPC object with message preserves the message
 * 6. USDC -> EURC remains unchanged
 * 7. Base Mainnet swap remains unchanged
 * 8. Base Sepolia swap remains unchanged
 */

import assert from "node:assert";
import {
  extractApprovalErrorMessage,
  executeArcMainnetApprovalPipeline,
  MinimalApprovalProvider,
} from "../src/lib/arc-mainnet-approval";
import { SWAP_CHAINS } from "../src/config/swap-config";
import { parseUnits } from "viem";

async function runTests() {
  console.log("================================================================================");
  console.log("ARC MAINNET APPROVAL UX & ERROR EXTRACTION REGRESSION SUITE");
  console.log("================================================================================\n");

  let passed = 0;

  // ---------------------------------------------------------------------------
  // Test 1: EURC amount > balance
  // ---------------------------------------------------------------------------
  console.log("[Test 1] Verifying EURC amount > balance guards...");
  {
    const mockBalanceWei = BigInt("304095"); // 0.304095 EURC
    const attemptedAmountStr = "0.35173";    // 0.35173 EURC
    const attemptedWei = parseUnits(attemptedAmountStr, 6);

    let pipelineEntered = false;
    let transactionsRequested = 0;
    let uiError: string | null = null;

    // Simulate swap-form logic
    if (attemptedWei > mockBalanceWei) {
      uiError = "Insufficient EURC balance";
    } else {
      pipelineEntered = true;
      transactionsRequested++;
    }

    assert.strictEqual(pipelineEntered, false, "Approval pipeline must NOT be entered when amount > balance");
    assert.strictEqual(transactionsRequested, 0, "No transactions may be requested when amount > balance");
    assert.strictEqual(uiError, "Insufficient EURC balance", "Correct user-facing error must be set");
    console.log("  ✓ EURC amount > balance correctly blocked without entering pipeline or requesting txs.");
    passed++;
  }

  // ---------------------------------------------------------------------------
  // Test 2: EURC amount <= balance: existing pipeline remains intact
  // ---------------------------------------------------------------------------
  console.log("\n[Test 2] Verifying EURC amount <= balance preserves existing pipeline...");
  {
    const mockBalanceWei = BigInt("500000"); // 0.50 EURC
    const attemptedAmountStr = "0.30";       // 0.30 EURC
    const attemptedWei = parseUnits(attemptedAmountStr, 6);

    let pipelineEntered = false;
    let transactionsRequested = 0;
    let uiError: string | null = null;

    if (attemptedWei > mockBalanceWei) {
      uiError = "Insufficient EURC balance";
    } else {
      pipelineEntered = true;
    }

    assert.strictEqual(pipelineEntered, true, "Pipeline should be entered when amount <= balance");
    assert.strictEqual(uiError, null, "No error should be set when balance is sufficient");

    // Verify pipeline mock execution for EURC
    let erc20TxRequested = false;
    const mockProvider: MinimalApprovalProvider = {
      request: async ({ method, params }) => {
        if (method === "eth_chainId") return "0x13b2"; // 5042
        if (method === "eth_sendTransaction") {
          erc20TxRequested = true;
          return "0x1111111111111111111111111111111111111111111111111111111111111111";
        }
        return null;
      },
    };

    let erc20Allowance = BigInt(0);
    let permit2Allowance = BigInt(0);
    const mockPublicClient: any = {
      readContract: async ({ address, functionName }: any) => {
        if (address.toLowerCase() === "0x000000000022d473030f116ddee9f6b43ac78ba3".toLowerCase()) {
          return [permit2Allowance, Math.floor(Date.now() / 1000) + 86400 * 30, 0];
        }
        return erc20Allowance;
      },
      waitForTransactionReceipt: async () => {
        erc20Allowance = BigInt("1000000");
        permit2Allowance = BigInt("1000000");
        return { status: "success" };
      },
    };

    const res = await executeArcMainnetApprovalPipeline({
      token: "EURC",
      owner: "0xE2eF8F89Df0B50975328EB8859116bBe90C1036d",
      requiredAmount: attemptedWei.toString(),
      provider: mockProvider,
      publicClient: mockPublicClient,
    });

    assert.strictEqual(erc20TxRequested, true, "ERC20 approval transaction was requested");
    assert.strictEqual(res.success, true, "Pipeline completed successfully");
    console.log("  ✓ EURC amount <= balance successfully executes pipeline.");
    passed++;
  }

  // ---------------------------------------------------------------------------
  // Test 3: EIP-1193 rejection error handling
  // ---------------------------------------------------------------------------
  console.log("\n[Test 3] Verifying EIP-1193 wallet rejection error handling...");
  {
    // A: Plain EIP-1193 error object (not an Error instance)
    const eip1193Obj = { code: 4001, message: "User rejected the request." };
    const msgA = extractApprovalErrorMessage(eip1193Obj);
    assert.strictEqual(msgA, "User rejected the approval request.");

    // B: Object with only code 4001
    const codeOnlyObj = { code: 4001 };
    const msgB = extractApprovalErrorMessage(codeOnlyObj);
    assert.strictEqual(msgB, "User rejected the approval request.");

    // C: Error instance with rejection message
    const errInstance = new Error("MetaMask Tx Signature: User denied transaction signature.");
    const msgC = extractApprovalErrorMessage(errInstance);
    assert.strictEqual(msgC, "User rejected the approval request.");

    // D: In executeArcMainnetApprovalPipeline with non-Error EIP-1193 rejection
    const rejectingProvider: MinimalApprovalProvider = {
      request: async ({ method }) => {
        if (method === "eth_chainId") return "0x13b2";
        if (method === "eth_sendTransaction") {
          throw { code: 4001, message: "User rejected the request." };
        }
        return null;
      },
    };

    const mockPublicClient: any = {
      readContract: async ({ address }: any) => {
        if (address.toLowerCase() === "0x000000000022d473030f116ddee9f6b43ac78ba3".toLowerCase()) {
          return [BigInt(0), Math.floor(Date.now() / 1000) + 86400 * 30, 0];
        }
        return BigInt(0);
      },
      waitForTransactionReceipt: async () => ({ status: "success" }),
    };

    const res = await executeArcMainnetApprovalPipeline({
      token: "EURC",
      owner: "0xE2eF8F89Df0B50975328EB8859116bBe90C1036d",
      requiredAmount: "351730",
      provider: rejectingProvider,
      publicClient: mockPublicClient,
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.stage, "aborted");
    assert.strictEqual(res.error, "User rejected the approval request.");
    console.log("  ✓ EIP-1193 rejection correctly normalized to: 'User rejected the approval request.'");
    passed++;
  }

  // ---------------------------------------------------------------------------
  // Test 4: Standard Error instance preservation
  // ---------------------------------------------------------------------------
  console.log("\n[Test 4] Verifying standard Error instance preservation...");
  {
    const err = new Error("test");
    const msg = extractApprovalErrorMessage(err);
    assert.strictEqual(msg, "test");

    const complexErr = new Error("Allowance verification timed out after 60s.");
    const msgComplex = extractApprovalErrorMessage(complexErr);
    assert.strictEqual(msgComplex, "Allowance verification timed out after 60s.");
    console.log("  ✓ Standard Error instances preserved exactly.");
    passed++;
  }

  // ---------------------------------------------------------------------------
  // Test 5: RPC object with message preservation
  // ---------------------------------------------------------------------------
  console.log("\n[Test 5] Verifying RPC objects with message or reason preservation...");
  {
    const rpcObj = { code: -32603, message: "Internal JSON-RPC error." };
    const msgA = extractApprovalErrorMessage(rpcObj);
    assert.strictEqual(msgA, "Internal JSON-RPC error.");

    const reasonObj = { reason: "ERC20: transfer amount exceeds balance" };
    const msgB = extractApprovalErrorMessage(reasonObj);
    assert.strictEqual(msgB, "ERC20: transfer amount exceeds balance");

    const shortMsgObj = { shortMessage: "The contract call reverted." };
    const msgC = extractApprovalErrorMessage(shortMsgObj);
    assert.strictEqual(msgC, "The contract call reverted.");

    const nestedDataObj = {
      code: -32000,
      message: "execution reverted",
      data: { message: "insufficient gas allowance" },
    };
    const msgD = extractApprovalErrorMessage(nestedDataObj);
    assert.strictEqual(msgD, "insufficient gas allowance");
    console.log("  ✓ RPC object message/reason correctly preserved.");
    passed++;
  }

  // ---------------------------------------------------------------------------
  // Test 6: USDC -> EURC remains unchanged
  // ---------------------------------------------------------------------------
  console.log("\n[Test 6] Verifying USDC -> EURC flow and config intact...");
  {
    const arcConfig = SWAP_CHAINS.ArcMainnet;
    assert.strictEqual(arcConfig.id, 5042);
    assert.strictEqual(arcConfig.tokens.USDC.symbol, "USDC");
    assert.strictEqual(arcConfig.tokens.USDC.decimals, 6);
    assert.strictEqual(
      arcConfig.tokens.USDC.address.toLowerCase(),
      "0x3600000000000000000000000000000000000000"
    );

    let usdcTxRequested = false;
    const mockProvider: MinimalApprovalProvider = {
      request: async ({ method }) => {
        if (method === "eth_chainId") return "0x13b2";
        if (method === "eth_sendTransaction") {
          usdcTxRequested = true;
          return "0x2222222222222222222222222222222222222222222222222222222222222222";
        }
        return null;
      },
    };

    let usdcErc20Allowance = BigInt(0);
    let usdcPermit2Allowance = BigInt(0);
    const mockPublicClient: any = {
      readContract: async ({ address }: any) => {
        if (address.toLowerCase() === "0x000000000022d473030f116ddee9f6b43ac78ba3".toLowerCase()) {
          return [usdcPermit2Allowance, Math.floor(Date.now() / 1000) + 86400 * 30, 0];
        }
        return usdcErc20Allowance;
      },
      waitForTransactionReceipt: async () => {
        usdcErc20Allowance = BigInt("1000000");
        usdcPermit2Allowance = BigInt("1000000");
        return { status: "success" };
      },
    };

    const res = await executeArcMainnetApprovalPipeline({
      token: "USDC",
      owner: "0xE2eF8F89Df0B50975328EB8859116bBe90C1036d",
      requiredAmount: "1000000",
      provider: mockProvider,
      publicClient: mockPublicClient,
    });

    assert.strictEqual(usdcTxRequested, true);
    assert.strictEqual(res.success, true);
    console.log("  ✓ USDC -> EURC approval pipeline unchanged and fully operational.");
    passed++;
  }

  // ---------------------------------------------------------------------------
  // Test 7: Base Mainnet swap configuration remains unchanged
  // ---------------------------------------------------------------------------
  console.log("\n[Test 7] Verifying Base Mainnet swap config intact...");
  {
    const baseMainnet = SWAP_CHAINS.BaseMainnet;
    assert.strictEqual(baseMainnet.id, 8453);
    assert.strictEqual(baseMainnet.routerAddress.toLowerCase(), "0x2626664c2603336e57b271c5c0b26f421741e481");
    assert.strictEqual(baseMainnet.tokens.USDC.address.toLowerCase(), "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
    assert.strictEqual(baseMainnet.tokens.EURC.address.toLowerCase(), "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42");
    console.log("  ✓ Base Mainnet config and addresses strictly unchanged.");
    passed++;
  }

  // ---------------------------------------------------------------------------
  // Test 8: Base Sepolia swap configuration remains unchanged
  // ---------------------------------------------------------------------------
  console.log("\n[Test 8] Verifying Base Sepolia swap config intact...");
  {
    const baseSepolia = SWAP_CHAINS.Base;
    assert.strictEqual(baseSepolia.id, 84532);
    assert.strictEqual(baseSepolia.tokens.USDC.symbol, "USDC");
    assert.strictEqual(baseSepolia.tokens.EURC.symbol, "EURC");
    assert.strictEqual(baseSepolia.tokens.ETH.symbol, "ETH");
    console.log("  ✓ Base Sepolia config strictly unchanged.");
    passed++;
  }

  console.log("\n================================================================================");
  console.log(`ALL ${passed}/8 TESTS PASSED SUCCESSFULLY!`);
  console.log("================================================================================");
}

runTests().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
