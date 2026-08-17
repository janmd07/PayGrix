import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("=== STARTING PAYGRIX LENDING STAGING DEPLOYMENT (ARC TESTNET) ===");

  // 1. Load deployer signer
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer account configured. Check DEPLOYER_PRIVATE_KEY in .env.");
  }

  // 2. Verify Chain ID
  const networkObj = await ethers.provider.getNetwork();
  const chainId = networkObj.chainId;
  console.log("Connected Chain ID:", chainId.toString());

  if (chainId !== 5042002n) {
    throw new Error(`Invalid network! Expected Arc Testnet (5042002), got ${chainId.toString()}`);
  }

  // 3. Display Deployer Info & Balance
  const deployerAddress = await deployer.getAddress();
  const balance = await ethers.provider.getBalance(deployerAddress);
  const balanceEth = ethers.formatEther(balance);

  console.log("Deployer Address:", deployerAddress);
  console.log("Deployer Arc Testnet Balance:", balanceEth, "ETH");

  if (balance === 0n) {
    throw new Error("Insufficient gas balance for deployment! Deployer has 0 ETH on Arc Testnet.");
  }

  // Verified Arc Testnet Token Addresses
  const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
  const CIRBTC_ADDRESS = "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF";
  const INITIAL_BTC_PRICE_60K = 60_000_000_000n; // $60,000.00 USDC (6 decimals)
  const BORROW_LTV_BPS = 5000n; // 50%
  const LIQUIDATION_THRESHOLD_BPS = 7500n; // 75%

  // 4. STEP 1: Deploy StagingOracle
  console.log("\n--- STEP 1: Deploying StagingOracle ---");
  const StagingOracleFactory = await ethers.getContractFactory("StagingOracle");
  const stagingOracle = await StagingOracleFactory.deploy(INITIAL_BTC_PRICE_60K, 6);

  const oracleDeploymentTx = stagingOracle.deploymentTransaction();
  if (!oracleDeploymentTx) {
    throw new Error("Failed to retrieve StagingOracle deployment transaction.");
  }
  console.log("StagingOracle Tx Hash:", oracleDeploymentTx.hash);
  await stagingOracle.waitForDeployment();
  const stagingOracleAddress = await stagingOracle.getAddress();
  console.log("StagingOracle Contract Address:", stagingOracleAddress);

  const oracleReceipt = await oracleDeploymentTx.wait();
  const oracleBlockNumber = oracleReceipt?.blockNumber ?? 0;

  // Verify StagingOracle on-chain read
  const [oraclePrice, oracleDecimals] = await stagingOracle.getPrice();
  console.log(`On-Chain StagingOracle Price: $${Number(oraclePrice) / 1e6} (${oraclePrice.toString()} base units, ${oracleDecimals.toString()} decimals)`);
  if (oraclePrice !== INITIAL_BTC_PRICE_60K || Number(oracleDecimals) !== 6) {
    throw new Error("StagingOracle state verification failed!");
  }

  // 5. STEP 2: Deploy PayGrixLending Contract
  console.log("\n--- STEP 2: Deploying PayGrixLending Contract ---");
  const PayGrixLendingFactory = await ethers.getContractFactory("PayGrixLending");
  const lending = await PayGrixLendingFactory.deploy(
    CIRBTC_ADDRESS,
    USDC_ADDRESS,
    stagingOracleAddress,
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

  // 6. STEP 3: Post-Deployment Read-Only State Verification
  console.log("\n--- STEP 3: Performing Post-Deployment On-Chain State Verification ---");
  const onChainOwner = await lending.owner();
  const onChainCollateral = await lending.collateralToken();
  const onChainBorrowToken = await lending.borrowToken();
  const onChainOracle = await lending.oracle();
  const onChainLtv = await lending.borrowLtvBps();
  const onChainThreshold = await lending.liquidationThresholdBps();
  const onChainPoolLiquidity = await lending.poolLiquidity();
  const onChainTotalDebt = await lending.totalOutstandingDebt();
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
  console.log("On-Chain Paused State:", onChainPaused);
  console.log(`On-Chain Collateral Price Query: $${Number(onChainCollateralPrice) / 1e6} (${onChainCollateralPrice.toString()} base units)`);

  // Assertions
  if (onChainOwner.toLowerCase() !== deployerAddress.toLowerCase()) {
    throw new Error("Owner mismatch!");
  }
  if (onChainCollateral.toLowerCase() !== CIRBTC_ADDRESS.toLowerCase()) {
    throw new Error("Collateral token mismatch!");
  }
  if (onChainBorrowToken.toLowerCase() !== USDC_ADDRESS.toLowerCase()) {
    throw new Error("Borrow token mismatch!");
  }
  if (onChainOracle.toLowerCase() !== stagingOracleAddress.toLowerCase()) {
    throw new Error("Oracle address mismatch!");
  }
  if (onChainLtv !== 5000n || onChainThreshold !== 7500n) {
    throw new Error("Risk parameters mismatch!");
  }
  if (onChainPoolLiquidity !== 0n) {
    throw new Error("Pool liquidity is not zero!");
  }
  if (onChainTotalDebt !== 0n) {
    throw new Error("Total outstanding debt is not zero!");
  }
  if (onChainPaused !== false) {
    throw new Error("Paused state mismatch!");
  }
  if (onChainCollateralPrice !== INITIAL_BTC_PRICE_60K) {
    throw new Error("Collateral price query mismatch!");
  }

  console.log("\n==================================================");
  console.log("ALL ON-CHAIN READ-ONLY VERIFICATIONS PASSED 100%!");
  console.log("==================================================");

  // 7. STEP 4: Save Deployment Record
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentRecord = {
    network: "Arc Testnet",
    chainId: Number(chainId),
    deployer: deployerAddress,
    contracts: {
      StagingOracle: {
        address: stagingOracleAddress,
        deploymentTxHash: oracleDeploymentTx.hash,
        blockNumber: oracleBlockNumber,
        constructorArgs: {
          initialPrice: INITIAL_BTC_PRICE_60K.toString(),
          decimals: 6,
        },
      },
      PayGrixLending: {
        address: lendingAddress,
        deploymentTxHash: lendingDeploymentTx.hash,
        blockNumber: lendingBlockNumber,
        constructorArgs: {
          collateralToken: CIRBTC_ADDRESS,
          borrowToken: USDC_ADDRESS,
          oracle: stagingOracleAddress,
          borrowLtvBps: 5000,
          liquidationThresholdBps: 7500,
        },
      },
    },
  };

  const recordPath = path.join(deploymentsDir, "lending-arc-testnet.json");
  fs.writeFileSync(recordPath, JSON.stringify(deploymentRecord, null, 2));
  console.log("\nDeployment record saved to:", recordPath);
}

main().catch((error) => {
  console.error("\n!!! STAGING DEPLOYMENT FAILED !!!");
  console.error(error);
  process.exit(1);
});
