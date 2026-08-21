/**
 * PayGrix x GenLayer — Base Sepolia Contract Deployment Script (Phase 5ZF).
 * 
 * STRICT TARGET:
 * Base Sepolia ONLY (Chain ID: 84532)
 * RPC: https://sepolia.base.org
 * Explorer: https://sepolia.basescan.org
 * 
 * ABSOLUTE SAFETY:
 * NEVER TARGET BASE MAINNET (8453).
 * 
 * Deployment Sequence:
 * Step 1: Deploy BaseBridgeAdapter(relayerAddress)
 * Step 2: Deploy PayGrixEscrowVault(BASE_SEPOLIA_USDC, adapterAddress)
 * Step 3: Call BaseBridgeAdapter.setVaultAddress(vaultAddress) to seal one-time binding
 * Step 4: Post-deployment on-chain state verification
 */

import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
// @ts-ignore
import solc from "solc";
import * as dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants & Guards
export const EXPECTED_CHAIN_ID = BigInt(84532); // Base Sepolia
export const FORBIDDEN_CHAIN_ID = BigInt(8453); // Base Mainnet (Strictly Prohibited)
export const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const DEFAULT_RELAYER_ADDRESS = "0xf85085b73a4Ec4efE895B532Fe1560a06ff0d179";

export interface DeploymentReceiptInfo {
  blockNumber: number;
  gasUsed: string;
  txHash: string;
}

export interface DeploymentResult {
  network: string;
  chainId: number;
  adapterAddress: string;
  adapterTxHash: string;
  adapterReceipt: DeploymentReceiptInfo;
  vaultAddress: string;
  vaultTxHash: string;
  vaultReceipt: DeploymentReceiptInfo;
  setVaultTxHash: string;
  setVaultReceipt: DeploymentReceiptInfo;
  relayerAddress: string;
  usdcAddress: string;
  verification: {
    adapterVaultBound: boolean;
    vaultAdjudicationBound: boolean;
    vaultUsdcBound: boolean;
    adapterBytecodePresent: boolean;
    vaultBytecodePresent: boolean;
  };
}

