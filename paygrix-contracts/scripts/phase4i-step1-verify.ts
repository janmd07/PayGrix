import { ethers } from "hardhat";

const CONFIG = {
  NETWORK_NAME: "Arc Testnet",
  EXPECTED_CHAIN_ID: 5042002n,
  PAYGRIX_LENDING_ADDRESS: "0x800Cd0a3b737e989F45E69f64eEeB118724522aE",
  PRODUCTION_ORACLE_ADAPTER: "0xA17Bfb3332A83F0e247129ee9c0d1A454A332287",
  BORROWER_ADDRESS: "0x00266374046e156d0Ce782F02505391981a53074",
  CIRBTC_ADDRESS: "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF",
  USDC_ADDRESS: "0x3600000000000000000000000000000000000000",
  EXPECTED_PRICE: 60_000_000_000n, // $60,000 (6 decimals)
};

async function main() {
  console.log("================================================================");
  console.log("=== PAYGRIX LENDING PHASE 4I STEP 1: POST-UPDATE READ-ONLY AUDIT ===");
  console.log("================================================================");

  const oracleAbi = [
    "function getPriceData() external view returns (uint256 price, uint8 decimals, uint256 updatedAt, bool isValid)",
    "function maxStaleness() external view returns (uint256)",
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

  const oracle = new ethers.Contract(CONFIG.PRODUCTION_ORACLE_ADAPTER, oracleAbi, ethers.provider);
  const lending = new ethers.Contract(CONFIG.PAYGRIX_LENDING_ADDRESS, lendingAbi, ethers.provider);
  const cirBtcToken = new ethers.Contract(CONFIG.CIRBTC_ADDRESS, erc20Abi, ethers.provider);

  const onChainOracleAddr: string = await lending.oracle();
  const [price, decimals, updatedAt, isValid] = await oracle.getPriceData();
  const maxStaleness: bigint = await oracle.maxStaleness();

  const auditBlock = await ethers.provider.getBlock("latest");
  const auditNow = BigInt(auditBlock?.timestamp || Math.floor(Date.now() / 1000));
  const ageSeconds = auditNow > updatedAt ? auditNow - updatedAt : 0n;
  const isFresh = ageSeconds <= maxStaleness;

  const paused: boolean = await lending.paused();
  const poolLiquidity: bigint = await lending.poolLiquidity();
  const totalDebt: bigint = await lending.totalOutstandingDebt();
  const totalBadDebt: bigint = await lending.totalBadDebt();
  const [borrowerCollateral, borrowerDebt] = await lending.getPosition(CONFIG.BORROWER_ADDRESS);
  const borrowerCirBtc: bigint = await cirBtcToken.balanceOf(CONFIG.BORROWER_ADDRESS);

  console.log(`1. Oracle Address Unchanged: ${onChainOracleAddr === CONFIG.PRODUCTION_ORACLE_ADAPTER ? "YES (PASS)" : "NO"}`);
  console.log(`2. Oracle Price: $${(Number(price) / 10 ** Number(decimals)).toLocaleString("en-US", { minimumFractionDigits: 2 })} (${price.toString()})`);
  console.log(`3. Oracle Decimals: ${decimals.toString()}`);
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

  // Explicit verifications
  if (onChainOracleAddr.toLowerCase() !== CONFIG.PRODUCTION_ORACLE_ADAPTER.toLowerCase()) {
    throw new Error("POST-AUDIT FAIL: Oracle address mismatch!");
  }
  if (price !== CONFIG.EXPECTED_PRICE) {
    throw new Error(`POST-AUDIT FAIL: Expected price ${CONFIG.EXPECTED_PRICE}, got ${price}`);
  }
  if (Number(decimals) !== 6) {
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
  console.log(`- Oracle Tx Hash: 0xd3def754381941cf580a9a47a3f60153970a3def211820f6409e27f4e4a777a3`);
  console.log(`- Confirmation Block: 57633032`);
  console.log(`- Post-Update Oracle Price: $${(Number(price) / 1e6).toFixed(2)} (${price.toString()})`);
  console.log(`- Post-Update Oracle Decimals: ${decimals.toString()}`);
  console.log(`- Post-Update Oracle Timestamp: ${updatedAt.toString()} (Age: ${ageSeconds.toString()}s)`);
  console.log(`- Post-Update Oracle isValid: ${isValid}`);
  console.log(`- Transaction Count: 1`);
  console.log(`- Signature Count: 1`);
  console.log(`- Lending Contract Paused State: ${paused ? "YES (paused == true)" : "NO"}`);
  console.log("\nPHASE 4I STEP 1 COMPLETE — ORACLE FRESH, LENDING STILL PAUSED");
}

main().catch((error) => {
  console.error("Execution Error:", error);
  process.exit(1);
});
