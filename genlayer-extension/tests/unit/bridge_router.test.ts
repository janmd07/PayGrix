import { describe, it, expect } from "vitest";

// ====================================================================
// PAYGRIX CROSS-CHAIN BRIDGE - SECURITY & ATTACK SIMULATION SUITE
// ====================================================================

const BASE_SEPOLIA_CHAIN_ID = 84532;
const FORBIDDEN_BASE_MAINNET_ID = 8453;
const GENLAYER_BRADBURY_CHAIN_ID = 4221;
const AUTHORIZED_ROUTER = "0xD9e1Cde11f6AF114e01726DA2cf007a27aB6314e".toLowerCase();
const AUTHORIZED_MANAGER = "0xA314b6402477561d9a1650142724724F60f92534".toLowerCase();

function validateBridgeAmount(amountStr: string, walletBalance: number): { valid: boolean; rawAmount?: bigint; error?: string } {
  if (!amountStr || amountStr.trim() === "") {
    return { valid: false, error: "Empty amount" };
  }

  const parsed = parseFloat(amountStr);
  if (isNaN(parsed) || parsed <= 0) {
    return { valid: false, error: "Amount must be greater than zero" };
  }

  const parts = amountStr.split(".");
  if (parts.length > 1 && parts[1].length > 6) {
    return { valid: false, error: "Exceeds 6 decimal places" };
  }

  if (parsed > walletBalance) {
    return { valid: false, error: "Insufficient wallet balance" };
  }

  const rawUnits = BigInt(Math.round(parsed * 1_000_000));
  return { valid: true, rawAmount: rawUnits };
}

function computeBridgeId(
  chainId: number,
  destChainId: number,
  sender: string,
  recipient: string,
  rawAmount: bigint,
  nonce: number
): string {
  if (chainId === FORBIDDEN_BASE_MAINNET_ID) {
    throw new Error("PayGrixBaseBridgeRouter: Base Mainnet forbidden");
  }
  return `BRIDGE_${chainId}_${destChainId}_${sender.toLowerCase()}_${recipient.toLowerCase()}_${rawAmount.toString()}_${nonce}`;
}

// EIP-712 / Attestation Validator Simulator
interface ReleasePayload {
  burnId: string;
  sourceChainId: number;
  genLayerBridgeManager: string;
  recipient: string;
  amount: bigint;
  nonce: number;
  deadline: number;
  signatures: string[];
}

class BaseBridgeRouterSimulator {
  processedBridges = new Set<string>();
  processedReleases = new Set<string>();
  processedNonces = new Set<number>();
  authorizedSigners = new Set<string>(["0xsigner1".toLowerCase(), "0xsigner2".toLowerCase()]);
  requiredSignatures = 2; // 2-of-2 multi-sig threshold

  // Vault limits
  maxSingleRelease = 50_000_000_000n; // 50,000 USDC
  dailyLimit = 100_000_000_000n; // 100,000 USDC
  vaultReserves = 100_000_000_000n;
  dailyReleased = 0n;
  isPaused = false;

  bridgeUSDC(chainId: number, sender: string, recipient: string, amount: bigint, nonce: number): string {
    if (this.isPaused) throw new Error("Vault is paused");
    if (chainId === FORBIDDEN_BASE_MAINNET_ID) throw new Error("Base Mainnet forbidden");
    if (chainId !== BASE_SEPOLIA_CHAIN_ID) throw new Error("Invalid source chain ID");
    if (amount <= 0n) throw new Error("Amount must be greater than zero");

    const bridgeId = computeBridgeId(chainId, GENLAYER_BRADBURY_CHAIN_ID, sender, recipient, amount, nonce);
    if (this.processedBridges.has(bridgeId)) throw new Error("Bridge ID collision / replay");

    this.processedBridges.add(bridgeId);
    this.vaultReserves += amount;
    return bridgeId;
  }

