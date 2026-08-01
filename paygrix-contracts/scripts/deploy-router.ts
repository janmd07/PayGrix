import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const FACTORY_ADDRESS = "0x05c69956564c556fc303Cb74C5505D0E1e8EDF2D";

async function main() {
  console.log("=== STARTING PAYGRIX ARC ROUTER DEPLOYMENT ===");

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

  console.log("Deployer Public Address:", deployerAddress);
  console.log("Deployer Arc Testnet Balance:", balanceEth, "ETH");

  if (balance === 0n) {
    throw new Error("Insufficient gas balance for deployment! Deployer has 0 ETH on Arc Testnet.");
  }

  // 4. Verify Factory Address on-chain
  console.log("\nTarget Factory Address:", FACTORY_ADDRESS);
  const factoryCode = await ethers.provider.getCode(FACTORY_ADDRESS);
  if (factoryCode === "0x") {
    throw new Error(`Factory contract does not exist at ${FACTORY_ADDRESS}`);
  }

  // 5. Deploy PayGrixArcRouter
  console.log("\nDeploying PayGrixArcRouter with Factory:", FACTORY_ADDRESS);
  const RouterContract = await ethers.getContractFactory("PayGrixArcRouter");
  const router = await RouterContract.deploy(FACTORY_ADDRESS);

  const deploymentTx = router.deploymentTransaction();
  if (!deploymentTx) {
    throw new Error("Failed to retrieve deployment transaction.");
  }
  console.log("Deployment Transaction Hash:", deploymentTx.hash);

  console.log("Waiting for on-chain block confirmation...");
  await router.waitForDeployment();

  const routerAddress = await router.getAddress();
  console.log("\n==================================================");
  console.log("PAYGRIX ARC ROUTER DEPLOYED SUCCESSFULLY!");
  console.log("Router Contract Address:", routerAddress);
  console.log("==================================================");

  // 6. On-Chain Verification
  console.log("\n--- Verifying On-Chain Contract State ---");
  const onChainFactory = await router.factory();
  console.log("On-Chain router.factory():", onChainFactory);

  if (onChainFactory.toLowerCase() !== FACTORY_ADDRESS.toLowerCase()) {
    throw new Error(`On-chain factory mismatch! Expected ${FACTORY_ADDRESS}, got ${onChainFactory}`);
  }

  const routerCode = await ethers.provider.getCode(routerAddress);
  if (routerCode === "0x") {
    throw new Error(`No bytecode deployed at router address ${routerAddress}`);
  }
  console.log("Router Bytecode Verification: SUCCESS!");

  const receipt = await deploymentTx.wait();
  if (receipt?.status !== 1) {
    throw new Error("Deployment transaction failed on-chain.");
  }
  const blockNumber = receipt.blockNumber;
  console.log("Receipt Status: SUCCESS (1)");
  console.log("Mined in Block:", blockNumber);

  // 7. Update Deployment Record
  const recordPath = path.join(__dirname, "..", "deployments", "arc-testnet.json");
  let deploymentRecord: any = {};
  if (fs.existsSync(recordPath)) {
    deploymentRecord = JSON.parse(fs.readFileSync(recordPath, "utf-8"));
  }

  deploymentRecord.contracts = deploymentRecord.contracts || {};
  deploymentRecord.contracts.PayGrixArcRouter = {
    address: routerAddress,
    deploymentTxHash: deploymentTx.hash,
    factory: FACTORY_ADDRESS,
    blockNumber: blockNumber,
  };

  fs.writeFileSync(recordPath, JSON.stringify(deploymentRecord, null, 2));
  console.log("\nUpdated deployment record saved to:", recordPath);
}

main().catch((error) => {
  console.error("\n!!! ROUTER DEPLOYMENT FAILED !!!");
  console.error(error);
  process.exit(1);
});
