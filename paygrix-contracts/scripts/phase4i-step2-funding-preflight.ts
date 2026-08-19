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
  TARGET_POOL_LIQUIDITY_USDC: 1_500_000_000n, // 1,500 USDC (6 decimals)
  REQUIRED_ADDITIONAL_FUNDING_USDC: 1_499_000_000n, // 1,499 USDC (6 decimals)
};

async function main() {
  console.log("================================================================");
  console.log("=== PAYGRIX LENDING PHASE 4I STEP 2: FUNDING READINESS PREFLIGHT ===");
  console.log("================================================================");

  if (EXECUTION_ENABLED) {
    throw new Error("SAFETY VIOLATION: EXECUTION_ENABLED must be false during Step 2 funding preflight!");
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
    "function getPosition(address user) external view returns (uint256 collateral, uint256 debt)",
    "function borrowToken() external view returns (address)",
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
  const usdcToken = new ethers.Contract(CONFIG.USDC_ADDRESS, erc20Abi, ethers.provider);

  // 1. Lending contract paused check
  const paused: boolean = await lending.paused();
  matrix.push({
    id: 1,
    check: "Lending contract is paused",
    value: paused ? "true (PAUSED)" : "false (UNPAUSED)",
    status: paused ? "PASS" : "BLOCKED",
  });

  // 2. Oracle fresh and valid at $60,000
  const [price, decimals, updatedAt, isValid] = await oracle.getPriceData();
  const maxStaleness: bigint = await oracle.maxStaleness();
  const block = await ethers.provider.getBlock("latest");
  const nowTs = BigInt(block?.timestamp || Math.floor(Date.now() / 1000));
  const ageSeconds = nowTs > updatedAt ? nowTs - updatedAt : 0n;
  const isFresh = ageSeconds <= maxStaleness;
  const priceMatches = price === 60_000_000_000n;

  matrix.push({
    id: 2,
    check: "Oracle fresh & valid at $60,000",
    value: `$${(Number(price) / 1e6).toFixed(2)}, isValid: ${isValid}, Age: ${ageSeconds}s (max: ${maxStaleness}s)`,
    status: priceMatches && isValid && isFresh ? "PASS" : "BLOCKED",
  });

  // 3. Current poolLiquidity
  const poolLiquidity: bigint = await lending.poolLiquidity();
  matrix.push({
    id: 3,
    check: "Current poolLiquidity",
    value: `${ethers.formatUnits(poolLiquidity, 6)} USDC`,
    status: "PASS",
  });

  // 4. Target pool liquidity
  matrix.push({
    id: 4,
    check: "Target pool liquidity",
    value: `${ethers.formatUnits(CONFIG.TARGET_POOL_LIQUIDITY_USDC, 6)} USDC`,
    status: "PASS",
  });

  // 5. Exact additional funding required
  const additionalNeeded = CONFIG.TARGET_POOL_LIQUIDITY_USDC > poolLiquidity
    ? CONFIG.TARGET_POOL_LIQUIDITY_USDC - poolLiquidity
    : 0n;
  const fundingNeededPass = additionalNeeded === CONFIG.REQUIRED_ADDITIONAL_FUNDING_USDC;
  matrix.push({
    id: 5,
    check: "Exact additional funding required == 1,499 USDC",
    value: `${ethers.formatUnits(additionalNeeded, 6)} USDC (${additionalNeeded.toString()} raw)`,
    status: fundingNeededPass ? "PASS" : "BLOCKED",
  });

  // 6. Funder/liquidator wallet address
  matrix.push({
    id: 6,
    check: "Funder/liquidator wallet",
    value: CONFIG.FUNDER_LIQUIDATOR_ADDRESS,
    status: "PASS",
  });

  // 7. Funder USDC balance
  const funderUsdc: bigint = await usdcToken.balanceOf(CONFIG.FUNDER_LIQUIDATOR_ADDRESS);
  const funderUsdcPass = funderUsdc >= additionalNeeded;
  matrix.push({
    id: 7,
    check: "Funder USDC balance >= 1,499 USDC",
    value: `${ethers.formatUnits(funderUsdc, 6)} USDC`,
    status: funderUsdcPass ? "PASS" : "BLOCKED",
  });

  // 8. Funder native gas balance
  const funderGas = await ethers.provider.getBalance(CONFIG.FUNDER_LIQUIDATOR_ADDRESS);
  const funderGasPass = funderGas > 0n;
  matrix.push({
    id: 8,
    check: "Funder native gas balance",
    value: `${ethers.formatEther(funderGas)} ARC`,
    status: funderGasPass ? "PASS" : "WARNING",
  });

  // 9. Borrow token is expected USDC
  const borrowToken: string = await lending.borrowToken();
  const borrowTokenPass = borrowToken.toLowerCase() === CONFIG.USDC_ADDRESS.toLowerCase();
  matrix.push({
    id: 9,
    check: "borrowToken == USDC",
    value: borrowToken,
    status: borrowTokenPass ? "PASS" : "BLOCKED",
  });

  // 10. Borrower cirBTC balance >= 0.05 and position clean
  const borrowerCirBtc: bigint = await cirBtcToken.balanceOf(CONFIG.BORROWER_ADDRESS);
  const [borrowerCollateral, borrowerDebt] = await lending.getPosition(CONFIG.BORROWER_ADDRESS);
  const borrowerClean = borrowerCollateral === 0n && borrowerDebt === 0n;
  const borrowerCirBtcPass = borrowerCirBtc >= 5_000_000n;

  matrix.push({
    id: 10,
    check: "Borrower cirBTC >= 0.05 & position clean",
    value: `cirBTC: ${ethers.formatUnits(borrowerCirBtc, 8)}, Collateral: ${borrowerCollateral.toString()}, Debt: ${borrowerDebt.toString()}`,
    status: borrowerCirBtcPass && borrowerClean ? "PASS" : "BLOCKED",
  });

  // 11. No unexpected debt or bad debt
  const totalDebt: bigint = await lending.totalOutstandingDebt();
  const totalBadDebt: bigint = await lending.totalBadDebt();
  const noUnexpectedDebt = totalDebt === 0n && totalBadDebt === 0n;
  matrix.push({
    id: 11,
    check: "Total debt == 0 & Bad debt == 0",
    value: `Total Debt: ${ethers.formatUnits(totalDebt, 6)} USDC, Bad Debt: ${ethers.formatUnits(totalBadDebt, 6)} USDC`,
    status: noUnexpectedDebt ? "PASS" : "BLOCKED",
  });

  console.log("=== STEP 2 FUNDING READINESS PREFLIGHT RESULTS ===");
  for (const m of matrix) {
    console.log(`[${m.status}] Check #${m.id}: ${m.check} => ${m.value}`);
  }

  console.log("\n================================================================");
  console.log("=== STEP 2 READINESS SUMMARY ===");
  console.log("================================================================");
  console.log(`- Lending Paused: ${paused ? "YES (paused == true)" : "NO"}`);
  console.log(`- Oracle Status: Price = $${(Number(price)/1e6).toFixed(2)}, Valid = ${isValid}, Age = ${ageSeconds}s`);
  console.log(`- Current Pool Liquidity: ${ethers.formatUnits(poolLiquidity, 6)} USDC`);
  console.log(`- Additional Funding Required: ${ethers.formatUnits(additionalNeeded, 6)} USDC`);
  console.log(`- Funder USDC Available: ${ethers.formatUnits(funderUsdc, 6)} USDC`);
  console.log(`- Funder Gas Available: ${ethers.formatEther(funderGas)} ARC`);
  console.log(`- Borrower cirBTC Balance: ${ethers.formatUnits(borrowerCirBtc, 8)} cirBTC`);
  console.log(`- Borrower Position: Collateral = ${borrowerCollateral.toString()}, Debt = ${borrowerDebt.toString()}`);
  console.log(`- Total System Debt: Outstanding = ${totalDebt.toString()}, Bad Debt = ${totalBadDebt.toString()}`);

  const hasBlocked = matrix.some((m) => m.status === "BLOCKED");
  if (hasBlocked) {
    console.log("\n=== STATUS: BLOCKED ===");
  } else {
    console.log("\n=== STATUS: PASS ===");
    console.log("PHASE 4I STEP 2 READY — FUNDING APPROVAL REQUIRED");
  }
}

main().catch((error) => {
  console.error("Step 2 Preflight Error:", error);
  process.exit(1);
});
