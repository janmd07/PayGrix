import { expect } from "chai";
import { ethers } from "hardhat";
import { PayGrixLending, LendingMockERC20, MockOracle } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("PayGrixLending Smart Contract Unit Tests", function () {
  let lending: PayGrixLending;
  let cirBTC: LendingMockERC20;
  let usdc: LendingMockERC20;
  let oracle: MockOracle;

  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let funder: SignerWithAddress;

  // Constants
  const ONE_BTC = 100_000_000n; // 1.0 cirBTC (8 decimals)
  const ZERO_FIVE_BTC = 50_000_000n; // 0.5 cirBTC (8 decimals)
  const ONE_POINT_FIVE_BTC = 150_000_000n; // 1.5 cirBTC (8 decimals)
  const BTC_PRICE_60K = 60_000_000_000n; // $60,000.00 USDC (6 decimals)
  const ONE_USDC = 1_000_000n; // 1.0 USDC (6 decimals)

  beforeEach(async function () {
    [owner, user1, user2, funder] = await ethers.getSigners();

    // Deploy Mock Tokens
    const MockERC20Factory = await ethers.getContractFactory("LendingMockERC20");
    cirBTC = await MockERC20Factory.deploy("Circle Bitcoin", "cirBTC", 8); // 8 decimals
    usdc = await MockERC20Factory.deploy("USD Coin", "USDC", 6); // 6 decimals

    // Deploy Mock Oracle with initial price $60,000.00 (6 decimals)
    const MockOracleFactory = await ethers.getContractFactory("MockOracle");
    oracle = await MockOracleFactory.deploy(BTC_PRICE_60K, 6);

    // Deploy PayGrixLending (50% Borrow LTV = 5000 bps, 75% Liquidation Threshold = 7500 bps)
    const PayGrixLendingFactory = await ethers.getContractFactory("PayGrixLending");
    lending = await PayGrixLendingFactory.deploy(
      await cirBTC.getAddress(),
      await usdc.getAddress(),
      await oracle.getAddress(),
      5000,
      7500
    );

    // Mint tokens for testing
    await cirBTC.mint(user1.address, 10n * ONE_BTC);
    await cirBTC.mint(user2.address, 10n * ONE_BTC);
    await usdc.mint(funder.address, 1_000_000n * ONE_USDC);

    // Approve tokens
    await cirBTC.connect(user1).approve(await lending.getAddress(), ethers.MaxUint256);
    await cirBTC.connect(user2).approve(await lending.getAddress(), ethers.MaxUint256);
    await usdc.connect(funder).approve(await lending.getAddress(), ethers.MaxUint256);
    await usdc.connect(user1).approve(await lending.getAddress(), ethers.MaxUint256);

    // Initial pool funding (100,000 USDC)
    await lending.connect(funder).fundPool(100_000n * ONE_USDC);
  });

  describe("1. Constructor & Configuration Validation", function () {
    it("1.1 Correctly records immutable token addresses and default parameters", async function () {
      expect(await lending.collateralToken()).to.equal(await cirBTC.getAddress());
      expect(await lending.borrowToken()).to.equal(await usdc.getAddress());
      expect(await lending.oracle()).to.equal(await oracle.getAddress());
      expect(await lending.borrowLtvBps()).to.equal(5000n);
      expect(await lending.liquidationThresholdBps()).to.equal(7500n);
      expect(await lending.owner()).to.equal(owner.address);
    });

    it("1.2 Reverts constructor with zero address collateral token", async function () {
      const Factory = await ethers.getContractFactory("PayGrixLending");
      await expect(
        Factory.deploy(ethers.ZeroAddress, await usdc.getAddress(), await oracle.getAddress(), 5000, 7500)
      ).to.be.revertedWithCustomError(lending, "ZeroAddress");
    });

    it("1.3 Reverts constructor with zero address borrow token", async function () {
      const Factory = await ethers.getContractFactory("PayGrixLending");
      await expect(
        Factory.deploy(await cirBTC.getAddress(), ethers.ZeroAddress, await oracle.getAddress(), 5000, 7500)
      ).to.be.revertedWithCustomError(lending, "ZeroAddress");
    });

    it("1.4 Reverts constructor with zero address oracle", async function () {
      const Factory = await ethers.getContractFactory("PayGrixLending");
      await expect(
        Factory.deploy(await cirBTC.getAddress(), await usdc.getAddress(), ethers.ZeroAddress, 5000, 7500)
      ).to.be.revertedWithCustomError(lending, "ZeroAddress");
    });

    it("1.5 Reverts constructor with invalid risk parameters (LTV > Threshold or Threshold > 10000)", async function () {
      const Factory = await ethers.getContractFactory("PayGrixLending");
      await expect(
        Factory.deploy(await cirBTC.getAddress(), await usdc.getAddress(), await oracle.getAddress(), 8000, 7500)
      ).to.be.revertedWithCustomError(lending, "InvalidRiskParameters");

      await expect(
        Factory.deploy(await cirBTC.getAddress(), await usdc.getAddress(), await oracle.getAddress(), 5000, 10001)
      ).to.be.revertedWithCustomError(lending, "InvalidRiskParameters");
    });
  });

  describe("2. Collateral Deposits", function () {
    it("2.1 Successfully deposits cirBTC collateral and updates position", async function () {
      await expect(lending.connect(user1).depositCollateral(ONE_BTC))
        .to.emit(lending, "CollateralDeposited")
        .withArgs(user1.address, ONE_BTC);

      const pos = await lending.getPosition(user1.address);
      expect(pos.collateral).to.equal(ONE_BTC);
      expect(pos.debt).to.equal(0n);
      expect(await cirBTC.balanceOf(await lending.getAddress())).to.equal(ONE_BTC);
    });

    it("2.2 Reverts when depositing zero collateral", async function () {
      await expect(lending.connect(user1).depositCollateral(0n)).to.be.revertedWithCustomError(
        lending,
        "ZeroAmount"
      );
    });

    it("2.3 Reverts when allowance is insufficient", async function () {
      await cirBTC.connect(user1).approve(await lending.getAddress(), 0n);
      await expect(lending.connect(user1).depositCollateral(ONE_BTC)).to.be.reverted;
    });
  });

  describe("3. Decimal Conversion & Borrowing Math Verification", function () {
    beforeEach(async function () {
      // User1 deposits 1.5 cirBTC
      await lending.connect(user1).depositCollateral(ONE_POINT_FIVE_BTC);
    });

    it("3.1 Verifies exact 1.5 cirBTC / $60,000 example math (Collateral Value = $90,000, Max Borrow at 50% LTV = $45,000)", async function () {
      // 1.5 cirBTC = 150,000,000 units (8 decimals)
      // Price = 60,000 USDC = 60,000,000,000 units (6 decimals)
      // Collateral Value = (150,000,000 * 60,000,000,000) / 10^8 = 90,000,000,000 units ($90,000 USDC)
      // Max Borrow at 50% LTV = 45,000,000,000 units ($45,000 USDC)
      const maxUsdc = await lending.maxBorrow(user1.address);
      expect(maxUsdc).to.equal(45_000n * ONE_USDC);
    });

    it("3.2 Successfully borrows USDC within 50% LTV limit", async function () {
      const borrowAmount = 30_000n * ONE_USDC;
      await expect(lending.connect(user1).borrow(borrowAmount))
        .to.emit(lending, "LoanBorrowed")
        .withArgs(user1.address, borrowAmount);

      const pos = await lending.getPosition(user1.address);
      expect(pos.debt).to.equal(borrowAmount);
      expect(await lending.totalOutstandingDebt()).to.equal(borrowAmount);
      expect(await usdc.balanceOf(user1.address)).to.equal(borrowAmount);
    });

    it("3.3 Reverts borrowing exceeding 50% LTV limit", async function () {
      const excessBorrow = 45_001n * ONE_USDC; // Limit is 45,000 USDC
      await expect(lending.connect(user1).borrow(excessBorrow)).to.be.revertedWithCustomError(
        lending,
        "ExceedsMaxLtv"
      );
    });

    it("3.4 Reverts borrowing when requested amount exceeds available pool liquidity", async function () {
      // User2 deposits 10 cirBTC -> max borrow = $300,000 USDC, but pool only has $100,000 USDC
      await lending.connect(user2).depositCollateral(10n * ONE_BTC);
      await expect(lending.connect(user2).borrow(150_000n * ONE_USDC)).to.be.revertedWithCustomError(
        lending,
        "InsufficientPoolLiquidity"
      );
    });

    it("3.5 Reverts borrowing zero amount", async function () {
      await expect(lending.connect(user1).borrow(0n)).to.be.revertedWithCustomError(
        lending,
        "ZeroAmount"
      );
    });
  });

  describe("4. Health Factor Scaling Verification", function () {
    beforeEach(async function () {
      // User1 deposits 1.5 cirBTC = $90,000 collateral value
      await lending.connect(user1).depositCollateral(ONE_POINT_FIVE_BTC);
    });

    it("4.1 Debt = 0 returns max uint256 sentinel value", async function () {
      expect(await lending.healthFactor(user1.address)).to.equal(ethers.MaxUint256);
    });

    it("4.2 $90,000 collateral value & $45,000 debt yields exactly 15,000 bps (1.5 HF > 10,000 healthy)", async function () {
      // HF = (90,000 * 7500) / 45,000 = 15,000 bps
      await lending.connect(user1).borrow(45_000n * ONE_USDC);

      const hf = await lending.healthFactor(user1.address);
      expect(hf).to.equal(15_000n);
      expect(hf).to.be.greaterThan(10_000n); // > 10,000 bps is healthy
    });

    it("4.3 Debt at 75% collateral value ($67,500 debt against $90,000 value) yields exactly 10,000 bps (1.0 HF threshold)", async function () {
      // Bumps liquidation threshold first to 7500 bps, then borrow LTV to 7500 bps
      await lending.connect(owner).setLiquidationThreshold(7500);
      await lending.connect(owner).setBorrowLtv(7500);
      await lending.connect(user1).borrow(67_500n * ONE_USDC);

      const hf = await lending.healthFactor(user1.address);
      expect(hf).to.equal(10_000n); // Exactly 10,000 bps = 1.0 HF threshold
    });

    it("4.4 Debt above 75% collateral value ($80,000 debt against $90,000 value) yields HF < 10,000 bps (unsafe)", async function () {
      // Bumps liquidation threshold first to 9000 bps, then borrow LTV to 9000 bps
      await lending.connect(owner).setLiquidationThreshold(9000);
      await lending.connect(owner).setBorrowLtv(9000);
      await lending.connect(user1).borrow(80_000n * ONE_USDC);

      // Reset liquidation threshold to 7500 bps to test original health factor formula
      await lending.connect(owner).setBorrowLtv(5000);
      await lending.connect(owner).setLiquidationThreshold(7500);

      const hf = await lending.healthFactor(user1.address);
      // HF = (90,000 * 7500) / 80,000 = 8437 bps (< 10000)
      expect(hf).to.equal(8_437n);
      expect(hf).to.be.lessThan(10_000n);
    });
  });

  describe("5. Debt Repayment", function () {
    const borrowAmount = 20_000n * ONE_USDC;

    beforeEach(async function () {
      await lending.connect(user1).depositCollateral(ONE_BTC);
      await lending.connect(user1).borrow(borrowAmount);
    });

    it("5.1 Successfully performs partial debt repayment", async function () {
      const repayAmount = 5_000n * ONE_USDC;
      await expect(lending.connect(user1).repay(repayAmount))
        .to.emit(lending, "LoanRepaid")
        .withArgs(user1.address, repayAmount);

      const pos = await lending.getPosition(user1.address);
      expect(pos.debt).to.equal(borrowAmount - repayAmount);
      expect(await lending.totalOutstandingDebt()).to.equal(borrowAmount - repayAmount);
    });

    it("5.2 Successfully performs full debt repayment", async function () {
      await expect(lending.connect(user1).repay(borrowAmount))
        .to.emit(lending, "LoanRepaid")
        .withArgs(user1.address, borrowAmount);

      const pos = await lending.getPosition(user1.address);
      expect(pos.debt).to.equal(0n);
      expect(await lending.totalOutstandingDebt()).to.equal(0n);
    });

    it("5.3 Reverts over-repayment exceeding current debt", async function () {
      await expect(lending.connect(user1).repay(borrowAmount + 1n)).to.be.revertedWithCustomError(
        lending,
        "OverRepayment"
      );
    });

    it("5.4 Reverts repaying zero debt or when user has zero debt", async function () {
      await expect(lending.connect(user2).repay(1_000n * ONE_USDC)).to.be.revertedWithCustomError(
        lending,
        "InsufficientDebt"
      );
      await expect(lending.connect(user1).repay(0n)).to.be.revertedWithCustomError(
        lending,
        "ZeroAmount"
      );
    });
  });

  describe("6. Collateral Withdrawal Safety & Maximum Safe Withdrawal Audit", function () {
    beforeEach(async function () {
      // User1 deposits 1.5 cirBTC = $90,000 collateral value
      await lending.connect(user1).depositCollateral(ONE_POINT_FIVE_BTC);
    });

    it("6.1 Allows full collateral withdrawal when debt is 0", async function () {
      await expect(lending.connect(user1).withdrawCollateral(ONE_POINT_FIVE_BTC))
        .to.emit(lending, "CollateralWithdrawn")
        .withArgs(user1.address, ONE_POINT_FIVE_BTC);

      const pos = await lending.getPosition(user1.address);
      expect(pos.collateral).to.equal(0n);
    });

    it("6.2 Verifies maximum safe collateral withdrawal with active debt ($90k collateral, $45k debt -> max withdrawal = 0.5 cirBTC)", async function () {
      // User borrows $45,000 USDC against 1.5 cirBTC ($90,000 collateral)
      await lending.connect(user1).borrow(45_000n * ONE_USDC);

      // At 75% liquidation threshold, required collateral value = $45,000 / 0.75 = $60,000 (1.0 cirBTC).
      // Maximum safe withdrawable collateral = 1.5 - 1.0 = 0.5 cirBTC (50,000,000 base units).
      expect(await lending.availableCollateral(user1.address)).to.equal(ZERO_FIVE_BTC);

      // User withdraws maximum safe collateral (0.5 cirBTC)
      await expect(lending.connect(user1).withdrawCollateral(ZERO_FIVE_BTC))
        .to.emit(lending, "CollateralWithdrawn")
        .withArgs(user1.address, ZERO_FIVE_BTC);

      // Health factor after maximum safe withdrawal must be exactly 10,000 bps (1.0 HF threshold)
      const hfAfterWithdrawal = await lending.healthFactor(user1.address);
      expect(hfAfterWithdrawal).to.equal(10_000n);
    });

    it("6.3 Reverts withdrawal exceeding maximum safe amount (attempting 0.50000001 cirBTC withdrawal)", async function () {
      await lending.connect(user1).borrow(45_000n * ONE_USDC);

      const unsafeAmount = ZERO_FIVE_BTC + 1n; // 0.50000001 cirBTC
      await expect(lending.connect(user1).withdrawCollateral(unsafeAmount)).to.be.revertedWithCustomError(
        lending,
        "UnsafePosition"
      );
    });
  });

  describe("7. Pool Liquidity & Admin Withdrawal Safety Audit", function () {
    it("7.1 Fund pool = 100k USDC -> poolLiquidity = 100k USDC, contract USDC balance = 100k USDC", async function () {
      expect(await lending.poolLiquidity()).to.equal(100_000n * ONE_USDC);
      expect(await usdc.balanceOf(await lending.getAddress())).to.equal(100_000n * ONE_USDC);
    });

    it("7.2 Fund pool 100k USDC, borrow 40k USDC -> contract USDC balance = 60k USDC, totalOutstandingDebt = 40k USDC, poolLiquidity = 60k USDC", async function () {
      await lending.connect(user1).depositCollateral(2n * ONE_BTC);
      await lending.connect(user1).borrow(40_000n * ONE_USDC);

      // Contract USDC balance = 60,000 USDC
      expect(await usdc.balanceOf(await lending.getAddress())).to.equal(60_000n * ONE_USDC);
      // Total outstanding debt = 40,000 USDC
      expect(await lending.totalOutstandingDebt()).to.equal(40_000n * ONE_USDC);
      // Available borrow liquidity = 60,000 USDC
      expect(await lending.poolLiquidity()).to.equal(60_000n * ONE_USDC);
    });

    it("7.3 Admin can withdraw maximum available physical USDC (60k USDC) after 40k USDC is borrowed", async function () {
      await lending.connect(user1).depositCollateral(2n * ONE_BTC);
      await lending.connect(user1).borrow(40_000n * ONE_USDC);

      // Admin withdraws 60,000 USDC (all unborrowed USDC cash in contract)
      await expect(lending.connect(owner).withdrawPoolLiquidity(60_000n * ONE_USDC))
        .to.emit(lending, "PoolLiquidityWithdrawn")
        .withArgs(owner.address, 60_000n * ONE_USDC);

      expect(await lending.poolLiquidity()).to.equal(0n);
    });

    it("7.4 Admin withdrawal exceeding available physical USDC (60,001 USDC) reverts InsolventAdminWithdrawal", async function () {
      await lending.connect(user1).depositCollateral(2n * ONE_BTC);
      await lending.connect(user1).borrow(40_000n * ONE_USDC);

      // Contract balance is 60,000 USDC. Attempting to withdraw 60,001 USDC reverts
      await expect(lending.connect(owner).withdrawPoolLiquidity(60_001n * ONE_USDC)).to.be.revertedWithCustomError(
        lending,
        "InsolventAdminWithdrawal"
      );
    });

    it("7.5 Non-admin attempting pool liquidity withdrawal reverts", async function () {
      await expect(lending.connect(user1).withdrawPoolLiquidity(1_000n * ONE_USDC)).to.be.reverted;
    });

    it("7.6 Zero pool liquidity withdrawal reverts", async function () {
      await expect(lending.connect(owner).withdrawPoolLiquidity(0n)).to.be.revertedWithCustomError(
        lending,
        "ZeroAmount"
      );
    });
  });

  describe("8. Risk Parameter Administration & Oracle Normalization Audit", function () {
    it("8.1 Allows admin to update borrow LTV within valid bounds", async function () {
      await expect(lending.connect(owner).setBorrowLtv(6000))
        .to.emit(lending, "BorrowLtvUpdated")
        .withArgs(5000, 6000);

      expect(await lending.borrowLtvBps()).to.equal(6000n);
    });

    it("8.2 Reverts setting borrow LTV greater than liquidation threshold", async function () {
      await expect(lending.connect(owner).setBorrowLtv(8000)).to.be.revertedWithCustomError(
        lending,
        "InvalidRiskParameters"
      );
    });

    it("8.3 Allows admin to update liquidation threshold within valid bounds", async function () {
      await expect(lending.connect(owner).setLiquidationThreshold(8500))
        .to.emit(lending, "LiquidationThresholdUpdated")
        .withArgs(7500, 8500);

      expect(await lending.liquidationThresholdBps()).to.equal(8500n);
    });

    it("8.4 Reverts setting oracle to zero address", async function () {
      await expect(lending.connect(owner).setOracle(ethers.ZeroAddress)).to.be.revertedWithCustomError(
        lending,
        "ZeroAddress"
      );
    });

    it("8.5 Correctly handles oracle price update and zero price rejection", async function () {
      await oracle.setPrice(70_000_000_000n); // $70,000.00
      expect(await lending.collateralPrice()).to.equal(70_000_000_000n);

      await oracle.setPrice(0n);
      await expect(lending.collateralPrice()).to.be.revertedWithCustomError(
        lending,
        "InvalidOraclePrice"
      );
    });

    it("8.6 Correctly normalizes oracle returning 8 decimals down to 6 decimals", async function () {
      // Deploy oracle returning 8 decimals ($60,000.00 = 60,000 * 10^8 = 6,000_000_000_000 units)
      const MockOracleFactory = await ethers.getContractFactory("MockOracle");
      const oracle8Dec = await MockOracleFactory.deploy(6_000_000_000_000n, 8);

      await lending.connect(owner).setOracle(await oracle8Dec.getAddress());

      // Collateral price view should return normalized 6 decimals ($60,000.00 = 60_000_000_000)
      expect(await lending.collateralPrice()).to.equal(BTC_PRICE_60K);
    });

    it("8.7 Reverts non-admin attempting parameter modifications", async function () {
      await expect(lending.connect(user1).setBorrowLtv(4000)).to.be.reverted;
      await expect(lending.connect(user1).setLiquidationThreshold(8000)).to.be.reverted;
      await expect(lending.connect(user1).setOracle(user1.address)).to.be.reverted;
    });
  });

  describe("9. Pausable & Emergency Controls", function () {
    beforeEach(async function () {
      await lending.connect(user1).depositCollateral(ONE_BTC);
      await lending.connect(user1).borrow(10_000n * ONE_USDC);
      await lending.connect(owner).pause();
    });

    it("9.1 Blocks depositCollateral when paused", async function () {
      await expect(lending.connect(user1).depositCollateral(ONE_BTC)).to.be.revertedWithCustomError(
        lending,
        "EnforcedPause"
      );
    });

    it("9.2 Blocks borrow when paused", async function () {
      await expect(lending.connect(user1).borrow(5_000n * ONE_USDC)).to.be.revertedWithCustomError(
        lending,
        "EnforcedPause"
      );
    });

    it("9.3 Blocks withdrawCollateral when paused", async function () {
      await expect(lending.connect(user1).withdrawCollateral(ONE_BTC)).to.be.revertedWithCustomError(
        lending,
        "EnforcedPause"
      );
    });

    it("9.4 Does NOT block repay when paused", async function () {
      await expect(lending.connect(user1).repay(5_000n * ONE_USDC))
        .to.emit(lending, "LoanRepaid")
        .withArgs(user1.address, 5_000n * ONE_USDC);
    });

    it("9.5 Successfully unpauses operations", async function () {
      await lending.connect(owner).unpause();
      await expect(lending.connect(user1).depositCollateral(ONE_BTC)).to.emit(
        lending,
        "CollateralDeposited"
      );
    });
  });
});
