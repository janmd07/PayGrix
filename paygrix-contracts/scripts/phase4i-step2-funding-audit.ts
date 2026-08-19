import { ethers } from "hardhat";

const CONFIG = {
  NETWORK_NAME: "Arc Testnet",
  EXPECTED_CHAIN_ID: 5042002n,
  PAYGRIX_LENDING_ADDRESS: "0x800Cd0a3b737e989F45E69f64eEeB118724522aE",
  PRODUCTION_ORACLE_ADAPTER: "0xA17Bfb3332A83F0e247129ee9c0d1A454A332287",
  EXPECTED_FUNDER_ADDRESS: "0x2f3cFb9bd88DEC61406f12F35146579aF42619f4",
  USDC_ADDRESS: "0x3600000000000000000000000000000000000000",
  TARGET_FUND_USDC: 1_499_000_000n, // 1,499 USDC (6 decimals)
};

async function main() {
  console.log("================================================================");
  console.log("=== PAYGRIX LENDING PHASE 4I STEP 2: FUNDING EXECUTION AUDIT ===");
  console.log("================================================================");

  const [signer] = await ethers.getSigners();
  const signerAddress = await signer.getAddress();
  console.log("Connected Signer Address:", signerAddress);
  console.log("Configured Target Funder Wallet:", CONFIG.EXPECTED_FUNDER_ADDRESS);

  const erc20Abi = [
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
  ];
  const usdc = new ethers.Contract(CONFIG.USDC_ADDRESS, erc20Abi, ethers.provider);

  const funderUsdcBal: bigint = await usdc.balanceOf(CONFIG.EXPECTED_FUNDER_ADDRESS);
  const signerUsdcBal: bigint = await usdc.balanceOf(signerAddress);

  console.log(`Funder Wallet (${CONFIG.EXPECTED_FUNDER_ADDRESS}) USDC Balance: ${ethers.formatUnits(funderUsdcBal, 6)} USDC`);
  console.log(`Connected Signer (${signerAddress}) USDC Balance: ${ethers.formatUnits(signerUsdcBal, 6)} USDC`);

  const signerMatches = signerAddress.toLowerCase() === CONFIG.EXPECTED_FUNDER_ADDRESS.toLowerCase();

  if (!signerMatches) {
    console.log("\n================================================================");
    console.log("=== SAFETY GUARD TRIGGERED: SIGNER MISMATCH ===");
    console.log("================================================================");
    console.log(`Connected Signer: ${signerAddress}`);
    console.log(`Configured Funder Wallet: ${CONFIG.EXPECTED_FUNDER_ADDRESS}`);
    console.log("Reason: The connected wallet signer (DEPLOYER_PRIVATE_KEY) does not match the configured funder wallet.");
    console.log("Funder wallet 0x2f3cFb9bd88DEC61406f12F35146579aF42619f4 private key is not present in local .env.");
    console.log("Action: Execution stopped per safety instructions. No transactions sent.");
  }
}

main().catch((error) => {
  console.error("Audit Execution Error:", error);
  process.exit(1);
});
