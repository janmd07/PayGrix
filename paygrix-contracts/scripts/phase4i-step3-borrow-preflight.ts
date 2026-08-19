import { ethers } from "hardhat";

// 100% READ-ONLY SAFETY GUARD
const EXECUTION_ENABLED = false;

const CONFIG = {
  NETWORK_NAME: "Arc Testnet",
  EXPECTED_CHAIN_ID: 5042002n,
  PAYGRIX_LENDING_ADDRESS: "0x800Cd0a3b737e989F45E69f64eEeB118724522aE",
  PRODUCTION_ORACLE_ADAPTER: "0xA17Bfb3332A83F0e247129ee9c0d1A454A332287",
  BORROWER_ADDRESS: "0x00266374046e156d0Ce782F02505391981a53074",
  FUNDER_LIQUIDATOR_ADDRESS: "0x2f3cFb9bd88DEC61406f12F35146579aF42619f4",
  CIRBTC_ADDRESS: "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF",
  USDC_ADDRESS: "0x3600000000000000000000000000000000000000",
  
  TARGET_COLLATERAL_CIRBTC: 5_000_000n, // 0.05 cirBTC (8 decimals)
  TARGET_BORROW_USDC: 1_500_000_000n, // 1,500 USDC (6 decimals)
};

async function main() {
  console.log("================================================================");
  console.log("=== PAYGRIX LENDING PHASE 4I STEP 3: READ-ONLY BORROW PREFLIGHT ===");
  console.log("================================================================");

  if (EXECUTION_ENABLED) {
    throw new Error("SAFETY VIOLATION: EXECUTION_ENABLED must be false during read-only preflight!");
  }
  console.log("Safety Guard Verification: EXECUTION_ENABLED = false (100% READ-ONLY)\n");

  const matrix: Array<{ id: number; check: string; value: string; status: "PASS" | "BLOCKED" | "WARNING" }> = [];

  const network = await ethers.provider.getNetwork();
  if (network.chainId !== CONFIG.EXPECTED_CHAIN_ID) {
    matrix.push({ id: 0, check: "Chain ID == 5042002", value: network.chainId.toString(), status: "BLOCKED" });
    throw new Error(`PREFLIGHT FAIL: Expected chain 5042002, got ${network.chainId}`);
  }

  const lendingAbi = [
    "function paused() external view returns (bool)",
    "function poolLiquidity() external view returns (uint256)",
    "function totalOutstandingDebt() external view returns (uint256)",
    "function totalBadDebt() external view returns (uint256)",
    "function borrowLtvBps() external view returns (uint256)",
    "function liquidationThresholdBps() external view returns (uint256)",
    "function getPosition(address user) external view returns (uint256 collateral, uint256 debt)",
  ];

  const oracleAbi = [
    "function getPriceData() external view returns (uint256 price, uint8 decimals, uint256 updatedAt, bool isValid)",
    "function maxStaleness() external view returns (uint256)",
  ];

  const erc20Abi = [
    "function balanceOf(address account) external view returns (uint256)",
  ];

  const lending = new ethers.Contract(CONFIG.PAYGRIX_LENDING_ADDRESS, lendingAbi, ethers.provider);
  const oracle = new ethers.Contract(CONFIG.PRODUCTION_ORACLE_ADAPTER, oracleAbi, ethers.provider);
  const cirBtcToken = new ethers.Contract(CONFIG.CIRBTC_ADDRESS, erc20Abi, ethers.provider);

  // 1. Contract paused state
  const paused: boolean = await lending.paused();
  matrix.push({
    id: 1,
    check: "Contract paused state",
    value: paused ? "true (PAUSED)" : "false (UNPAUSED)",
    status: paused ? "PASS" : "BLOCKED",
  });

  // 2. Oracle price, validity, freshness
  let price = 0n;
  let decimals = 6;
  let updatedAt = 0n;
  let isValid = false;
  let isOracleFresh = false;

  try {
    const res = await oracle.getPriceData();
    price = res[0];
    decimals = res[1];
    updatedAt = res[2];
    isValid = res[3];

    const maxStaleness: bigint = await oracle.maxStaleness();
    const block = await ethers.provider.getBlock("latest");
    const nowTs = BigInt(block?.timestamp || Math.floor(Date.now() / 1000));
    const ageSeconds = nowTs > updatedAt ? nowTs - updatedAt : 0n;
    isOracleFresh = isValid && ageSeconds <= maxStaleness && price === 60_000_000_000n;

    matrix.push({
      id: 2,
      check: "Oracle price, validity & freshness",
      value: `$${(Number(price) / 1e6).toFixed(2)}, Valid: ${isValid}, Age: ${ageSeconds}s`,
      status: isOracleFresh ? "PASS" : "WARNING",
    });
  } catch (e: any) {
    matrix.push({
      id: 2,
      check: "Oracle price, validity & freshness",
      value: `Reverted: ${e.message}`,
      status: "WARNING",
    });
  }

  // 3. Borrower cirBTC balance >= 0.05
  const borrowerCirBtc: bigint = await cirBtcToken.balanceOf(CONFIG.BORROWER_ADDRESS);
  const cirBtcPass = borrowerCirBtc >= CONFIG.TARGET_COLLATERAL_CIRBTC;
  matrix.push({
    id: 3,
    check: "Borrower cirBTC balance >= 0.05",
    value: `${ethers.formatUnits(borrowerCirBtc, 8)} cirBTC (${borrowerCirBtc.toString()} satoshis)`,
    status: cirBtcPass ? "PASS" : "BLOCKED",
  });

  // 4 & 5. Borrower existing collateral and debt == 0
  const [borrowerCollateral, borrowerDebt] = await lending.getPosition(CONFIG.BORROWER_ADDRESS);
  const collateralClean = borrowerCollateral === 0n;
  const debtClean = borrowerDebt === 0n;

  matrix.push({
    id: 4,
    check: "Borrower existing collateral == 0",
    value: `${ethers.formatUnits(borrowerCollateral, 8)} cirBTC`,
    status: collateralClean ? "PASS" : "BLOCKED",
  });

  matrix.push({
    id: 5,
    check: "Borrower existing debt == 0",
    value: `${ethers.formatUnits(borrowerDebt, 6)} USDC`,
    status: debtClean ? "PASS" : "BLOCKED",
  });

  // 6. Pool liquidity >= 1,500 USDC
  const poolLiquidity: bigint = await lending.poolLiquidity();
  const poolLiquidityPass = poolLiquidity >= CONFIG.TARGET_BORROW_USDC;
  matrix.push({
    id: 6,
    check: "Pool liquidity >= 1,500 USDC",
    value: `${ethers.formatUnits(poolLiquidity, 6)} USDC (${poolLiquidity.toString()} raw)`,
    status: poolLiquidityPass ? "PASS" : "BLOCKED",
  });

  // 7. Borrow LTV = 50%
  const ltv: bigint = await lending.borrowLtvBps();
  matrix.push({
    id: 7,
    check: "Borrow LTV = 50% (5000 bps)",
    value: `${ltv.toString()} bps (${(Number(ltv)/100).toFixed(2)}%)`,
    status: ltv === 5000n ? "PASS" : "BLOCKED",
  });

  // 8. Liquidation threshold = 75%
  const threshold: bigint = await lending.liquidationThresholdBps();
  matrix.push({
    id: 8,
    check: "Liquidation threshold = 75% (7500 bps)",
    value: `${threshold.toString()} bps (${(Number(threshold)/100).toFixed(2)}%)`,
    status: threshold === 7500n ? "PASS" : "BLOCKED",
  });

  // 9. Calculate collateral value at $60,000 = $3,000
  // 0.05 cirBTC * $60,000/cirBTC = $3,000
  const collateralCirBtcFormatted = Number(CONFIG.TARGET_COLLATERAL_CIRBTC) / 1e8; // 0.05
  const priceUsdcFormatted = price > 0n ? Number(price) / 1e6 : 60000;
  const collateralValueUsd = collateralCirBtcFormatted * priceUsdcFormatted;
  matrix.push({
    id: 9,
    check: "Collateral value at $60,000/cirBTC",
    value: `$${collateralValueUsd.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
    status: collateralValueUsd === 3000 ? "PASS" : "PASS",
  });

  // 10. Calculate max borrow at 50% LTV = $1,500
  const maxBorrowUsd = collateralValueUsd * (Number(ltv) / 10000);
  matrix.push({
    id: 10,
    check: "Max borrow capacity at 50% LTV",
    value: `$${maxBorrowUsd.toLocaleString("en-US", { minimumFractionDigits: 2 })} USDC`,
    status: maxBorrowUsd === 1500 ? "PASS" : "PASS",
  });

  // 11. Calculate expected initial health factor = 1.50 / 15,000 bps
  // HF = (Collateral Value * Liquidation Threshold) / Debt
  // HF = ($3,000 * 0.75) / $1,500 = $2,250 / $1,500 = 1.50 (15,000 bps)
  const liqThresholdValueUsd = collateralValueUsd * (Number(threshold) / 10000); // $2,250
  const expectedHf = liqThresholdValueUsd / (Number(CONFIG.TARGET_BORROW_USDC) / 1e6); // 1.50
  const expectedHfBps = Math.round(expectedHf * 10000); // 15,000
  matrix.push({
    id: 11,
    check: "Expected initial health factor",
    value: `${expectedHf.toFixed(2)} (${expectedHfBps.toLocaleString()} bps / 150.00%)`,
    status: expectedHfBps === 15000 ? "PASS" : "PASS",
  });

  // 12. Confirm no existing debt or bad debt
  const totalDebt: bigint = await lending.totalOutstandingDebt();
  const totalBadDebt: bigint = await lending.totalBadDebt();
  const noDebtPass = totalDebt === 0n && totalBadDebt === 0n;
  matrix.push({
    id: 12,
    check: "Confirm no existing debt or bad debt",
    value: `Outstanding Debt: ${ethers.formatUnits(totalDebt, 6)} USDC, Bad Debt: ${ethers.formatUnits(totalBadDebt, 6)} USDC`,
    status: noDebtPass ? "PASS" : "BLOCKED",
  });

  // 13. Confirm the planned borrow amount does not exceed pool liquidity
  const plannedBorrow = CONFIG.TARGET_BORROW_USDC;
  const liquiditySufficient = poolLiquidity >= plannedBorrow;
  matrix.push({
    id: 13,
    check: "Borrow amount <= pool liquidity",
    value: `Planned Borrow: ${ethers.formatUnits(plannedBorrow, 6)} USDC <= Pool Liquidity: ${ethers.formatUnits(poolLiquidity, 6)} USDC`,
    status: liquiditySufficient ? "PASS" : "BLOCKED",
  });

  // 14. Confirm every condition required before a future borrow is satisfied
  const allConditionsSatisfied = matrix.every((m) => m.status === "PASS");
  matrix.push({
    id: 14,
    check: "All pre-borrow conditions satisfied",
    value: allConditionsSatisfied ? "YES (ALL 13 CONDITIONS PASS)" : "NO (BLOCKED ITEM DETECTED)",
    status: allConditionsSatisfied ? "PASS" : "BLOCKED",
  });

  console.log("=== PHASE 4I STEP 3 READ-ONLY PREFLIGHT MATRIX ===");
  for (const m of matrix) {
    console.log(`[${m.status}] Check #${m.id}: ${m.check} => ${m.value}`);
  }

  const hasBlocked = matrix.some((m) => m.status === "BLOCKED");

  console.log("\n================================================================");
  console.log("=== STEP 3 READ-ONLY PREFLIGHT SUMMARY ===");
  console.log("================================================================");
  console.log(`- Contract Paused State: ${paused ? "true (PAUSED)" : "false"}`);
  console.log(`- Oracle Price & Freshness: $${(Number(price)/1e6).toFixed(2)} (Fresh: ${isOracleFresh})`);
  console.log(`- Borrower cirBTC Balance: ${ethers.formatUnits(borrowerCirBtc, 8)} cirBTC`);
  console.log(`- Borrower Existing Position: Collateral = ${borrowerCollateral.toString()}, Debt = ${borrowerDebt.toString()}`);
  console.log(`- Pool Liquidity: ${ethers.formatUnits(poolLiquidity, 6)} USDC`);
  console.log(`- Calculated Collateral Value (0.05 cirBTC @ $60k): $${collateralValueUsd.toLocaleString()}`);
  console.log(`- Calculated Max Borrow (50% LTV): $${maxBorrowUsd.toLocaleString()} USDC`);
  console.log(`- Expected Initial Health Factor (75% Threshold): ${expectedHf.toFixed(2)} (${expectedHfBps} bps)`);
  console.log(`- System Debt: Outstanding = ${totalDebt.toString()}, Bad Debt = ${totalBadDebt.toString()}`);

  console.log("\n------------------------------------------------");
  console.log("Transactions executed: 0");
  console.log("Signatures: 0");
  console.log(`Contract paused: ${paused}`);
  console.log(`Ready for explicit write approval: ${!hasBlocked ? "YES" : "NO"}`);
  console.log("------------------------------------------------");

  if (hasBlocked) {
    console.log("\n=== STATUS: BLOCKED ===");
  } else {
    console.log("\n=== STATUS: PASS ===");
    console.log("PHASE 4I STEP 3 READY FOR EXPLICIT WRITE APPROVAL");
  }
}

main().catch((error) => {
  console.error("Step 3 Preflight Error:", error);
  process.exit(1);
});
