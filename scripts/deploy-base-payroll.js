const hre = require("hardhat");

async function main() {
  const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
  const ARC_USDC = "0x3600000000000000000000000000000000000000";

  console.log("=========================================");
  console.log("Base Sepolia Payroll Smart Contract Deployment");
  console.log("=========================================");

  const network = await hre.ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  console.log(`Target Network Chain ID: ${chainId}`);
  if (chainId !== 84532) {
    console.warn(`WARNING: Current network chain ID is ${chainId}, expected 84532 (Base Sepolia).`);
  }

  // 1. Verify deployer
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer signer found. Ensure PRIVATE_KEY is set in your environment.");
  }
  console.log(`Deployer Address:        ${deployer.address}`);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  const balanceEther = hre.ethers.formatEther(balance);
  console.log(`Deployer ETH Balance:    ${balanceEther} ETH`);

  if (balance === 0n) {
    throw new Error("Deployer has 0 ETH balance. Deployment cannot proceed without gas.");
  }

  // 2. Verify Base Sepolia USDC contract
  console.log(`Constructor USDC Address:${BASE_SEPOLIA_USDC}`);
  const usdcAbi = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)"
  ];
  const usdcContract = new hre.ethers.Contract(BASE_SEPOLIA_USDC, usdcAbi, hre.ethers.provider);

  const [usdcName, usdcSymbol, usdcDecimals] = await Promise.all([
    usdcContract.name(),
    usdcContract.symbol(),
    usdcContract.decimals()
  ]);

  console.log(`USDC Verified On-Chain:  ${usdcName} (${usdcSymbol}), Decimals: ${usdcDecimals}`);

  if (usdcSymbol !== "USDC") {
    throw new Error(`Invalid USDC symbol: expected 'USDC', got '${usdcSymbol}'`);
  }
  if (Number(usdcDecimals) !== 6) {
    throw new Error(`Invalid USDC decimals: expected 6, got ${usdcDecimals}`);
  }

  const DEPLOYED_ADDRESS = process.env.BASE_PAYROLL_ADDRESS || "0x2d9B6f6B790bEc03f666420089919aeA0c40FBCD";
  let contractAddress = DEPLOYED_ADDRESS;
  let deployTxHash = "0xfb32da3352ba8fb8ef19d68e50f4cf3df7c69296c57c9302d67aabe092db98d4";

  // Check if contract is already deployed
  const existingBytecode = await hre.ethers.provider.getCode(DEPLOYED_ADDRESS);
  if (existingBytecode && existingBytecode !== "0x" && !process.env.FORCE_DEPLOY) {
    console.log(`\nExisting BasePayroll deployment found at: ${DEPLOYED_ADDRESS}`);
    console.log(`Deployment Tx Hash:        ${deployTxHash}`);
  } else {
    // Deploy ArcPayroll contract with Base Sepolia USDC
    console.log("\nDeploying ArcPayroll contract to Base Sepolia...");
    const ArcPayroll = await hre.ethers.getContractFactory("ArcPayroll");
    const payroll = await ArcPayroll.deploy(BASE_SEPOLIA_USDC);

    console.log("Waiting for deployment transaction to be mined...");
    await payroll.waitForDeployment();

    contractAddress = await payroll.getAddress();
    const deployTx = payroll.deploymentTransaction();
    deployTxHash = deployTx ? deployTx.hash : "N/A";

    console.log(`\nDeployment Success!`);
    console.log(`Deployed Contract Address: ${contractAddress}`);
    console.log(`Deployment Tx Hash:        ${deployTxHash}`);
  }

  // 4. Post-deployment verification on Base Sepolia
  console.log("\n--- Running Post-Deployment Verification ---");
  
  // Retry loop for bytecode to allow for RPC read-after-write sync
  let bytecode = "0x";
  for (let i = 0; i < 5; i++) {
    bytecode = await hre.ethers.provider.getCode(contractAddress);
    if (bytecode && bytecode !== "0x") break;
    await new Promise((r) => setTimeout(r, 2000));
  }

  if (!bytecode || bytecode === "0x") {
    throw new Error(`Verification failed: No bytecode found at ${contractAddress}`);
  }
  console.log(`Bytecode check:          Passed (${bytecode.length} characters / ${(bytecode.length - 2) / 2} bytes)`);

  const ArcPayrollFactory = await hre.ethers.getContractFactory("ArcPayroll");
  const contract = ArcPayrollFactory.attach(contractAddress);

  const owner = await contract.owner();
  console.log(`Contract owner():        ${owner}`);
  if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error(`Owner mismatch: expected ${deployer.address}, got ${owner}`);
  }

  const configuredUsdc = await contract.getUsdcToken();
  console.log(`Configured USDC token:   ${configuredUsdc}`);
  if (configuredUsdc.toLowerCase() !== BASE_SEPOLIA_USDC.toLowerCase()) {
    throw new Error(`Configured USDC mismatch: expected ${BASE_SEPOLIA_USDC}, got ${configuredUsdc}`);
  }

  if (configuredUsdc.toLowerCase() === ARC_USDC.toLowerCase()) {
    throw new Error("CRITICAL ERROR: Contract was accidentally deployed with Arc USDC address!");
  }

  console.log("\n=========================================");
  console.log("Base Sepolia Payroll Deployment Verified");
  console.log("=========================================");
}

main().catch((error) => {
  console.error("\nDeployment failed with error:");
  console.error(error);
  process.exitCode = 1;
});
