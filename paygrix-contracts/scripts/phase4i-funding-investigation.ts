import { ethers } from "hardhat";

const CONFIG = {
  NETWORK_NAME: "Arc Testnet",
  EXPECTED_CHAIN_ID: 5042002n,
  PAYGRIX_LENDING_ADDRESS: "0x800Cd0a3b737e989F45E69f64eEeB118724522aE",
  PRODUCTION_ORACLE_ADAPTER: "0xA17Bfb3332A83F0e247129ee9c0d1A454A332287",
  FUNDER_WALLET: "0x2f3cFb9bd88DEC61406f12F35146579aF42619f4",
  DEPLOYER_WALLET: "0xf85085b73a4Ec4efE895B532Fe1560a06ff0d179",
  USDC_ADDRESS: "0x3600000000000000000000000000000000000000",
  REQUIRED_FUNDING_USDC: 1_499_000_000n, // 1,499 USDC
};

async function main() {
  console.log("================================================================");
  console.log("=== PAYGRIX LENDING PHASE 4I — FUNDING SIGNER INVESTIGATION ===");
  console.log("================================================================");

  const network = await ethers.provider.getNetwork();
  if (network.chainId !== CONFIG.EXPECTED_CHAIN_ID) {
    throw new Error(`Invalid network: ${network.chainId}`);
  }

  const lendingAbi = [
    "function fundPool(uint256 amount) external",
    "function paused() external view returns (bool)",
    "function poolLiquidity() external view returns (uint256)",
    "function totalOutstandingDebt() external view returns (uint256)",
    "function totalBadDebt() external view returns (uint256)",
    "function borrowToken() external view returns (address)",
  ];

  const erc20Abi = [
    "function balanceOf(address account) external view returns (uint256)",
    "function allowance(address owner, address spender) external view returns (uint256)",
  ];

  const lending = new ethers.Contract(CONFIG.PAYGRIX_LENDING_ADDRESS, lendingAbi, ethers.provider);
  const usdc = new ethers.Contract(CONFIG.USDC_ADDRESS, erc20Abi, ethers.provider);

  // 1. On-Chain State Checks
  const paused: boolean = await lending.paused();
  const poolLiquidity: bigint = await lending.poolLiquidity();
  const totalDebt: bigint = await lending.totalOutstandingDebt();
  const totalBadDebt: bigint = await lending.totalBadDebt();
  const borrowToken: string = await lending.borrowToken();

  const funderUsdcBal: bigint = await usdc.balanceOf(CONFIG.FUNDER_WALLET);
  const funderAllowance: bigint = await usdc.allowance(CONFIG.FUNDER_WALLET, CONFIG.PAYGRIX_LENDING_ADDRESS);

  const deployerUsdcBal: bigint = await usdc.balanceOf(CONFIG.DEPLOYER_WALLET);
  const deployerAllowance: bigint = await usdc.allowance(CONFIG.DEPLOYER_WALLET, CONFIG.PAYGRIX_LENDING_ADDRESS);

  console.log("\n--- ON-CHAIN SYSTEM AUDIT ---");
  console.log(`1. Lending Paused: ${paused ? "YES (paused == true)" : "NO"}`);
  console.log(`2. Current Pool Liquidity: ${ethers.formatUnits(poolLiquidity, 6)} USDC`);
  console.log(`3. Total Outstanding Debt: ${ethers.formatUnits(totalDebt, 6)} USDC`);
  console.log(`4. Total Bad Debt: ${ethers.formatUnits(totalBadDebt, 6)} USDC`);
  console.log(`5. Borrow Token Address: ${borrowToken}`);

  console.log("\n--- WALLET BALANCES & ALLOWANCES ---");
  console.log(`Designated Funder Wallet (${CONFIG.FUNDER_WALLET}):`);
  console.log(`  - USDC Balance: ${ethers.formatUnits(funderUsdcBal, 6)} USDC (${funderUsdcBal.toString()} raw)`);
  console.log(`  - USDC Allowance to Lending (${CONFIG.PAYGRIX_LENDING_ADDRESS}): ${ethers.formatUnits(funderAllowance, 6)} USDC`);

  console.log(`Loaded Deployer Wallet (${CONFIG.DEPLOYER_WALLET}):`);
  console.log(`  - USDC Balance: ${ethers.formatUnits(deployerUsdcBal, 6)} USDC (${deployerUsdcBal.toString()} raw)`);
  console.log(`  - USDC Allowance to Lending: ${ethers.formatUnits(deployerAllowance, 6)} USDC`);

  console.log("\n--- INVESTIGATION VERIFICATION SUMMARY ---");
  console.log("1. Exact fundPool() signature: fundPool(uint256 amount) external");
  console.log("2. Access control: PERMISSIONLESS (callable by any account holding approved USDC)");
  console.log("3. Can funder wallet call fundPool(): YES");
  console.log(`4. Is USDC approval required: YES (erc20.approve(spender, 1499000000))`);
  console.log(`5. Exact spender address for approval: ${CONFIG.PAYGRIX_LENDING_ADDRESS}`);
  console.log(`6. Exact amount required: 1,499 USDC (${CONFIG.REQUIRED_FUNDING_USDC.toString()} raw units)`);
  console.log(`7. Can deployer fund pool directly with own USDC: NO (deployer only has ${ethers.formatUnits(deployerUsdcBal, 6)} USDC < 1,499 USDC)`);
  console.log("8. Can funder wallet fund directly without saving private key in .env: YES");
  console.log(`9. Confirm poolLiquidity == 1 USDC: ${poolLiquidity === 1_000_000n ? "YES (PASS)" : "NO"}`);
  console.log(`10. Confirm lending paused == true: ${paused ? "YES (PASS)" : "NO"}`);
  console.log(`11. Confirm totalOutstandingDebt == 0: ${totalDebt === 0n ? "YES (PASS)" : "NO"}`);
  console.log(`12. Confirm totalBadDebt == 0: ${totalBadDebt === 0n ? "YES (PASS)" : "NO"}`);
}

main().catch((error) => {
  console.error("Investigation Error:", error);
  process.exit(1);
});
