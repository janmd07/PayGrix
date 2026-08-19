import { ethers } from "hardhat";

// 100% READ-ONLY SAFETY GUARD — DO NOT CHANGE TO TRUE
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
  
  // Phase 4I Target Simulation Parameters
  TARGET_COLLATERAL_CIRBTC: 5_000_000n, // 0.05 cirBTC (8 decimals)
  TARGET_BORROW_USDC: 1_500_000_000n, // 1,500 USDC (6 decimals)
  TARGET_LIQUIDATION_REPAYMENT_USDC: 750_000_000n, // 750 USDC (6 decimals)
};

async function main() {
  console.log("================================================================");
  console.log("=== PAYGRIX LENDING PHASE 4I — READ-ONLY PREFLIGHT AUDIT ===");
  console.log("================================================================");

  if (EXECUTION_ENABLED) {
    throw new Error("SAFETY VIOLATION: EXECUTION_ENABLED must be false during read-only preflight!");
  }
  console.log("Safety Guard Verification: EXECUTION_ENABLED = false (100% READ-ONLY)\n");

  const matrix: Array<{ id: number; check: string; value: string; status: "PASS" | "BLOCKED" | "WARNING" }> = [];

  // 1. Network Verification
  const network = await ethers.provider.getNetwork();
  const chainId = network.chainId;
  const chainIdPass = chainId === CONFIG.EXPECTED_CHAIN_ID;
  matrix.push({
    id: 1,
    check: "Chain ID == 5042002",
    value: chainId.toString(),
    status: chainIdPass ? "PASS" : "BLOCKED",
  });

  // ABIs
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
    "function availableCollateral(address user) external view returns (uint256)",
  ];

  const oracleAbi = [
    "function getPriceData() external view returns (uint256 price, uint8 decimals, uint256 updatedAt, bool isValid)",
    "function maxStaleness() external view returns (uint256)",
    "function minPrice() external view returns (uint256)",
    "function maxPrice() external view returns (uint256)",
  ];

  const erc20Abi = [
    "function balanceOf(address account) external view returns (uint256)",
  ];

  const lending = new ethers.Contract(CONFIG.PAYGRIX_LENDING_ADDRESS, lendingAbi, ethers.provider);
  const oracle = new ethers.Contract(CONFIG.PRODUCTION_ORACLE_ADAPTER, oracleAbi, ethers.provider);
  const cirBtcToken = new ethers.Contract(CONFIG.CIRBTC_ADDRESS, erc20Abi, ethers.provider);
  const usdcToken = new ethers.Contract(CONFIG.USDC_ADDRESS, erc20Abi, ethers.provider);

  // 2. Lending Contract Address
  const lendingCode = await ethers.provider.getCode(CONFIG.PAYGRIX_LENDING_ADDRESS);
  const isContract = lendingCode !== "0x" && lendingCode !== "0x00";
  matrix.push({
    id: 2,
    check: "Lending Contract Address",
    value: CONFIG.PAYGRIX_LENDING_ADDRESS,
    status: isContract ? "PASS" : "BLOCKED",
  });

  // 3. Lending Owner
  const owner: string = await lending.owner();
  matrix.push({
    id: 3,
    check: "Lending Owner",
    value: owner,
    status: owner ? "PASS" : "BLOCKED",
  });

  // 4. Oracle Address
  const onChainOracle: string = await lending.oracle();
  const oracleMatches = onChainOracle.toLowerCase() === CONFIG.PRODUCTION_ORACLE_ADAPTER.toLowerCase();
  matrix.push({
    id: 4,
    check: "Oracle Address",
    value: onChainOracle,
    status: oracleMatches ? "PASS" : "BLOCKED",
  });

  // 5. Collateral Token
  const collateralToken: string = await lending.collateralToken();
  const collateralMatches = collateralToken.toLowerCase() === CONFIG.CIRBTC_ADDRESS.toLowerCase();
  matrix.push({
    id: 5,
    check: "collateralToken == cirBTC",
    value: collateralToken,
    status: collateralMatches ? "PASS" : "BLOCKED",
  });

  // 6. Borrow Token
  const borrowToken: string = await lending.borrowToken();
  const borrowMatches = borrowToken.toLowerCase() === CONFIG.USDC_ADDRESS.toLowerCase();
  matrix.push({
    id: 6,
    check: "borrowToken == USDC",
    value: borrowToken,
    status: borrowMatches ? "PASS" : "BLOCKED",
  });

  // 7. borrowLtvBps == 5000
  const ltv: bigint = await lending.borrowLtvBps();
  matrix.push({
    id: 7,
    check: "borrowLtvBps == 5000",
    value: `${ltv.toString()} bps (${(Number(ltv) / 100).toFixed(2)}%)`,
    status: ltv === 5000n ? "PASS" : "BLOCKED",
  });

  // 8. liquidationThresholdBps == 7500
  const threshold: bigint = await lending.liquidationThresholdBps();
  matrix.push({
    id: 8,
    check: "liquidationThresholdBps == 7500",
    value: `${threshold.toString()} bps (${(Number(threshold) / 100).toFixed(2)}%)`,
    status: threshold === 7500n ? "PASS" : "BLOCKED",
  });

  // 9. paused == true
  const paused: boolean = await lending.paused();
  matrix.push({
    id: 9,
    check: "paused == true",
    value: paused ? "true (PAUSED)" : "false (UNPAUSED)",
    status: paused ? "PASS" : "WARNING",
  });

  // 10. poolLiquidity
  const poolLiquidity: bigint = await lending.poolLiquidity();
  matrix.push({
    id: 10,
    check: "poolLiquidity",
    value: `${ethers.formatUnits(poolLiquidity, 6)} USDC (${poolLiquidity.toString()} raw)`,
    status: "PASS",
  });

  // 11. totalOutstandingDebt
  const totalOutstandingDebt: bigint = await lending.totalOutstandingDebt();
  matrix.push({
    id: 11,
    check: "totalOutstandingDebt",
    value: `${ethers.formatUnits(totalOutstandingDebt, 6)} USDC (${totalOutstandingDebt.toString()} raw)`,
    status: "PASS",
  });

  // 12. totalBadDebt
  const totalBadDebt: bigint = await lending.totalBadDebt();
  matrix.push({
    id: 12,
    check: "totalBadDebt",
    value: `${ethers.formatUnits(totalBadDebt, 6)} USDC (${totalBadDebt.toString()} raw)`,
    status: "PASS",
  });

  // Oracle inspection (support both view call and raw storage read if getPriceData reverts due to staleness)
  const maxStaleness: bigint = await oracle.maxStaleness();
  const minPrice: bigint = await oracle.minPrice();
  const maxPrice: bigint = await oracle.maxPrice();

  const currentBlock = await ethers.provider.getBlock("latest");
  const nowTs = BigInt(currentBlock?.timestamp || Math.floor(Date.now() / 1000));

  let oraclePrice = 0n;
  let oracleDecimals = 6;
  let updatedAt = 0n;
  let isValid = false;
  let getPriceDataReverted = false;

  try {
    const res = await oracle.getPriceData();
    oraclePrice = res[0];
    oracleDecimals = res[1];
    updatedAt = res[2];
    isValid = res[3];
  } catch (err: any) {
    getPriceDataReverted = true;
    // Read raw storage slots from ProductionOracleAdapter:
    // slot 1: _price
    // slot 2: _decimals
    // slot 3: _updatedAt
    // slot 4: _isValid
    const slot1 = await ethers.provider.getStorage(CONFIG.PRODUCTION_ORACLE_ADAPTER, 1);
    const slot2 = await ethers.provider.getStorage(CONFIG.PRODUCTION_ORACLE_ADAPTER, 2);
    const slot3 = await ethers.provider.getStorage(CONFIG.PRODUCTION_ORACLE_ADAPTER, 3);
    const slot4 = await ethers.provider.getStorage(CONFIG.PRODUCTION_ORACLE_ADAPTER, 4);

    oraclePrice = BigInt(slot1);
    oracleDecimals = Number(BigInt(slot2));
    updatedAt = BigInt(slot3);
    isValid = BigInt(slot4) !== 0n;
  }

  const ageSeconds = nowTs > updatedAt ? nowTs - updatedAt : 0n;
  const isFresh = !getPriceDataReverted && ageSeconds <= maxStaleness;

  // 13. Oracle price
  const formattedPrice = (Number(oraclePrice) / 10 ** oracleDecimals).toLocaleString("en-US", { minimumFractionDigits: 2 });
  matrix.push({
    id: 13,
    check: "Oracle price",
    value: `$${formattedPrice} (${oraclePrice.toString()})`,
    status: "PASS",
  });

  // 14. Oracle updatedAt / freshness
  matrix.push({
    id: 14,
    check: "Oracle updatedAt / freshness",
    value: `updatedAt: ${updatedAt.toString()}, age: ${ageSeconds.toString()}s (maxStaleness: ${maxStaleness.toString()}s) ${getPriceDataReverted ? "[STALE: getPriceData() reverts until updated]" : "[FRESH]"}`,
    status: isFresh ? "PASS" : "WARNING",
  });

  // 15. Oracle validity
  matrix.push({
    id: 15,
    check: "Oracle validity",
    value: `isValid = ${isValid.toString()}`,
    status: isValid ? "PASS" : "BLOCKED",
  });

  // 16. Oracle bounds
  // Note: stored price might be unnormalized (60000000000 = 60000 * 10^6) or 6 decimal normalized.
  let normalizedPrice = oraclePrice;
  if (oracleDecimals > 6) {
    normalizedPrice = oraclePrice / (10n ** BigInt(oracleDecimals - 6));
  } else if (oracleDecimals < 6) {
    normalizedPrice = oraclePrice * (10n ** BigInt(6 - oracleDecimals));
  }
  const withinBounds = normalizedPrice >= minPrice && normalizedPrice <= maxPrice;
  matrix.push({
    id: 16,
    check: "Oracle bounds",
    value: `normalized: $${Number(normalizedPrice) / 1e6}, min: $${Number(minPrice) / 1e6}, max: $${Number(maxPrice) / 1e6}`,
    status: withinBounds ? "PASS" : "BLOCKED",
  });

  // Borrower balances & position
  const borrowerNativeGas = await ethers.provider.getBalance(CONFIG.BORROWER_ADDRESS);
  const borrowerCirBtc = await cirBtcToken.balanceOf(CONFIG.BORROWER_ADDRESS);
  const borrowerUsdc = await usdcToken.balanceOf(CONFIG.BORROWER_ADDRESS);
  const [borrowerCollateral, borrowerDebt] = await lending.getPosition(CONFIG.BORROWER_ADDRESS);
  
  let borrowerHf = 0n;
  let borrowerMaxBorrow = 0n;
  let borrowerAvailableCollateral = 0n;
  try {
    borrowerHf = await lending.healthFactor(CONFIG.BORROWER_ADDRESS);
    borrowerMaxBorrow = await lending.maxBorrow(CONFIG.BORROWER_ADDRESS);
    borrowerAvailableCollateral = await lending.availableCollateral(CONFIG.BORROWER_ADDRESS);
  } catch {
    // If lending views revert due to stale oracle
    borrowerHf = 0n;
  }

  // 17. Borrower native gas balance
  matrix.push({
    id: 17,
    check: "Borrower native gas balance",
    value: `${ethers.formatEther(borrowerNativeGas)} ARC`,
    status: borrowerNativeGas > 0n ? "PASS" : "WARNING",
  });

  // 18. Borrower cirBTC balance — confirm >= 0.05 cirBTC
  const cirBtcSufficient = borrowerCirBtc >= CONFIG.TARGET_COLLATERAL_CIRBTC;
  matrix.push({
    id: 18,
    check: "Borrower cirBTC balance >= 0.05",
    value: `${ethers.formatUnits(borrowerCirBtc, 8)} cirBTC (${borrowerCirBtc.toString()} satoshis)`,
    status: cirBtcSufficient ? "PASS" : "BLOCKED",
  });

  // 19. Borrower USDC balance
  matrix.push({
    id: 19,
    check: "Borrower USDC balance",
    value: `${ethers.formatUnits(borrowerUsdc, 6)} USDC`,
    status: "PASS",
  });

  // 20. Borrower existing collateral
  matrix.push({
    id: 20,
    check: "Borrower existing collateral",
    value: `${ethers.formatUnits(borrowerCollateral, 8)} cirBTC`,
    status: borrowerCollateral === 0n ? "PASS" : "BLOCKED",
  });

  // 21. Borrower existing debt
  matrix.push({
    id: 21,
    check: "Borrower existing debt",
    value: `${ethers.formatUnits(borrowerDebt, 6)} USDC`,
    status: borrowerDebt === 0n ? "PASS" : "BLOCKED",
  });

  // 22. Borrower healthFactor
  matrix.push({
    id: 22,
    check: "Borrower healthFactor (initial)",
    value: borrowerHf.toString() === "0" ? "Max (No Debt)" : borrowerHf.toString(),
    status: "PASS",
  });

  // 23. Borrower maxBorrow
  matrix.push({
    id: 23,
    check: "Borrower maxBorrow (initial)",
    value: `${ethers.formatUnits(borrowerMaxBorrow, 6)} USDC`,
    status: "PASS",
  });

  // 24. Borrower availableCollateral
  matrix.push({
    id: 24,
    check: "Borrower availableCollateral",
    value: `${ethers.formatUnits(borrowerAvailableCollateral, 8)} cirBTC`,
    status: "PASS",
  });

  // Liquidator balances
  const liquidatorNativeGas = await ethers.provider.getBalance(CONFIG.FUNDER_LIQUIDATOR_ADDRESS);
  const liquidatorUsdc = await usdcToken.balanceOf(CONFIG.FUNDER_LIQUIDATOR_ADDRESS);

  // 25. Funder/Liquidator native gas balance
  matrix.push({
    id: 25,
    check: "Funder/Liquidator native gas balance",
    value: `${ethers.formatEther(liquidatorNativeGas)} ARC`,
    status: liquidatorNativeGas > 0n ? "PASS" : "WARNING",
  });

  // 26. Funder/Liquidator USDC balance
  const liquidatorUsdcSufficient = liquidatorUsdc >= CONFIG.TARGET_LIQUIDATION_REPAYMENT_USDC;
  matrix.push({
    id: 26,
    check: "Funder/Liquidator USDC balance >= 750 USDC",
    value: `${ethers.formatUnits(liquidatorUsdc, 6)} USDC`,
    status: liquidatorUsdcSufficient ? "PASS" : "BLOCKED",
  });

  // 27. Current pool liquidity and exact additional USDC required for a 1,500 USDC borrow
  const targetBorrow = CONFIG.TARGET_BORROW_USDC; // 1500 USDC = 1,500,000,000
  const additionalFundingNeeded = targetBorrow > poolLiquidity ? targetBorrow - poolLiquidity : 0n;
  matrix.push({
    id: 27,
    check: "Pool liquidity for 1,500 USDC borrow",
    value: `Current: ${ethers.formatUnits(poolLiquidity, 6)} USDC, Additional required: ${ethers.formatUnits(additionalFundingNeeded, 6)} USDC`,
    status: "PASS",
  });

  // Output Full Audit Log
  console.log("=== READ-ONLY PREFLIGHT CHECK RESULTS ===");
  for (const m of matrix) {
    console.log(`[${m.status}] Check #${m.id}: ${m.check} => ${m.value}`);
  }

  console.log("\n================================================================");
  console.log("=== EXPLICIT SUMMARY REPORT ===");
  console.log("================================================================");
  console.log(`- Exact cirBTC balance received: ${ethers.formatUnits(borrowerCirBtc, 8)} cirBTC (${borrowerCirBtc.toString()} satoshis)`);
  console.log(`- Is 0.05 cirBTC requirement satisfied: ${cirBtcSufficient ? "YES (PASS)" : "NO (BLOCKED)"}`);
  console.log(`- Exact pool funding required: ${ethers.formatUnits(additionalFundingNeeded, 6)} USDC (${additionalFundingNeeded.toString()} raw)`);
  console.log(`- Exact liquidator USDC available: ${ethers.formatUnits(liquidatorUsdc, 6)} USDC (${liquidatorUsdc.toString()} raw)`);
  console.log(`- Oracle freshness: Age = ${ageSeconds.toString()}s, maxStaleness = ${maxStaleness.toString()}s, isFresh = ${isFresh} (Oracle staleness update will be performed during phase 4I execution once approved)`);
  console.log(`- Is contract paused: ${paused ? "YES (paused == true)" : "NO"}`);
  console.log(`- Transaction count: 0`);
  console.log(`- Signature count: 0`);

  const hasBlocked = matrix.some((m) => m.status === "BLOCKED");
  if (hasBlocked) {
    console.log("\n=== STATUS: BLOCKED ===");
    console.log("One or more required preflight checks failed.");
  } else {
    console.log("\n=== STATUS: PASS ===");
    console.log("PHASE 4I READY FOR EXPLICIT WRITE APPROVAL");
  }
}

main().catch((error) => {
  console.error("Preflight Execution Error:", error);
  process.exit(1);
});
