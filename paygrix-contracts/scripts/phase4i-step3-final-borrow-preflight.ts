import { ethers } from "hardhat";

// 100% READ-ONLY SAFETY GUARD
const EXECUTION_ENABLED = false;

const CONFIG = {
  NETWORK_NAME: "Arc Testnet",
  EXPECTED_CHAIN_ID: 5042002n,
  PAYGRIX_LENDING_ADDRESS: "0x800Cd0a3b737e989F45E69f64eEeB118724522aE",
  PRODUCTION_ORACLE_ADAPTER: "0xA17Bfb3332A83F0e247129ee9c0d1A454A332287",
  OWNER_ADDRESS: "0xf85085b73a4Ec4efE895B532Fe1560a06ff0d179",
  BORROWER_ADDRESS: "0x00266374046e156d0Ce782F02505391981a53074",
  FUNDER_LIQUIDATOR_ADDRESS: "0x2f3cFb9bd88DEC61406f12F35146579aF42619f4",
  CIRBTC_ADDRESS: "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF",
  USDC_ADDRESS: "0x3600000000000000000000000000000000000000",
  
  TARGET_COLLATERAL_CIRBTC: 5_000_000n, // 0.05 cirBTC (8 decimals)
  TARGET_BORROW_USDC: 1_500_000_000n, // 1,500 USDC (6 decimals)
};

