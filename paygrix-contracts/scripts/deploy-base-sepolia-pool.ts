import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Official Base Sepolia Constants
const EXPECTED_CHAIN_ID = 84532n;
const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const BASE_SEPOLIA_EURC = "0x808456652fdb597867f38412077A9182bf77359F";
const EXPECTED_INIT_CODE_HASH = "0xc6a44fe3c1e7083957b7fff0660555c6ff70da1aa738095a17993f0dec93a045";

async function main() {
  console.log("================================================================");
  console.log("=== STARTING PAYGRIX BASE SEPOLIA LIQUIDITY POOL DEPLOYMENT ===");
  console.log("================================================================");

  // 1. Verify Signer & Network
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer account configured. Check DEPLOYER_PRIVATE_KEY in .env.");
  }

  const networkObj = await ethers.provider.getNetwork();
  const chainId = networkObj.chainId;
  console.log("\n[CHECK 1] Verifying Target Network...");
  console.log("Connected Chain ID:", chainId.toString());

  if (chainId !== EXPECTED_CHAIN_ID) {
    throw new Error(
      `ABORTED: Invalid network! Expected Base Sepolia (${EXPECTED_CHAIN_ID}), got ${chainId.toString()}`
    );
  }
  console.log("✓ Network verified: Base Sepolia (84532)");

  // 2. Deployer Info & Balance
  const deployerAddress = await deployer.getAddress();
  const balance = await ethers.provider.getBalance(deployerAddress);
  const balanceEth = ethers.formatEther(balance);

  console.log("\n[CHECK 2] Deployer Account:");
  console.log("Deployer Address:", deployerAddress);
  console.log("Deployer Base Sepolia Balance:", balanceEth, "ETH");

  if (balance === 0n) {
    throw new Error("ABORTED: Deployer has 0 ETH on Base Sepolia. Insufficient gas.");
  }

  // 3. Check for Existing Deployment File
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  const recordPath = path.join(deploymentsDir, "pool-base-sepolia.json");

  console.log("\n[CHECK 3] Checking Deployment Target File...");
  if (fs.existsSync(recordPath) && process.env.OVERWRITE_DEPLOYMENT !== "true") {
    const existing = JSON.parse(fs.readFileSync(recordPath, "utf-8"));
    if (existing?.contracts?.PayGrixBaseRouter?.address) {
      throw new Error(
        `ABORTED: Deployment already exists at ${recordPath}!\n` +
        `Existing Router: ${existing.contracts.PayGrixBaseRouter.address}\n` +
        `Set OVERWRITE_DEPLOYMENT=true in environment if you explicitly intend to redeploy.`
      );
    }
  }
  console.log("✓ Target deployment file ready.");

  // 4. Verify Pair Creation Bytecode & Init Code Hash
  console.log("\n[CHECK 4] Verifying UniswapV2Pair Init Code Hash...");
  const PairContract = await ethers.getContractFactory("UniswapV2Pair");
  const pairBytecode = PairContract.bytecode;
  const computedHash = ethers.keccak256(pairBytecode);

  console.log("Computed Pair Init Code Hash:", computedHash);
  console.log("Expected Library Hash:       ", EXPECTED_INIT_CODE_HASH);

  if (computedHash.toLowerCase() !== EXPECTED_INIT_CODE_HASH.toLowerCase()) {
    throw new Error(
      `CRITICAL ERROR: Init code hash mismatch!\n` +
      `Compiled: ${computedHash}\n` +
      `Expected: ${EXPECTED_INIT_CODE_HASH}\n` +
      `UniswapV2Library.sol requires exact match for CREATE2 address calculation.`
    );
  }
  console.log("✓ Init code hash matches UniswapV2Library.sol byte-for-byte.");

  // 5. Verify Base Sepolia Tokens on-chain
  console.log("\n[CHECK 5] Verifying Target Base Sepolia Tokens On-Chain...");
  const usdcCode = await ethers.provider.getCode(BASE_SEPOLIA_USDC);
  if (usdcCode === "0x") {
    throw new Error(`ABORTED: No contract found at USDC address ${BASE_SEPOLIA_USDC}`);
  }
  const eurcCode = await ethers.provider.getCode(BASE_SEPOLIA_EURC);
  if (eurcCode === "0x") {
    throw new Error(`ABORTED: No contract found at EURC address ${BASE_SEPOLIA_EURC}`);
  }
  console.log("✓ USDC contract verified:", BASE_SEPOLIA_USDC);
  console.log("✓ EURC contract verified:", BASE_SEPOLIA_EURC);

  // 6. Deploy UniswapV2Factory
  console.log("\n--- STEP 1: Deploying UniswapV2Factory ---");
  console.log("Constructor feeToSetter:", deployerAddress);
  const FactoryContract = await ethers.getContractFactory("UniswapV2Factory");
  const factory = await FactoryContract.deploy(deployerAddress);
  const factoryDeployTx = factory.deploymentTransaction();
  console.log("Deployment Tx Hash:", factoryDeployTx?.hash);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("✓ UniswapV2Factory deployed at:", factoryAddress);

  // 7. Deploy PayGrixBaseRouter
  console.log("\n--- STEP 2: Deploying PayGrixBaseRouter ---");
  console.log("Constructor factory:", factoryAddress);
  const RouterContract = await ethers.getContractFactory("PayGrixBaseRouter");
  const router = await RouterContract.deploy(factoryAddress);
  const routerDeployTx = router.deploymentTransaction();
  console.log("Deployment Tx Hash:", routerDeployTx?.hash);
  await router.waitForDeployment();
  const routerAddress = await router.getAddress();
  console.log("✓ PayGrixBaseRouter deployed at:", routerAddress);

  // 8. Create Pair (USDC / EURC)
  console.log("\n--- STEP 3: Creating USDC/EURC Pair via Factory ---");
  const createPairTx = await factory.createPair(BASE_SEPOLIA_USDC, BASE_SEPOLIA_EURC);
  console.log("CreatePair Tx Hash:", createPairTx.hash);
  const createPairReceipt = await createPairTx.wait();
  console.log("CreatePair mined in block:", createPairReceipt?.blockNumber);

  // 9. Verify Deployed Pair On-Chain
  console.log("\n--- STEP 4: Verifying Pair Contract On-Chain ---");
  const pairAddress = await factory.getPair(BASE_SEPOLIA_USDC, BASE_SEPOLIA_EURC);
  console.log("Deployed USDC/EURC Pair Address:", pairAddress);

  if (pairAddress === "0x0000000000000000000000000000000000000000") {
    throw new Error("CRITICAL ERROR: Factory returned zero address for created pair.");
  }

  // Check Pair Token0 and Token1
  const pair = await ethers.getContractAt("UniswapV2Pair", pairAddress);
  const token0 = await pair.token0();
  const token1 = await pair.token1();
  console.log("Pair token0:", token0);
  console.log("Pair token1:", token1);

  const [expectedToken0, expectedToken1] =
    BASE_SEPOLIA_USDC.toLowerCase() < BASE_SEPOLIA_EURC.toLowerCase()
      ? [BASE_SEPOLIA_USDC, BASE_SEPOLIA_EURC]
      : [BASE_SEPOLIA_EURC, BASE_SEPOLIA_USDC];

  if (
    token0.toLowerCase() !== expectedToken0.toLowerCase() ||
    token1.toLowerCase() !== expectedToken1.toLowerCase()
  ) {
    throw new Error(
      `Pair token sorting mismatch! Expected (${expectedToken0}, ${expectedToken1}), got (${token0}, ${token1})`
    );
  }
  console.log("✓ Token0 and Token1 correctly sorted and initialized.");

  // 10. Verify CREATE2 Address Calculation via UniswapV2Library logic
  const salt = ethers.keccak256(
    ethers.solidityPacked(["address", "address"], [expectedToken0, expectedToken1])
  );
  const rawHash = ethers.keccak256(
    ethers.solidityPacked(
      ["bytes1", "address", "bytes32", "bytes32"],
      ["0xff", factoryAddress, salt, EXPECTED_INIT_CODE_HASH]
    )
  );
  const expectedCreate2Address = ethers.getAddress("0x" + rawHash.slice(26));
  console.log("Expected CREATE2 Pair Address:", expectedCreate2Address);

  if (expectedCreate2Address.toLowerCase() !== pairAddress.toLowerCase()) {
    throw new Error(
      `CRITICAL ERROR: CREATE2 calculated pair address (${expectedCreate2Address}) does not match actual deployed pair (${pairAddress})!`
    );
  }
  console.log("✓ Verified CREATE2 pair address matches UniswapV2Library logic.");

  // 11. Safety Check on Liquidity Seeding
  console.log("\n--- STEP 5: Liquidity Seeding Status ---");
  console.log(
    "NOTE: Initial liquidity was NOT seeded because the deployer currently has 0 EURC on Base Sepolia.\n" +
    "Token approvals and addLiquidity were intentionally skipped for safety."
  );

  // 12. Save Deployment Record
  const factoryReceipt = await factoryDeployTx?.wait();
  const routerReceipt = await routerDeployTx?.wait();

  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentRecord = {
    network: "Base Sepolia",
    chainId: Number(EXPECTED_CHAIN_ID),
    deployer: deployerAddress,
    timestamp: new Date().toISOString(),
    contracts: {
      UniswapV2Factory: {
        address: factoryAddress,
        deploymentTxHash: factoryDeployTx?.hash,
        feeToSetter: deployerAddress,
        blockNumber: factoryReceipt?.blockNumber ?? 0,
      },
      PayGrixBaseRouter: {
        address: routerAddress,
        deploymentTxHash: routerDeployTx?.hash,
        factory: factoryAddress,
        blockNumber: routerReceipt?.blockNumber ?? 0,
      },
      USDC_EURC_Pair: {
        address: pairAddress,
        deploymentTxHash: createPairTx.hash,
        blockNumber: createPairReceipt?.blockNumber ?? 0,
        token0: token0,
        token1: token1,
        factory: factoryAddress,
        initCodeHash: EXPECTED_INIT_CODE_HASH,
      },
    },
    tokens: {
      USDC: {
        address: BASE_SEPOLIA_USDC,
        decimals: 6,
        symbol: "USDC",
      },
      EURC: {
        address: BASE_SEPOLIA_EURC,
        decimals: 6,
        symbol: "EURC",
      },
    },
  };

  fs.writeFileSync(recordPath, JSON.stringify(deploymentRecord, null, 2));
  console.log("\n================================================================");
  console.log("BASE SEPOLIA POOL DEPLOYMENT RECORD SAVED SUCCESSFULLY!");
  console.log("Record Path:", recordPath);
  console.log("================================================================");
}

main().catch((error) => {
  console.error("\n!!! DEPLOYMENT FAILED !!!");
  console.error(error);
  process.exit(1);
});
