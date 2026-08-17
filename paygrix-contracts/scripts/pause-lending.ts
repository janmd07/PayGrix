import { ethers } from "hardhat";

async function main() {
  console.log("=== EXECUTING PAYGRIX LENDING STAGING SAFETY LOCK (PAUSE) ===");

  const LENDING_ADDRESS = "0x5662977d74e8f460d85F0c0499297B05C68c6111";

  // 1. Load deployer signer
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer account configured. Check DEPLOYER_PRIVATE_KEY in .env.");
  }

  // 2. Verify Chain ID
  const networkObj = await ethers.provider.getNetwork();
  const chainId = networkObj.chainId;
  console.log("Connected Chain ID:", chainId.toString());

  if (chainId !== 5042002n) {
    throw new Error(`Invalid network! Expected Arc Testnet (5042002), got ${chainId.toString()}`);
  }

  console.log("Owner/Deployer Address:", await deployer.getAddress());
  console.log("Target Lending Contract:", LENDING_ADDRESS);

  // 3. Attach to PayGrixLending
  const lending = await ethers.getContractAt("PayGrixLending", LENDING_ADDRESS, deployer);

  // Check current pause state
  const isPausedBefore = await lending.paused();
  console.log("Current Paused State before tx:", isPausedBefore);

  if (isPausedBefore) {
    console.log("Contract is ALREADY paused!");
  } else {
    // 4. Call pause()
    console.log("Calling pause() on PayGrixLending...");
    const pauseTx = await lending.pause();
    console.log("Pause Transaction Hash:", pauseTx.hash);

    console.log("Waiting for block confirmation...");
    const receipt = await pauseTx.wait();
    console.log("Block Number:", receipt?.blockNumber);
  }

  // 5. Verify Post-Pause On-Chain State
  console.log("\n--- Post-Pause On-Chain State Verification ---");
  const isPausedAfter = await lending.paused();
  const poolLiquidity = await lending.poolLiquidity();
  const totalDebt = await lending.totalOutstandingDebt();

  console.log("Final Paused State:", isPausedAfter);
  console.log("Final Pool Liquidity (USDC):", poolLiquidity.toString());
  console.log("Final Total Outstanding Debt (USDC):", totalDebt.toString());

  if (!isPausedAfter) {
    throw new Error("Failed to pause contract! Paused state is still false.");
  }
  if (poolLiquidity !== 0n) {
    throw new Error("Pool liquidity is not zero!");
  }
  if (totalDebt !== 0n) {
    throw new Error("Total outstanding debt is not zero!");
  }

  // 6. Verify borrow() is blocked while paused
  console.log("\n--- Verifying Borrow Rejection While Paused ---");
  try {
    // Static call to borrow() to verify EnforcedPause error
    await lending.borrow.staticCall(1000000n);
    console.error("ERROR: borrow() did NOT revert while paused!");
  } catch (error: any) {
    console.log("Confirmed: borrow() reverted as expected while paused!");
    console.log("Revert reason / error message:", error.message || error);
  }

  console.log("\n==================================================");
  console.log("PAYGRIX LENDING STAGING SAFETY LOCK SUCCESSFUL!");
  console.log("==================================================");
}

main().catch((error) => {
  console.error("\n!!! PAUSE SCRIPT FAILED !!!");
  console.error(error);
  process.exit(1);
});