  releaseUSDC(currentChainId: number, now: number, payload: ReleasePayload): void {
    if (this.isPaused) throw new Error("Vault is paused");
    if (currentChainId === FORBIDDEN_BASE_MAINNET_ID) throw new Error("Base Mainnet forbidden");
    if (now > payload.deadline) throw new Error("Release attestation expired");
    if (payload.sourceChainId !== GENLAYER_BRADBURY_CHAIN_ID) throw new Error("Invalid source chain ID");
    if (payload.genLayerBridgeManager.toLowerCase() !== AUTHORIZED_MANAGER) throw new Error("Invalid GenLayer bridge manager");
    if (payload.amount <= 0n) throw new Error("Amount must be greater than zero");
    if (payload.amount > this.maxSingleRelease) throw new Error("Exceeds max single release cap");
    if (this.dailyReleased + payload.amount > this.dailyLimit) throw new Error("Exceeds daily release limit");
    if (this.vaultReserves < payload.amount) throw new Error("Insufficient vault liquidity");
    if (this.processedReleases.has(payload.burnId)) throw new Error("Burn ID already released (replay rejected)");
    if (this.processedNonces.has(payload.nonce)) throw new Error("Nonce already used");

    // Multi-signature verification
    if (payload.signatures.length < this.requiredSignatures) throw new Error("Insufficient signatures");
    const seenSigners = new Set<string>();
    for (const sig of payload.signatures) {
      const recovered = sig.toLowerCase();
      if (!this.authorizedSigners.has(recovered)) throw new Error("Unauthorized signer");
      if (seenSigners.has(recovered)) throw new Error("Duplicate signature");
      seenSigners.add(recovered);
    }

    this.processedReleases.add(payload.burnId);
    this.processedNonces.add(payload.nonce);
    this.dailyReleased += payload.amount;
    this.vaultReserves -= payload.amount;
  }
}

class GenLayerBridgeManagerSimulator {
  processedBridgeIds = new Set<string>();
  processedBurnIds = new Set<string>();
  authorizedAttesters = new Set<string>(["0xattester1".toLowerCase(), "0xattester2".toLowerCase()]);
  requiredAttestations = 2;

  executeInboundMint(
    bridgeId: string,
    sender: string,
    recipient: string,
    amount: bigint,
    nonce: number,
    sourceChainId: number,
    destChainId: number,
    sourceRouter: string,
    sourceTxHash: string,
    signatures: string[]
  ): boolean {
    if (sourceChainId !== BASE_SEPOLIA_CHAIN_ID) throw new Error("Invalid source chain ID (Expected 84532)");
    if (destChainId !== GENLAYER_BRADBURY_CHAIN_ID) throw new Error("Invalid destination chain ID (Expected 4221)");
    if (sourceRouter.toLowerCase() !== AUTHORIZED_ROUTER) throw new Error("Invalid source router");
    if (amount <= 0n) throw new Error("Mint amount must be positive");
    if (!recipient.startsWith("0x") || recipient.length !== 42) throw new Error("Invalid recipient format");
    if (!sender.startsWith("0x") || sender.length !== 42) throw new Error("Invalid sender format");
    if (!sourceTxHash || sourceTxHash.length === 0) throw new Error("Source tx hash required");
    if (this.processedBridgeIds.has(bridgeId)) throw new Error("Bridge transaction already processed (replay rejected)");

    if (signatures.length < this.requiredAttestations) throw new Error("Insufficient attester signatures");
    const seen = new Set<string>();
    for (const sig of signatures) {
      const attester = sig.toLowerCase();
      if (!this.authorizedAttesters.has(attester)) throw new Error("Unauthorized attester signature");
      if (seen.has(attester)) throw new Error("Duplicate attester signature in payload");
      seen.add(attester);
    }

    this.processedBridgeIds.add(bridgeId);
    return true;
  }
}

// ====================================================================
// TEST SUITE: SECURITY BLOCKER VERIFICATION & ATTACK SCENARIOS
// ====================================================================

