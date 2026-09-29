import { ensureWalletNetwork, parseChainId, type MinimalEIP1193Provider } from "../src/lib/network-switch.ts";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ TEST FAILED: ${message}`);
    process.exit(1);
  }
}

/**
 * Mock EIP-1193 provider factory
 */
function createMockProvider(initialChainId: number, options?: {
  rejectSwitch?: boolean;
  unrecognizedChain?: boolean;
  switchTargetChainId?: number;
}) {
  let currentChainId = initialChainId;
  const recordedCalls: Array<{ method: string; params?: unknown[] }> = [];

  const provider: MinimalEIP1193Provider = {
    async request({ method, params }: { method: string; params?: unknown[] }) {
      recordedCalls.push({ method, params });

      if (method === "eth_chainId") {
        return `0x${currentChainId.toString(16)}`;
      }

      if (method === "wallet_switchEthereumChain") {
        if (options?.rejectSwitch) {
          const err = new Error("User rejected the request.");
          (err as unknown as { code: number }).code = 4001;
          throw err;
        }

        if (options?.unrecognizedChain) {
          const err = new Error("Unrecognized chain ID.");
          (err as unknown as { code: number }).code = 4902;
          throw err;
        }

        const targetHex = (params?.[0] as { chainId: string })?.chainId;
        const targetId = parseInt(targetHex, 16);
        currentChainId = options?.switchTargetChainId !== undefined ? options.switchTargetChainId : targetId;
        return null;
      }

      if (method === "wallet_addEthereumChain") {
        const targetHex = (params?.[0] as { chainId: string })?.chainId;
        const targetId = parseInt(targetHex, 16);
        currentChainId = targetId;
        return null;
      }

      if (method === "eth_sendTransaction") {
        return "0xmocktxhash1234567890abcdef1234567890abcdef";
      }

      return null;
    },
  };

  return {
    provider,
    recordedCalls,
    getCurrentChainId: () => currentChainId,
  };
}

async function runTests() {
  console.log("==================================================");
  console.log("PAYGRIX NETWORK-SWITCH UX & SAFETY VERIFICATION");
  console.log("==================================================");

  // -------------------------------------------------------------
  // CASE 1: Wallet on Arc Testnet + Swap selected Base Mainnet
  // -> clicking Swap requests switch to 8453
  // -> transaction does not execute before switch
  // -------------------------------------------------------------
  console.log("\n[CASE 1] Wallet on Arc Testnet (5042002) + Swap selected Base Mainnet (8453)...");
  {
    // Subcase 1A: Switch succeeds
    const mock = createMockProvider(5042002);
    const result = await ensureWalletNetwork({
      provider: mock.provider,
      targetChainId: 8453,
    });

    assert(result.success === true, "Case 1: Switch must succeed");
    assert(result.switched === true, "Case 1: switched flag must be true");
    assert(result.chainId === 8453, "Case 1: verified chainId must be 8453");
    assert(
      mock.recordedCalls.some((c) => c.method === "wallet_switchEthereumChain" && (c.params?.[0] as { chainId: string })?.chainId === "0x2105"),
      "Case 1: wallet_switchEthereumChain must be called with 0x2105"
    );

    // Subcase 1B: User rejects switch -> transaction MUST NOT execute
    const mockRejected = createMockProvider(5042002, { rejectSwitch: true });
    let txExecuted = false;
    try {
      const rejectResult = await ensureWalletNetwork({
        provider: mockRejected.provider,
        targetChainId: 8453,
      });
      if (!rejectResult.success) {
        throw new Error(rejectResult.error);
      }
      // Simulating transaction execution if check passed
      txExecuted = true;
    } catch (err) {
      assert(!txExecuted, "Case 1B: Transaction MUST NOT execute before network switch succeeds");
    }
    assert(!txExecuted, "Case 1B: Transaction was blocked when switch was rejected");
    console.log("  ✓ Case 1 verified: switch requested to 8453, transaction blocked on rejection, succeeds when approved.");
  }

  // -------------------------------------------------------------
  // CASE 2: Wallet already on Base Mainnet + Swap selected Base Mainnet
  // -> no switch request
  // -> existing flow unchanged
  // -------------------------------------------------------------
  console.log("\n[CASE 2] Wallet already on Base Mainnet (8453) + Swap selected Base Mainnet (8453)...");
  {
    const mock = createMockProvider(8453);
    const result = await ensureWalletNetwork({
      provider: mock.provider,
      targetChainId: 8453,
    });

    assert(result.success === true, "Case 2: Must return success true");
    assert(result.switched === false, "Case 2: switched must be false (no switch needed)");
    assert(result.chainId === 8453, "Case 2: chainId must remain 8453");
    assert(
      !mock.recordedCalls.some((c) => c.method === "wallet_switchEthereumChain"),
      "Case 2: wallet_switchEthereumChain MUST NOT be called when already on correct network"
    );
    console.log("  ✓ Case 2 verified: no switch request made when already on correct network.");
  }

  // -------------------------------------------------------------
  // CASE 3: Wallet on Base Mainnet + Swap selected Arc Mainnet
  // -> switch requested to 5042
  // -------------------------------------------------------------
  console.log("\n[CASE 3] Wallet on Base Mainnet (8453) + Swap selected Arc Mainnet (5042)...");
  {
    const mock = createMockProvider(8453);
    const result = await ensureWalletNetwork({
      provider: mock.provider,
      targetChainId: 5042,
    });

    assert(result.success === true, "Case 3: Switch must succeed");
    assert(result.switched === true, "Case 3: switched must be true");
    assert(result.chainId === 5042, "Case 3: verified chainId must be 5042");
    assert(
      mock.recordedCalls.some((c) => c.method === "wallet_switchEthereumChain" && (c.params?.[0] as { chainId: string })?.chainId === "0x13b2"),
      "Case 3: wallet_switchEthereumChain must be called with 0x13b2 (Arc Mainnet)"
    );
    console.log("  ✓ Case 3 verified: switch requested to 5042.");
  }

  // -------------------------------------------------------------
  // CASE 4: Wallet on arbitrary unsupported network + Swap selected Base Sepolia
  // -> switch requested to 84532
  // -------------------------------------------------------------
  console.log("\n[CASE 4] Wallet on arbitrary network (11155111) + Swap selected Base Sepolia (84532)...");
  {
    // Subcase 4A: Normal switch
    const mock = createMockProvider(11155111);
    const result = await ensureWalletNetwork({
      provider: mock.provider,
      targetChainId: 84532,
    });

    assert(result.success === true, "Case 4: Switch must succeed");
    assert(result.switched === true, "Case 4: switched must be true");
    assert(result.chainId === 84532, "Case 4: verified chainId must be 84532");
    assert(
      mock.recordedCalls.some((c) => c.method === "wallet_switchEthereumChain" && (c.params?.[0] as { chainId: string })?.chainId === "0x14a34"),
      "Case 4: wallet_switchEthereumChain must be called with 0x14a34 (Base Sepolia)"
    );

    // Subcase 4B: Unrecognized chain (4902) prompts wallet_addEthereumChain
    const mock4902 = createMockProvider(11155111, { unrecognizedChain: true });
    const result4902 = await ensureWalletNetwork({
      provider: mock4902.provider,
      targetChainId: 84532,
    });
    assert(result4902.success === true, "Case 4B: Add chain and switch must succeed");
    assert(
      mock4902.recordedCalls.some((c) => c.method === "wallet_addEthereumChain"),
      "Case 4B: wallet_addEthereumChain must be called when 4902 encountered"
    );
    console.log("  ✓ Case 4 verified: switch requested to 84532, 4902 fallback handled seamlessly.");
  }

  // -------------------------------------------------------------
  // CASE 5: Wallet on wrong network + Bridge source selected Arc Mainnet
  // -> switch requested to 5042 before source transaction
  // -------------------------------------------------------------
  console.log("\n[CASE 5] Wallet on Base Mainnet (8453) + Bridge source Arc Mainnet (5042)...");
  {
    const mock = createMockProvider(8453);
    const result = await ensureWalletNetwork({
      provider: mock.provider,
      targetChainId: 5042,
    });

    assert(result.success === true, "Case 5: Switch must succeed");
    assert(result.switched === true, "Case 5: switched must be true");
    assert(result.chainId === 5042, "Case 5: verified chainId must be 5042");
    assert(
      mock.recordedCalls.some((c) => c.method === "wallet_switchEthereumChain" && (c.params?.[0] as { chainId: string })?.chainId === "0x13b2"),
      "Case 5: switch requested to 5042 before source bridge transaction"
    );
    console.log("  ✓ Case 5 verified: switch requested to 5042 before source transaction.");
  }

  // -------------------------------------------------------------
  // CASE 6: Wallet already on correct Bridge source network
  // -> no switch request
  // -------------------------------------------------------------
  console.log("\n[CASE 6] Wallet already on Arc Mainnet (5042) + Bridge source Arc Mainnet (5042)...");
  {
    const mock = createMockProvider(5042);
    const result = await ensureWalletNetwork({
      provider: mock.provider,
      targetChainId: 5042,
    });

    assert(result.success === true, "Case 6: Must return success true");
    assert(result.switched === false, "Case 6: switched must be false");
    assert(result.chainId === 5042, "Case 6: chainId must remain 5042");
    assert(
      !mock.recordedCalls.some((c) => c.method === "wallet_switchEthereumChain"),
      "Case 6: wallet_switchEthereumChain MUST NOT be called when already on correct source network"
    );
    console.log("  ✓ Case 6 verified: no switch request when already on correct source network.");
  }

  console.log("\n==================================================");
  console.log("ALL 6 EXACT REGRESSION CASES PASSED SUCCESSFULLY!");
  console.log("==================================================");
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
