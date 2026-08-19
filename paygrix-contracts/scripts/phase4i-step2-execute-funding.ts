import { ethers } from "hardhat";

const CONFIG = {
  NETWORK_NAME: "Arc Testnet",
  EXPECTED_CHAIN_ID: 5042002n,
  EXPECTED_FUNDER: "0x2f3cFb9bd88DEC61406f12F35146579aF42619f4",
  PAYGRIX_LENDING_ADDRESS: "0x800Cd0a3b737e989F45E69f64eEeB118724522aE",
  PRODUCTION_ORACLE_ADAPTER: "0xA17Bfb3332A83F0e247129ee9c0d1A454A332287",
  BORROWER_ADDRESS: "0x00266374046e156d0Ce782F02505391981a53074",
  CIRBTC_ADDRESS: "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF",
  USDC_ADDRESS: "0x3600000000000000000000000000000000000000",
  FUNDING_AMOUNT_USDC: 1_499_000_000n, // 1,499 USDC (6 decimals)
  TARGET_POST_LIQUIDITY_USDC: 1_500_000_000n, // 1,500 USDC
};

async function main() {
  console.log("================================================================");
  console.log("=== PAYGRIX LENDING PHASE 4I STEP 2: POOL FUNDING EXECUTION ===");
  console.log("================================================================");

  // 1. Load Funder Key from Environment Variable ONLY
  const rawKey = process.env.FUNDER_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
  if (!rawKey) {
    throw new Error("EXECUTION HALTED: FUNDER_PRIVATE_KEY environment variable is not set!");
  }

  const formattedKey = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`;
  const funderWallet = new ethers.Wallet(formattedKey, ethers.provider);
  const derivedAddress = await funderWallet.getAddress();

  console.log(`Derived Signer Address: ${derivedAddress}`);
  console.log(`Expected Funder Address: ${CONFIG.EXPECTED_FUNDER}`);

  // 3 & 4. Verify Signer Match
  if (derivedAddress.toLowerCase() !== CONFIG.EXPECTED_FUNDER.toLowerCase()) {
    throw new Error(`SIGNER MISMATCH ERROR: Derived address ${derivedAddress} != expected ${CONFIG.EXPECTED_FUNDER}. ZERO transactions executed!`);
  }
  console.log("Signer Verification PASSED: Wallet matches expected funder address exactly.\n");

  const network = await ethers.provider.getNetwork();
  if (network.chainId !== CONFIG.EXPECTED_CHAIN_ID) {
    throw new Error(`NETWORK ERROR: Expected chain ${CONFIG.EXPECTED_CHAIN_ID}, got ${network.chainId}`);
  }

  // Contract Interfaces
  const lendingAbi = [
    "function fundPool(uint256 amount) external",
    "function paused() external view returns (bool)",
    "function poolLiquidity() external view returns (uint256)",
    "function totalOutstandingDebt() external view returns (uint256)",
    "function totalBadDebt() external view returns (uint256)",
    "function getPosition(address user) external view returns (uint256 collateral, uint256 debt)",
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

  const lending = new ethers.Contract(CONFIG.PAYGRIX_LENDING_ADDRESS, lendingAbi, funderWallet);
  const oracle = new ethers.Contract(CONFIG.PRODUCTION_ORACLE_ADAPTER, oracleAbi, ethers.provider);
  const usdc = new ethers.Contract(CONFIG.USDC_ADDRESS, erc20Abi, funderWallet);
  const cirBtc = new ethers.Contract(CONFIG.CIRBTC_ADDRESS, erc20Abi, ethers.provider);

  // 5. Pre-Execution Read-Only Audits
  console.log("--- PRE-EXECUTION READ-ONLY AUDIT ---");
  const funderUsdcBal: bigint = await usdc.balanceOf(derivedAddress);
  const paused: boolean = await lending.paused();
  const initialPoolLiquidity: bigint = await lending.poolLiquidity();
  const initialDebt: bigint = await lending.totalOutstandingDebt();
  const initialBadDebt: bigint = await lending.totalBadDebt();

  const [price, decimals, updatedAt, isValid] = await oracle.getPriceData();
  const maxStaleness: bigint = await oracle.maxStaleness();
  const currentBlock = await ethers.provider.getBlock("latest");
  const nowTs = BigInt(currentBlock?.timestamp || Math.floor(Date.now() / 1000));
  const ageSeconds = nowTs > updatedAt ? nowTs - updatedAt : 0n;
  const isOracleFresh = isValid && ageSeconds <= maxStaleness && price === 60_000_000_000n;

  const borrowerCirBtcBal: bigint = await cirBtc.balanceOf(CONFIG.BORROWER_ADDRESS);
  const [borrowerCollateral, borrowerDebt] = await lending.getPosition(CONFIG.BORROWER_ADDRESS);
  const isBorrowerClean = borrowerCollateral === 0n && borrowerDebt === 0n && borrowerCirBtcBal >= 5_000_000n;

  console.log(`1. Funder USDC Balance: ${ethers.formatUnits(funderUsdcBal, 6)} USDC (>= 1,499 USDC required)`);
  console.log(`2. Lending Paused State: ${paused ? "true (PAUSED)" : "false"}`);
  console.log(`3. Initial Pool Liquidity: ${ethers.formatUnits(initialPoolLiquidity, 6)} USDC`);
  console.log(`4. Outstanding Debt: ${ethers.formatUnits(initialDebt, 6)} USDC`);
  console.log(`5. Bad Debt: ${ethers.formatUnits(initialBadDebt, 6)} USDC`);
  console.log(`6. Oracle Status: Price = $${(Number(price)/1e6).toFixed(2)}, Valid = ${isValid}, Age = ${ageSeconds}s (Max: ${maxStaleness}s)`);
  console.log(`7. Borrower cirBTC Balance: ${ethers.formatUnits(borrowerCirBtcBal, 8)} cirBTC`);
  console.log(`8. Borrower Position: Collateral = ${borrowerCollateral.toString()}, Debt = ${borrowerDebt.toString()}`);

  if (funderUsdcBal < CONFIG.FUNDING_AMOUNT_USDC) {
    throw new Error(`PREFLIGHT FAIL: Funder USDC balance (${ethers.formatUnits(funderUsdcBal, 6)}) < 1,499 USDC`);
  }
  if (!paused) {
    throw new Error("PREFLIGHT FAIL: Lending contract is UNPAUSED!");
  }
  if (initialPoolLiquidity !== 1_000_000n) {
    throw new Error(`PREFLIGHT FAIL: Expected initial pool liquidity 1 USDC, got ${initialPoolLiquidity}`);
  }
  if (initialDebt !== 0n || initialBadDebt !== 0n) {
    throw new Error("PREFLIGHT FAIL: Outstanding or bad debt detected!");
  }
  if (!isOracleFresh) {
    throw new Error("PREFLIGHT FAIL: Oracle is not fresh or valid!");
  }
  if (!isBorrowerClean) {
    throw new Error("PREFLIGHT FAIL: Borrower position is not clean or cirBTC < 0.05!");
  }

  console.log("Pre-execution read-only checks 100% PASSED!\n");

  let txCount = 0;
  let sigCount = 0;
  let approvalTxHash = "NONE";
  let approvalBlock = "N/A";
  let fundingTxHash = "";
  let fundingBlock = 0;

  // 6 & 7. Check Current USDC Allowance
  const currentAllowance: bigint = await usdc.allowance(derivedAddress, CONFIG.PAYGRIX_LENDING_ADDRESS);
  console.log(`Current USDC Allowance to Lending: ${ethers.formatUnits(currentAllowance, 6)} USDC`);

  if (currentAllowance < CONFIG.FUNDING_AMOUNT_USDC) {
    console.log(`Allowance is insufficient (${ethers.formatUnits(currentAllowance, 6)} < 1,499 USDC). Executing EXACT 1,499 USDC Approval...`);
    const approveTx = await usdc.approve(CONFIG.PAYGRIX_LENDING_ADDRESS, CONFIG.FUNDING_AMOUNT_USDC);
    txCount += 1;
    sigCount += 1;
    approvalTxHash = approveTx.hash;
    console.log("Approval Tx Submitted! Tx Hash:", approvalTxHash);
    const approveReceipt = await approveTx.wait();
    approvalBlock = approveReceipt.blockNumber.toString();
    console.log("Approval Confirmed in Block:", approvalBlock);
  } else {
    console.log("USDC Allowance is already sufficient. Approval skipped.");
  }

  // 8. Execute fundPool(1,499,000,000)
  console.log("\n>>> Executing PayGrixLending.fundPool(1,499,000,000 raw USDC)...");
  const fundTx = await lending.fundPool(CONFIG.FUNDING_AMOUNT_USDC);
  txCount += 1;
  sigCount += 1;
  fundingTxHash = fundTx.hash;
  console.log("Funding Tx Submitted! Tx Hash:", fundingTxHash);
  console.log("Waiting for confirmation on Arc Testnet...");
  const fundReceipt = await fundTx.wait();
  fundingBlock = fundReceipt.blockNumber;
  console.log("Funding Confirmed in Block:", fundingBlock);

  // 10. Post-Funding READ-ONLY Audit Verification
  console.log("\n================================================================");
  console.log("=== POST-FUNDING READ-ONLY VERIFICATION ===");
  console.log("================================================================");

  const finalPoolLiquidity: bigint = await lending.poolLiquidity();
  const finalPaused: boolean = await lending.paused();
  const finalDebt: bigint = await lending.totalOutstandingDebt();
  const finalBadDebt: bigint = await lending.totalBadDebt();
  const [finalBorrowerCollateral, finalBorrowerDebt] = await lending.getPosition(CONFIG.BORROWER_ADDRESS);
  const finalBorrowerCirBtc: bigint = await cirBtc.balanceOf(CONFIG.BORROWER_ADDRESS);
  
  const [postPrice, postDecimals, postUpdatedAt, postIsValid] = await oracle.getPriceData();
  const postBlock = await ethers.provider.getBlock("latest");
  const postNowTs = BigInt(postBlock?.timestamp || Math.floor(Date.now() / 1000));
  const postAge = postNowTs > postUpdatedAt ? postNowTs - postUpdatedAt : 0n;
  const postOracleFresh = postIsValid && postAge <= maxStaleness;

  const finalFunderUsdc: bigint = await usdc.balanceOf(derivedAddress);
  const finalAllowance: bigint = await usdc.allowance(derivedAddress, CONFIG.PAYGRIX_LENDING_ADDRESS);

  console.log(`1. Final Pool Liquidity: ${ethers.formatUnits(finalPoolLiquidity, 6)} USDC (${finalPoolLiquidity.toString()} raw)`);
  console.log(`2. Contract Paused State: ${finalPaused ? "true (PAUSED)" : "false"}`);
  console.log(`3. Total Outstanding Debt: ${ethers.formatUnits(finalDebt, 6)} USDC`);
  console.log(`4. Total Bad Debt: ${ethers.formatUnits(finalBadDebt, 6)} USDC`);
  console.log(`5. Borrower Collateral: ${ethers.formatUnits(finalBorrowerCollateral, 8)} cirBTC`);
  console.log(`6. Borrower Debt: ${ethers.formatUnits(finalBorrowerDebt, 6)} USDC`);
  console.log(`7. Borrower cirBTC Balance: ${ethers.formatUnits(finalBorrowerCirBtc, 8)} cirBTC`);
  console.log(`8. Oracle Fresh & Valid: ${postOracleFresh ? "YES (PASS)" : "NO"}`);
  console.log(`9. Funder Remaining USDC: ${ethers.formatUnits(finalFunderUsdc, 6)} USDC`);
  console.log(`10. Final Allowance to Lending: ${ethers.formatUnits(finalAllowance, 6)} USDC`);

  // Assertions
  if (finalPoolLiquidity !== CONFIG.TARGET_POST_LIQUIDITY_USDC) {
    throw new Error(`POST-AUDIT FAIL: Expected pool liquidity 1,500 USDC, got ${ethers.formatUnits(finalPoolLiquidity, 6)}`);
  }
  if (!finalPaused) {
    throw new Error("SAFETY FAIL: Contract is unpaused post-funding!");
  }
  if (finalDebt !== 0n || finalBadDebt !== 0n) {
    throw new Error("POST-AUDIT FAIL: Outstanding or bad debt detected!");
  }
  if (finalBorrowerCollateral !== 0n || finalBorrowerDebt !== 0n) {
    throw new Error("POST-AUDIT FAIL: Borrower position changed!");
  }
  if (finalBorrowerCirBtc < 5_000_000n) {
    throw new Error("POST-AUDIT FAIL: Borrower cirBTC < 0.05!");
  }

  console.log("\n================================================================");
  console.log("=== STEP 2 EXECUTION METRICS REPORT ===");
  console.log("================================================================");
  console.log(`- Signer Verified: ${derivedAddress}`);
  console.log(`- Approval Tx Hash: ${approvalTxHash}`);
  console.log(`- Approval Confirmation Block: ${approvalBlock}`);
  console.log(`- Funding Tx Hash: ${fundingTxHash}`);
  console.log(`- Funding Confirmation Block: ${fundingBlock}`);
  console.log(`- Final Pool Liquidity: ${ethers.formatUnits(finalPoolLiquidity, 6)} USDC`);
  console.log(`- Final Outstanding Debt: ${ethers.formatUnits(finalDebt, 6)} USDC`);
  console.log(`- Final Bad Debt: ${ethers.formatUnits(finalBadDebt, 6)} USDC`);
  console.log(`- Exact Number of Write Transactions: ${txCount}`);
  console.log(`- Exact Number of Signatures: ${sigCount}`);
  console.log(`- Lending Contract Paused State: ${finalPaused ? "YES (paused == true)" : "NO"}`);
  console.log("\nPHASE 4I STEP 2 COMPLETE — POOL FUNDED, LENDING STILL PAUSED");
}

main().catch((error) => {
  console.error("Execution Error:", error);
  process.exit(1);
});