function compileContracts() {
  const rootDir = path.resolve(__dirname, "..");
  const vaultPath = path.join(rootDir, "contracts", "base-sepolia", "PayGrixEscrowVault.sol");
  const adapterPath = path.join(rootDir, "bridge", "adapter", "BaseBridgeAdapter.sol");
  const interfacePath = path.join(rootDir, "contracts", "base-sepolia", "interfaces", "IAdjudicationSource.sol");

  const vaultSource = fs.readFileSync(vaultPath, "utf8");
  const adapterSource = fs.readFileSync(adapterPath, "utf8");
  const interfaceSource = fs.readFileSync(interfacePath, "utf8");

  function findImports(importPath: string) {
    if (importPath.includes("IAdjudicationSource.sol")) {
      return { contents: interfaceSource };
    }
    return { error: "File not found" };
  }

  const input = {
    language: "Solidity",
    sources: {
      "contracts/base-sepolia/PayGrixEscrowVault.sol": { content: vaultSource },
      "bridge/adapter/BaseBridgeAdapter.sol": { content: adapterSource },
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object"],
        },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

  if (output.errors) {
    const fatal = output.errors.filter((e: { severity: string }) => e.severity === "error");
    if (fatal.length > 0) {
      throw new Error(`Solidity Compilation Error: ${JSON.stringify(fatal, null, 2)}`);
    }
  }

  const adapter = output.contracts["bridge/adapter/BaseBridgeAdapter.sol"]["BaseBridgeAdapter"];
  const vault = output.contracts["contracts/base-sepolia/PayGrixEscrowVault.sol"]["PayGrixEscrowVault"];

  return {
    adapterAbi: adapter.abi,
    adapterBytecode: "0x" + adapter.evm.bytecode.object,
    vaultAbi: vault.abi,
    vaultBytecode: "0x" + vault.evm.bytecode.object,
  };
}

export async function deployBaseSepolia(
  signer: ethers.Signer,
  relayerAddress: string
): Promise<DeploymentResult> {
  // 1. Verify Signer & Network
  const provider = signer.provider;
  if (!provider) {
    throw new Error("BaseSepoliaDeployer: Signer must be connected to a provider.");
  }

  const network = await provider.getNetwork();
  const currentChainId = network.chainId;

  console.log("\n========================================================");
  console.log("=== PAYGRIX x GENLAYER BASE SEPOLIA LIVE DEPLOYMENT ===");
  console.log("========================================================");
  console.log(`Connected Chain ID: ${currentChainId.toString()}`);

  if (currentChainId === FORBIDDEN_CHAIN_ID) {
    throw new Error("CRITICAL SAFETY REVERT: Base Mainnet (8453) detected! Deployment aborted.");
  }

  if (currentChainId !== EXPECTED_CHAIN_ID) {
    throw new Error(
      `INVALID NETWORK: Expected Base Sepolia (84532), but connected to chain ID ${currentChainId.toString()}`
    );
  }

  // 2. Validate Addresses
  if (!relayerAddress || relayerAddress === ZERO_ADDRESS || !ethers.isAddress(relayerAddress)) {
    throw new Error("BaseSepoliaDeployer: Invalid or zero relayer address provided.");
  }

  if (BASE_SEPOLIA_USDC.toLowerCase() !== "0x036cbd53842c5426634e7929541ec2318f3dcf7e") {
    throw new Error("BaseSepoliaDeployer: USDC address mismatch with official Base Sepolia contract.");
  }

  const deployerAddress = await signer.getAddress();
  const balance = await provider.getBalance(deployerAddress);
  console.log(`Deployer Address:           ${deployerAddress}`);
  console.log(`Deployer Balance:           ${ethers.formatEther(balance)} ETH`);
  console.log(`Configured Relayer Address: ${relayerAddress}`);
  console.log(`Configured USDC Address:    ${BASE_SEPOLIA_USDC}`);

  if (balance === BigInt(0)) {
    throw new Error("BaseSepoliaDeployer: Deployer account has 0 ETH on Base Sepolia for gas.");
  }

  // 3. Compile Contracts
  console.log("\n[0/4] Compiling BaseBridgeAdapter and PayGrixEscrowVault with solc 0.8.26...");
  const compiled = compileContracts();
  console.log("Compilation successful!");

  // Step 1: Deploy BaseBridgeAdapter
  console.log("\n[1/4] Deploying BaseBridgeAdapter(relayerAddress)...");
  const AdapterFactory = new ethers.ContractFactory(compiled.adapterAbi, compiled.adapterBytecode, signer);
  const adapterContract = await AdapterFactory.deploy(relayerAddress);
  const adapterTx = adapterContract.deploymentTransaction();
  if (!adapterTx) throw new Error("Failed to retrieve BaseBridgeAdapter deployment transaction.");
  console.log(`BaseBridgeAdapter TX Hash: ${adapterTx.hash}`);
  console.log("Waiting for confirmation on Base Sepolia...");
  
  await adapterContract.waitForDeployment();
  const adapterAddress = await adapterContract.getAddress();
  const adapterReceipt = await adapterTx.wait(1);
  if (!adapterReceipt) throw new Error("Failed to retrieve BaseBridgeAdapter receipt.");
  console.log(`✓ BaseBridgeAdapter Deployed at: ${adapterAddress} (Block: ${adapterReceipt.blockNumber}, Gas: ${adapterReceipt.gasUsed.toString()})`);
  console.log(`BaseScan Link: https://sepolia.basescan.org/address/${adapterAddress}`);

  // Step 2: Deploy PayGrixEscrowVault
  console.log("\n[2/4] Deploying PayGrixEscrowVault(BASE_SEPOLIA_USDC, adapterAddress)...");
  const VaultFactory = new ethers.ContractFactory(compiled.vaultAbi, compiled.vaultBytecode, signer);
  const vaultContract = await VaultFactory.deploy(BASE_SEPOLIA_USDC, adapterAddress);
  const vaultTx = vaultContract.deploymentTransaction();
  if (!vaultTx) throw new Error("Failed to retrieve PayGrixEscrowVault deployment transaction.");
  console.log(`PayGrixEscrowVault TX Hash: ${vaultTx.hash}`);
  console.log("Waiting for confirmation on Base Sepolia...");

  await vaultContract.waitForDeployment();
  const vaultAddress = await vaultContract.getAddress();
  const vaultReceipt = await vaultTx.wait(1);
  if (!vaultReceipt) throw new Error("Failed to retrieve PayGrixEscrowVault receipt.");
  console.log(`✓ PayGrixEscrowVault Deployed at: ${vaultAddress} (Block: ${vaultReceipt.blockNumber}, Gas: ${vaultReceipt.gasUsed.toString()})`);
  console.log(`BaseScan Link: https://sepolia.basescan.org/address/${vaultAddress}`);

  // Step 3: Call adapter.setVaultAddress(vaultAddress)
  console.log("\n[3/4] Binding PayGrixEscrowVault to BaseBridgeAdapter via setVaultAddress()...");
  const boundAdapter = new ethers.Contract(adapterAddress, compiled.adapterAbi, signer);
  const setVaultTx = await boundAdapter.setVaultAddress(vaultAddress);
  console.log(`setVaultAddress TX Hash: ${setVaultTx.hash}`);
  console.log("Waiting for confirmation on Base Sepolia...");

  const setVaultReceipt = await setVaultTx.wait(1);
  if (!setVaultReceipt) throw new Error("Failed to retrieve setVaultAddress receipt.");
  console.log(`✓ Vault Sealed on Adapter! (Block: ${setVaultReceipt.blockNumber}, Gas: ${setVaultReceipt.gasUsed.toString()})`);
  console.log(`BaseScan Link: https://sepolia.basescan.org/tx/${setVaultTx.hash}`);

  // Step 4: Post-Deployment Read-Only Verification
  console.log("\n[4/4] Performing Read-Only Post-Deployment On-Chain Verification...");
  const onChainVaultOnAdapter = await boundAdapter.vaultAddress();
  const onChainRelayerOnAdapter = await boundAdapter.relayerAddress();
  const boundVault = new ethers.Contract(vaultAddress, compiled.vaultAbi, provider);
  const onChainUsdcOnVault = await boundVault.usdcToken();
  const onChainAdjudicationOnVault = await boundVault.adjudicationSource();
  const adapterBytecode = await provider.getCode(adapterAddress);
  const vaultBytecode = await provider.getCode(vaultAddress);

  console.log(`- Adapter vaultAddress:        ${onChainVaultOnAdapter}`);
  console.log(`- Adapter relayerAddress:      ${onChainRelayerOnAdapter}`);
  console.log(`- Vault usdcToken:             ${onChainUsdcOnVault}`);
  console.log(`- Vault adjudicationSource:    ${onChainAdjudicationOnVault}`);
  console.log(`- Adapter Bytecode Length:     ${adapterBytecode.length} chars`);
  console.log(`- Vault Bytecode Length:       ${vaultBytecode.length} chars`);

  const adapterVaultBound = onChainVaultOnAdapter.toLowerCase() === vaultAddress.toLowerCase();
  const vaultAdjudicationBound = onChainAdjudicationOnVault.toLowerCase() === adapterAddress.toLowerCase();
  const vaultUsdcBound = onChainUsdcOnVault.toLowerCase() === BASE_SEPOLIA_USDC.toLowerCase();
  const adapterBytecodePresent = adapterBytecode !== "0x" && adapterBytecode.length > 2;
  const vaultBytecodePresent = vaultBytecode !== "0x" && vaultBytecode.length > 2;

  if (!adapterVaultBound) throw new Error(`Verification FAILED: Adapter vaultAddress mismatch.`);
  if (!vaultAdjudicationBound) throw new Error(`Verification FAILED: Vault adjudicationSource mismatch.`);
  if (!vaultUsdcBound) throw new Error(`Verification FAILED: Vault usdcToken mismatch.`);
  if (!adapterBytecodePresent || !vaultBytecodePresent) throw new Error(`Verification FAILED: Deployed bytecode is missing.`);

  console.log("\n✓ ALL ON-CHAIN VERIFICATIONS PASSED 100%!");
  console.log("========================================================\n");

  return {
    network: "Base Sepolia",
    chainId: Number(currentChainId),
    adapterAddress,
    adapterTxHash: adapterTx.hash,
    adapterReceipt: {
      blockNumber: adapterReceipt.blockNumber,
      gasUsed: adapterReceipt.gasUsed.toString(),
      txHash: adapterTx.hash,
    },
    vaultAddress,
    vaultTxHash: vaultTx.hash,
    vaultReceipt: {
      blockNumber: vaultReceipt.blockNumber,
      gasUsed: vaultReceipt.gasUsed.toString(),
      txHash: vaultTx.hash,
    },
    setVaultTxHash: setVaultTx.hash,
    setVaultReceipt: {
      blockNumber: setVaultReceipt.blockNumber,
      gasUsed: setVaultReceipt.gasUsed.toString(),
      txHash: setVaultTx.hash,
    },
    relayerAddress,
    usdcAddress: BASE_SEPOLIA_USDC,
    verification: {
      adapterVaultBound,
      vaultAdjudicationBound,
      vaultUsdcBound,
      adapterBytecodePresent,
      vaultBytecodePresent,
    },
  };
}

// Direct CLI execution
const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isDirectExecution || process.argv.includes("--run")) {
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY;
  const relayerAddr = process.env.RELAYER_ADDRESS || process.env.BASE_SEPOLIA_RELAYER_ADDRESS || DEFAULT_RELAYER_ADDRESS;

  if (!privateKey) {
    console.error("ERROR: Deployer private key is missing from environment.");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);

  deployBaseSepolia(signer, relayerAddr)
    .then((result) => {
      console.log("DEPLOYMENT_RESULT_JSON=" + JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error("DEPLOYMENT FAILED:", err);
      process.exit(1);
    });
}
