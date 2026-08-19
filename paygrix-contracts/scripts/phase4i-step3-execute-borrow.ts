import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

const CONFIG = {
  NETWORK_NAME: "Arc Testnet",
  EXPECTED_CHAIN_ID: 5042002n,
  OWNER_ADDRESS: "0xf85085b73a4Ec4efE895B532Fe1560a06ff0d179",
  PAYGRIX_LENDING_ADDRESS: "0x800Cd0a3b737e989F45E69f64eEeB118724522aE",
  PRODUCTION_ORACLE_ADAPTER: "0xA17Bfb3332A83F0e247129ee9c0d1A454A332287",
  BORROWER_ADDRESS: "0x00266374046e156d0Ce782F02505391981a53074",
  CIRBTC_ADDRESS: "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF",
  USDC_ADDRESS: "0x3600000000000000000000000000000000000000",
  
  TARGET_COLLATERAL_CIRBTC: 5_000_000n, // 0.05 cirBTC (8 decimals)
  TARGET_BORROW_USDC: 1_500_000_000n, // 1,500 USDC (6 decimals)
};

interface TxRecord {
  step: string;
  txHash: string;
  blockNumber: number;
  signer: string;
  description: string;
}

async function main() {
  console.log("================================================================");
  console.log("=== PAYGRIX LENDING PHASE 4I STEP 3: CONTROLLED BORROW TEST ===");
  console.log("================================================================");

  // Check network
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== CONFIG.EXPECTED_CHAIN_ID) {
    throw new Error(`NETWORK ERROR: Expected chain ${CONFIG.EXPECTED_CHAIN_ID}, got ${network.chainId}`);
  }

  // 1. DERIVE AND VERIFY BORROWER SIGNER
  const rawBorrowerKey = process.env.BORROWER_PRIVATE_KEY;
  if (!rawBorrowerKey) {
    throw new Error("HALT: BORROWER_PRIVATE_KEY environment variable is not set!");
  }
  const formattedBorrowerKey = rawBorrowerKey.startsWith("0x") ? rawBorrowerKey : `0x${rawBorrowerKey}`;
  const borrowerWallet = new ethers.Wallet(formattedBorrowerKey, ethers.provider);
  const derivedBorrowerAddress = await borrowerWallet.getAddress();

  console.log(`Derived Borrower Address: ${derivedBorrowerAddress}`);
  console.log(`Expected Borrower Address: ${CONFIG.BORROWER_ADDRESS}`);

  if (derivedBorrowerAddress.toLowerCase() !== CONFIG.BORROWER_ADDRESS.toLowerCase()) {
    throw new Error(`SIGNER VERIFICATION FAILURE: Derived borrower address ${derivedBorrowerAddress} != expected ${CONFIG.BORROWER_ADDRESS}. STOPPING IMMEDIATELY with 0 transactions!`);
  }
  console.log("[PASS] Borrower Signer Verification Succeeded.\n");

  // 2. DERIVE AND VERIFY OWNER SIGNER
  const rawOwnerKey = process.env.DEPLOYER_PRIVATE_KEY || process.env.OWNER_PRIVATE_KEY;
  if (!rawOwnerKey) {
    throw new Error("HALT: OWNER signer private key (DEPLOYER_PRIVATE_KEY/OWNER_PRIVATE_KEY) is not available in environment!");
  }
  const formattedOwnerKey = rawOwnerKey.startsWith("0x") ? rawOwnerKey : `0x${rawOwnerKey}`;
  const ownerWallet = new ethers.Wallet(formattedOwnerKey, ethers.provider);
  const derivedOwnerAddress = await ownerWallet.getAddress();

  console.log(`Derived Owner Address: ${derivedOwnerAddress}`);
  console.log(`Expected Owner Address: ${CONFIG.OWNER_ADDRESS}`);

  if (derivedOwnerAddress.toLowerCase() !== CONFIG.OWNER_ADDRESS.toLowerCase()) {
    throw new Error(`OWNER SIGNER MISMATCH: Derived owner ${derivedOwnerAddress} != expected owner ${CONFIG.OWNER_ADDRESS}. STOPPING IMMEDIATELY! Do NOT attempt to use borrower key as owner.`);
  }
  console.log("[PASS] Owner Signer Verification Succeeded.\n");

  // ABIs
  const lendingAbi = [
    "function paused() external view returns (bool)",
    "function poolLiquidity() external view returns (uint256)",
    "function totalOutstandingDebt() external view returns (uint256)",
    "function totalBadDebt() external view returns (uint256)",
    "function getPosition(address user) external view returns (uint256 collateral, uint256 debt)",
    "function healthFactor(address user) external view returns (uint256)",
    "function unpause() external",
    "function pause() external",
    "function depositCollateral(uint256 amount) external",
    "function borrow(uint256 amount) external",
    "function owner() external view returns (address)",
  ];

  const oracleAbi = [
    "function getPriceData() external view returns (uint256 price, uint8 decimals, uint256 updatedAt, bool isValid)",
    "function maxStaleness() external view returns (uint256)",
  ];

  const erc20Abi = [
    "function balanceOf(address account) external view returns (uint256)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function approve(address spender, uint256 amount) external returns (bool)",
  ];

  const lendingContract = new ethers.Contract(CONFIG.PAYGRIX_LENDING_ADDRESS, lendingAbi, ethers.provider);
  const oracleContract = new ethers.Contract(CONFIG.PRODUCTION_ORACLE_ADAPTER, oracleAbi, ethers.provider);
  const cirBtcContract = new ethers.Contract(CONFIG.CIRBTC_ADDRESS, erc20Abi, ethers.provider);
  const usdcContract = new ethers.Contract(CONFIG.USDC_ADDRESS, erc20Abi, ethers.provider);

  const txRecords: TxRecord[] = [];
  let signatureCount = 0;

  // ================================================================
  // STEP A — READ-ONLY PRECHECK
  // ================================================================
  console.log("----------------------------------------------------------------");
  console.log("=== STEP A — READ-ONLY PRECHECK ===");
  console.log("----------------------------------------------------------------");

  const borrowerCirBtcBal: bigint = await cirBtcContract.balanceOf(derivedBorrowerAddress);
  const [borrowerCollateralPre, borrowerDebtPre] = await lendingContract.getPosition(derivedBorrowerAddress);
  const poolLiquidityPre: bigint = await lendingContract.poolLiquidity();
  const pausedPre: boolean = await lendingContract.paused();
  const outstandingDebtPre: bigint = await lendingContract.totalOutstandingDebt();
  const badDebtPre: bigint = await lendingContract.totalBadDebt();

  const [pricePre, decimalsPre, updatedAtPre, isValidPre] = await oracleContract.getPriceData();
  const maxStalenessPre: bigint = await oracleContract.maxStaleness();
  const blockPre = await ethers.provider.getBlock("latest");
  const nowTsPre = BigInt(blockPre?.timestamp || Math.floor(Date.now() / 1000));
  const ageSecondsPre = nowTsPre > updatedAtPre ? nowTsPre - updatedAtPre : 0n;
  const isOracleFreshPre = isValidPre && ageSecondsPre <= maxStalenessPre && pricePre === 60_000_000_000n;

  console.log(`- Signer == Borrower: ${derivedBorrowerAddress} (${derivedBorrowerAddress.toLowerCase() === CONFIG.BORROWER_ADDRESS.toLowerCase() ? "PASS" : "FAIL"})`);
  console.log(`- Borrower cirBTC Balance: ${ethers.formatUnits(borrowerCirBtcBal, 8)} cirBTC (Required >= 0.05)`);
  console.log(`- Borrower Existing Collateral: ${borrowerCollateralPre.toString()} (Required == 0)`);
  console.log(`- Borrower Existing Debt: ${borrowerDebtPre.toString()} (Required == 0)`);
  console.log(`- Pool Liquidity: ${ethers.formatUnits(poolLiquidityPre, 6)} USDC (Required >= 1,500)`);
  console.log(`- Oracle Status: Price = $${(Number(pricePre)/1e6).toFixed(2)}, Valid = ${isValidPre}, Fresh = ${isOracleFreshPre} (Age: ${ageSecondsPre}s)`);
  console.log(`- Contract Paused: ${pausedPre} (Required == true)`);
  console.log(`- Total Outstanding Debt: ${outstandingDebtPre.toString()} (Required == 0)`);
  console.log(`- Total Bad Debt: ${badDebtPre.toString()} (Required == 0)`);

  if (borrowerCirBtcBal < CONFIG.TARGET_COLLATERAL_CIRBTC) {
    throw new Error(`STEP A FAIL: Borrower cirBTC balance ${ethers.formatUnits(borrowerCirBtcBal, 8)} < 0.05. STOPPING!`);
  }
  if (borrowerCollateralPre !== 0n) {
    throw new Error(`STEP A FAIL: Borrower collateral is non-zero: ${borrowerCollateralPre}. STOPPING!`);
  }
  if (borrowerDebtPre !== 0n) {
    throw new Error(`STEP A FAIL: Borrower debt is non-zero: ${borrowerDebtPre}. STOPPING!`);
  }
  if (poolLiquidityPre < CONFIG.TARGET_BORROW_USDC) {
    throw new Error(`STEP A FAIL: Pool liquidity ${ethers.formatUnits(poolLiquidityPre, 6)} USDC < 1,500 USDC. STOPPING!`);
  }
  if (!isOracleFreshPre) {
    throw new Error(`STEP A FAIL: Oracle is invalid or stale (Age: ${ageSecondsPre}s). STOPPING!`);
  }
  if (!pausedPre) {
    throw new Error("STEP A FAIL: Contract is not paused before step B. STOPPING!");
  }
  if (outstandingDebtPre !== 0n || badDebtPre !== 0n) {
    throw new Error("STEP A FAIL: Outstanding or bad debt is non-zero. STOPPING!");
  }

  console.log("\n>>> STEP A PRECHECK PASSED 100%. Proceeding with Step B.\n");

  // ================================================================
  // STEP B — OWNER UNPAUSE
  // ================================================================
  console.log("----------------------------------------------------------------");
  console.log("=== STEP B — OWNER UNPAUSE ===");
  console.log("----------------------------------------------------------------");

  const lendingOwner = lendingContract.connect(ownerWallet);
  console.log("Executing PayGrixLending.unpause() as Owner...");
  const unpauseTx = await (lendingOwner as any).unpause();
  signatureCount += 1;
  console.log("Unpause Tx Submitted! Tx Hash:", unpauseTx.hash);
  const unpauseReceipt = await unpauseTx.wait();
  console.log("Unpause Tx Confirmed in Block:", unpauseReceipt.blockNumber);

  txRecords.push({
    step: "STEP B (Owner Unpause)",
    txHash: unpauseTx.hash,
    blockNumber: unpauseReceipt.blockNumber,
    signer: derivedOwnerAddress,
    description: "PayGrixLending.unpause()",
  });

  const pausedStepB: boolean = await lendingContract.paused();
  if (pausedStepB) {
    throw new Error("STEP B FAIL: Contract is still paused after unpause tx!");
  }
  console.log("Unpause verified: paused == false\n");

  // ================================================================
  // STEP C — BORROWER APPROVAL
  // ================================================================
  console.log("----------------------------------------------------------------");
  console.log("=== STEP C — BORROWER APPROVAL ===");
  console.log("----------------------------------------------------------------");

  const cirBtcBorrower = cirBtcContract.connect(borrowerWallet);
  console.log(`Approving PayGrixLending as spender for EXACTLY 5,000,000 cirBTC raw units (0.05 cirBTC)...`);
  const approveTx = await (cirBtcBorrower as any).approve(CONFIG.PAYGRIX_LENDING_ADDRESS, CONFIG.TARGET_COLLATERAL_CIRBTC);
  signatureCount += 1;
  console.log("Approval Tx Submitted! Tx Hash:", approveTx.hash);
  const approveReceipt = await approveTx.wait();
  console.log("Approval Tx Confirmed in Block:", approveReceipt.blockNumber);

  txRecords.push({
    step: "STEP C (Borrower Approval)",
    txHash: approveTx.hash,
    blockNumber: approveReceipt.blockNumber,
    signer: derivedBorrowerAddress,
    description: `cirBTC.approve(PayGrixLending, 5,000,000)`,
  });

  const allowanceStepC: bigint = await cirBtcContract.allowance(derivedBorrowerAddress, CONFIG.PAYGRIX_LENDING_ADDRESS);
  console.log(`Confirmed Allowance: ${allowanceStepC.toString()} raw (${ethers.formatUnits(allowanceStepC, 8)} cirBTC)\n`);

  if (allowanceStepC < CONFIG.TARGET_COLLATERAL_CIRBTC) {
    throw new Error(`STEP C FAIL: Approved allowance ${allowanceStepC} < target 5,000,000 raw units!`);
  }

  // ================================================================
  // STEP D — BORROWER COLLATERAL DEPOSIT
  // ================================================================
  console.log("----------------------------------------------------------------");
  console.log("=== STEP D — BORROWER COLLATERAL DEPOSIT ===");
  console.log("----------------------------------------------------------------");

  const lendingBorrower = lendingContract.connect(borrowerWallet);
  console.log(`Executing PayGrixLending.depositCollateral(5_000_000)...`);
  const depositTx = await (lendingBorrower as any).depositCollateral(CONFIG.TARGET_COLLATERAL_CIRBTC);
  signatureCount += 1;
  console.log("Deposit Tx Submitted! Tx Hash:", depositTx.hash);
  const depositReceipt = await depositTx.wait();
  console.log("Deposit Tx Confirmed in Block:", depositReceipt.blockNumber);

  txRecords.push({
    step: "STEP D (Borrower Deposit Collateral)",
    txHash: depositTx.hash,
    blockNumber: depositReceipt.blockNumber,
    signer: derivedBorrowerAddress,
    description: `PayGrixLending.depositCollateral(5,000,000)`,
  });

  // ================================================================
  // STEP E — VERIFY COLLATERAL
  // ================================================================
  console.log("\n----------------------------------------------------------------");
  console.log("=== STEP E — VERIFY COLLATERAL ===");
  console.log("----------------------------------------------------------------");

  const [collateralStepE, debtStepE] = await lendingContract.getPosition(derivedBorrowerAddress);
  const poolLiquidityStepE: bigint = await lendingContract.poolLiquidity();

  console.log(`- Borrower Collateral: ${ethers.formatUnits(collateralStepE, 8)} cirBTC (${collateralStepE.toString()} raw)`);
  console.log(`- Borrower Debt: ${ethers.formatUnits(debtStepE, 6)} USDC (${debtStepE.toString()} raw)`);
  console.log(`- Pool Liquidity: ${ethers.formatUnits(poolLiquidityStepE, 6)} USDC (${poolLiquidityStepE.toString()} raw)`);

  if (collateralStepE !== CONFIG.TARGET_COLLATERAL_CIRBTC) {
    throw new Error(`STEP E FAIL: Expected borrower collateral 5,000,000 raw, got ${collateralStepE}! STOPPING!`);
  }
  if (debtStepE !== 0n) {
    throw new Error(`STEP E FAIL: Expected borrower debt 0, got ${debtStepE}! STOPPING!`);
  }
  if (poolLiquidityStepE !== CONFIG.TARGET_BORROW_USDC) {
    throw new Error(`STEP E FAIL: Expected pool liquidity 1,500 USDC, got ${ethers.formatUnits(poolLiquidityStepE, 6)} USDC! STOPPING!`);
  }
  console.log("STEP E Verification PASSED: Collateral deposited correctly, position clean.\n");

  // ================================================================
  // STEP F — BORROW
  // ================================================================
  console.log("----------------------------------------------------------------");
  console.log("=== STEP F — BORROW ===");
  console.log("----------------------------------------------------------------");

  const borrowerInitialUsdc: bigint = await usdcContract.balanceOf(derivedBorrowerAddress);
  console.log(`Borrower Initial USDC Balance: ${ethers.formatUnits(borrowerInitialUsdc, 6)} USDC`);

  console.log(`Executing PayGrixLending.borrow(1_500_000_000)...`);
  const borrowTx = await (lendingBorrower as any).borrow(CONFIG.TARGET_BORROW_USDC);
  signatureCount += 1;
  console.log("Borrow Tx Submitted! Tx Hash:", borrowTx.hash);
  const borrowReceipt = await borrowTx.wait();
  console.log("Borrow Tx Confirmed in Block:", borrowReceipt.blockNumber);

  txRecords.push({
    step: "STEP F (Borrower Borrow)",
    txHash: borrowTx.hash,
    blockNumber: borrowReceipt.blockNumber,
    signer: derivedBorrowerAddress,
    description: `PayGrixLending.borrow(1,500,000,000)`,
  });

  // ================================================================
  // STEP G — IMMEDIATE READ-ONLY POST-BORROW AUDIT
  // ================================================================
  console.log("\n----------------------------------------------------------------");
  console.log("=== STEP G — IMMEDIATE READ-ONLY POST-BORROW AUDIT ===");
  console.log("----------------------------------------------------------------");

  const [collateralStepG, debtStepG] = await lendingContract.getPosition(derivedBorrowerAddress);
  const borrowerPostUsdc: bigint = await usdcContract.balanceOf(derivedBorrowerAddress);
  const usdcIncrease = borrowerPostUsdc - borrowerInitialUsdc;
  const totalDebtStepG: bigint = await lendingContract.totalOutstandingDebt();
  const badDebtStepG: bigint = await lendingContract.totalBadDebt();
  const hfStepG: bigint = await lendingContract.healthFactor(derivedBorrowerAddress);
  const poolLiquidityStepG: bigint = await lendingContract.poolLiquidity();
  const pausedStepG: boolean = await lendingContract.paused();

  const hfNumStepG = Number(hfStepG) / 10000;

  console.log(`1. Borrower Collateral: ${ethers.formatUnits(collateralStepG, 8)} cirBTC (${collateralStepG.toString()} raw)`);
  console.log(`2. Borrower Debt: ${ethers.formatUnits(debtStepG, 6)} USDC (${debtStepG.toString()} raw)`);
  console.log(`3. Borrower USDC Balance Increase: ${ethers.formatUnits(usdcIncrease, 6)} USDC (Raw: ${usdcIncrease.toString()})`);
  console.log(`4. Total Outstanding Debt: ${ethers.formatUnits(totalDebtStepG, 6)} USDC`);
  console.log(`5. Total Bad Debt: ${ethers.formatUnits(badDebtStepG, 6)} USDC`);
  console.log(`6. Health Factor: ${hfNumStepG.toFixed(2)} (${hfStepG.toString()} bps)`);
  console.log(`7. Pool Liquidity: ${ethers.formatUnits(poolLiquidityStepG, 6)} USDC`);
  console.log(`8. Paused State: ${pausedStepG ? "PAUSED" : "UNPAUSED (Expected unpaused at this step)"}`);

  if (collateralStepG !== CONFIG.TARGET_COLLATERAL_CIRBTC) {
    throw new Error(`STEP G FAIL: Collateral mismatch ${collateralStepG}`);
  }
  if (debtStepG !== CONFIG.TARGET_BORROW_USDC) {
    throw new Error(`STEP G FAIL: Debt mismatch ${debtStepG}`);
  }
  if (usdcIncrease !== CONFIG.TARGET_BORROW_USDC) {
    throw new Error(`STEP G FAIL: Borrower USDC increase mismatch ${usdcIncrease}`);
  }
  if (totalDebtStepG !== CONFIG.TARGET_BORROW_USDC) {
    throw new Error(`STEP G FAIL: Total debt mismatch ${totalDebtStepG}`);
  }
  if (badDebtStepG !== 0n) {
    throw new Error(`STEP G FAIL: Bad debt detected ${badDebtStepG}`);
  }
  if (hfStepG !== 15000n) {
    throw new Error(`STEP G FAIL: Health factor expected 15000 bps (1.50), got ${hfStepG}`);
  }
  if (poolLiquidityStepG !== 0n) {
    throw new Error(`STEP G FAIL: Pool liquidity expected 0, got ${poolLiquidityStepG}`);
  }
  if (pausedStepG) {
    throw new Error("STEP G FAIL: Protocol was paused prematurely!");
  }

  console.log("STEP G Audit PASSED 100%.\n");

  // ================================================================
  // STEP H — EMERGENCY PAUSE
  // ================================================================
  console.log("----------------------------------------------------------------");
  console.log("=== STEP H — EMERGENCY PAUSE ===");
  console.log("----------------------------------------------------------------");

  console.log("Executing PayGrixLending.pause() as Owner...");
  const pauseTx = await (lendingOwner as any).pause();
  signatureCount += 1;
  console.log("Pause Tx Submitted! Tx Hash:", pauseTx.hash);
  const pauseReceipt = await pauseTx.wait();
  console.log("Pause Tx Confirmed in Block:", pauseReceipt.blockNumber);

  txRecords.push({
    step: "STEP H (Owner Emergency Pause)",
    txHash: pauseTx.hash,
    blockNumber: pauseReceipt.blockNumber,
    signer: derivedOwnerAddress,
    description: "PayGrixLending.pause()",
  });

  const pausedStepH: boolean = await lendingContract.paused();
  if (!pausedStepH) {
    throw new Error("STEP H FAIL: Contract is not paused after pause tx!");
  }
  console.log("Pause verified: paused == true\n");

  // ================================================================
  // STEP I — FINAL READ-ONLY AUDIT
  // ================================================================
  console.log("----------------------------------------------------------------");
  console.log("=== STEP I — FINAL READ-ONLY AUDIT ===");
  console.log("----------------------------------------------------------------");

  const finalPaused: boolean = await lendingContract.paused();
  const [finalCollateral, finalDebt] = await lendingContract.getPosition(derivedBorrowerAddress);
  const finalTotalDebt: bigint = await lendingContract.totalOutstandingDebt();
  const finalBadDebt: bigint = await lendingContract.totalBadDebt();
  const finalPoolLiquidity: bigint = await lendingContract.poolLiquidity();
  const finalHfBps: bigint = await lendingContract.healthFactor(derivedBorrowerAddress);
  const finalHfNum = Number(finalHfBps) / 10000;

  console.log(`1. Paused State: ${finalPaused ? "true (PAUSED)" : "false"}`);
  console.log(`2. Borrower Collateral: ${ethers.formatUnits(finalCollateral, 8)} cirBTC (${finalCollateral.toString()} raw)`);
  console.log(`3. Borrower Debt: ${ethers.formatUnits(finalDebt, 6)} USDC (${finalDebt.toString()} raw)`);
  console.log(`4. Total Outstanding Debt: ${ethers.formatUnits(finalTotalDebt, 6)} USDC`);
  console.log(`5. Total Bad Debt: ${ethers.formatUnits(finalBadDebt, 6)} USDC`);
  console.log(`6. Pool Liquidity: ${ethers.formatUnits(finalPoolLiquidity, 6)} USDC`);
  console.log(`7. Health Factor: ${finalHfNum.toFixed(2)} (${finalHfBps.toString()} bps)`);

  const borrowTestSucceeded = 
    finalPaused === true &&
    finalCollateral === CONFIG.TARGET_COLLATERAL_CIRBTC &&
    finalDebt === CONFIG.TARGET_BORROW_USDC &&
    finalTotalDebt === CONFIG.TARGET_BORROW_USDC &&
    finalBadDebt === 0n &&
    finalPoolLiquidity === 0n &&
    finalHfBps === 15000n;

  console.log("\n================================================================");
  console.log("=== CONTROLLED BORROW TEST FINAL EXECUTION REPORT ===");
  console.log("================================================================");
  console.log(`- Exact Transaction Count: ${txRecords.length}`);
  console.log(`- Exact Signature Count: ${signatureCount}`);
  console.log("- Transaction History:");
  for (const r of txRecords) {
    console.log(`  * [${r.step}] Signer: ${r.signer} | Tx: ${r.txHash} | Block: ${r.blockNumber} | Action: ${r.description}`);
  }
  console.log(`- Final Borrower Collateral: ${ethers.formatUnits(finalCollateral, 8)} cirBTC`);
  console.log(`- Final Borrower Debt: ${ethers.formatUnits(finalDebt, 6)} USDC`);
  console.log(`- Final Health Factor: ${finalHfNum.toFixed(2)} (${finalHfBps.toString()} bps)`);
  console.log(`- Final Pool Liquidity: ${ethers.formatUnits(finalPoolLiquidity, 6)} USDC`);
  console.log(`- Final Paused State: ${finalPaused ? "true (PAUSED)" : "false"}`);
  console.log(`- Borrow Test Succeeded: ${borrowTestSucceeded ? "YES" : "NO"}`);
  console.log("================================================================");

  if (!borrowTestSucceeded) {
    throw new Error("FINAL AUDIT FAILED: One or more final state verifications failed!");
  }
}

main().catch((error) => {
  console.error("Execution Error in Step 3 Borrow Test:", error);
  process.exit(1);
});
