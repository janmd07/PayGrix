import { ethers } from "hardhat";

// 100% READ-ONLY SAFETY GUARD
const EXECUTION_ENABLED = false;

const CONFIG = {
  NETWORK_NAME: "Arc Testnet",
  EXPECTED_CHAIN_ID: 5042002n,
  PAYGRIX_LENDING_ADDRESS: "0x800Cd0a3b737e989F45E69f64eEeB118724522aE",
  PRODUCTION_ORACLE_ADAPTER: "0xA17Bfb3332A83F0e247129ee9c0d1A454A332287",
  FUNDER_ADDRESS: "0x2f3cFb9bd88DEC61406f12F35146579aF42619f4",
  OWNER_ADDRESS: "0xf85085b73a4Ec4efE895B532Fe1560a06ff0d179",
  USDC_ADDRESS: "0x3600000000000000000000000000000000000000",
};

async function main() {
  console.log("================================================================");
  console.log("=== PAYGRIX LENDING PHASE 4I — PRE-BORROW FUND RECOVERY AUDIT ===");
  console.log("================================================================");

  if (EXECUTION_ENABLED) {
    throw new Error("SAFETY VIOLATION: EXECUTION_ENABLED must be false during read-only recovery audit!");
  }
  console.log("Safety Guard Verification: EXECUTION_ENABLED = false (100% READ-ONLY)\n");

  const network = await ethers.provider.getNetwork();
  if (network.chainId !== CONFIG.EXPECTED_CHAIN_ID) {
    throw new Error(`Invalid network: ${network.chainId}`);
  }

  const lendingAbi = [
    "function owner() external view returns (address)",
    "function paused() external view returns (bool)",
    "function poolLiquidity() external view returns (uint256)",
    "function totalOutstandingDebt() external view returns (uint256)",
    "function totalBadDebt() external view returns (uint256)",
    "function totalLenderDeposits() external view returns (uint256)",
  ];

  const erc20Abi = [
    "function balanceOf(address account) external view returns (uint256)",
  ];

  const lending = new ethers.Contract(CONFIG.PAYGRIX_LENDING_ADDRESS, lendingAbi, ethers.provider);
  const usdc = new ethers.Contract(CONFIG.USDC_ADDRESS, erc20Abi, ethers.provider);

  const onChainOwner: string = await lending.owner();
  const paused: boolean = await lending.paused();
  const poolLiquidity: bigint = await lending.poolLiquidity();
  const contractUsdcBal: bigint = await usdc.balanceOf(CONFIG.PAYGRIX_LENDING_ADDRESS);
  const totalDebt: bigint = await lending.totalOutstandingDebt();
  const totalBadDebt: bigint = await lending.totalBadDebt();
  const totalDeposits: bigint = await lending.totalLenderDeposits();

  const funderUsdcBal: bigint = await usdc.balanceOf(CONFIG.FUNDER_ADDRESS);
  const ownerUsdcBal: bigint = await usdc.balanceOf(CONFIG.OWNER_ADDRESS);

  // Invariant calculation
  const requiredReserve = totalDebt;
  const availableAdminLiquidity = poolLiquidity > requiredReserve ? poolLiquidity - requiredReserve : 0n;

  console.log("--- 1. ON-CHAIN CONTRACT & LIQUIDITY AUDIT ---");
  console.log(`Contract Owner: ${onChainOwner}`);
  console.log(`Lending Paused State: ${paused ? "true (PAUSED)" : "false"}`);
  console.log(`Contract poolLiquidity(): ${ethers.formatUnits(poolLiquidity, 6)} USDC (${poolLiquidity.toString()} raw)`);
  console.log(`Contract ERC20 USDC Balance: ${ethers.formatUnits(contractUsdcBal, 6)} USDC (${contractUsdcBal.toString()} raw)`);
  console.log(`Total Outstanding Debt: ${ethers.formatUnits(totalDebt, 6)} USDC`);
  console.log(`Total Bad Debt: ${ethers.formatUnits(totalBadDebt, 6)} USDC`);
  console.log(`Total Lender Deposits (Accounting): ${ethers.formatUnits(totalDeposits, 6)} USDC`);

  console.log("\n--- 2. WALLET BALANCE AUDIT ---");
  console.log(`Designated Funder (${CONFIG.FUNDER_ADDRESS}) USDC Balance: ${ethers.formatUnits(funderUsdcBal, 6)} USDC`);
  console.log(`Contract Owner (${CONFIG.OWNER_ADDRESS}) USDC Balance: ${ethers.formatUnits(ownerUsdcBal, 6)} USDC`);

  console.log("\n--- 3. RECOVERY INVARIANT ANALYSIS ---");
  console.log(`Required Reserve (totalOutstandingDebt): ${ethers.formatUnits(requiredReserve, 6)} USDC`);
  console.log(`Max Available Admin Withdrawal (withdrawPoolLiquidity): ${ethers.formatUnits(availableAdminLiquidity, 6)} USDC (${availableAdminLiquidity.toString()} raw)`);

  const ownerMatches = onChainOwner.toLowerCase() === CONFIG.OWNER_ADDRESS.toLowerCase();
  const fullLiquidityAvailable = availableAdminLiquidity >= 1_500_000_000n;

  console.log("\n================================================================");
  console.log("=== FUND RECOVERY VERDICT ===");
  console.log("================================================================");
  if (ownerMatches && fullLiquidityAvailable && totalDebt === 0n) {
    console.log("FUND RECOVERY VERDICT: CONDITIONALLY SAFE");
    console.log("Recovery Path: Contract Owner (0xf85085b73a4Ec4efE895B532Fe1560a06ff0d179) calls withdrawPoolLiquidity(1_500_000_000) to receive 1,500 USDC (or 1,499 USDC funded), then transfers USDC back to Funder wallet (0x2f3cFb9bd88DEC61406f12F35146579aF42619f4).");
  } else {
    console.log("FUND RECOVERY VERDICT: NOT AVAILABLE / BLOCKED");
  }

  console.log("\n------------------------------------------------");
  console.log("Transactions executed: 0");
  console.log("Signatures: 0");
  console.log(`Lending paused: ${paused ? "unchanged (true)" : "false"}`);
  console.log("Borrow executed: NO");
  console.log("------------------------------------------------");
}

main().catch((error) => {
  console.error("Recovery Audit Error:", error);
  process.exit(1);
});
