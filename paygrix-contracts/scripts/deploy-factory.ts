import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("=== STARTING UNISWAP V2 FACTORY DEPLOYMENT ===");

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

  // 3. Display Deployer Public Info & Balance
  const deployerAddress = await deployer.getAddress();
  const balance = await ethers.provider.getBalance(deployerAddress);
  const balanceEth = ethers.formatEther(balance);

  console.log("Deployer Public Address:", deployerAddress);
  console.log("Deployer Arc Testnet Balance:", balanceEth, "ETH");

  if (balance === 0n) {
    throw new Error("Insufficient gas balance for deployment! Deployer has 0 ETH on Arc Testnet.");
  }

  // 4. Deploy UniswapV2Factory
  console.log("\nDeploying UniswapV2Factory with feeToSetter:", deployerAddress);
  const FactoryContract = await ethers.getContractFactory("UniswapV2Factory");
  const factory = await FactoryContract.deploy(deployerAddress);

  const deploymentTx = factory.deploymentTransaction();
  if (!deploymentTx) {
    throw new Error("Failed to retrieve deployment transaction.");
  }
  console.log("Deployment Transaction Hash:", deploymentTx.hash);

  console.log("Waiting for on-chain block confirmation...");
  await factory.waitForDeployment();

  const factoryAddress = await factory.getAddress();
  console.log("\n==================================================");
  console.log("UNISWAP V2 FACTORY DEPLOYED SUCCESSFULLY!");
  console.log("Factory Contract Address:", factoryAddress);
  console.log("==================================================");

  // 5. On-Chain Verification
  console.log("\n--- Verifying On-Chain Contract State ---");
  const onChainFeeToSetter = await factory.feeToSetter();
  const onChainFeeTo = await factory.feeTo();
  const onChainAllPairsLength = await factory.allPairsLength();

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  console.log("On-Chain feeToSetter:", onChainFeeToSetter);
  console.log("On-Chain feeTo:", onChainFeeTo);
  console.log("On-Chain allPairsLength:", onChainAllPairsLength.toString());

  if (onChainFeeToSetter.toLowerCase() !== deployerAddress.toLowerCase()) {
    throw new Error(`On-chain feeToSetter mismatch! Expected ${deployerAddress}, got ${onChainFeeToSetter}`);
  }
  if (onChainFeeTo !== ZERO_ADDRESS) {
    throw new Error(`On-chain feeTo mismatch! Expected zero address, got ${onChainFeeTo}`);
  }
  if (onChainAllPairsLength !== 0n) {
    throw new Error(`On-chain allPairsLength mismatch! Expected 0, got ${onChainAllPairsLength.toString()}`);
  }
  console.log("On-Chain State Verification: SUCCESS!");

  // 6. Save Deployment Record
  const receipt = await deploymentTx.wait();
  const blockNumber = receipt?.blockNumber ?? 0;

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentRecord = {
    network: "Arc Testnet",
    chainId: Number(chainId),
    contracts: {
      UniswapV2Factory: {
        address: factoryAddress,
        deploymentTxHash: deploymentTx.hash,
        feeToSetter: deployerAddress,
        blockNumber: blockNumber,
      },
    },
  };

  const recordPath = path.join(deploymentsDir, "arc-testnet.json");
  fs.writeFileSync(recordPath, JSON.stringify(deploymentRecord, null, 2));
  console.log("\nDeployment record saved to:", recordPath);
}

main().catch((error) => {
  console.error("\n!!! DEPLOYMENT FAILED !!!");
  console.error(error);
  process.exit(1);
});
