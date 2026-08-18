import { expect } from "chai";
import { ethers } from "hardhat";
import { PayGrixLending, LendingMockERC20, MockOracle, ProductionOracleAdapter } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("PayGrixLending Smart Contract Unit Tests", function () {
  let lending: PayGrixLending;
  let cirBTC: LendingMockERC20;
  let usdc: LendingMockERC20;
  let oracle: MockOracle;
  let adapter: ProductionOracleAdapter;

  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let funder: SignerWithAddress;
  let liquidator: SignerWithAddress;

  // Constants
  const ONE_BTC = 100_000_000n; // 1.0 cirBTC (8 decimals)
  const ZERO_FIVE_BTC = 50_000_000n; // 0.5 cirBTC (8 decimals)
  const ONE_POINT_FIVE_BTC = 150_000_000n; // 1.5 cirBTC (8 decimals)
  const BTC_PRICE_60K = 60_000_000_000n; // $60,000.00 USDC (6 decimals)
  const ONE_USDC = 1_000_000n; // 1.0 USDC (6 decimals)

  beforeEach(async function () {
    [owner, user1, user2, funder, liquidator] = await ethers.getSigners();

    // Deploy Mock Tokens
    const MockERC20Factory = await ethers.getContractFactory("LendingMockERC20");
    cirBTC = await MockERC20Factory.deploy("Circle Bitcoin", "cirBTC", 8); // 8 decimals
    usdc = await MockERC20Factory.deploy("USD Coin", "USDC", 6); // 6 decimals

    // Deploy Mock Oracle with initial price $60,000.00 (6 decimals)
    const MockOracleFactory = await ethers.getContractFactory("MockOracle");
    oracle = await MockOracleFactory.deploy(BTC_PRICE_60K, 6);

    // Deploy Production Oracle Adapter ($60,000, 6 dec, staleness 3600s, min $1,000, max $500,000)
    const AdapterFactory = await ethers.getContractFactory("ProductionOracleAdapter");
    adapter = await AdapterFactory.deploy(BTC_PRICE_60K, 6, 3600, 1_000_000_000n, 500_000_000_000n);

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
    await usdc.mint(liquidator.address, 1_000_000n * ONE_USDC);

    // Approve tokens
    await cirBTC.connect(user1).approve(await lending.getAddress(), ethers.MaxUint256);
    await cirBTC.connect(user2).approve(await lending.getAddress(), ethers.MaxUint256);
    await usdc.connect(funder).approve(await lending.getAddress(), ethers.MaxUint256);
    await usdc.connect(user1).approve(await lending.getAddress(), ethers.MaxUint256);
    await usdc.connect(liquidator).approve(await lending.getAddress(), ethers.MaxUint256);

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
      await lending.connect(user1).depositCollateral(ONE_POINT_FIVE_BTC);
    });

    it("3.1 Verifies exact 1.5 cirBTC / $60,000 example math (Collateral Value = $90,000, Max Borrow at 50% LTV = $45,000)", async function () {
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
      const excessBorrow = 45_001n * ONE_USDC;
      await expect(lending.connect(user1).borrow(excessBorrow)).to.be.revertedWithCustomError(
        lending,
        "ExceedsMaxLtv"
      );
    });

    it("3.4 Reverts borrowing when requested amount exceeds available pool liquidity", async function () {
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
      await lending.connect(user1).depositCollateral(ONE_POINT_FIVE_BTC);
    });

    it("4.1 Debt = 0 returns max uint256 sentinel value", async function () {
      expect(await lending.healthFactor(user1.address)).to.equal(ethers.MaxUint256);
    });

    it("4.2 $90,000 collateral value & $45,000 debt yields exactly 15,000 bps (1.5 HF > 10,000 healthy)", async function () {
      await lending.connect(user1).borrow(45_000n * ONE_USDC);

      const hf = await lending.healthFactor(user1.address);
      expect(hf).to.equal(15_000n);
      expect(hf).to.be.greaterThan(10_000n);
    });

    it("4.3 Debt at 75% collateral value ($67,500 debt against $90,000 value) yields exactly 10,000 bps (1.0 HF threshold)", async function () {
      await lending.connect(owner).setLiquidationThreshold(7500);
      await lending.connect(owner).setBorrowLtv(7500);
      await lending.connect(user1).borrow(67_500n * ONE_USDC);

      const hf = await lending.healthFactor(user1.address);
      expect(hf).to.equal(10_000n);
    });

    it("4.4 Debt above 75% collateral value ($80,000 debt against $90,000 value) yields HF < 10,000 bps (unsafe)", async function () {
      await lending.connect(owner).setLiquidationThreshold(9000);
      await lending.connect(owner).setBorrowLtv(9000);
      await lending.connect(user1).borrow(80_000n * ONE_USDC);

      await lending.connect(owner).setBorrowLtv(5000);
      await lending.connect(owner).setLiquidationThreshold(7500);

      const hf = await lending.healthFactor(user1.address);
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
      await lending.connect(user1).borrow(45_000n * ONE_USDC);

      expect(await lending.availableCollateral(user1.address)).to.equal(ZERO_FIVE_BTC);

      await expect(lending.connect(user1).withdrawCollateral(ZERO_FIVE_BTC))
        .to.emit(lending, "CollateralWithdrawn")
        .withArgs(user1.address, ZERO_FIVE_BTC);

      const hfAfterWithdrawal = await lending.healthFactor(user1.address);
      expect(hfAfterWithdrawal).to.equal(10_000n);
    });

    it("6.3 Reverts withdrawal exceeding maximum safe amount (attempting 0.50000001 cirBTC withdrawal)", async function () {
      await lending.connect(user1).borrow(45_000n * ONE_USDC);

      const unsafeAmount = ZERO_FIVE_BTC + 1n;
      await expect(lending.connect(user1).withdrawCollateral(unsafeAmount)).to.be.revertedWithCustomError(
        lending,
        "UnsafePosition"
      );
    });
  });

  describe("7. Pool Liquidity & Admin Withdrawal Reserve Invariant Audit", function () {
    it("7.1 Fund pool = 100k USDC -> poolLiquidity = 100k USDC, contract USDC balance = 100k USDC", async function () {
      expect(await lending.poolLiquidity()).to.equal(100_000n * ONE_USDC);
      expect(await usdc.balanceOf(await lending.getAddress())).to.equal(100_000n * ONE_USDC);
    });

    it("7.2 Fund pool 100k USDC, borrow 40k USDC -> contract USDC balance = 60k USDC, totalOutstandingDebt = 40k USDC", async function () {
      await lending.connect(user1).depositCollateral(2n * ONE_BTC);
      await lending.connect(user1).borrow(40_000n * ONE_USDC);

      expect(await usdc.balanceOf(await lending.getAddress())).to.equal(60_000n * ONE_USDC);
      expect(await lending.totalOutstandingDebt()).to.equal(40_000n * ONE_USDC);
    });

    it("7.3 Admin can withdraw unborrowed surplus liquidity (20k USDC) when balance is 60k and active debt is 40k USDC", async function () {
      await lending.connect(user1).depositCollateral(2n * ONE_BTC);
      await lending.connect(user1).borrow(40_000n * ONE_USDC);

      // Contract balance = 60k USDC, required reserve for active debt = 40k USDC.
      // Admin surplus = 60k - 40k = 20k USDC.
      await expect(lending.connect(owner).withdrawPoolLiquidity(20_000n * ONE_USDC))
        .to.emit(lending, "PoolLiquidityWithdrawn")
        .withArgs(owner.address, 20_000n * ONE_USDC);

      expect(await lending.poolLiquidity()).to.equal(40_000n * ONE_USDC);
    });

    it("7.4 Admin withdrawal exceeding unborrowed surplus (e.g. attempting 20,001 USDC when debt reserve is 40k USDC) reverts InsolventAdminWithdrawal", async function () {
      await lending.connect(user1).depositCollateral(2n * ONE_BTC);
      await lending.connect(user1).borrow(40_000n * ONE_USDC);

      // Attempting to withdraw 20,001 USDC would breach the 40k USDC debt reserve invariant
      await expect(lending.connect(owner).withdrawPoolLiquidity(20_001n * ONE_USDC)).to.be.revertedWithCustomError(
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

  describe("8. Production Oracle Adapter & Freshness Validation", function () {
    it("8.1 ProductionOracleAdapter initializes correctly with price, decimals, staleness, and bounds", async function () {
      expect(await adapter.maxStaleness()).to.equal(3600n);
      expect(await adapter.minPrice()).to.equal(1_000_000_000n); // $1,000
      expect(await adapter.maxPrice()).to.equal(500_000_000_000n); // $500,000
      const [price, dec, updatedAt, isValid] = await adapter.getPriceData();
      expect(price).to.equal(BTC_PRICE_60K);
      expect(dec).to.equal(6);
      expect(isValid).to.be.true;
    });

    it("8.2 Connects ProductionOracleAdapter to lending contract and reads fresh price", async function () {
      await lending.connect(owner).setOracle(await adapter.getAddress());
      expect(await lending.collateralPrice()).to.equal(BTC_PRICE_60K);
    });

    it("8.3 Reverts when oracle price feed is stale (updatedAt older than 3600 seconds)", async function () {
      await lending.connect(owner).setOracle(await adapter.getAddress());
      const currentBlock = await ethers.provider.getBlock("latest");
      const pastTime = (currentBlock?.timestamp || 0) - 3601;

      await adapter.updateFeed(BTC_PRICE_60K, 6, pastTime, true);

      await expect(lending.collateralPrice()).to.be.revertedWithCustomError(
        lending,
        "OraclePriceStale"
      );
    });

    it("8.4 Reverts when oracle price feed returns zero or isValid = false", async function () {
      await lending.connect(owner).setOracle(await adapter.getAddress());
      const currentBlock = await ethers.provider.getBlock("latest");

      await adapter.updateFeed(0n, 6, currentBlock?.timestamp || 0, true);
      await expect(lending.collateralPrice()).to.be.revertedWithCustomError(
        lending,
        "InvalidOraclePrice"
      );

      await adapter.updateFeed(BTC_PRICE_60K, 6, currentBlock?.timestamp || 0, false);
      await expect(lending.collateralPrice()).to.be.revertedWithCustomError(
        lending,
        "InvalidOraclePrice"
      );
    });

    it("8.5 Reverts when normalized oracle price is out of min/max bounds", async function () {
      await lending.connect(owner).setOracle(await adapter.getAddress());
      const currentBlock = await ethers.provider.getBlock("latest");

      // Below min price ($500 < $1,000 min)
      await adapter.updateFeed(500_000_000n, 6, currentBlock?.timestamp || 0, true);
      await expect(lending.collateralPrice()).to.be.revertedWithCustomError(
        lending,
        "OraclePriceOutOfBounds"
      );

      // Above max price ($600,000 > $500,000 max)
      await adapter.updateFeed(600_000_000_000n, 6, currentBlock?.timestamp || 0, true);
      await expect(lending.collateralPrice()).to.be.revertedWithCustomError(
        lending,
        "OraclePriceOutOfBounds"
      );
    });
  });

  describe("9. Permissionless Liquidation & Bad-Debt Accounting", function () {
    beforeEach(async function () {
      // User1 deposits 1.5 cirBTC ($90,000 value) and borrows $45,000 USDC (50% LTV)
      await lending.connect(user1).depositCollateral(ONE_POINT_FIVE_BTC);
      await lending.connect(user1).borrow(45_000n * ONE_USDC);
    });

    it("9.1 Healthy position (HF = 1.5 > 1.0) cannot be liquidated", async function () {
      await expect(
        lending.connect(liquidator).liquidate(user1.address, 10_000n * ONE_USDC)
      ).to.be.revertedWithCustomError(lending, "PositionNotLiquidatable");
    });

    it("9.2 Position exactly at liquidation threshold (HF = 1.0 = 10,000 bps) cannot be liquidated", async function () {
      // Drop cirBTC price from $60,000 to $40,000 -> 1.5 cirBTC = $60,000 value
      // $45,000 debt against $60,000 value @ 75% threshold yields HF = (60k * 0.75) / 45k = 1.0 (10000 bps)
      await oracle.setPrice(40_000_000_000n);
      expect(await lending.healthFactor(user1.address)).to.equal(10_000n);

      await expect(
        lending.connect(liquidator).liquidate(user1.address, 10_000n * ONE_USDC)
      ).to.be.revertedWithCustomError(lending, "PositionNotLiquidatable");
    });

    it("9.3 Liquidates underwater position (HF < 1.0), enforcing 50% close factor and exact 5% bonus math", async function () {
      // Drop cirBTC price to $30,000 -> 1.5 cirBTC = $45,000 value
      // HF = (45k * 0.75) / 45k = 0.75 (7500 bps < 10000)
      await oracle.setPrice(30_000_000_000n);
      expect(await lending.healthFactor(user1.address)).to.equal(7_500n);

      // Max allowed repay = 50% of 45,000 USDC = 22,500 USDC
      const maxRepay = 22_500n * ONE_USDC;

      // 5% bonus math: Seized USD value = 22,500 * 1.05 = $23,625
      // Seized cirBTC at $30,000/BTC = 23,625 / 30,000 = 0.7875 cirBTC (78,750,000 base units)
      const expectedSeizedCirBtc = 78_750_000n;

      const initialLiquidatorBtc = await cirBTC.balanceOf(liquidator.address);

      await expect(lending.connect(liquidator).liquidate(user1.address, 30_000n * ONE_USDC)) // requests 30k, capped to 22.5k
        .to.emit(lending, "PositionLiquidated")
        .withArgs(user1.address, liquidator.address, maxRepay, expectedSeizedCirBtc, 500n);

      const pos = await lending.getPosition(user1.address);
      expect(pos.debt).to.equal(22_500n * ONE_USDC); // 45,000 - 22,500 = 22,500 USDC
      expect(pos.collateral).to.equal(ONE_POINT_FIVE_BTC - expectedSeizedCirBtc); // 1.5 - 0.7875 = 0.7125 cirBTC
      expect(await cirBTC.balanceOf(liquidator.address)).to.equal(initialLiquidatorBtc + expectedSeizedCirBtc);
    });

    it("9.4 Full 100% liquidation allowed for dust debt positions (debt <= 100 USDC)", async function () {
      // User2 deposits 0.01 cirBTC ($600 value) and borrows 50 USDC
      await lending.connect(user2).depositCollateral(1_000_000n);
      await lending.connect(user2).borrow(50n * ONE_USDC);

      // Drop price to $4,000 -> 0.01 cirBTC = $40 value -> HF = (40 * 0.75) / 50 = 0.6 (6000 bps < 10000)
      await oracle.setPrice(4_000_000_000n);

      // Since debt (50 USDC) <= 100 USDC dust threshold, liquidator can repay 100% (50 USDC)
      await expect(lending.connect(liquidator).liquidate(user2.address, 50n * ONE_USDC))
        .to.emit(lending, "PositionLiquidated");

      const pos = await lending.getPosition(user2.address);
      expect(pos.debt).to.equal(0n);
      expect(pos.collateral).to.equal(0n);
    });

    it("9.5 Handles insolvent position bad debt (collateral value < debt repaid), emitting BadDebtRealized and clearing position", async function () {
      // User1 has 1.5 cirBTC and $45,000 USDC debt.
      // Price crashes abruptly from $60,000 to $10,000 -> 1.5 cirBTC = $15,000 total collateral value!
      await oracle.setPrice(10_000_000_000n);

      // Liquidation attempt: 50% close factor = 22,500 USDC.
      // But 1.5 cirBTC at $10,000/BTC is worth only $15,000!
      // Seized collateral is capped at all remaining collateral (1.5 cirBTC = $15,000 value).
      // Unbacked bad debt realized = 22,500 - 15,000 = 7,500 USDC!
      await expect(lending.connect(liquidator).liquidate(user1.address, 22_500n * ONE_USDC))
        .to.emit(lending, "BadDebtRealized")
        .withArgs(user1.address, 7_500n * ONE_USDC);

      expect(await lending.totalBadDebt()).to.equal(7_500n * ONE_USDC);
      const pos = await lending.getPosition(user1.address);
      expect(pos.collateral).to.equal(0n); // All collateral seized
      expect(pos.debt).to.equal(22_500n * ONE_USDC); // Remaining debt after partial insolvent liquidation
    });
  });

  describe("10. Pausable & Emergency Controls", function () {
    beforeEach(async function () {
      await lending.connect(user1).depositCollateral(ONE_BTC);
      await lending.connect(user1).borrow(10_000n * ONE_USDC);
      await lending.connect(owner).pause();
    });

    it("10.1 Blocks depositCollateral when paused", async function () {
      await expect(lending.connect(user1).depositCollateral(ONE_BTC)).to.be.revertedWithCustomError(
        lending,
        "EnforcedPause"
      );
    });

    it("10.2 Blocks borrow when paused", async function () {
      await expect(lending.connect(user1).borrow(5_000n * ONE_USDC)).to.be.revertedWithCustomError(
        lending,
        "EnforcedPause"
      );
    });

    it("10.3 Blocks withdrawCollateral when paused", async function () {
      await expect(lending.connect(user1).withdrawCollateral(ONE_BTC)).to.be.revertedWithCustomError(
        lending,
        "EnforcedPause"
      );
    });

    it("10.4 Does NOT block repay when paused", async function () {
      await expect(lending.connect(user1).repay(5_000n * ONE_USDC))
        .to.emit(lending, "LoanRepaid")
        .withArgs(user1.address, 5_000n * ONE_USDC);
    });

    it("10.5 Successfully unpauses operations", async function () {
      await lending.connect(owner).unpause();
      await expect(lending.connect(user1).depositCollateral(ONE_BTC)).to.emit(
        lending,
        "CollateralDeposited"
      );
    });
  });
});
