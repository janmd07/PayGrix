import { describe, it, expect } from "vitest";

interface BaseVaultState {
  totalReserves: bigint;
  userBalances: Map<string, bigint>;
}

interface GenlayerState {
  totalSupply: bigint;
  balances: Map<string, bigint>;
  processedBridgeIds: Set<string>;
  processedBurnIds: Set<string>;
}

class CrossChainBridgeSimulator {
  baseVault: BaseVaultState = {
    totalReserves: 0n,
    userBalances: new Map(),
  };

  genlayer: GenlayerState = {
    totalSupply: 0n,
    balances: new Map(),
    processedBridgeIds: new Set(),
    processedBurnIds: new Set(),
  };

  processedReleases: Set<string> = new Set();

  constructor() {
    this.baseVault.userBalances.set("0xBaseUser".toLowerCase(), 100_000_000n);
  }

  lockBaseUSDC(user: string, recipientGen: string, rawAmount: bigint, nonce: number): { bridgeId: string; amount: bigint } {
    const userClean = user.toLowerCase();
    const currentBal = this.baseVault.userBalances.get(userClean) || 0n;
    if (currentBal < rawAmount) throw new Error("Insufficient Base USDC");

    this.baseVault.userBalances.set(userClean, currentBal - rawAmount);
    this.baseVault.totalReserves += rawAmount;

    // Harmonized Chain IDs: 84532 -> 4221
    const bridgeId = `BRIDGE_84532_4221_${userClean}_${recipientGen.toLowerCase()}_${rawAmount}_${nonce}`;
    return { bridgeId, amount: rawAmount };
  }

  relayAndMintToGenlayer(bridgeId: string, recipientGen: string, rawAmount: bigint, attesters: string[]): void {
    if (attesters.length < 2) throw new Error("Insufficient attester signatures (threshold 2 required)");
    if (this.genlayer.processedBridgeIds.has(bridgeId)) {
      throw new Error("Bridge ID replay rejected");
    }

    this.genlayer.processedBridgeIds.add(bridgeId);
    const recClean = recipientGen.toLowerCase();
    const currentBal = this.genlayer.balances.get(recClean) || 0n;

    this.genlayer.balances.set(recClean, currentBal + rawAmount);
    this.genlayer.totalSupply += rawAmount;
  }

  burnGenlayerPUSDC(userGen: string, recipientBase: string, rawAmount: bigint, nonce: number): { burnId: string; amount: bigint } {
    const userClean = userGen.toLowerCase();
    const currentBal = this.genlayer.balances.get(userClean) || 0n;
    if (currentBal < rawAmount) throw new Error("Insufficient pUSDC");

    this.genlayer.balances.set(userClean, currentBal - rawAmount);
    this.genlayer.totalSupply -= rawAmount;

    // Harmonized Chain IDs: 4221 -> 84532
    const burnId = `BURN_4221_84532_${userClean}_${recipientBase.toLowerCase()}_${rawAmount}_${nonce}`;
    return { burnId, amount: rawAmount };
  }

  relayAndReleaseOnBase(burnId: string, recipientBase: string, rawAmount: bigint, signatures: string[]): void {
    if (signatures.length < 2) throw new Error("Insufficient validator signatures");
    if (this.processedReleases.has(burnId)) {
      throw new Error("Burn ID replay rejected");
    }

    if (this.baseVault.totalReserves < rawAmount) {
      throw new Error("Insufficient vault reserves");
    }

    this.processedReleases.add(burnId);
    this.baseVault.totalReserves -= rawAmount;

    const recClean = recipientBase.toLowerCase();
    const currentBal = this.baseVault.userBalances.get(recClean) || 0n;
    this.baseVault.userBalances.set(recClean, currentBal + rawAmount);
  }
}

