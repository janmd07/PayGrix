import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("=== STARTING PAYGRIX LENDING PHASE 3C TESTNET SECURITY DEPLOYMENT ===");

  // 1. Load deployer signer
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer account configured. Check DEPLOYER_PRIVATE_KEY in .env.");
  }

  // 2. Verify Chain ID (Arc Testnet 5042002)
  const networkObj = await ethers.provider.getNetwork();
  const chainId = networkObj.chainId;
  console.log("Connected Chain ID:", chainId.toString());

  if (chainId !== 5042002n) {
    throw new Error(`Invalid network! Expected Arc Testnet (5042002), got ${chainId.toString()}`);
  }

  const deployerAddress = await deployer.getAddress();
  const balance = await ethers.provider.getBalance(deployerAddress);
  console.log("Deployer Address:", deployerAddress);
  console.log("Deployer Arc Testnet Balance:", ethers.formatEther(balance), "ETH");

  if (balance === 0n) {
    throw new Error("Insufficient gas balance for deployment!");
  }

  // Verified Arc Testnet Token Addresses
  const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
  const CIRBTC_ADDRESS = "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF";

  // ProductionOracleAdapter Parameters (TESTNET SIMULATION ONLY)
  const INITIAL_BTC_PRICE_60K = 60_000_000_000n; // $60,000.00 USDC (6 decimals)
  const INITIAL_DECIMALS = 6;
  const INITIAL_STALENESS = 3600n; // 1 hour
  const INITIAL_MIN_PRICE = 1_000_000_000n; // $1,000
  const INITIAL_MAX_PRICE = 500_000_000_000n; // $500,000

  // Risk Parameters
  const BORROW_LTV_BPS = 5000n; // 50%
  const LIQUIDATION_THRESHOLD_BPS = 7500n; // 75%

  // 3. STEP 1: Deploy ProductionOracleAdapter (TESTNET SIMULATION ONLY)
  console.log("\n--- STEP 1: Deploying ProductionOracleAdapter (TESTNET SIMULATION ONLY) ---");
  const AdapterFactory = await ethers.getContractFactory("ProductionOracleAdapter");
  const adapter = await AdapterFactory.deploy(
    INITIAL_BTC_PRICE_60K,
    INITIAL_DECIMALS,
    INITIAL_STALENESS,
    INITIAL_MIN_PRICE,
    INITIAL_MAX_PRICE
  );

  const adapterDeploymentTx = adapter.deploymentTransaction();
  if (!adapterDeploymentTx) {
    throw new Error("Failed to retrieve ProductionOracleAdapter deployment transaction.");
  }
  console.log("ProductionOracleAdapter Tx Hash:", adapterDeploymentTx.hash);
  await adapter.waitForDeployment();
  const adapterAddress = await adapter.getAddress();
  console.log("ProductionOracleAdapter Address (TESTNET SIMULATION ONLY):", adapterAddress);

  const adapterReceipt = await adapterDeploymentTx.wait();
  const adapterBlockNumber = adapterReceipt?.blockNumber ?? 0;

  // 4. STEP 2: Deploy Phase 3B PayGrixLending Contract
  console.log("\n--- STEP 2: Deploying Phase 3B PayGrixLending Contract ---");
  const PayGrixLendingFactory = await ethers.getContractFactory("PayGrixLending");
  const lending = await PayGrixLendingFactory.deploy(
    CIRBTC_ADDRESS,
    USDC_ADDRESS,
    adapterAddress,
    BORROW_LTV_BPS,
    LIQUIDATION_THRESHOLD_BPS
  );

  const lendingDeploymentTx = lending.deploymentTransaction();
  if (!lendingDeploymentTx) {
    throw new Error("Failed to retrieve PayGrixLending deployment transaction.");
  }
  console.log("PayGrixLending Tx Hash:", lendingDeploymentTx.hash);
  await lending.waitForDeployment();
  const lendingAddress = await lending.getAddress();
  console.log("PayGrixLending Contract Address:", lendingAddress);

  const lendingReceipt = await lendingDeploymentTx.wait();
  const lendingBlockNumber = lendingReceipt?.blockNumber ?? 0;

  // 5. STEP 3: Immediately Pause Contract
  console.log("\n--- STEP 3: Immediately Pausing PayGrixLending Contract ---");
  const pauseTx = await lending.pause();
  console.log("Pause Tx Hash:", pauseTx.hash);
  const pauseReceipt = await pauseTx.wait();
  console.log("Pause Confirmed in Block:", pauseReceipt?.blockNumber);

  const isPausedAfterDeploy = await lending.paused();
  console.log("Paused State Verification:", isPausedAfterDeploy);
  if (!isPausedAfterDeploy) {
    throw new Error("SAFETY VIOLATION: Failed to pause new lending contract! Aborting funding.");
  }

  // 6. STEP 4: Post-Deployment Read-Only State Verification
  console.log("\n--- STEP 4: Post-Deployment Read-Only State Verification ---");
  const onChainOwner = await lending.owner();
  const onChainCollateral = await lending.collateralToken();
  const onChainBorrowToken = await lending.borrowToken();
  const onChainOracle = await lending.oracle();
  const onChainLtv = await lending.borrowLtvBps();
  const onChainThreshold = await lending.liquidationThresholdBps();
  const onChainPoolLiquidity = await lending.poolLiquidity();
  const onChainTotalDebt = await lending.totalOutstandingDebt();
  const onChainTotalBadDebt = await lending.totalBadDebt();
  const onChainPaused = await lending.paused();
  const onChainCollateralPrice = await lending.collateralPrice();

  console.log("On-Chain Owner:", onChainOwner);
  console.log("On-Chain Collateral Token (cirBTC):", onChainCollateral);
  console.log("On-Chain Borrow Token (USDC):", onChainBorrowToken);
  console.log("On-Chain Oracle Address:", onChainOracle);
  console.log("On-Chain Borrow LTV Bps:", onChainLtv.toString(), "(50%)");
  console.log("On-Chain Liquidation Threshold Bps:", onChainThreshold.toString(), "(75%)");
  console.log("On-Chain Pool Liquidity (USDC):", onChainPoolLiquidity.toString(), "units (0 USDC)");
  console.log("On-Chain Total Outstanding Debt (USDC):", onChainTotalDebt.toString(), "units (0 USDC)");
  console.log("On-Chain Total Bad Debt (USDC):", onChainTotalBadDebt.toString(), "units (0 USDC)");
  console.log("On-Chain Paused State:", onChainPaused);
  console.log(`On-Chain Collateral Price Query: $${Number(onChainCollateralPrice) / 1e6}`);

  // Verification assertions
  if (onChainOwner.toLowerCase() !== deployerAddress.toLowerCase()) throw new Error("Owner mismatch!");
  if (onChainCollateral.toLowerCase() !== CIRBTC_ADDRESS.toLowerCase()) throw new Error("Collateral token mismatch!");
  if (onChainBorrowToken.toLowerCase() !== USDC_ADDRESS.toLowerCase()) throw new Error("Borrow token mismatch!");
  if (onChainOracle.toLowerCase() !== adapterAddress.toLowerCase()) throw new Error("Oracle mismatch!");
  if (onChainLtv !== 5000n || onChainThreshold !== 7500n) throw new Error("Risk parameters mismatch!");
  if (onChainPoolLiquidity !== 0n) throw new Error("Pool liquidity not 0!");
  if (onChainTotalDebt !== 0n) throw new Error("Total debt not 0!");
  if (onChainTotalBadDebt !== 0n) throw new Error("Total bad debt not 0!");
  if (!onChainPaused) throw new Error("Contract is not paused!");
  if (onChainCollateralPrice !== INITIAL_BTC_PRICE_60K) throw new Error("Price query mismatch!");

  console.log("\n==================================================");
  console.log("PRE-FUNDING ON-CHAIN VERIFICATION PASSED 100%!");
  console.log("==================================================");

  // 7. STEP 5: Controlled Testnet Funding (1 USDC = 1,000,000 base units)
  console.log("\n--- STEP 5: Controlled Testnet Funding (1.00 USDC) ---");
  const FUND_AMOUNT = 1_000_000n; // 1 USDC (6 decimals)

  const usdcAbi = [
    "function balanceOf(address account) external view returns (uint256)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function approve(address spender, uint256 amount) external returns (bool)",
  ];
  const usdc = new ethers.Contract(USDC_ADDRESS, usdcAbi, deployer);

  const startingBalance: bigint = await usdc.balanceOf(deployerAddress);
  const startingAllowance: bigint = await usdc.allowance(deployerAddress, lendingAddress);
  console.log("Deployer USDC Balance:", ethers.formatUnits(startingBalance, 6), "USDC");
  console.log("USDC Allowance for Lending:", ethers.formatUnits(startingAllowance, 6), "USDC");

  if (startingBalance < FUND_AMOUNT) {
    throw new Error("Insufficient USDC balance in deployer wallet for 1 USDC controlled funding!");
  }

  let approvalTxHash = "N/A (Skipped - Allowance sufficient)";
  if (startingAllowance < FUND_AMOUNT) {
    console.log("Executing USDC Approval of 1 USDC...");
    const approveTx = await usdc.approve(lendingAddress, FUND_AMOUNT);
    console.log("Approval Tx Hash:", approveTx.hash);
    const approveReceipt = await approveTx.wait();
    approvalTxHash = approveTx.hash;
    console.log("Approval confirmed in Block:", approveReceipt.blockNumber);
  }

  console.log("Calling PayGrixLending.fundPool(1_000_000)...");
  const fundTx = await lending.fundPool(FUND_AMOUNT);
  console.log("Funding Tx Hash:", fundTx.hash);
  const fundReceipt = await fundTx.wait();
  console.log("Funding confirmed in Block:", fundReceipt.blockNumber);

  // 8. STEP 6: Post-Funding Verification
  console.log("\n--- STEP 6: Post-Funding On-Chain Verification ---");
  const finalPoolLiquidity = await lending.poolLiquidity();
  const finalTotalDebt = await lending.totalOutstandingDebt();
  const finalTotalBadDebt = await lending.totalBadDebt();
  const finalPaused = await lending.paused();

  console.log("Final Pool Liquidity:", ethers.formatUnits(finalPoolLiquidity, 6), "USDC");
  console.log("Final Total Debt:", ethers.formatUnits(finalTotalDebt, 6), "USDC");
  console.log("Final Total Bad Debt:", ethers.formatUnits(finalTotalBadDebt, 6), "USDC");
  console.log("Final Paused State:", finalPaused);

  if (finalPoolLiquidity !== FUND_AMOUNT) throw new Error("Pool liquidity did not increase to 1 USDC!");
  if (finalTotalDebt !== 0n) throw new Error("Total debt changed unexpectedly!");
  if (finalTotalBadDebt !== 0n) throw new Error("Total bad debt changed unexpectedly!");
  if (!finalPaused) throw new Error("SAFETY VIOLATION: Contract is unpaused post-funding!");

  console.log("\n==================================================");
  console.log("CONTROLLED 1 USDC TESTNET FUNDING SUCCESSFUL!");
  console.log("==================================================");

  // 9. STEP 7: Save Public Deployment Record
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentRecord = {
    network: "Arc Testnet",
    chainId: Number(chainId),
    deployer: deployerAddress,
    contracts: {
      ProductionOracleAdapter: {
        classification: "TESTNET SIMULATION ONLY",
        address: adapterAddress,
        deploymentTxHash: adapterDeploymentTx.hash,
        blockNumber: adapterBlockNumber,
        constructorArgs: {
          initialPrice: INITIAL_BTC_PRICE_60K.toString(),
          initialDecimals: 6,
          initialStaleness: 3600,
          initialMinPrice: INITIAL_MIN_PRICE.toString(),
          initialMaxPrice: INITIAL_MAX_PRICE.toString(),
        },
      },
      PayGrixLendingPhase3B: {
        address: lendingAddress,
        deploymentTxHash: lendingDeploymentTx.hash,
        blockNumber: lendingBlockNumber,
        pauseTxHash: pauseTx.hash,
        fundingApprovalTxHash: approvalTxHash,
        fundingTxHash: fundTx.hash,
        constructorArgs: {
          collateralToken: CIRBTC_ADDRESS,
          borrowToken: USDC_ADDRESS,
          oracle: adapterAddress,
          borrowLtvBps: 5000,
          liquidationThresholdBps: 7500,
        },
        statePostFunding: {
          paused: finalPaused,
          poolLiquidityUsdc: ethers.formatUnits(finalPoolLiquidity, 6),
          totalOutstandingDebtUsdc: ethers.formatUnits(finalTotalDebt, 6),
          totalBadDebtUsdc: ethers.formatUnits(finalTotalBadDebt, 6),
          collateralPriceUsdc: ethers.formatUnits(onChainCollateralPrice, 6),
        },
      },
    },
  };

  const recordPath = path.join(deploymentsDir, "lending-phase3c-arc-testnet.json");
  fs.writeFileSync(recordPath, JSON.stringify(deploymentRecord, null, 2));
  console.log("Deployment record saved to:", recordPath);
}

main().catch((err) => {
  console.error("\n!!! PHASE 3C DEPLOYMENT FAILED !!!");
  console.error(err);
  process.exit(1);
});
