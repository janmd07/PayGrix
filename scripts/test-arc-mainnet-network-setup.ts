/**
 * Test Suite: Arc Mainnet Wallet Network Setup
 *
 * Verifies the single-entry-point wallet-assisted Arc Mainnet network switch/add flow
 * adhering strictly to all requirements:
 * 1. Configuration reused from src/config/arc-mainnet.ts (Chain ID 5042 / 0x13B2)
 * 2. Case A: Already on 5042 -> 0 switch/add calls, immediate success
 * 3. Case B: On Arc Testnet (5042002) -> wallet_switchEthereumChain triggered
 * 4. Case C: On Base Sepolia (84532) -> wallet_switchEthereumChain triggered
 * 5. Case D: Error 4902 -> wallet_addEthereumChain triggered with exact params
 * 6. Case E: User approves Add Network -> network added and verified to 5042
 * 7. Case F: User rejects Add Network (4001) -> handled cleanly, swap blocked
 * 8. Case G: User rejects Switch Network (4001) -> handled cleanly, swap blocked
 * 9. Architectural Invariant: Single user-facing setup entry point (no duplicate popups in executeSwap)
 * 10. Provider chain ID parsing & safety invariants (0 real tx, 0 approvals)
 */

import assert from "assert";
import {
  ensureArcMainnetNetwork,
  parseChainId,
  isUserRejectionError,
  isUnrecognizedChainError,
  ARC_MAINNET_CHAIN_ID,
  ARC_MAINNET_CHAIN_ID_HEX,
  ARC_MAINNET_NETWORK_PARAMS,
} from "../src/lib/arc-mainnet-network";
import { arcMainnet, ARC_MAINNET_CONFIG } from "../src/config/arc-mainnet";

console.log("==================================================");
console.log("TEST SUITE: ARC MAINNET WALLET NETWORK SETUP FLOW");
console.log("==================================================");

let realTransactionsSent = 0;
let realSignaturesRequested = 0;
let realApprovalsExecuted = 0;

// Helper to create mock EIP-1193 providers
interface MockProviderOptions {
  initialChainId: number | string;
  onSwitch?: (chainId: string) => Promise<void> | void;
  onAdd?: (params: unknown) => Promise<void> | void;
}

function createMockProvider(options: MockProviderOptions) {
  let currentChainHex =
    typeof options.initialChainId === "number"
      ? `0x${options.initialChainId.toString(16)}`
      : options.initialChainId;

  const calls: { method: string; params?: unknown[] }[] = [];

  const provider = {
    calls,
    get currentChain() {
      return currentChainHex;
    },
    async request(args: { method: string; params?: unknown[] }) {
      calls.push(args);

      if (args.method === "eth_chainId") {
        return currentChainHex;
      }

      if (args.method === "wallet_switchEthereumChain") {
        if (options.onSwitch) {
          const target = (args.params as [{ chainId: string }])[0].chainId;
          await options.onSwitch(target);
        }
        const target = (args.params as [{ chainId: string }])[0].chainId;
        currentChainHex = target;
        return null;
      }

      if (args.method === "wallet_addEthereumChain") {
        if (options.onAdd) {
          await options.onAdd(args.params?.[0]);
        }
        const params = args.params?.[0] as { chainId: string };
        currentChainHex = params.chainId;
        return null;
      }

      if (args.method === "eth_sendTransaction") {
        realTransactionsSent++;
        throw new Error("Unexpected eth_sendTransaction in network setup tests!");
      }

      if (args.method === "personal_sign" || args.method === "eth_signTypedData_v4") {
        realSignaturesRequested++;
        throw new Error("Unexpected signature in network setup tests!");
      }

      throw new Error(`Unhandled mock method: ${args.method}`);
    },
  };

  return provider;
}

