import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

const CONFIG = {
  NETWORK_NAME: "Arc Testnet",
  EXPECTED_CHAIN_ID: 5042002n,
  EXPECTED_OWNER: "0xf85085b73a4Ec4efE895B532Fe1560a06ff0d179",
  PAYGRIX_LENDING_ADDRESS: "0x800Cd0a3b737e989F45E69f64eEeB118724522aE",
  PRODUCTION_ORACLE_ADAPTER: "0xA17Bfb3332A83F0e247129ee9c0d1A454A332287",
  BORROWER_ADDRESS: "0x00266374046e156d0Ce782F02505391981a53074",
  CIRBTC_ADDRESS: "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF",
  USDC_ADDRESS: "0x3600000000000000000000000000000000000000",
  TARGET_PRICE: 60_000_000_000n, // $60,000 (6 decimals)
  TARGET_DECIMALS: 6,
  TARGET_IS_VALID: true,
  EXPECTED_POOL_LIQUIDITY: 1_500_000_000n, // 1,500 USDC (6 decimals)
  MIN_BORROWER_CIRBTC: 5_000_000n, // 0.05 cirBTC (8 decimals)
};

async function main() {
  console.log("================================================================");
  console.log("=== PAYGRIX LENDING PHASE 4I: CONTROLLED ORACLE REFRESH ONLY ===");
  console.log("================================================================");

  // 1. Verify Connected Network & Signer
  const [signer] = await ethers.getSigners();
  const signerAddress = await signer.getAddress();
  console.log("Connected Signer Address:", signerAddress);
  console.log("Expected Owner Address:  ", CONFIG.EXPECTED_OWNER);

  if (signerAddress.toLowerCase() !== CONFIG.EXPECTED_OWNER.toLowerCase()) {
    throw new Error(`SIGNER ERROR: Signer ${signerAddress} does not match expected owner ${CONFIG.EXPECTED_OWNER}`);
  }

  const network = await ethers.provider.getNetwork();
  console.log("Connected Chain ID:", network.chainId.toString());
  if (network.chainId !== CONFIG.EXPECTED_CHAIN_ID) {
    throw new Error(`NETWORK ERROR: Expected chain ${CONFIG.EXPECTED_CHAIN_ID}, got ${network.chainId}`);
  }

  // Contract ABIs
  const oracleAbi = [
    "function updateFeed(uint256 newPrice, uint8 newDecimals, uint256 newUpdatedAt, bool newIsValid) external",
    "function getPriceData() external view returns (uint256 price, uint8 decimals, uint256 updatedAt, bool isValid)",
    "function maxStaleness() external view returns (uint256)",
    "function owner() external view returns (address)",
  ];

  const lendingAbi = [
    "function paused() external view returns (bool)",
    "function poolLiquidity() external view returns (uint256)",
    "function totalOutstandingDebt() external view returns (uint256)",
    "function totalBadDebt() external view returns (uint256)",
    "function getPosition(address user) external view returns (uint256 collateral, uint256 debt)",
    "function oracle() external view returns (address)",
  ];

  const erc20Abi = [
    "function balanceOf(address account) external view returns (uint256)",
  ];

  const oracleContract = new ethers.Contract(CONFIG.PRODUCTION_ORACLE_ADAPTER, oracleAbi, signer);
  const lendingContract = new ethers.Contract(CONFIG.PAYGRIX_LENDING_ADDRESS, lendingAbi, ethers.provider);
  const cirBtcContract = new ethers.Contract(CONFIG.CIRBTC_ADDRESS, erc20Abi, ethers.provider);

  // Check Oracle Owner
  const oracleOwner: string = await oracleContract.owner();
  console.log("Oracle Adapter Owner: ", oracleOwner);
  if (oracleOwner.toLowerCase() !== signerAddress.toLowerCase()) {
    throw new Error(`ORACLE OWNER MISMATCH: Oracle owner ${oracleOwner} != signer ${signerAddress}`);
  }

  // ================================================================
  // PRE-EXECUTION READ-ONLY AUDIT
  // ================================================================
  console.log("\n----------------------------------------------------------------");
  console.log("=== PRE-EXECUTION READ-ONLY AUDIT ===");
  console.log("----------------------------------------------------------------");

  // Read Storage slots for Oracle Feed State (since getPriceData reverts when stale)
  const slot1 = await ethers.provider.getStorage(CONFIG.PRODUCTION_ORACLE_ADAPTER, 1);
  const slot2 = await ethers.provider.getStorage(CONFIG.PRODUCTION_ORACLE_ADAPTER, 2);
  const slot3 = await ethers.provider.getStorage(CONFIG.PRODUCTION_ORACLE_ADAPTER, 3);
  const slot4 = await ethers.provider.getStorage(CONFIG.PRODUCTION_ORACLE_ADAPTER, 4);

  const storedPrice = BigInt(slot1);
  const storedDecimals = Number(BigInt(slot2) & 0xffn);
  const storedUpdatedAt = BigInt(slot3);
  const storedIsValid = BigInt(slot4) !== 0n;

  const maxStaleness: bigint = await oracleContract.maxStaleness();
  const preBlock = await ethers.provider.getBlock("latest");
  const preTimestamp = BigInt(preBlock?.timestamp || Math.floor(Date.now() / 1000));
  const ageSecondsPre = preTimestamp > storedUpdatedAt ? preTimestamp - storedUpdatedAt : 0n;
  const isStalePre = ageSecondsPre > maxStaleness || !storedIsValid;

  // Test getPriceData() revert specifically
  let getPriceDataReverted = false;
  let revertErrorMessage = "";
  try {
    await oracleContract.getPriceData();
  } catch (err: any) {
    getPriceDataReverted = true;
    revertErrorMessage = err.message || String(err);
  }

  // Read Lending State
  const pausedPre: boolean = await lendingContract.paused();
  const poolLiquidityPre: bigint = await lendingContract.poolLiquidity();
  const outstandingDebtPre: bigint = await lendingContract.totalOutstandingDebt();
  const badDebtPre: bigint = await lendingContract.totalBadDebt();
  const [borrowerCollateralPre, borrowerDebtPre] = await lendingContract.getPosition(CONFIG.BORROWER_ADDRESS);
  const borrowerCirBtcBalPre: bigint = await cirBtcContract.balanceOf(CONFIG.BORROWER_ADDRESS);

  console.log(`1. Chain ID: ${network.chainId.toString()} (EXPECTED: 5042002)`);
  console.log(`2. Signer matches Owner: ${signerAddress.toLowerCase() === CONFIG.EXPECTED_OWNER.toLowerCase() ? "YES" : "NO"}`);
  console.log(`3. Stored Price: $${(Number(storedPrice) / 10 ** storedDecimals).toFixed(2)} (${storedPrice.toString()} raw) (EXPECTED: $60,000)`);
  console.log(`4. Stored isValid: ${storedIsValid} (EXPECTED: true)`);
  console.log(`5. getPriceData() Reverted: ${getPriceDataReverted} (Revert message: ${revertErrorMessage})`);
  console.log(`6. Oracle Feed Stale: ${isStalePre} (Age: ${ageSecondsPre}s > Max: ${maxStaleness}s)`);
  console.log(`7. Lending Paused: ${pausedPre} (EXPECTED: true)`);
  console.log(`8. Pool Liquidity: ${ethers.formatUnits(poolLiquidityPre, 6)} USDC (${poolLiquidityPre.toString()} raw) (EXPECTED: 1,500 USDC)`);
  console.log(`9. Outstanding Debt: ${outstandingDebtPre.toString()} raw (EXPECTED: 0)`);
  console.log(`10. Bad Debt: ${badDebtPre.toString()} raw (EXPECTED: 0)`);
  console.log(`11. Borrower Collateral/Debt: ${borrowerCollateralPre.toString()} / ${borrowerDebtPre.toString()} (EXPECTED: 0 / 0)`);
  console.log(`12. Borrower cirBTC Balance: ${ethers.formatUnits(borrowerCirBtcBalPre, 8)} cirBTC (${borrowerCirBtcBalPre.toString()} raw) (REQUIRED >= 0.05)`);

  // Assert Pre-checks
  if (storedPrice !== CONFIG.TARGET_PRICE) {
    throw new Error(`PRE-CHECK FAIL: Expected price ${CONFIG.TARGET_PRICE}, got ${storedPrice}`);
  }
  if (!storedIsValid) {
    throw new Error("PRE-CHECK FAIL: Stored isValid is false!");
  }
  if (!getPriceDataReverted) {
    throw new Error("PRE-CHECK FAIL: getPriceData() did not revert as expected!");
  }
  if (!isStalePre) {
    throw new Error("PRE-CHECK FAIL: Oracle is not stale!");
  }
  if (!pausedPre) {
    throw new Error("PRE-CHECK FAIL: Lending contract is UNPAUSED!");
  }
  if (poolLiquidityPre !== CONFIG.EXPECTED_POOL_LIQUIDITY) {
    throw new Error(`PRE-CHECK FAIL: Expected pool liquidity 1,500 USDC, got ${poolLiquidityPre}`);
  }
  if (outstandingDebtPre !== 0n || badDebtPre !== 0n) {
    throw new Error("PRE-CHECK FAIL: Outstanding or bad debt detected!");
  }
  if (borrowerCollateralPre !== 0n || borrowerDebtPre !== 0n) {
    throw new Error("PRE-CHECK FAIL: Borrower position is not clean!");
  }
  if (borrowerCirBtcBalPre < CONFIG.MIN_BORROWER_CIRBTC) {
    throw new Error(`PRE-CHECK FAIL: Borrower cirBTC balance ${ethers.formatUnits(borrowerCirBtcBalPre, 8)} < 0.05`);
  }

  console.log("\n>>> ALL PRE-EXECUTION CHECKS PASSED 100%! Executing single Oracle updateFeed transaction...\n");

  // ================================================================
  // SINGLE WRITE TRANSACTION: ProductionOracleAdapter.updateFeed
  // ================================================================
  let txCount = 0;
  let sigCount = 0;

  const currentBlock = await ethers.provider.getBlock("latest");
  const newTimestamp = BigInt(currentBlock?.timestamp || Math.floor(Date.now() / 1000));

  console.log(`Sending ProductionOracleAdapter.updateFeed($60,000, 6, ${newTimestamp}, true)...`);
  const tx = await oracleContract.updateFeed(
    CONFIG.TARGET_PRICE,
    CONFIG.TARGET_DECIMALS,
    newTimestamp,
    CONFIG.TARGET_IS_VALID
  );
  txCount += 1;
  sigCount += 1;

  console.log("Transaction Submitted! Tx Hash:", tx.hash);
  console.log("Waiting for block confirmation on Arc Testnet...");
  const receipt = await tx.wait();
  console.log("Transaction Confirmed in Block:", receipt.blockNumber);

  // ================================================================
  // POST-EXECUTION READ-ONLY AUDIT
  // ================================================================
  console.log("\n----------------------------------------------------------------");
  console.log("=== POST-EXECUTION READ-ONLY VERIFICATION ===");
  console.log("----------------------------------------------------------------");

  const [postPrice, postDecimals, postUpdatedAt, postIsValid] = await oracleContract.getPriceData();
  const postBlock = await ethers.provider.getBlock("latest");
  const postTimestamp = BigInt(postBlock?.timestamp || Math.floor(Date.now() / 1000));
  const postAgeSeconds = postTimestamp > postUpdatedAt ? postTimestamp - postUpdatedAt : 0n;
  const postIsFresh = postIsValid && postAgeSeconds <= maxStaleness;

  const pausedPost: boolean = await lendingContract.paused();
  const poolLiquidityPost: bigint = await lendingContract.poolLiquidity();
  const outstandingDebtPost: bigint = await lendingContract.totalOutstandingDebt();
  const badDebtPost: bigint = await lendingContract.totalBadDebt();
  const [borrowerCollateralPost, borrowerDebtPost] = await lendingContract.getPosition(CONFIG.BORROWER_ADDRESS);

  console.log(`1. getPriceData() Call Status: SUCCESS`);
  console.log(`2. Post-Update Price: $${(Number(postPrice) / 10 ** Number(postDecimals)).toFixed(2)} (${postPrice.toString()} raw) (EXPECTED: $60,000)`);
  console.log(`3. Post-Update Decimals: ${postDecimals} (EXPECTED: 6)`);
  console.log(`4. Post-Update isValid: ${postIsValid} (EXPECTED: true)`);
  console.log(`5. Post-Update Timestamp: ${postUpdatedAt.toString()} (Age: ${postAgeSeconds}s, maxStaleness: ${maxStaleness}s)`);
  console.log(`6. Oracle Fresh: ${postIsFresh ? "YES (PASS)" : "NO"}`);
  console.log(`7. Lending Paused State: ${pausedPost ? "true (PAUSED)" : "false (UNPAUSED!)"}`);
  console.log(`8. Pool Liquidity: ${ethers.formatUnits(poolLiquidityPost, 6)} USDC (${poolLiquidityPost.toString()} raw) (EXPECTED: 1,500 USDC)`);
  console.log(`9. Total Outstanding Debt: ${ethers.formatUnits(outstandingDebtPost, 6)} USDC (${outstandingDebtPost.toString()} raw)`);
  console.log(`10. Total Bad Debt: ${ethers.formatUnits(badDebtPost, 6)} USDC (${badDebtPost.toString()} raw)`);
  console.log(`11. Borrower Collateral/Debt: ${borrowerCollateralPost.toString()} / ${borrowerDebtPost.toString()} (EXPECTED: 0 / 0)`);

  // Assert Post-checks
  if (postPrice !== CONFIG.TARGET_PRICE) {
    throw new Error(`POST-CHECK FAIL: Expected price ${CONFIG.TARGET_PRICE}, got ${postPrice}`);
  }
  if (Number(postDecimals) !== 6) {
    throw new Error(`POST-CHECK FAIL: Expected 6 decimals, got ${postDecimals}`);
  }
  if (!postIsValid) {
    throw new Error("POST-CHECK FAIL: Oracle isValid is false!");
  }
  if (!postIsFresh || postAgeSeconds > 3600n) {
    throw new Error(`POST-CHECK FAIL: Oracle age (${postAgeSeconds}s) > 3,600s!`);
  }
  if (!pausedPost) {
    throw new Error("SAFETY VIOLATION: Lending contract was unpaused!");
  }
  if (poolLiquidityPost !== CONFIG.EXPECTED_POOL_LIQUIDITY) {
    throw new Error(`POST-CHECK FAIL: Pool liquidity changed from 1,500 USDC to ${ethers.formatUnits(poolLiquidityPost, 6)}`);
  }
  if (outstandingDebtPost !== 0n || badDebtPost !== 0n) {
    throw new Error("POST-CHECK FAIL: Debt detected after oracle update!");
  }

  console.log("\n================================================================");
  console.log("=== ORACLE REFRESH FINAL REPORT ===");
  console.log("================================================================");
  console.log(`- Exact Write Transactions Executed: ${txCount}`);
  console.log(`- Exact Signatures Generated: ${sigCount}`);
  console.log(`- Owner Signer Used: ${signerAddress}`);
  console.log(`- Update Transaction Hash: ${tx.hash}`);
  console.log(`- Confirmation Block Number: ${receipt.blockNumber}`);
  console.log(`- Oracle Price: $${(Number(postPrice)/1e6).toFixed(2)}`);
  console.log(`- Oracle isValid: ${postIsValid}`);
  console.log(`- Oracle Age: ${postAgeSeconds.toString()} seconds`);
  console.log(`- getPriceData() Status: SUCCESS`);
  console.log(`- Lending Paused State: ${pausedPost ? "true (PAUSED)" : "false"}`);
  console.log(`- Pool Liquidity: ${ethers.formatUnits(poolLiquidityPost, 6)} USDC`);
  console.log("\nCONTROLLED ORACLE REFRESH SUCCESSFUL — UNBLOCKING PHASE 4I STEP 3 BORROW TEST");
}

main().catch((error) => {
  console.error("Execution Error:", error);
  process.exit(1);
});