describe("PayGrix Cross-Chain Bridge - Authenticated E2E Lifecycle Dry Run", () => {
  const attesters = ["0xattester1", "0xattester2"];
  const signers = ["0xsigner1", "0xsigner2"];

  it("should complete a full forward and reverse bridge lifecycle for 5 USDC with exact 1:1 balance integrity", () => {
    const sim = new CrossChainBridgeSimulator();
    const baseUser = "0xBaseUser";
    const genUser = "0xGenUser";

    // Initial check
    expect(sim.baseVault.userBalances.get(baseUser.toLowerCase())).toBe(100_000_000n);
    expect(sim.genlayer.balances.get(genUser.toLowerCase()) || 0n).toBe(0n);

    // Forward Bridge: 5 USDC (5,000,000 units)
    const forwardAmount = 5_000_000n;
    const lockResult = sim.lockBaseUSDC(baseUser, genUser, forwardAmount, 1);
    expect(lockResult.amount).toBe(5_000_000n);
    expect(sim.baseVault.userBalances.get(baseUser.toLowerCase())).toBe(95_000_000n);
    expect(sim.baseVault.totalReserves).toBe(5_000_000n);

    // Relaying & Multi-attestation to GenLayer
    sim.relayAndMintToGenlayer(lockResult.bridgeId, genUser, lockResult.amount, attesters);
    expect(sim.genlayer.balances.get(genUser.toLowerCase())).toBe(5_000_000n);
    expect(sim.genlayer.totalSupply).toBe(5_000_000n);

    // Replay attempt must revert
    expect(() => {
      sim.relayAndMintToGenlayer(lockResult.bridgeId, genUser, lockResult.amount, attesters);
    }).toThrow("Bridge ID replay rejected");

    // Reverse Bridge: 5 pUSDC back to Base
    const reverseAmount = 5_000_000n;
    const burnResult = sim.burnGenlayerPUSDC(genUser, baseUser, reverseAmount, 1);
    expect(sim.genlayer.balances.get(genUser.toLowerCase())).toBe(0n);
    expect(sim.genlayer.totalSupply).toBe(0n);

    // Relaying burn release to Base with multi-signatures
    sim.relayAndReleaseOnBase(burnResult.burnId, baseUser, burnResult.amount, signers);
    expect(sim.baseVault.userBalances.get(baseUser.toLowerCase())).toBe(100_000_000n);
    expect(sim.baseVault.totalReserves).toBe(0n);

    // Replay attempt must revert
    expect(() => {
      sim.relayAndReleaseOnBase(burnResult.burnId, baseUser, burnResult.amount, signers);
    }).toThrow("Burn ID replay rejected");
  });

  it("should support variable user amounts: 1 USDC, 10 USDC, 25.5 USDC without any predetermined limit", () => {
    const sim = new CrossChainBridgeSimulator();
    const baseUser = "0xBaseUser";
    const genUser = "0xGenUser";

    // 1 USDC
    const lock1 = sim.lockBaseUSDC(baseUser, genUser, 1_000_000n, 1);
    sim.relayAndMintToGenlayer(lock1.bridgeId, genUser, 1_000_000n, attesters);
    expect(sim.genlayer.balances.get(genUser.toLowerCase())).toBe(1_000_000n);

    // 10 USDC
    const lock10 = sim.lockBaseUSDC(baseUser, genUser, 10_000_000n, 2);
    sim.relayAndMintToGenlayer(lock10.bridgeId, genUser, 10_000_000n, attesters);
    expect(sim.genlayer.balances.get(genUser.toLowerCase())).toBe(11_000_000n);

    // 25.5 USDC
    const lock25 = sim.lockBaseUSDC(baseUser, genUser, 25_500_000n, 3);
    sim.relayAndMintToGenlayer(lock25.bridgeId, genUser, 25_500_000n, attesters);
    expect(sim.genlayer.balances.get(genUser.toLowerCase())).toBe(36_500_000n);
    expect(sim.genlayer.totalSupply).toBe(36_500_000n);
  });
});
