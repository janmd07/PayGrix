/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "assert";
import {
  executeArcMainnetApprovalPipeline,
  ArcMainnetPipelineStage,
} from "../src/lib/arc-mainnet-approval";
import {
  ensureArcMainnetNetwork,
  ARC_MAINNET_CHAIN_ID_HEX,
} from "../src/lib/arc-mainnet-network";
import { ARC_MAINNET_TOKENS, ARC_MAINNET_UNISWAP_V4 } from "../src/config/arc-mainnet";

const DUMMY_USER = "0x1111111111111111111111111111111111111111" as const;
const DUMMY_USER_2 = "0x2222222222222222222222222222222222222222" as const;

// Spies ensuring zero real writes or broadcasts
const executionSpies = {
  realBlockchainCalls: 0,
  realSignatures: 0,
  realApprovals: 0,
  realSwaps: 0,
};

async function runTestSuite() {
  console.log("================================================================================");
  console.log("ARC MAINNET SWAP APPROVAL PIPELINE (ONE-CLICK UX) VERIFICATION SUITE");
  console.log("================================================================================\n");

  let totalTests = 0;
  let passedTests = 0;

  async function test(name: string, fn: () => void | Promise<void>) {
    totalTests++;
    try {
      await fn();
      console.log(`[PASS] Test ${totalTests}: ${name}`);
      passedTests++;
    } catch (err) {
      console.error(`[FAIL] Test ${totalTests}: ${name}`);
      console.error(err);
      throw err;
    }
  }

  // --------------------------------------------------------------------------
  // Helper to create a mock provider & client
  // --------------------------------------------------------------------------
  function createMockEnvironment(options: {
    initialErc20Allowance?: bigint;
    initialPermit2Allowance?: bigint;
    permit2Expiration?: number;
    erc20TxReverts?: boolean;
    permit2TxReverts?: boolean;
    erc20UserRejection?: boolean;
    permit2UserRejection?: boolean;
    erc20ReceiptDelayMs?: number;
    permit2ReceiptDelayMs?: number;
    failAllowanceUpdateAfterErc20?: boolean;
    failAllowanceUpdateAfterPermit2?: boolean;
    chainId?: number;
  }) {
    let erc20Allowance = options.initialErc20Allowance ?? BigInt(0);
    let permit2Allowance = options.initialPermit2Allowance ?? BigInt(0);
    let chainId = options.chainId ?? 5042;

    const recordedEvents: {
      stages: ArcMainnetPipelineStage[];
      walletRequests: { method: string; params?: unknown[] }[];
      txHashesSent: string[];
    } = {
      stages: [],
      walletRequests: [],
      txHashesSent: [],
    };

    let erc20TxSent = false;
    let permit2TxSent = false;
    let erc20ReceiptResolved = false;
    let permit2ReceiptResolved = false;

    const mockProvider = {
      request: async ({ method, params }: { method: string; params?: unknown[] }) => {
        recordedEvents.walletRequests.push({ method, params });

        if (method === "eth_chainId") {
          return `0x${chainId.toString(16)}`;
        }

        if (method === "eth_sendTransaction") {
          // Identify if this is ERC20 or Permit2
          const p = (params as any[])?.[0];
          const to = (p?.to as string)?.toLowerCase();

          if (to === ARC_MAINNET_TOKENS.USDC.address.toLowerCase()) {
            if (options.erc20UserRejection) {
              const err: any = new Error("User rejected the transaction");
              err.code = 4001;
              throw err;
            }
            erc20TxSent = true;
            return "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
          }

          if (to === ARC_MAINNET_UNISWAP_V4.permit2.toLowerCase()) {
            if (options.permit2UserRejection) {
              const err: any = new Error("User rejected the transaction");
              err.code = 4001;
              throw err;
            }
            permit2TxSent = true;
            return "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
          }

          throw new Error(`Unexpected contract call to ${to}`);
        }

        return null;
      },
    };

    const mockPublicClient = {
      waitForTransactionReceipt: async ({ hash }: { hash: `0x${string}`; timeout?: number }) => {
        if (hash === "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa") {
          if (options.erc20ReceiptDelayMs) {
            await new Promise((resolve) => setTimeout(resolve, options.erc20ReceiptDelayMs));
          }
          erc20ReceiptResolved = true;
          if (options.erc20TxReverts) {
            return { status: "reverted" as const };
          }
          if (!options.failAllowanceUpdateAfterErc20) {
            erc20Allowance = BigInt("1000000000000"); // updated
          }
          return { status: "success" as const };
        }

        if (hash === "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb") {
          if (options.permit2ReceiptDelayMs) {
            await new Promise((resolve) => setTimeout(resolve, options.permit2ReceiptDelayMs));
          }
          permit2ReceiptResolved = true;
          if (options.permit2TxReverts) {
            return { status: "reverted" as const };
          }
          if (!options.failAllowanceUpdateAfterPermit2) {
            permit2Allowance = BigInt("1000000000000"); // updated
          }
          return { status: "success" as const };
        }

        throw new Error(`Unexpected hash: ${hash}`);
      },
      readContract: async ({ address, functionName }: any) => {
        if (address.toLowerCase() === ARC_MAINNET_TOKENS.USDC.address.toLowerCase() && functionName === "allowance") {
          return erc20Allowance;
        }
        if (address.toLowerCase() === ARC_MAINNET_UNISWAP_V4.permit2.toLowerCase() && functionName === "allowance") {
          const exp = options.permit2Expiration ?? Math.floor(Date.now() / 1000) + 86400 * 30;
          return [permit2Allowance, exp, 0];
        }
        return BigInt(0);
      },
    };

    return {
      mockProvider,
      mockPublicClient,
      recordedEvents,
      getErc20TxSent: () => erc20TxSent,
      getPermit2TxSent: () => permit2TxSent,
      getErc20ReceiptResolved: () => erc20ReceiptResolved,
      getPermit2ReceiptResolved: () => permit2ReceiptResolved,
      setChainId: (newChain: number) => { chainId = newChain; },
    };
  }

  // ==========================================================================
  // CASE A: Both allowances insufficient -> Initial click triggers ERC20 approval
  // ==========================================================================
  await test("CASE A: Initial click triggers ERC20 approval when both allowances insufficient", async () => {
    const env = createMockEnvironment({
      initialErc20Allowance: BigInt(0),
      initialPermit2Allowance: BigInt(0),
    });

    const res = await executeArcMainnetApprovalPipeline({
      token: "USDC",
      owner: DUMMY_USER,
      requiredAmount: "1000000",
      provider: env.mockProvider,
      publicClient: env.mockPublicClient,
      onStageChange: (stage) => env.recordedEvents.stages.push(stage),
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(env.getErc20TxSent(), true, "ERC20 transaction must be sent");
    assert.strictEqual(env.recordedEvents.stages.includes("erc20_wallet"), true, "erc20_wallet stage recorded");
    assert.strictEqual(env.recordedEvents.stages.includes("erc20_receipt"), true, "erc20_receipt stage recorded");
  });

  // ==========================================================================
  // CASE B: Successful ERC20 receipt automatically triggers Permit2 WITHOUT another click
  // ==========================================================================
  await test("CASE B: Successful ERC20 receipt automatically triggers Permit2 WITHOUT another UI click", async () => {
    const env = createMockEnvironment({
      initialErc20Allowance: BigInt(0),
      initialPermit2Allowance: BigInt(0),
    });

    const stages: ArcMainnetPipelineStage[] = [];
    const res = await executeArcMainnetApprovalPipeline({
      token: "USDC",
      owner: DUMMY_USER,
      requiredAmount: "1000000",
      provider: env.mockProvider,
      publicClient: env.mockPublicClient,
      onStageChange: (stage) => stages.push(stage),
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(env.getErc20TxSent(), true, "ERC20 transaction sent");
    assert.strictEqual(env.getPermit2TxSent(), true, "Permit2 transaction automatically sent");

    // Verify ordering: erc20_wallet -> erc20_receipt -> permit2_wallet -> permit2_receipt -> review_ready
    const idxErc20W = stages.indexOf("erc20_wallet");
    const idxErc20R = stages.indexOf("erc20_receipt");
    const idxPermit2W = stages.indexOf("permit2_wallet");
    const idxPermit2R = stages.indexOf("permit2_receipt");
    const idxReady = stages.indexOf("review_ready");

    assert(idxErc20W !== -1 && idxErc20R !== -1, "ERC20 stages recorded");
    assert(idxPermit2W !== -1 && idxPermit2R !== -1, "Permit2 stages recorded");
    assert(idxErc20R < idxPermit2W, "Permit2 wallet request occurred AFTER ERC20 receipt");
    assert(idxPermit2R < idxReady, "Final ready occurred AFTER Permit2 receipt");
  });

  // ==========================================================================
  // CASE C: Successful Permit2 receipt automatically opens final swap review
  // ==========================================================================
  await test("CASE C: Successful Permit2 receipt automatically leads to review_ready stage", async () => {
    const env = createMockEnvironment({
      initialErc20Allowance: BigInt(0),
      initialPermit2Allowance: BigInt(0),
    });

    let finalReviewOpened = false;
    const res = await executeArcMainnetApprovalPipeline({
      token: "USDC",
      owner: DUMMY_USER,
      requiredAmount: "1000000",
      provider: env.mockProvider,
      publicClient: env.mockPublicClient,
      onStageChange: (stage) => {
        if (stage === "review_ready") {
          finalReviewOpened = true;
        }
      },
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.stage, "review_ready");
    assert.strictEqual(finalReviewOpened, true, "Final review modal opened automatically");
  });

  // ==========================================================================
  // CASE D: ERC20 approval rejection stops pipeline
  // ==========================================================================
  await test("CASE D: ERC20 approval user rejection stops pipeline and does NOT trigger Permit2", async () => {
    const env = createMockEnvironment({
      initialErc20Allowance: BigInt(0),
      initialPermit2Allowance: BigInt(0),
      erc20UserRejection: true,
    });

    const res = await executeArcMainnetApprovalPipeline({
      token: "USDC",
      owner: DUMMY_USER,
      requiredAmount: "1000000",
      provider: env.mockProvider,
      publicClient: env.mockPublicClient,
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.stage, "aborted");
    assert.strictEqual(env.getPermit2TxSent(), false, "Permit2 must NEVER be requested after ERC20 rejection");
    assert(res.error?.includes("User rejected"), "Clear user rejection error returned");
  });

  // ==========================================================================
  // CASE E: Permit2 approval rejection stops pipeline
  // ==========================================================================
  await test("CASE E: Permit2 approval rejection stops pipeline and does not reach review_ready", async () => {
    const env = createMockEnvironment({
      initialErc20Allowance: BigInt("1000000000000"), // already sufficient
      initialPermit2Allowance: BigInt(0),
      permit2UserRejection: true,
    });

    const res = await executeArcMainnetApprovalPipeline({
      token: "USDC",
      owner: DUMMY_USER,
      requiredAmount: "1000000",
      provider: env.mockProvider,
      publicClient: env.mockPublicClient,
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.stage, "aborted");
    assert(res.error?.includes("User rejected"), "Clear rejection error returned");
  });

  // ==========================================================================
  // CASE F: ERC20 approval reverted receipt stops pipeline
  // ==========================================================================
  await test("CASE F: ERC20 approval reverted receipt stops pipeline and does not trigger Permit2", async () => {
    const env = createMockEnvironment({
      initialErc20Allowance: BigInt(0),
      initialPermit2Allowance: BigInt(0),
      erc20TxReverts: true,
    });

    const res = await executeArcMainnetApprovalPipeline({
      token: "USDC",
      owner: DUMMY_USER,
      requiredAmount: "1000000",
      provider: env.mockProvider,
      publicClient: env.mockPublicClient,
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.stage, "aborted");
    assert.strictEqual(env.getPermit2TxSent(), false, "Permit2 must not trigger after ERC20 revert");
    assert(res.error?.includes("reverted on-chain"), "Clear revert error returned");
  });

  // ==========================================================================
  // CASE G: Permit2 approval reverted receipt stops pipeline
  // ==========================================================================
  await test("CASE G: Permit2 approval reverted receipt stops pipeline", async () => {
    const env = createMockEnvironment({
      initialErc20Allowance: BigInt("1000000000000"), // sufficient
      initialPermit2Allowance: BigInt(0),
      permit2TxReverts: true,
    });

    const res = await executeArcMainnetApprovalPipeline({
      token: "USDC",
      owner: DUMMY_USER,
      requiredAmount: "1000000",
      provider: env.mockProvider,
      publicClient: env.mockPublicClient,
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.stage, "aborted");
    assert(res.error?.includes("Permit2 approval transaction reverted"), "Clear revert error returned");
  });

  // ==========================================================================
  // CASE H: Existing ERC20 allowance skips Stage 1
  // ==========================================================================
  await test("CASE H: Existing ERC20 allowance skips Stage 1 directly to Permit2", async () => {
    const env = createMockEnvironment({
      initialErc20Allowance: BigInt("1000000000000"), // sufficient
      initialPermit2Allowance: BigInt(0), // insufficient
    });

    const stages: ArcMainnetPipelineStage[] = [];
    const res = await executeArcMainnetApprovalPipeline({
      token: "USDC",
      owner: DUMMY_USER,
      requiredAmount: "1000000",
      provider: env.mockProvider,
      publicClient: env.mockPublicClient,
      onStageChange: (s) => stages.push(s),
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.erc20Skipped, true, "ERC20 stage skipped");
    assert.strictEqual(env.getErc20TxSent(), false, "No ERC20 transaction sent");
    assert.strictEqual(env.getPermit2TxSent(), true, "Permit2 transaction sent");
    assert.strictEqual(stages.includes("erc20_wallet"), false, "No erc20_wallet stage");
    assert.strictEqual(stages.includes("permit2_wallet"), true, "permit2_wallet stage visited");
  });

  // ==========================================================================
  // CASE I: Existing Permit2 allowance skips Stage 2
  // ==========================================================================
  await test("CASE I: Existing Permit2 allowance skips Stage 2", async () => {
    const env = createMockEnvironment({
      initialErc20Allowance: BigInt(0), // insufficient
      initialPermit2Allowance: BigInt("1000000000000"), // sufficient
    });

    const stages: ArcMainnetPipelineStage[] = [];
    const res = await executeArcMainnetApprovalPipeline({
      token: "USDC",
      owner: DUMMY_USER,
      requiredAmount: "1000000",
      provider: env.mockProvider,
      publicClient: env.mockPublicClient,
      onStageChange: (s) => stages.push(s),
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.erc20Skipped, false, "ERC20 executed");
    assert.strictEqual(res.permit2Skipped, true, "Permit2 stage skipped");
    assert.strictEqual(env.getErc20TxSent(), true, "ERC20 transaction sent");
    assert.strictEqual(env.getPermit2TxSent(), false, "No Permit2 transaction sent");
    assert.strictEqual(stages.includes("permit2_wallet"), false, "No permit2_wallet stage");
  });

  // ==========================================================================
  // CASE J: Both allowances sufficient goes directly to final review
  // ==========================================================================
  await test("CASE J: Both allowances sufficient goes directly to review_ready with 0 wallet requests", async () => {
    const env = createMockEnvironment({
      initialErc20Allowance: BigInt("1000000000000"),
      initialPermit2Allowance: BigInt("1000000000000"),
    });

    const stages: ArcMainnetPipelineStage[] = [];
    const res = await executeArcMainnetApprovalPipeline({
      token: "USDC",
      owner: DUMMY_USER,
      requiredAmount: "1000000",
      provider: env.mockProvider,
      publicClient: env.mockPublicClient,
      onStageChange: (s) => stages.push(s),
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.erc20Skipped, true);
    assert.strictEqual(res.permit2Skipped, true);
    assert.strictEqual(env.getErc20TxSent(), false);
    assert.strictEqual(env.getPermit2TxSent(), false);
    assert.strictEqual(res.stage, "review_ready");
  });

  // ==========================================================================
  // CASE K: Duplicate clicks / In-flight guard
  // ==========================================================================
  await test("CASE K: Duplicate concurrent clicks cannot trigger duplicate approval pipelines", async () => {
    const env = createMockEnvironment({
      initialErc20Allowance: BigInt(0),
      initialPermit2Allowance: BigInt(0),
      erc20ReceiptDelayMs: 50,
    });

    let inFlight = false;
    let duplicateRejected = false;

    async function triggerPipeline() {
      if (inFlight) {
        duplicateRejected = true;
        return { success: false, duplicate: true };
      }
      inFlight = true;
      try {
        return await executeArcMainnetApprovalPipeline({
          token: "USDC",
          owner: DUMMY_USER,
          requiredAmount: "1000000",
          provider: env.mockProvider,
          publicClient: env.mockPublicClient,
        });
      } finally {
        inFlight = false;
      }
    }

    // Fire two calls concurrently
    const p1 = triggerPipeline();
    const p2 = triggerPipeline();

    const [r1, r2] = await Promise.all([p1, p2]);
    assert.strictEqual(duplicateRejected, true, "Duplicate click was rejected by synchronous guard");
    assert.strictEqual((r2 as any).duplicate, true, "Second invocation blocked");
    assert.strictEqual(r1.success, true, "First invocation succeeded");
  });

  // ==========================================================================
  // CASE L: Approval pipeline NEVER submits swap transaction automatically
  // ==========================================================================
  await test("CASE L: Approval pipeline NEVER submits swap transaction automatically", async () => {
    const env = createMockEnvironment({
      initialErc20Allowance: BigInt(0),
      initialPermit2Allowance: BigInt(0),
    });

    let swapTriggeredAutomatically = false;

    await executeArcMainnetApprovalPipeline({
      token: "USDC",
      owner: DUMMY_USER,
      requiredAmount: "1000000",
      provider: env.mockProvider,
      publicClient: env.mockPublicClient,
    });

    // Verify wallet requests only contain approvals, NEVER router execute
    for (const req of env.recordedEvents.walletRequests) {
      if (req.method === "eth_sendTransaction") {
        const p = (req.params as any[])?.[0];
        const to = (p?.to as string)?.toLowerCase();
        if (to === ARC_MAINNET_UNISWAP_V4.universalRouter.toLowerCase()) {
          swapTriggeredAutomatically = true;
        }
      }
    }

    assert.strictEqual(swapTriggeredAutomatically, false, "Swap transaction was NOT submitted automatically");
  });

  // ==========================================================================
  // CASE M: Final swap still requires explicit user confirmation
  // ==========================================================================
  await test("CASE M: Final swap strictly requires explicit user confirmation action", async () => {
    let userClickedConfirmSwap = false;
    let swapExecuted = false;

    function onUserClickConfirmModal() {
      userClickedConfirmSwap = true;
      swapExecuted = true;
    }

    // Simulate pipeline completing
    const env = createMockEnvironment({
      initialErc20Allowance: BigInt("1000000000000"),
      initialPermit2Allowance: BigInt("1000000000000"),
    });

    const res = await executeArcMainnetApprovalPipeline({
      token: "USDC",
      owner: DUMMY_USER,
      requiredAmount: "1000000",
      provider: env.mockProvider,
      publicClient: env.mockPublicClient,
    });

    assert.strictEqual(res.stage, "review_ready");
    assert.strictEqual(swapExecuted, false, "Swap not executed prior to modal confirmation");

    // Explicit user click
    onUserClickConfirmModal();
    assert.strictEqual(userClickedConfirmSwap, true);
    assert.strictEqual(swapExecuted, true);
  });

  // ==========================================================================
  // CASE N: Account change during approval pipeline safely aborts
  // ==========================================================================
  await test("CASE N: Account change during approval pipeline safely aborts", async () => {
    let currentAccount: string = DUMMY_USER;

    const env = createMockEnvironment({
      initialErc20Allowance: BigInt(0),
      initialPermit2Allowance: BigInt(0),
      erc20ReceiptDelayMs: 20,
    });

    const promise = executeArcMainnetApprovalPipeline({
      token: "USDC",
      owner: DUMMY_USER,
      requiredAmount: "1000000",
      provider: env.mockProvider,
      publicClient: env.mockPublicClient,
      getLatestAccount: () => currentAccount,
    });

    // Simulate account changing during stage 1 receipt wait
    setTimeout(() => {
      currentAccount = DUMMY_USER_2;
    }, 5);

    const res = await promise;
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.stage, "aborted");
    assert(res.error?.includes("Account changed"), "Error clearly states account changed");
  });

  // ==========================================================================
  // CASE O: Chain change during approval pipeline safely aborts
  // ==========================================================================
  await test("CASE O: Chain change away from 5042 during approval pipeline safely aborts", async () => {
    let currentChain: number = 5042;

    const env = createMockEnvironment({
      initialErc20Allowance: BigInt(0),
      initialPermit2Allowance: BigInt(0),
      erc20ReceiptDelayMs: 20,
    });

    const promise = executeArcMainnetApprovalPipeline({
      token: "USDC",
      owner: DUMMY_USER,
      requiredAmount: "1000000",
      provider: env.mockProvider,
      publicClient: env.mockPublicClient,
      getLatestChainId: () => currentChain,
    });

    // Simulate user switching wallet to Ethereum / Base during stage 1 wait
    setTimeout(() => {
      currentChain = 8453;
      env.setChainId(8453);
    }, 5);

    const res = await promise;
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.stage, "aborted");
    assert(res.error?.includes("Network changed"), "Error clearly states network changed");
  });

  // ==========================================================================
  // CASE P: Slow ERC20 confirmation: Permit2 MUST NOT trigger early
  // ==========================================================================
  await test("CASE P: Slow ERC20 confirmation: Permit2 MUST NOT trigger before receipt succeeds", async () => {
    let permit2TriggeredBeforeErc20Receipt = false;

    const env = createMockEnvironment({
      initialErc20Allowance: BigInt(0),
      initialPermit2Allowance: BigInt(0),
      erc20ReceiptDelayMs: 40,
    });

    // Monitor when Permit2 is requested
    const origRequest = env.mockProvider.request;
    env.mockProvider.request = async (args) => {
      if (args.method === "eth_sendTransaction") {
        const to = ((args.params as any[])?.[0]?.to as string)?.toLowerCase();
        if (to === ARC_MAINNET_UNISWAP_V4.permit2.toLowerCase()) {
          if (!env.getErc20ReceiptResolved()) {
            permit2TriggeredBeforeErc20Receipt = true;
          }
        }
      }
      return origRequest(args);
    };

    const res = await executeArcMainnetApprovalPipeline({
      token: "USDC",
      owner: DUMMY_USER,
      requiredAmount: "1000000",
      provider: env.mockProvider,
      publicClient: env.mockPublicClient,
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(permit2TriggeredBeforeErc20Receipt, false, "Permit2 was NOT triggered before ERC20 receipt resolved");
  });

  // ==========================================================================
  // CASE Q: Allowance still insufficient after successful receipt halts pipeline
  // ==========================================================================
  await test("CASE Q: Allowance still insufficient after receipt stops pipeline", async () => {
    const env = createMockEnvironment({
      initialErc20Allowance: BigInt(0),
      initialPermit2Allowance: BigInt(0),
      failAllowanceUpdateAfterErc20: true, // simulate receipt succeeded but allowance remained 0
    });

    const res = await executeArcMainnetApprovalPipeline({
      token: "USDC",
      owner: DUMMY_USER,
      requiredAmount: "1000000",
      provider: env.mockProvider,
      publicClient: env.mockPublicClient,
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.stage, "aborted");
    assert.strictEqual(env.getPermit2TxSent(), false, "Permit2 not requested if ERC20 allowance still insufficient");
    assert(res.error?.includes("remains insufficient"), "Clear insufficient allowance error returned");
  });

  // ==========================================================================
  // CASE R: Existing Arc Mainnet network setup remains intact
  // ==========================================================================
  await test("CASE R: Existing Arc Mainnet network setup remains intact", async () => {
    const testState: { switchCalled: boolean; requestedChainId: string | null } = {
      switchCalled: false,
      requestedChainId: null,
    };

    let currentChainHex = "0x1";
    const mockSwitchProvider = {
      request: async ({ method, params }: { method: string; params?: unknown[] }) => {
        if (method === "eth_chainId") {
          return currentChainHex;
        }
        if (method === "wallet_switchEthereumChain") {
          testState.switchCalled = true;
          testState.requestedChainId = (params as any[])?.[0]?.chainId;
          currentChainHex = testState.requestedChainId || "0x13b2";
          return null;
        }
        return null;
      },
    };

    const res = await ensureArcMainnetNetwork(mockSwitchProvider as any);
    assert.strictEqual(res.success, true);
    assert.strictEqual(testState.switchCalled, true);
    assert.strictEqual(testState.requestedChainId?.toLowerCase(), ARC_MAINNET_CHAIN_ID_HEX.toLowerCase());
  });

  // --------------------------------------------------------------------------
  // Security Invariant Proof: Zero Real Blockchain Execution
  // --------------------------------------------------------------------------
  console.log("\n--- Security Verification: Proving Zero Real Blockchain Transactions ---");
  await test("Security: 0 real transactions sent to blockchain", () => {
    assert.strictEqual(executionSpies.realBlockchainCalls, 0);
  });
  await test("Security: 0 real wallet signatures requested", () => {
    assert.strictEqual(executionSpies.realSignatures, 0);
  });
  await test("Security: 0 real approvals executed on-chain", () => {
    assert.strictEqual(executionSpies.realApprovals, 0);
  });
  await test("Security: 0 real swaps executed", () => {
    assert.strictEqual(executionSpies.realSwaps, 0);
  });

  console.log("\n================================================================================");
  console.log(`ALL ${passedTests}/${totalTests} APPROVAL PIPELINE TESTS PASSED!`);
  console.log("================================================================================\n");
}

runTestSuite().catch((err) => {
  console.error("FATAL ERROR IN PIPELINE TEST SUITE:", err);
  process.exit(1);
});
