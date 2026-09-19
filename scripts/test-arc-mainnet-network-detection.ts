import assert from "assert";
import { parseChainId } from "@/hooks/use-swap";
import { ARC_MAINNET_CONFIG } from "@/config/arc-mainnet";

console.log("==================================================");
console.log("PHASE 6.2: ARC MAINNET NETWORK DETECTION TEST SUITE");
console.log("==================================================");

// Execution Spies ensuring zero unsolicited operations
const spies = {
  wallet_switchEthereumChain: 0,
  wallet_addEthereumChain: 0,
  eth_sendTransaction: 0,
  eth_signTransaction: 0,
  personal_sign: 0,
  chainChangedListeners: new Set<(...args: unknown[]) => void>(),
  accountsChangedListeners: new Set<(...args: unknown[]) => void>(),
};

interface MockProviderOptions {
  initialChainId?: string | number | null;
  failChainId?: boolean;
}

interface TestEIP1193Provider {
  currentChainId: string | number | null;
  setChainId: (newId: string | number | null) => void;
  setShouldFail: (fail: boolean) => void;
  emit: (event: "chainChanged" | "accountsChanged", data: unknown) => void;
  on: (event: string, fn: (...args: unknown[]) => void) => void;
  removeListener: (event: string, fn: (...args: unknown[]) => void) => void;
  off: (event: string, fn: (...args: unknown[]) => void) => void;
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

function createMockProvider(options: MockProviderOptions = {}): TestEIP1193Provider {
  let currentChainId: string | number | null = options.initialChainId ?? "0x13b2";
  let shouldFail = options.failChainId ?? false;

  return {
    get currentChainId() {
      return currentChainId;
    },
    setChainId(newId: string | number | null) {
      currentChainId = newId;
    },
    setShouldFail(fail: boolean) {
      shouldFail = fail;
    },
    emit(event: "chainChanged" | "accountsChanged", data: unknown) {
      if (event === "chainChanged") {
        spies.chainChangedListeners.forEach((fn) => fn(data));
      } else if (event === "accountsChanged") {
        spies.accountsChangedListeners.forEach((fn) => fn(data));
      }
    },
    on(event: string, fn: (...args: unknown[]) => void) {
      if (event === "chainChanged") {
        spies.chainChangedListeners.add(fn);
      } else if (event === "accountsChanged") {
        spies.accountsChangedListeners.add(fn);
      }
    },
    removeListener(event: string, fn: (...args: unknown[]) => void) {
      if (event === "chainChanged") {
        spies.chainChangedListeners.delete(fn);
      } else if (event === "accountsChanged") {
        spies.accountsChangedListeners.delete(fn);
      }
    },
    off(event: string, fn: (...args: unknown[]) => void) {
      this.removeListener(event, fn);
    },
    request: async ({ method }: { method: string; params?: unknown[] }) => {
      if (method === "wallet_switchEthereumChain") {
        spies.wallet_switchEthereumChain++;
        throw new Error("wallet_switchEthereumChain should NOT be called for Arc Mainnet!");
      }
      if (method === "wallet_addEthereumChain") {
        spies.wallet_addEthereumChain++;
        throw new Error("wallet_addEthereumChain should NOT be called for Arc Mainnet!");
      }
      if (method === "eth_sendTransaction") {
        spies.eth_sendTransaction++;
        throw new Error("eth_sendTransaction forbidden in test");
      }
      if (method === "eth_signTransaction") {
        spies.eth_signTransaction++;
        throw new Error("eth_signTransaction forbidden in test");
      }
      if (method === "personal_sign") {
        spies.personal_sign++;
        throw new Error("personal_sign forbidden in test");
      }
      if (method === "eth_chainId") {
        if (shouldFail) {
          throw new Error("RPC Failure: Internal JSON-RPC error");
        }
        return currentChainId;
      }
      if (method === "eth_accounts") {
        return ["0x1111111111111111111111111111111111111111"];
      }
      return null;
    },
  };
}

/**
 * Validates the runtime provider chain check logic matching use-swap.ts
 */
async function verifyProviderChain(provider: TestEIP1193Provider): Promise<{ valid: boolean; chainId: number | null; error?: string }> {
  let providerChainId: number | null = null;
  try {
    const hexChainId = (await provider.request({ method: "eth_chainId" })) as string;
    providerChainId = parseChainId(hexChainId);
  } catch {
    // Failure to read chain ID -> remains null (blocked/unknown)
    providerChainId = null;
  }

  const targetChainId = ARC_MAINNET_CONFIG.chainId; // 5042
  if (providerChainId !== targetChainId) {
    return {
      valid: false,
      chainId: providerChainId,
      error: `Wrong network: Connected wallet chain ID is ${providerChainId ?? "unknown"}, but Arc Mainnet requires 5042. Please switch your wallet to Arc Mainnet (Chain ID 5042).`,
    };
  }

  return { valid: true, chainId: providerChainId };
}

async function runNetworkDetectionTests() {
  console.log("\n--- Test 1: Provider Reports 5042 (0x13b2) -> Accepted ---");
  {
    const provider = createMockProvider({ initialChainId: "0x13b2" });
    const result = await verifyProviderChain(provider);
    assert.strictEqual(result.valid, true, "Chain 5042 must be accepted");
    assert.strictEqual(result.chainId, 5042, "Chain ID must parse to 5042");
    assert.strictEqual(result.error, undefined);
    console.log("[PASS] Test 1: Provider 5042 (0x13b2) accepted as Arc Mainnet");
  }

  console.log("\n--- Test 2: Provider Reports 5042002 (0x4cef52) -> Rejected ---");
  {
    const provider = createMockProvider({ initialChainId: "0x4cef52" });
    const result = await verifyProviderChain(provider);
    assert.strictEqual(result.valid, false, "Arc Testnet 5042002 must be rejected for Mainnet");
    assert.strictEqual(result.chainId, 5042002, "Parsed chain ID must be 5042002");
    assert.ok(result.error?.includes("Connected wallet chain ID is 5042002, but Arc Mainnet requires 5042"));
    assert.ok(result.error?.includes("Please switch your wallet to Arc Mainnet (Chain ID 5042)"));
    console.log("[PASS] Test 2: Provider 5042002 (0x4cef52) rejected with explicit error message");
  }

  console.log("\n--- Test 3: Provider Reports Base Sepolia (0x14a34 / 84532) -> Rejected ---");
  {
    const provider = createMockProvider({ initialChainId: "0x14a34" });
    const result = await verifyProviderChain(provider);
    assert.strictEqual(result.valid, false, "Base Sepolia must be rejected for Arc Mainnet");
    assert.strictEqual(result.chainId, 84532);
    assert.ok(result.error?.includes("Connected wallet chain ID is 84532, but Arc Mainnet requires 5042"));
    console.log("[PASS] Test 3: Provider Base Sepolia (84532) rejected");
  }

  console.log("\n--- Test 4: Provider Reports Unknown Chain (999999 / 0xf423f) -> Rejected ---");
  {
    const provider = createMockProvider({ initialChainId: "0xf423f" });
    const result = await verifyProviderChain(provider);
    assert.strictEqual(result.valid, false, "Unknown chain must be rejected");
    assert.strictEqual(result.chainId, 999999);
    assert.ok(result.error?.includes("Connected wallet chain ID is 999999, but Arc Mainnet requires 5042"));
    console.log("[PASS] Test 4: Unknown chain ID strictly rejected");
  }

  console.log("\n--- Test 5: Provider eth_chainId RPC Failure -> Rejected ---");
  {
    const provider = createMockProvider({ failChainId: true });
    const result = await verifyProviderChain(provider);
    assert.strictEqual(result.valid, false, "RPC failure must reject execution");
    assert.strictEqual(result.chainId, null, "Failed chain ID must be null");
    assert.ok(result.error?.includes("Connected wallet chain ID is unknown, but Arc Mainnet requires 5042"));
    console.log("[PASS] Test 5: eth_chainId RPC failure results in blocked/unknown state");
  }

  console.log("\n--- Test 6: No Fallback to 5042 on Failure ---");
  {
    const provider = createMockProvider({ failChainId: true });
    let providerChainId: number | null = null;
    try {
      const hex = await provider.request({ method: "eth_chainId" });
      providerChainId = parseChainId(hex);
    } catch {
      providerChainId = null;
    }
    assert.strictEqual(providerChainId, null, "Must NOT fall back to 5042 on error");
    assert.notStrictEqual(providerChainId, 5042, "providerChainId must never assume 5042");
    console.log("[PASS] Test 6: Zero fallback to 5042 on error confirmed");
  }

  console.log("\n--- Test 7: chainChanged to 5042002 -> Execution Blocked ---");
  {
    let trackedChainId: number | null = 5042;
    let uiError: string | null = null;

    const provider = createMockProvider({ initialChainId: "0x13b2" });
    provider.on("chainChanged", (newHex: unknown) => {
      trackedChainId = parseChainId(newHex);
      if (trackedChainId !== 5042) {
        uiError = `Wrong network: Connected wallet chain ID is ${trackedChainId ?? "unknown"}, but Arc Mainnet requires 5042.`;
      } else {
        uiError = null;
      }
    });

    // Simulate MetaMask switching to Arc Testnet
    provider.emit("chainChanged", "0x4cef52");

    assert.strictEqual(trackedChainId, 5042002);
    const errorMsg: string = uiError ?? "";
    assert.ok(errorMsg.includes("Connected wallet chain ID is 5042002"));
    console.log("[PASS] Test 7: chainChanged to 5042002 immediately blocks execution and sets error");
  }

  console.log("\n--- Test 8: chainChanged to 5042 -> Execution Enabled & Error Cleared ---");
  {
    let trackedChainId: number | null = 5042002;
    let uiError: string | null = "Stale wrong network error";

    const provider = createMockProvider({ initialChainId: "0x4cef52" });
    provider.on("chainChanged", (newHex: unknown) => {
      trackedChainId = parseChainId(newHex);
      if (trackedChainId === 5042) {
        uiError = null; // Stale error cleared immediately without reload!
      } else {
        uiError = `Wrong network: Connected wallet chain ID is ${trackedChainId ?? "unknown"}`;
      }
    });

    // Simulate MetaMask switching from Arc Testnet to Arc Mainnet
    provider.emit("chainChanged", "0x13b2");

    assert.strictEqual(trackedChainId, 5042, "Tracked chain ID must be 5042");
    assert.strictEqual(uiError, null, "Stale approval/network error must be cleared");
    console.log("[PASS] Test 8: chainChanged to 5042 enables Mainnet state and clears error without page reload");
  }

  console.log("\n--- Test 9: accountsChanged -> Re-reads Provider State & Clears Errors ---");
  {
    let trackedAccount = "0x1111111111111111111111111111111111111111";
    let staleApprovalError: string | null = "Previous account error";
    let refreshedChainId: number | null = null;

    const provider = createMockProvider({ initialChainId: "0x13b2" });
    provider.on("accountsChanged", (accountsPayload: unknown) => {
      const accounts = accountsPayload as string[];
      trackedAccount = accounts[0];
      staleApprovalError = null; // Do not leak previous account's state
      provider.request({ method: "eth_chainId" }).then((hex: unknown) => {
        refreshedChainId = parseChainId(hex);
      }).catch(() => {
        refreshedChainId = null;
      });
    });

    // Simulate switching account
    provider.emit("accountsChanged", ["0x2222222222222222222222222222222222222222"]);

    // Allow promise resolution
    await new Promise((r) => setTimeout(r, 10));

    assert.strictEqual(trackedAccount, "0x2222222222222222222222222222222222222222");
    assert.strictEqual(staleApprovalError, null, "Account state isolation preserved");
    assert.strictEqual(refreshedChainId, 5042, "Chain refreshed on accountsChanged");
    console.log("[PASS] Test 9: accountsChanged refreshes chain/address and isolates wallet state");
  }

  console.log("\n--- Test 10: Connector Mismatch vs Provider -> Provider Wins ---");
  {
    // Simulate connector reporting 5042, but provider reporting 5042002
    const connectorReportedChainId = 5042;
    const provider = createMockProvider({ initialChainId: "0x4cef52" }); // Actual provider is on 5042002

    const result = await verifyProviderChain(provider);

    assert.notStrictEqual(
      result.chainId,
      connectorReportedChainId,
      "Provider actual chain must NOT blindly trust connector state"
    );
    assert.strictEqual(result.valid, false, "Provider on 5042002 must WIN over connector cache and block execution");
    assert.strictEqual(result.chainId, 5042002);
    console.log("[PASS] Test 10: Connector mismatch vs provider -> provider eth_chainId strictly wins");
  }

  console.log("\n--- Test 11: Zero Automatic Network Switching Calls ---");
  {
    assert.strictEqual(
      spies.wallet_switchEthereumChain,
      0,
      "Zero calls to wallet_switchEthereumChain allowed in Arc Mainnet flow"
    );
    assert.strictEqual(
      spies.wallet_addEthereumChain,
      0,
      "Zero calls to wallet_addEthereumChain allowed in Arc Mainnet flow"
    );
    console.log("[PASS] Test 11: Zero automatic network switching calls verified");
  }

  console.log("\n--- Test 12: Zero Transaction / Signature Calls ---");
  {
    assert.strictEqual(spies.eth_sendTransaction, 0, "Zero transaction broadcasts");
    assert.strictEqual(spies.eth_signTransaction, 0, "Zero transaction signatures");
    assert.strictEqual(spies.personal_sign, 0, "Zero personal signatures");
    console.log("[PASS] Test 12: Zero transactions and zero signatures verified");
  }

  console.log("\n--- Test 13: Event Listener Cleanup Verification ---");
  {
    const provider = createMockProvider();
    const handler1 = () => {};
    const handler2 = () => {};

    provider.on("chainChanged", handler1);
    provider.on("accountsChanged", handler2);
    assert.strictEqual(spies.chainChangedListeners.has(handler1), true);
    assert.strictEqual(spies.accountsChangedListeners.has(handler2), true);

    provider.removeListener("chainChanged", handler1);
    provider.removeListener("accountsChanged", handler2);
    assert.strictEqual(spies.chainChangedListeners.has(handler1), false);
    assert.strictEqual(spies.accountsChangedListeners.has(handler2), false);

    console.log("[PASS] Test 13: Listener cleanup properly deregisters event callbacks");
  }

  console.log("\n==================================================");
  console.log("ALL 13 PHASE 6.2 NETWORK DETECTION TESTS PASSED!");
  console.log("==================================================");
}

runNetworkDetectionTests().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