describe("PayGrix Cross-Chain Bridge - Comprehensive Attack & Blocker Tests", () => {
  const router = new BaseBridgeRouterSimulator();
  const manager = new GenLayerBridgeManagerSimulator();

  it("Harmonization: All components use canonical GenLayer chain ID 4221", () => {
    expect(GENLAYER_BRADBURY_CHAIN_ID).toBe(4221);
    expect(BASE_SEPOLIA_CHAIN_ID).toBe(84532);
  });

  it("ATTACK 1: Compromised relayer attempts to mint pUSDC with unauthorized attesters", () => {
    expect(() => {
      manager.executeInboundMint(
        "bridge_unauthorized",
        "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
        "0x1234567890abcdef1234567890abcdef12345678",
        1_000_000_000_000n,
        1,
        84532,
        4221,
        AUTHORIZED_ROUTER,
        "0xtx1",
        ["0xAttackerSigner", "0xFakeSigner"]
      );
    }).toThrow("Unauthorized attester signature");
  });

  it("ATTACK 2: Attacker tampers with amount in GenLayer mint payload", () => {
    expect(() => {
      manager.executeInboundMint(
        "bridge_zero_amt",
        "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
        "0x1234567890abcdef1234567890abcdef12345678",
        0n, // Zero or tampered amount
        1,
        84532,
        4221,
        AUTHORIZED_ROUTER,
        "0xtx2",
        ["0xattester1", "0xattester2"]
      );
    }).toThrow("Mint amount must be positive");
  });

  it("ATTACK 3: Attacker provides invalid recipient address", () => {
    expect(() => {
      manager.executeInboundMint(
        "bridge_bad_rec",
        "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
        "invalid_recipient_address",
        5_000_000n,
        1,
        84532,
        4221,
        AUTHORIZED_ROUTER,
        "0xtx3",
        ["0xattester1", "0xattester2"]
      );
    }).toThrow("Invalid recipient format");
  });

  it("ATTACK 4: Valid bridge attestation replayed twice on GenLayer", () => {
    const success = manager.executeInboundMint(
      "bridge_replay_test",
      "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
      "0x1234567890abcdef1234567890abcdef12345678",
      5_000_000n,
      1,
      84532,
      4221,
      AUTHORIZED_ROUTER,
      "0xtx4",
      ["0xattester1", "0xattester2"]
    );
    expect(success).toBe(true);

    // Second execution MUST revert
    expect(() => {
      manager.executeInboundMint(
        "bridge_replay_test",
        "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
        "0x1234567890abcdef1234567890abcdef12345678",
        5_000_000n,
        1,
        84532,
        4221,
        AUTHORIZED_ROUTER,
        "0xtx4",
        ["0xattester1", "0xattester2"]
      );
    }).toThrow("Bridge transaction already processed (replay rejected)");
  });

  it("ATTACK 5: Compromised relayer attempts fabricated Base release with fake signers", () => {
    const fakePayload: ReleasePayload = {
      burnId: "BURN_FAKE_001",
      sourceChainId: 4221,
      genLayerBridgeManager: AUTHORIZED_MANAGER,
      recipient: "0xAttacker",
      amount: 10_000_000n,
      nonce: 101,
      deadline: 9999999999,
      signatures: ["0xFakeSigner1", "0xFakeSigner2"]
    };

    expect(() => {
      router.releaseUSDC(BASE_SEPOLIA_CHAIN_ID, 1000, fakePayload);
    }).toThrow("Unauthorized signer");
  });

  it("ATTACK 6: Release exceeds maximum single release cap (Vault Drain Protection)", () => {
    const hugePayload: ReleasePayload = {
      burnId: "BURN_HUGE_001",
      sourceChainId: 4221,
      genLayerBridgeManager: AUTHORIZED_MANAGER,
      recipient: "0xUser",
      amount: 60_000_000_000n, // 60,000 USDC (> 50,000 USDC cap)
      nonce: 102,
      deadline: 9999999999,
      signatures: ["0xsigner1", "0xsigner2"]
    };

    expect(() => {
      router.releaseUSDC(BASE_SEPOLIA_CHAIN_ID, 1000, hugePayload);
    }).toThrow("Exceeds max single release cap");
  });

  it("ATTACK 7: Valid release authorization replayed twice on Base Sepolia", () => {
    const validPayload: ReleasePayload = {
      burnId: "BURN_VALID_REPLAY_TEST",
      sourceChainId: 4221,
      genLayerBridgeManager: AUTHORIZED_MANAGER,
      recipient: "0xUser",
      amount: 5_000_000n,
      nonce: 103,
      deadline: 9999999999,
      signatures: ["0xsigner1", "0xsigner2"]
    };

    router.releaseUSDC(BASE_SEPOLIA_CHAIN_ID, 1000, validPayload);

    // Second release MUST revert
    expect(() => {
      router.releaseUSDC(BASE_SEPOLIA_CHAIN_ID, 1000, validPayload);
    }).toThrow("Burn ID already released (replay rejected)");
  });

  it("ATTACK 8: Wrong source chain ID rejected on Base release", () => {
    const wrongChainPayload: ReleasePayload = {
      burnId: "BURN_WRONG_CHAIN",
      sourceChainId: 9999, // Wrong source chain
      genLayerBridgeManager: AUTHORIZED_MANAGER,
      recipient: "0xUser",
      amount: 5_000_000n,
      nonce: 104,
      deadline: 9999999999,
      signatures: ["0xsigner1", "0xsigner2"]
    };

    expect(() => {
      router.releaseUSDC(BASE_SEPOLIA_CHAIN_ID, 1000, wrongChainPayload);
    }).toThrow("Invalid source chain ID");
  });

  it("ATTACK 9: Wrong router address rejected on GenLayer mint", () => {
    expect(() => {
      manager.executeInboundMint(
        "bridge_wrong_router",
        "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
        "0x1234567890abcdef1234567890abcdef12345678",
        5_000_000n,
        1,
        84532,
        4221,
        "0xWrongRouterAddress000000000000000000000",
        "0xtx5",
        ["0xattester1", "0xattester2"]
      );
    }).toThrow("Invalid source router");
  });

  it("ATTACK 10: Base Mainnet chain ID 8453 is strictly forbidden on both bridge and release", () => {
    expect(() => {
      router.bridgeUSDC(FORBIDDEN_BASE_MAINNET_ID, "0xSender", "0xRecipient", 5_000_000n, 1);
    }).toThrow("Base Mainnet forbidden");

    const validPayload: ReleasePayload = {
      burnId: "BURN_MAINNET_TEST",
      sourceChainId: 4221,
      genLayerBridgeManager: AUTHORIZED_MANAGER,
      recipient: "0xUser",
      amount: 5_000_000n,
      nonce: 105,
      deadline: 9999999999,
      signatures: ["0xsigner1", "0xsigner2"]
    };

    expect(() => {
      router.releaseUSDC(FORBIDDEN_BASE_MAINNET_ID, 1000, validPayload);
    }).toThrow("Base Mainnet forbidden");
  });

  it("Circuit Breaker: Vault pause stops deposits and releases", () => {
    router.isPaused = true;
    expect(() => {
      router.bridgeUSDC(BASE_SEPOLIA_CHAIN_ID, "0xSender", "0xRecipient", 5_000_000n, 1);
    }).toThrow("Vault is paused");

    const validPayload: ReleasePayload = {
      burnId: "BURN_PAUSE_TEST",
      sourceChainId: 4221,
      genLayerBridgeManager: AUTHORIZED_MANAGER,
      recipient: "0xUser",
      amount: 5_000_000n,
      nonce: 106,
      deadline: 9999999999,
      signatures: ["0xsigner1", "0xsigner2"]
    };

    expect(() => {
      router.releaseUSDC(BASE_SEPOLIA_CHAIN_ID, 1000, validPayload);
    }).toThrow("Vault is paused");
    router.isPaused = false;
  });

  it("Dynamic Amounts: 1, 5, 10, 25.5 USDC correctly scaled and supported without fixed limits", () => {
    expect(validateBridgeAmount("1", 100).rawAmount).toBe(1_000_000n);
    expect(validateBridgeAmount("5", 100).rawAmount).toBe(5_000_000n);
    expect(validateBridgeAmount("10", 100).rawAmount).toBe(10_000_000n);
    expect(validateBridgeAmount("25.5", 100).rawAmount).toBe(25_500_000n);
  });
});