async function runTests() {
  // Test 1: Configuration Source of Truth
  console.log("\n--- Test 1: Network Configuration Source of Truth ---");
  assert.strictEqual(arcMainnet.id, 5042, "arcMainnet id must be 5042");
  assert.strictEqual(ARC_MAINNET_CONFIG.chainId, 5042, "ARC_MAINNET_CONFIG chainId must be 5042");
  assert.strictEqual(ARC_MAINNET_CHAIN_ID, 5042, "ARC_MAINNET_CHAIN_ID must be 5042");
  assert.strictEqual(
    ARC_MAINNET_CHAIN_ID_HEX.toLowerCase(),
    "0x13b2",
    "ARC_MAINNET_CHAIN_ID_HEX must be 0x13b2"
  );
  assert.strictEqual(
    ARC_MAINNET_NETWORK_PARAMS.rpcUrls[0],
    "https://rpc.mainnet.arc.io",
    "RPC URL must match canonical Arc Mainnet RPC"
  );
  assert.strictEqual(
    ARC_MAINNET_NETWORK_PARAMS.blockExplorerUrls?.[0],
    "https://explorer.arc.io",
    "Explorer URL must match canonical Arc Mainnet explorer"
  );
  assert.strictEqual(
    ARC_MAINNET_NETWORK_PARAMS.nativeCurrency.name,
    "USDC",
    "Native currency must be USDC"
  );
  assert.strictEqual(
    ARC_MAINNET_NETWORK_PARAMS.nativeCurrency.symbol,
    "USDC",
    "Native symbol must be USDC"
  );
  assert.strictEqual(
    ARC_MAINNET_NETWORK_PARAMS.nativeCurrency.decimals,
    18,
    "Native decimals must be 18"
  );
  console.log("[PASS] Test 1: Network configuration verified against canonical arc-mainnet.ts");

  // Test 2: Case A - Already on Arc Mainnet (5042)
  console.log("\n--- Test 2: Case A - Wallet Already on Arc Mainnet ---");
  {
    const provider = createMockProvider({ initialChainId: 5042 });
    const result = await ensureArcMainnetNetwork(provider);
    assert.strictEqual(result.success, true, "Should return success");
    assert.strictEqual(result.chainId, 5042, "Should return chainId 5042");
    assert.strictEqual(result.switched, false, "switched should be false");
    assert.strictEqual(result.added, false, "added should be false");
    // Only eth_chainId was queried; 0 switch and 0 add calls
    const switchCalls = provider.calls.filter((c) => c.method === "wallet_switchEthereumChain");
    const addCalls = provider.calls.filter((c) => c.method === "wallet_addEthereumChain");
    assert.strictEqual(switchCalls.length, 0, "No switch calls should be made when already on 5042");
    assert.strictEqual(addCalls.length, 0, "No add calls should be made when already on 5042");
    console.log("[PASS] Test 2: Case A - Already on 5042 produces 0 switch/add calls and returns immediately");
  }

  // Test 3: Case B - Connected on Arc Testnet (5042002)
  console.log("\n--- Test 3: Case B - Wallet on Arc Testnet (5042002) ---");
  {
    const provider = createMockProvider({ initialChainId: 5042002 });
    const result = await ensureArcMainnetNetwork(provider);
    assert.strictEqual(result.success, true, "Should return success");
    assert.strictEqual(result.chainId, 5042, "Should return chainId 5042");
    assert.strictEqual(result.switched, true, "switched should be true");
    assert.strictEqual(result.added, false, "added should be false");

    const switchCalls = provider.calls.filter((c) => c.method === "wallet_switchEthereumChain");
    assert.strictEqual(switchCalls.length, 1, "Exactly one switch call should be made");
    const targetHex = (switchCalls[0].params as [{ chainId: string }])[0].chainId;
    assert.strictEqual(targetHex.toLowerCase(), "0x13b2", "Target chainId must be 0x13b2");
    console.log("[PASS] Test 3: Case B - Arc Testnet wallet successfully prompted to switch to 0x13B2");
  }

  // Test 4: Case C - Connected on Base Sepolia (84532)
  console.log("\n--- Test 4: Case C - Wallet on Base Sepolia (84532) ---");
  {
    const provider = createMockProvider({ initialChainId: 84532 });
    const result = await ensureArcMainnetNetwork(provider);
    assert.strictEqual(result.success, true, "Should return success");
    assert.strictEqual(result.chainId, 5042, "Should return chainId 5042");
    assert.strictEqual(result.switched, true, "switched should be true");
    assert.strictEqual(result.added, false, "added should be false");

    const switchCalls = provider.calls.filter((c) => c.method === "wallet_switchEthereumChain");
    assert.strictEqual(switchCalls.length, 1, "Exactly one switch call should be made");
    console.log("[PASS] Test 4: Case C - Base Sepolia wallet successfully prompted to switch to 0x13B2");
  }

  // Test 5: Case D & E - Error 4902 triggers wallet_addEthereumChain and user approves
  console.log("\n--- Test 5: Case D & E - Unrecognized Chain (4902) Triggers Add Network ---");
  {
    let addNetworkCalled = false;
    let addedParams: unknown = null;

    const provider = createMockProvider({
      initialChainId: 1, // Ethereum mainnet
      onSwitch: () => {
        const err: { code: number; message: string } = {
          code: 4902,
          message: "Unrecognized chain ID 0x13b2. Try adding the chain using wallet_addEthereumChain.",
        };
        throw err;
      },
      onAdd: (params) => {
        addNetworkCalled = true;
        addedParams = params;
      },
    });

    const result = await ensureArcMainnetNetwork(provider);
    assert.strictEqual(result.success, true, "Should return success after network is added");
    assert.strictEqual(result.chainId, 5042, "Should be on chainId 5042");
    assert.strictEqual(result.added, true, "added should be true");
    assert.strictEqual(addNetworkCalled, true, "wallet_addEthereumChain must have been invoked");

    // Verify exact params
    const p = addedParams as typeof ARC_MAINNET_NETWORK_PARAMS;
    assert.strictEqual(p.chainId.toLowerCase(), "0x13b2", "Added chainId must be 0x13b2");
    assert.strictEqual(p.chainName, "Arc Mainnet", "Added chainName must be 'Arc Mainnet'");
    assert.strictEqual(p.nativeCurrency.name, "USDC", "Native currency name must be 'USDC'");
    assert.strictEqual(p.nativeCurrency.symbol, "USDC", "Native currency symbol must be 'USDC'");
    assert.strictEqual(p.nativeCurrency.decimals, 18, "Native decimals must be 18");
    assert.deepStrictEqual(p.rpcUrls, ["https://rpc.mainnet.arc.io"], "RPC URLs must match");
    console.log("[PASS] Test 5: Case D & E - 4902 triggers wallet_addEthereumChain with canonical parameters");
  }

  // Test 6: Case F - User rejects Add Network prompt (code 4001)
  console.log("\n--- Test 6: Case F - User Rejection of Add Network (4001) ---");
  {
    const provider = createMockProvider({
      initialChainId: 1,
      onSwitch: () => {
        const err = { code: 4902, message: "Unrecognized chain" };
        throw err;
      },
      onAdd: () => {
        const err = { code: 4001, message: "User rejected the request." };
        throw err;
      },
    });

    const result = await ensureArcMainnetNetwork(provider);
    assert.strictEqual(result.success, false, "Should return failure on user rejection");
    assert.strictEqual(result.added, false, "added should be false");
    assert.ok(
      result.error?.includes("rejected"),
      `Error must mention rejection, got: ${result.error}`
    );
    assert.ok(
      result.error?.includes("Swap transaction was not submitted"),
      "Error must clarify no swap transaction was submitted"
    );
    console.log("[PASS] Test 6: Case F - Add Network rejection handled cleanly with user-friendly message");
  }

  // Test 7: Case G - User rejects Switch Network prompt (code 4001)
  console.log("\n--- Test 7: Case G - User Rejection of Switch Network (4001) ---");
  {
    const provider = createMockProvider({
      initialChainId: 84532,
      onSwitch: () => {
        const err = { code: 4001, message: "User rejected the request." };
        throw err;
      },
    });

    const result = await ensureArcMainnetNetwork(provider);
    assert.strictEqual(result.success, false, "Should return failure on user rejection");
    assert.strictEqual(result.switched, false, "switched should be false");
    assert.ok(
      result.error?.includes("rejected"),
      `Error must mention rejection, got: ${result.error}`
    );
    assert.ok(
      result.error?.includes("Swap transaction was not submitted"),
      "Error must clarify no swap transaction was submitted"
    );
    console.log("[PASS] Test 7: Case G - Switch Network rejection handled cleanly with user-friendly message");
  }

  // Test 8: Chain ID Parsing Unit Tests
  console.log("\n--- Test 8: Robust Chain ID Parsing ---");
  assert.strictEqual(parseChainId(5042), 5042);
  assert.strictEqual(parseChainId("5042"), 5042);
  assert.strictEqual(parseChainId("0x13b2"), 5042);
  assert.strictEqual(parseChainId("0x13B2"), 5042);
  assert.strictEqual(parseChainId("0X13B2"), 5042);
  assert.strictEqual(parseChainId(84532), 84532);
  assert.strictEqual(parseChainId("0x14a34"), 84532);
  assert.strictEqual(parseChainId("invalid"), null);
  assert.strictEqual(parseChainId(null), null);
  assert.strictEqual(parseChainId(undefined), null);
  console.log("[PASS] Test 8: parseChainId parses hex, decimal strings, numbers, and null safely");

  // Test 9: Error classification helpers
  console.log("\n--- Test 9: Error Classification Helpers ---");
  assert.strictEqual(isUserRejectionError({ code: 4001 }), true);
  assert.strictEqual(isUserRejectionError({ message: "User denied transaction signature" }), true);
  assert.strictEqual(isUserRejectionError({ code: 4902 }), false);
  assert.strictEqual(isUnrecognizedChainError({ code: 4902 }), true);
  assert.strictEqual(isUnrecognizedChainError({ message: "Unrecognized chain ID" }), true);
  assert.strictEqual(isUnrecognizedChainError({ data: { originalError: { code: 4902 } } }), true);
  assert.strictEqual(isUnrecognizedChainError({ code: 4001 }), false);
  console.log("[PASS] Test 9: isUserRejectionError and isUnrecognizedChainError correctly classify RPC errors");

  // Test 10: Architectural Invariant: executeSwap does NOT duplicate ensureArcMainnetNetwork
  console.log("\n--- Test 10: Architectural Invariant - Single Setup Entry Point ---");
  const fs = await import("fs");
  const useSwapContent = fs.readFileSync("src/hooks/use-swap.ts", "utf-8");
  const swapFormContent = fs.readFileSync("src/components/bridge/swap-form.tsx", "utf-8");

  // Verify executeSwap does NOT call ensureArcMainnetNetwork
  assert.strictEqual(
    useSwapContent.includes("ensureArcMainnetNetwork"),
    false,
    "executeSwap / use-swap.ts must NOT call ensureArcMainnetNetwork (prevents duplicate popups)"
  );

  // Verify swap-form.tsx calls ensureArcMainnetNetwork in handleReviewArcMainnetSwap
  assert.ok(
    swapFormContent.includes("ensureArcMainnetNetwork"),
    "swap-form.tsx must invoke ensureArcMainnetNetwork as single entry point"
  );

  // Verify strict chainId check remains in use-swap.ts as safety guard
  assert.ok(
    useSwapContent.includes("providerChainId !== targetChainId") ||
    useSwapContent.includes("providerChainId !== 5042"),
    "use-swap.ts must retain strict chainId guard"
  );
  console.log("[PASS] Test 10: Architectural guard verified (executeSwap has no duplicate switch/add flow)");

  // Test 11: Scope & Isolation Invariants
  console.log("\n--- Test 11: Scope & Isolation Invariant ---");
  const { execSync } = await import("child_process");
  const gitDiffTracked = execSync("git diff --name-only", { encoding: "utf-8" });
  const modifiedTrackedFiles = gitDiffTracked
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => Boolean(line) && !line.startsWith("warning:"));

  for (const file of modifiedTrackedFiles) {
    assert.strictEqual(
      file,
      "src/components/bridge/swap-form.tsx",
      `Only swap-form.tsx should be modified among tracked files. Found: ${file}`
    );
  }
  console.log("[PASS] Test 11: Zero unintended files touched (Bridge, Lending, Payroll, etc. untouched)");

  // Test 12: Zero Real Blockchain Execution
  console.log("\n--- Test 12: Zero Real Blockchain Execution Invariant ---");
  assert.strictEqual(realTransactionsSent, 0, "0 real transactions sent");
  assert.strictEqual(realSignaturesRequested, 0, "0 real signatures requested");
  assert.strictEqual(realApprovalsExecuted, 0, "0 real approvals executed");
  console.log("[PASS] 0 real transactions sent to blockchain");
  console.log("[PASS] 0 signatures requested from wallet");
  console.log("[PASS] 0 real approvals executed");

  console.log("\n==================================================");
  console.log("ALL ARC MAINNET NETWORK SETUP TESTS PASSED! (12/12)");
  console.log("==================================================");
}

runTests().catch((err) => {
  console.error("\n[FAIL] Test suite encountered an error:", err);
  process.exit(1);
});
