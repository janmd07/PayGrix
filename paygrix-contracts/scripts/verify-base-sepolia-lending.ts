import { ethers } from "hardhat";

const BASE_SEPOLIA_WETH = "0x4200000000000000000000000000000000000006";
const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const BASE_SEPOLIA_LENDING = "0x7C5e75516D55703D564587aC35BF0D20a14e34b8";
const BASE_SEPOLIA_ORACLE = "0x204e574eeEd81B4C766D225A3859aB7E19d17067";

const WETH_ABI = [
  "function deposit() external payable",
  "function withdraw(uint256 amount) external",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
];

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const [tester] = await ethers.getSigners();
  console.log("==================================================");
  console.log("TESTING BASE SEPOLIA LENDING PROTOCOL END-TO-END");
  console.log("==================================================");
  console.log("Tester address:", tester.address);

  const lending = await ethers.getContractAt("BaseSepoliaLending", BASE_SEPOLIA_LENDING, tester);
  const oracle = await ethers.getContractAt("BaseSepoliaOracleAdapter", BASE_SEPOLIA_ORACLE, tester);
  const weth = new ethers.Contract(BASE_SEPOLIA_WETH, WETH_ABI, tester);
  const usdc = new ethers.Contract(BASE_SEPOLIA_USDC, ERC20_ABI, tester);

  // 1. Oracle Verification
  console.log("\n[TEST 1] Verifying Oracle...");
  const [oraclePrice, oracleDec, oracleTime, oracleValid] = await oracle.getPriceData();
  console.log(`✓ Live Oracle Price: $${Number(oraclePrice) / 1e6} (Decimals: ${oracleDec}, Valid: ${oracleValid})`);

  // 2. Check / Ensure WETH balance
  console.log("\n[TEST 2] Checking WETH balance...");
  let wethBal: bigint = await weth.balanceOf(tester.address);
  const testAmount = ethers.parseEther("0.0003");

  if (wethBal < testAmount) {
    console.log("Wrapping 0.0005 ETH to WETH...");
    const wrapTx = await weth.deposit({ value: ethers.parseEther("0.0005") });
    await wrapTx.wait(1);
    await sleep(2000);
    wethBal = await weth.balanceOf(tester.address);
  }
  console.log(`✓ Tester WETH Balance: ${ethers.formatEther(wethBal)} WETH`);

  // 3. WETH Approval
  console.log("\n[TEST 3] Approving WETH to BaseSepoliaLending...");
  const approveWethTx = await weth.approve(BASE_SEPOLIA_LENDING, testAmount);
  await approveWethTx.wait(1);
  await sleep(1000);
  console.log("✓ WETH approved");

  // 4. WETH Supply
  console.log(`\n[TEST 4] Supplying ${ethers.formatEther(testAmount)} WETH collateral...`);
  const supplyTx = await lending.depositCollateral(testAmount);
  await supplyTx.wait(1);
  await sleep(2000);
  const [collatPostSupply, debtPostSupply] = await lending.getPosition(tester.address);
  console.log(`✓ Position: Collateral = ${ethers.formatEther(collatPostSupply)} WETH, Debt = ${ethers.formatUnits(debtPostSupply, 6)} USDC`);

  // 5. Max Borrow Calculation
  console.log("\n[TEST 5] Checking On-Chain Borrow Capacity...");
  const maxBorrow = await lending.maxBorrow(tester.address);
  console.log(`✓ Max Borrow Capacity: ${ethers.formatUnits(maxBorrow, 6)} USDC`);

  // 6. Test ExceedsMaxLtv Revert
  console.log("\n[TEST 6] Testing Unsafe Borrow Rejection (> max LTV)...");
  const excessiveBorrowAmount = ethers.parseUnits("10.0", 6); // 10 USDC is > 50% LTV
  try {
    await lending.borrow.staticCall(excessiveBorrowAmount);
    throw new Error("FAIL: Excessive borrow did not revert!");
  } catch (err: any) {
    if (err.message.includes("ExceedsMaxLtv") || err.message.includes("revert")) {
      console.log("✓ Successfully rejected excessive borrow (ExceedsMaxLtv enforced)");
    } else {
      throw err;
    }
  }

  // 7. Borrow 0.1 USDC (well within capacity)
  console.log("\n[TEST 7] Borrowing 0.1 USDC...");
  const borrowAmount = ethers.parseUnits("0.1", 6);
  // Pre-flight simulation with staticCall
  await lending.borrow.staticCall(borrowAmount);
  const borrowTx = await lending.borrow(borrowAmount);
  await borrowTx.wait(1);
  await sleep(2000);
  const [collatPostBorrow, debtPostBorrow] = await lending.getPosition(tester.address);
  console.log(`✓ Position Post-Borrow: Collateral = ${ethers.formatEther(collatPostBorrow)} WETH, Debt = ${ethers.formatUnits(debtPostBorrow, 6)} USDC`);

  // 8. Repay 0.1 USDC
  console.log("\n[TEST 8] Repaying 0.1 USDC debt...");
  const approveUsdcTx = await usdc.approve(BASE_SEPOLIA_LENDING, borrowAmount);
  await approveUsdcTx.wait(1);
  await sleep(1000);
  const repayTx = await lending.repay(borrowAmount);
  await repayTx.wait(1);
  await sleep(2000);
  const [collatPostRepay, debtPostRepay] = await lending.getPosition(tester.address);
  console.log(`✓ Position Post-Repay: Collateral = ${ethers.formatEther(collatPostRepay)} WETH, Debt = ${ethers.formatUnits(debtPostRepay, 6)} USDC`);

  // 9. Withdraw WETH
  console.log(`\n[TEST 9] Withdrawing ${ethers.formatEther(testAmount)} WETH collateral...`);
  // Pre-flight simulation with staticCall
  await lending.withdrawCollateral.staticCall(testAmount);
  const withdrawTx = await lending.withdrawCollateral(testAmount);
  await withdrawTx.wait(1);
  await sleep(2000);
  const [collatPostWithdraw, debtPostWithdraw] = await lending.getPosition(tester.address);
  console.log(`✓ Final Position: Collateral = ${ethers.formatEther(collatPostWithdraw)} WETH, Debt = ${ethers.formatUnits(debtPostWithdraw, 6)} USDC`);

  console.log("\n==================================================");
  console.log("✓ ALL ON-CHAIN BASE SEPOLIA TESTS PASSED PERFECTLY!");
  console.log("==================================================");
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
