import { ethers } from "hardhat";

const CONFIG = {
  NETWORK_NAME: "Arc Testnet",
  EXPECTED_CHAIN_ID: 5042002n,
  EXPECTED_OWNER: "0xf85085b73a4Ec4efE895B532Fe1560a06ff0d179",
  PAYGRIX_LENDING_ADDRESS: "0x800Cd0a3b737e989F45E69f64eEeB118724522aE",
  PRODUCTION_ORACLE_ADAPTER: "0xA17Bfb3332A83F0e247129ee9c0d1A454A332287",
  BORROWER_ADDRESS: "0x00266374046e156d0Ce782F02505391981a53074",
  CIRBTC_ADDRESS: "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF",
  USDC_ADDRESS: "0x3600000000000000000000000000000000000000",
  NEW_PRICE: 60_000_000_000n, // $60,000 (6 decimals)
  NEW_DECIMALS: 6,
  NEW_IS_VALID: true,
};

async function main() {
  console.log("================================================================");
  console.log("=== PAYGRIX LENDING PHASE 4I STEP 1: ORACLE REFRESH ONLY ===");
  console.log("================================================================");

  // 1. Verify Connected Signer
  const [signer] = await ethers.getSigners();
  console.log("Connected Signer Address:", signer.address);

  if (signer.address.toLowerCase() !== CONFIG.EXPECTED_OWNER.toLowerCase()) {
    throw new Error(`SIGNER ERROR: Signer ${signer.address} is not expected owner ${CONFIG.EXPECTED_OWNER}`);
  }

  const network = await ethers.provider.getNetwork();
  if (network.chainId !== CONFIG.EXPECTED_CHAIN_ID) {
    throw new Error(`NETWORK ERROR: Expected chain ${CONFIG.EXPECTED_CHAIN_ID}, got ${network.chainId}`);
  }

  const oracleAbi = [
    "function updateFeed(uint256 newPrice, uint8 newDecimals, uint256 newUpdatedAt, bool newIsValid) external",
    "function getPriceData() external view returns (uint256 price, uint8 decimals, uint256 updatedAt, bool isValid)",
    "function maxStaleness() external view returns (uint256)",
    "function owner() external view returns (address)",
  ];

  const oracle = new ethers.Contract(CONFIG.PRODUCTION_ORACLE_ADAPTER, oracleAbi, signer);

  // Check Oracle Owner
  const oracleOwner: string = await oracle.owner();
  console.log("Oracle Owner:", oracleOwner);
  if (oracleOwner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(`ORACLE OWNER MISMATCH: Oracle owner ${oracleOwner} != signer ${signer.address}`);
  }

  const latestBlock = await ethers.provider.getBlock("latest");
  const currentTimestamp = BigInt(latestBlock?.timestamp || Math.floor(Date.now() / 1000));
  console.log("Current Block Timestamp:", currentTimestamp.toString());
  console.log("Updating feed to Price: $60,000, Decimals: 6, Timestamp:", currentTimestamp.toString(), "IsValid: true");

  // Execute SINGLE Write Operation
  let txCount = 0;
  let sigCount = 0;

  console.log("\n>>> Sending Oracle updateFeed Transaction...");
  const tx = await oracle.updateFeed(
    CONFIG.NEW_PRICE,
    CONFIG.NEW_DECIMALS,
    currentTimestamp,
    CONFIG.NEW_IS_VALID
  );
  txCount += 1;
  sigCount += 1;

  console.log("Transaction Submitted! Tx Hash:", tx.hash);
  console.log("Waiting for confirmation...");

  const receipt = await tx.wait();
  console.log("Transaction Confirmed in Block:", receipt.blockNumber);

  // 3. POST-UPDATE READ-ONLY AUDIT
  console.log("\n================================================================");
  console.log("=== POST-UPDATE READ-ONLY AUDIT ===");
  console.log("================================================================");

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

  const lending = new ethers.Contract(CONFIG.PAYGRIX_LENDING_ADDRESS, lendingAbi, ethers.provider);
  const cirBtcToken = new ethers.Contract(CONFIG.CIRBTC_ADDRESS, erc20Abi, ethers.provider);

  // Oracle audit
  const onChainOracleAddr: string = await lending.oracle();
  const [price, decimals, updatedAt, isValid] = await oracle.getPriceData();
  const maxStaleness: bigint = await oracle.maxStaleness();

  const auditBlock = await ethers.provider.getBlock("latest");
  const auditNow = BigInt(auditBlock?.timestamp || Math.floor(Date.now() / 1000));
  const ageSeconds = auditNow > updatedAt ? auditNow - updatedAt : 0n;
  const isFresh = ageSeconds <= maxStaleness;

  // Lending audit
  const paused: boolean = await lending.paused();
  const poolLiquidity: bigint = await lending.poolLiquidity();
  const totalDebt: bigint = await lending.totalOutstandingDebt();
  const totalBadDebt: bigint = await lending.totalBadDebt();
  const [borrowerCollateral, borrowerDebt] = await lending.getPosition(CONFIG.BORROWER_ADDRESS);
  const borrowerCirBtc: bigint = await cirBtcToken.balanceOf(CONFIG.BORROWER_ADDRESS);

  console.log(`1. Oracle Address Unchanged: ${onChainOracleAddr === CONFIG.PRODUCTION_ORACLE_ADAPTER ? "YES (PASS)" : "NO"}`);
  console.log(`2. Oracle Price: $${(Number(price) / 10 ** Number(decimals)).toLocaleString("en-US", { minimumFractionDigits: 2 })} (${price.toString()})`);
  console.log(`3. Oracle Decimals: ${decimals}`);
  console.log(`4. Oracle isValid: ${isValid}`);
  console.log(`5. Oracle updatedAt: ${updatedAt.toString()} (Age: ${ageSeconds.toString()}s, maxStaleness: ${maxStaleness.toString()}s)`);
  console.log(`6. Oracle Fresh: ${isFresh ? "YES (PASS)" : "NO"}`);
  console.log(`7. Lending Paused: ${paused ? "YES (PAUSED == true)" : "NO (UNPAUSED!)"}`);
  console.log(`8. Pool Liquidity: ${ethers.formatUnits(poolLiquidity, 6)} USDC`);
  console.log(`9. Total Outstanding Debt: ${ethers.formatUnits(totalDebt, 6)} USDC`);
  console.log(`10. Total Bad Debt: ${ethers.formatUnits(totalBadDebt, 6)} USDC`);
  console.log(`11. Borrower Collateral: ${ethers.formatUnits(borrowerCollateral, 8)} cirBTC`);
  console.log(`12. Borrower Debt: ${ethers.formatUnits(borrowerDebt, 6)} USDC`);
  console.log(`13. Borrower cirBTC Balance: ${ethers.formatUnits(borrowerCirBtc, 8)} cirBTC`);

  // Assertions
  if (onChainOracleAddr.toLowerCase() !== CONFIG.PRODUCTION_ORACLE_ADAPTER.toLowerCase()) {
    throw new Error("POST-AUDIT FAIL: Oracle address mismatch!");
  }
  if (price !== CONFIG.NEW_PRICE) {
    throw new Error(`POST-AUDIT FAIL: Expected price ${CONFIG.NEW_PRICE}, got ${price}`);
  }
  if (decimals !== 6) {
    throw new Error(`POST-AUDIT FAIL: Expected 6 decimals, got ${decimals}`);
  }
  if (!isValid) {
    throw new Error("POST-AUDIT FAIL: Oracle isValid is false!");
  }
  if (!isFresh) {
    throw new Error(`POST-AUDIT FAIL: Oracle is still stale! Age: ${ageSeconds}s`);
  }
  if (!paused) {
    throw new Error("SAFETY FAIL: Lending contract is UNPAUSED! Must remain paused!");
  }
  if (poolLiquidity !== 1_000_000n) {
    throw new Error(`POST-AUDIT FAIL: Expected pool liquidity 1 USDC, got ${poolLiquidity}`);
  }
  if (totalDebt !== 0n || totalBadDebt !== 0n) {
    throw new Error("POST-AUDIT FAIL: Outstanding or bad debt detected!");
  }
  if (borrowerCollateral !== 0n || borrowerDebt !== 0n) {
    throw new Error("POST-AUDIT FAIL: Borrower position is not clean!");
  }
  if (borrowerCirBtc < 5_000_000n) {
    throw new Error("POST-AUDIT FAIL: Borrower cirBTC balance < 0.05!");
  }

  console.log("\n================================================================");
  console.log("=== STEP 1 FINAL METRICS ===");
  console.log("================================================================");
  console.log(`- Oracle Tx Hash: ${tx.hash}`);
  console.log(`- Confirmation Block: ${receipt.blockNumber}`);
  console.log(`- Post-Update Oracle Price: $${(Number(price) / 1e6).toFixed(2)} (${price.toString()})`);
  console.log(`- Post-Update Oracle Decimals: ${decimals}`);
  console.log(`- Post-Update Oracle Timestamp: ${updatedAt.toString()} (Age: ${ageSeconds.toString()}s)`);
  console.log(`- Post-Update Oracle isValid: ${isValid}`);
  console.log(`- Transaction Count: ${txCount}`);
  console.log(`- Signature Count: ${sigCount}`);
  console.log(`- Lending Contract Paused State: ${paused ? "YES (paused == true)" : "NO"}`);
  console.log("\nPHASE 4I STEP 1 COMPLETE — ORACLE FRESH, LENDING STILL PAUSED");
}

main().catch((error) => {
  console.error("Execution Error:", error);
  process.exit(1);
});