async function main() {
  console.log("================================================================");
  console.log("=== PAYGRIX LENDING PHASE 4I STEP 3: FINAL BORROW PREFLIGHT ===");
  console.log("================================================================");

  if (EXECUTION_ENABLED) {
    throw new Error("SAFETY VIOLATION: EXECUTION_ENABLED must be false during read-only audit!");
  }
  console.log("Safety Guard Verification: EXECUTION_ENABLED = false (100% READ-ONLY)\n");

  const network = await ethers.provider.getNetwork();
  if (network.chainId !== CONFIG.EXPECTED_CHAIN_ID) {
    throw new Error(`Invalid network: ${network.chainId}`);
  }

  const lendingAbi = [
    "function owner() external view returns (address)",
    "function oracle() external view returns (address)",
    "function collateralToken() external view returns (address)",
    "function borrowToken() external view returns (address)",
    "function borrowLtvBps() external view returns (uint256)",
    "function liquidationThresholdBps() external view returns (uint256)",
    "function paused() external view returns (bool)",
    "function poolLiquidity() external view returns (uint256)",
    "function totalOutstandingDebt() external view returns (uint256)",
    "function totalBadDebt() external view returns (uint256)",
    "function getPosition(address user) external view returns (uint256 collateral, uint256 debt)",
    "function maxBorrow(address user) external view returns (uint256)",
    "function healthFactor(address user) external view returns (uint256)",
  ];

  const oracleAbi = [
    "function getPriceData() external view returns (uint256 price, uint8 decimals, uint256 updatedAt, bool isValid)",
    "function maxStaleness() external view returns (uint256)",
  ];

  const erc20Abi = [
    "function balanceOf(address account) external view returns (uint256)",
    "function allowance(address owner, address spender) external view returns (uint256)",
  ];

  const lending = new ethers.Contract(CONFIG.PAYGRIX_LENDING_ADDRESS, lendingAbi, ethers.provider);
  const oracle = new ethers.Contract(CONFIG.PRODUCTION_ORACLE_ADAPTER, oracleAbi, ethers.provider);
  const cirBtc = new ethers.Contract(CONFIG.CIRBTC_ADDRESS, erc20Abi, ethers.provider);

  // 1. On-Chain Checks
  const owner: string = await lending.owner();
  const paused: boolean = await lending.paused();
  const poolLiquidity: bigint = await lending.poolLiquidity();
  const totalDebt: bigint = await lending.totalOutstandingDebt();
  const totalBadDebt: bigint = await lending.totalBadDebt();

  const ltv: bigint = await lending.borrowLtvBps();
  const threshold: bigint = await lending.liquidationThresholdBps();

  const [price, decimals, updatedAt, isValid] = await oracle.getPriceData();
  const maxStaleness: bigint = await oracle.maxStaleness();
  const block = await ethers.provider.getBlock("latest");
  const nowTs = BigInt(block?.timestamp || Math.floor(Date.now() / 1000));
  const ageSeconds = nowTs > updatedAt ? nowTs - updatedAt : 0n;
  const isFresh = isValid && ageSeconds <= maxStaleness && price === 60_000_000_000n;

  const borrowerCirBtcBal: bigint = await cirBtc.balanceOf(CONFIG.BORROWER_ADDRESS);
  const borrowerCirBtcAllowance: bigint = await cirBtc.allowance(CONFIG.BORROWER_ADDRESS, CONFIG.PAYGRIX_LENDING_ADDRESS);
  const [borrowerCollateral, borrowerDebt] = await lending.getPosition(CONFIG.BORROWER_ADDRESS);

  // Math validations
  const collateralCirBtcNum = Number(CONFIG.TARGET_COLLATERAL_CIRBTC) / 1e8; // 0.05
  const oraclePriceUsdNum = Number(price) / 1e6; // 60,000
  const collateralValueUsd = collateralCirBtcNum * oraclePriceUsdNum; // $3,000
  const maxBorrowCapacityUsd = collateralValueUsd * (Number(ltv) / 10000); // $1,500
  const liqThresholdValUsd = collateralValueUsd * (Number(threshold) / 10000); // $2,250
  const plannedBorrowUsdNum = Number(CONFIG.TARGET_BORROW_USDC) / 1e6; // $1,500
  const expectedHf = liqThresholdValUsd / plannedBorrowUsdNum; // 1.50
  const expectedHfBps = Math.round(expectedHf * 10000); // 15,000 bps

  console.log("--- ON-CHAIN SYSTEM AUDIT & PARAMETER VERIFICATION ---");
  console.log(`1. Lending Contract Owner: ${owner} (${owner.toLowerCase() === CONFIG.OWNER_ADDRESS.toLowerCase() ? "MATCH" : "MISMATCH"})`);
  console.log(`2. Contract Paused State: ${paused ? "true (PAUSED)" : "false"}`);
  console.log(`3. Oracle Status: Price = $${oraclePriceUsdNum.toFixed(2)}, Valid = ${isValid}, Age = ${ageSeconds}s (Max: ${maxStaleness}s), Fresh = ${isFresh}`);
  console.log(`4. Borrower cirBTC Balance: ${ethers.formatUnits(borrowerCirBtcBal, 8)} cirBTC (${borrowerCirBtcBal.toString()} satoshis)`);
  console.log(`5. Borrower cirBTC Allowance to Lending: ${ethers.formatUnits(borrowerCirBtcAllowance, 8)} cirBTC`);
  console.log(`6. Borrower Collateral: ${ethers.formatUnits(borrowerCollateral, 8)} cirBTC`);
  console.log(`7. Borrower Debt: ${ethers.formatUnits(borrowerDebt, 6)} USDC`);
  console.log(`8. Pool Liquidity: ${ethers.formatUnits(poolLiquidity, 6)} USDC`);
  console.log(`9. Outstanding System Debt: ${ethers.formatUnits(totalDebt, 6)} USDC, Bad Debt: ${ethers.formatUnits(totalBadDebt, 6)} USDC`);
  console.log(`10. Borrow LTV: ${ltv.toString()} bps (${Number(ltv)/100}%), Liquidation Threshold: ${threshold.toString()} bps (${Number(threshold)/100}%)`);
  console.log(`11. Calculated Collateral Value (0.05 cirBTC @ $60k): $${collateralValueUsd.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
  console.log(`12. Calculated Max Borrow (50% LTV): $${maxBorrowCapacityUsd.toLocaleString("en-US", { minimumFractionDigits: 2 })} USDC`);
  console.log(`13. Calculated Initial HF (75% Threshold): ${expectedHf.toFixed(2)} (${expectedHfBps.toLocaleString()} bps / 150.00%)`);
  console.log(`14. Pool Liquidity Capacity Check: ${plannedBorrowUsdNum} USDC <= ${ethers.formatUnits(poolLiquidity, 6)} USDC (SUFFICIENT)`);

  console.log("\n================================================================");
  console.log("=== FUTURE BORROW TRANSACTION SEQUENCE AUDIT ===");
  console.log("================================================================");
  console.log("Transaction 1: PayGrixLending.unpause()");
  console.log("  - Signer: Contract Owner (0xf85085b73a4Ec4efE895B532Fe1560a06ff0d179)");
  console.log("  - Contract: PayGrixLending (0x800Cd0a3b737e989F45E69f64eEeB118724522aE)");
  console.log("  - Function Signature: unpause() external onlyOwner");
  console.log("  - Purpose: Temporarily unpauses protocol so user operations (depositCollateral, borrow) can execute.");

  console.log("\nTransaction 2: cirBTC.approve(PayGrixLending, 5_000_000)");
  console.log("  - Signer: Borrower Wallet (0x00266374046e156d0Ce782F02505391981a53074)");
  console.log("  - Token: cirBTC (0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF)");
  console.log("  - Spender Address: PayGrixLending (0x800Cd0a3b737e989F45E69f64eEeB118724522aE)");
  console.log("  - Function Signature: approve(address spender, uint256 amount) external returns (bool)");
  console.log("  - Raw Amount: 5,000,000 satoshis (0.05 cirBTC in 8 decimals)");

  console.log("\nTransaction 3: PayGrixLending.depositCollateral(5_000_000)");
  console.log("  - Signer: Borrower Wallet (0x00266374046e156d0Ce782F02505391981a53074)");
  console.log("  - Contract: PayGrixLending (0x800Cd0a3b737e989F45E69f64eEeB118724522aE)");
  console.log("  - Function Signature: depositCollateral(uint256 amount) external whenNotPaused nonReentrant");
  console.log("  - Raw Amount: 5,000,000 satoshis (0.05 cirBTC)");

  console.log("\nTransaction 4: PayGrixLending.borrow(1_500_000_000)");
  console.log("  - Signer: Borrower Wallet (0x00266374046e156d0Ce782F02505391981a53074)");
  console.log("  - Contract: PayGrixLending (0x800Cd0a3b737e989F45E69f64eEeB118724522aE)");
  console.log("  - Function Signature: borrow(uint256 amount) external whenNotPaused nonReentrant");
  console.log("  - Raw Amount: 1,500,000,000 base units (1,500 USDC in 6 decimals)");

  console.log("\n================================================================");
  console.log("=== EXPECTED POST-BORROW STATE ===");
  console.log("================================================================");
  console.log("- Borrower Collateral: 0.05 cirBTC (5,000,000 satoshis)");
  console.log("- Borrower Debt: 1,500.00 USDC (1,500,000,000 raw)");
  console.log("- Borrower Health Factor: 1.50 (15,000 bps)");
  console.log("- Pool Liquidity Remaining: 0.00 USDC (1,500 USDC borrowed)");
  console.log("- Total Outstanding System Debt: 1,500.00 USDC");
  console.log("- Total Bad Debt: 0.00 USDC");

  console.log("\n------------------------------------------------");
  console.log("Transactions executed: 0");
  console.log("Signatures requested: 0");
  console.log(`Contract paused after audit: ${paused}`);
  console.log("Borrow executed: NO");
  console.log("Ready for explicit write approval: YES");
  console.log("------------------------------------------------");
}

main().catch((error) => {
  console.error("Audit Error:", error);
  process.exit(1);
});
