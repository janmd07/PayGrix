import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const BASE_SEPOLIA_CHAINLINK_ETH_USD = "0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1";
const BASE_SEPOLIA_WETH = "0x4200000000000000000000000000000000000006";
const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log("==================================================");
  console.log("DEPLOYING BASE SEPOLIA LENDING PROTOCOL");
  console.log("==================================================");
  console.log("Network:", network.name, "Chain ID:", network.chainId.toString());
  console.log("Deployer:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("ETH Balance:", ethers.formatEther(balance), "ETH");

  // 1. Deploy BaseSepoliaOracleAdapter
  console.log("\n1. Deploying BaseSepoliaOracleAdapter...");
  const maxStaleness = 86400; // 24 hours
  const minPrice = 500_000_000n; // $500 in 6 decimals
  const maxPrice = 20_000_000_000n; // $20,000 in 6 decimals

  const OracleFactory = await ethers.getContractFactory("BaseSepoliaOracleAdapter");
  const oracle = await OracleFactory.deploy(
    BASE_SEPOLIA_CHAINLINK_ETH_USD,
    maxStaleness,
    minPrice,
    maxPrice
  );
  await oracle.waitForDeployment();
  const oracleAddress = await oracle.getAddress();
  console.log("BaseSepoliaOracleAdapter deployed at:", oracleAddress);

  // Read oracle price to verify
  const [price, decimals, updatedAt, isValid] = await oracle.getPriceData();
  console.log(`Oracle Verification: $${Number(price) / 1e6} (decimals: ${decimals}, isValid: ${isValid}, updatedAt: ${updatedAt})`);

  // 2. Deploy BaseSepoliaLending
  console.log("\n2. Deploying BaseSepoliaLending...");
  const borrowLtvBps = 5000; // 50%
  const liquidationThresholdBps = 7500; // 75%

  const LendingFactory = await ethers.getContractFactory("BaseSepoliaLending");
  const lending = await LendingFactory.deploy(
    BASE_SEPOLIA_WETH,
    BASE_SEPOLIA_USDC,
    oracleAddress,
    borrowLtvBps,
    liquidationThresholdBps
  );
  await lending.waitForDeployment();
  const lendingAddress = await lending.getAddress();
  console.log("BaseSepoliaLending deployed at:", lendingAddress);

  // 3. Fund Pool with Initial USDC Liquidity
  console.log("\n3. Funding Initial Pool Liquidity...");
  const usdcContract = new ethers.Contract(BASE_SEPOLIA_USDC, ERC20_ABI, deployer);
  const usdcBalance: bigint = await usdcContract.balanceOf(deployer.address);
  console.log("Deployer USDC Balance:", ethers.formatUnits(usdcBalance, 6), "USDC");

  const fundAmount = 2_000_000n; // 2.0 USDC
  if (usdcBalance >= fundAmount) {
    console.log(`Approving ${ethers.formatUnits(fundAmount, 6)} USDC to Lending contract...`);
    const approveTx = await usdcContract.approve(lendingAddress, fundAmount);
    await approveTx.wait();

    console.log(`Funding pool with ${ethers.formatUnits(fundAmount, 6)} USDC...`);
    const fundTx = await lending.fundPool(fundAmount);
    await fundTx.wait();

    const poolLiquidity = await lending.poolLiquidity();
    console.log("Pool Liquidity Post-Funding:", ethers.formatUnits(poolLiquidity, 6), "USDC");
  } else {
    console.warn("Deployer has insufficient USDC to fund pool immediately; skipping initial funding.");
  }

  // 4. Save Deployment JSON
  const deploymentInfo = {
    network: "Base Sepolia",
    chainId: Number(network.chainId),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      BaseSepoliaOracleAdapter: {
        address: oracleAddress,
        chainlinkFeed: BASE_SEPOLIA_CHAINLINK_ETH_USD,
        maxStaleness,
        minPrice: minPrice.toString(),
        maxPrice: maxPrice.toString(),
        verifiedPriceUsd: (Number(price) / 1e6).toFixed(2),
      },
      BaseSepoliaLending: {
        address: lendingAddress,
        collateralToken: {
          address: BASE_SEPOLIA_WETH,
          symbol: "WETH",
          decimals: 18,
        },
        borrowToken: {
          address: BASE_SEPOLIA_USDC,
          symbol: "USDC",
          decimals: 6,
        },
        oracle: oracleAddress,
        borrowLtvBps,
        liquidationThresholdBps,
        poolLiquidityUsdc: ethers.formatUnits(await lending.poolLiquidity(), 6),
      },
    },
  };

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const outPath = path.join(deploymentsDir, "lending-base-sepolia.json");
  fs.writeFileSync(outPath, JSON.stringify(deploymentInfo, null, 2));
  console.log("\nDeployment artifact written to:", outPath);
  console.log("==================================================");
  console.log("DEPLOYMENT COMPLETE");
  console.log("==================================================");
}

main().catch((err) => {
  console.error("Deployment failed:", err);
  process.exit(1);
});
