// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "../interfaces/IPriceOracle.sol";
import "../interfaces/IProductionOracle.sol";

/// @title BaseSepoliaLending
/// @notice Decentralized, collateral-backed lending protocol for PayGrix on Base Sepolia.
/// @dev Users deposit WETH collateral (18 decimals) to borrow USDC (6 decimals).
///      Enforces conservative 50% max borrow LTV, 75% liquidation threshold, 0% interest,
///      5% liquidation bonus, 50% close factor, and explicit bad-debt accounting.
contract BaseSepoliaLending is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // --- STRUCTS ---
    struct Position {
        uint256 collateral; // WETH base units (18 decimals)
        uint256 debt;       // USDC base units (6 decimals)
    }

    // --- STATE VARIABLES ---
    IERC20 public immutable collateralToken; // WETH9 (0x4200000000000000000000000000000000000006)
    IERC20 public immutable borrowToken;     // USDC  (0x036CbD53842c5426634e7929541eC2318f3dCF7e)
    IPriceOracle public oracle;

    uint256 public borrowLtvBps;              // Basis points (e.g. 5000 = 50%)
    uint256 public liquidationThresholdBps;   // Basis points (e.g. 7500 = 75%)
    uint256 public totalOutstandingDebt;      // Total USDC debt owed across all users (6 decimals)
    uint256 public totalBadDebt;              // Cumulative written-off bad debt (6 decimals)
    uint256 public totalLenderDeposits;       // Cumulative USDC liquidity funded (6 decimals)

    mapping(address => Position) public positions;

    // --- CONSTANTS ---
    uint256 public constant BPS_DIVISOR = 10000;
    uint256 public constant HEALTH_FACTOR_DECIMALS = 10000; // 1.0 Health Factor = 10000 bps
    uint256 public constant LIQUIDATION_BONUS_BPS = 500;    // 5.00% liquidation bonus
    uint256 public constant CLOSE_FACTOR_BPS = 5000;        // 50.00% max liquidation close factor
    uint256 public constant DUST_DEBT_THRESHOLD = 100 * 1e6; // 100 USDC dust threshold (6 decimals)
    uint256 public constant COLLATERAL_DECIMALS_SCALE = 1e18; // WETH 18 decimals

    // --- CUSTOM ERRORS ---
    error ZeroAddress();
    error ZeroAmount();
    error InvalidRiskParameters();
    error InsufficientCollateral();
    error ExceedsMaxLtv();
    error InsufficientPoolLiquidity();
    error InsufficientDebt();
    error OverRepayment();
    error InsolventAdminWithdrawal();
    error InvalidOraclePrice();
    error OraclePriceStale();
    error OraclePriceOutOfBounds();
    error UnsafePosition();
    error PositionNotLiquidatable();
    error ExcessiveLiquidationAmount();

    // --- EVENTS ---
    event CollateralDeposited(address indexed user, uint256 amount);
    event CollateralWithdrawn(address indexed user, uint256 amount);
    event LoanBorrowed(address indexed user, uint256 amount);
    event LoanRepaid(address indexed user, uint256 amount);
    event PoolFunded(address indexed funder, uint256 amount);
    event PoolLiquidityWithdrawn(address indexed admin, uint256 amount);
    event BorrowLtvUpdated(uint256 oldLtv, uint256 newLtv);
    event LiquidationThresholdUpdated(uint256 oldThreshold, uint256 newThreshold);
    event OracleUpdated(address indexed newOracle);
    event PositionLiquidated(
        address indexed borrower,
        address indexed liquidator,
        uint256 debtRepaid,
        uint256 collateralSeized,
        uint256 liquidationBonusBps
    );
    event BadDebtRealized(address indexed borrower, uint256 unbackedDebt);

    /// @notice Contract constructor
    /// @param _collateralToken Address of WETH token (18 decimals)
    /// @param _borrowToken Address of USDC token (6 decimals)
    /// @param _oracle Address of price oracle returning WETH price in 6-decimal USDC
    /// @param _borrowLtvBps Initial max borrow LTV in basis points (5000 = 50%)
    /// @param _liquidationThresholdBps Initial liquidation threshold in basis points (7500 = 75%)
    constructor(
        address _collateralToken,
        address _borrowToken,
        address _oracle,
        uint256 _borrowLtvBps,
        uint256 _liquidationThresholdBps
    ) Ownable(msg.sender) {
        if (_collateralToken == address(0) || _borrowToken == address(0) || _oracle == address(0)) {
            revert ZeroAddress();
        }
        if (_borrowLtvBps == 0 || _borrowLtvBps > _liquidationThresholdBps || _liquidationThresholdBps > BPS_DIVISOR) {
            revert InvalidRiskParameters();
        }

        collateralToken = IERC20(_collateralToken);
        borrowToken = IERC20(_borrowToken);
        oracle = IPriceOracle(_oracle);
        borrowLtvBps = _borrowLtvBps;
        liquidationThresholdBps = _liquidationThresholdBps;
    }

    // =========================================================================
    // USER FUNCTIONS
    // =========================================================================

    /// @notice Deposits WETH collateral into user's position
    /// @param amount Amount of WETH base units (18 decimals) to deposit
    function depositCollateral(uint256 amount) external whenNotPaused nonReentrant {
        if (amount == 0) revert ZeroAmount();

        positions[msg.sender].collateral += amount;
        collateralToken.safeTransferFrom(msg.sender, address(this), amount);

        emit CollateralDeposited(msg.sender, amount);
    }

    /// @notice Withdraws WETH collateral from user's position if safe
    /// @param amount Amount of WETH base units (18 decimals) to withdraw
    function withdrawCollateral(uint256 amount) external whenNotPaused nonReentrant {
        if (amount == 0) revert ZeroAmount();

        Position storage pos = positions[msg.sender];
        if (amount > pos.collateral) revert InsufficientCollateral();

        uint256 remainingCollateral = pos.collateral - amount;

        // If active debt exists, enforce safety against liquidation threshold (75%)
        if (pos.debt > 0) {
            uint256 price = _getSanitizedPrice();
            uint256 remainingCollateralValue = (remainingCollateral * price) / COLLATERAL_DECIMALS_SCALE;
            uint256 hf = (remainingCollateralValue * liquidationThresholdBps) / pos.debt;

            if (hf < HEALTH_FACTOR_DECIMALS) {
                revert UnsafePosition();
            }
        }

        pos.collateral = remainingCollateral;
        collateralToken.safeTransfer(msg.sender, amount);

        emit CollateralWithdrawn(msg.sender, amount);
    }

    /// @notice Borrows USDC against deposited WETH collateral up to 50% LTV
    /// @param amount Amount of USDC base units (6 decimals) to borrow
    function borrow(uint256 amount) external whenNotPaused nonReentrant {
        if (amount == 0) revert ZeroAmount();

        Position storage pos = positions[msg.sender];
        uint256 newTotalDebt = pos.debt + amount;

        uint256 price = _getSanitizedPrice();
        uint256 collateralValue = (pos.collateral * price) / COLLATERAL_DECIMALS_SCALE;
        uint256 maxDebt = (collateralValue * borrowLtvBps) / BPS_DIVISOR;

        if (newTotalDebt > maxDebt) {
            revert ExceedsMaxLtv();
        }

        uint256 currentLiquidity = poolLiquidity();
        if (amount > currentLiquidity) {
            revert InsufficientPoolLiquidity();
        }

        pos.debt = newTotalDebt;
        totalOutstandingDebt += amount;

        borrowToken.safeTransfer(msg.sender, amount);

        emit LoanBorrowed(msg.sender, amount);
    }

    /// @notice Repays active USDC debt
    /// @dev May be called even when paused so borrowers can clear debt during emergency pause
    /// @param amount Amount of USDC base units (6 decimals) to repay
    function repay(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();

        Position storage pos = positions[msg.sender];
        if (pos.debt == 0) revert InsufficientDebt();
        if (amount > pos.debt) revert OverRepayment();

        pos.debt -= amount;
        totalOutstandingDebt -= amount;

        borrowToken.safeTransferFrom(msg.sender, address(this), amount);

        emit LoanRepaid(msg.sender, amount);
    }

    /// @notice Liquidates an undercollateralized borrower position (HF < 10000 bps)
    /// @param borrower Address of borrower to liquidate
    /// @param maxRepayAmountUsdc Maximum amount of USDC (6 decimals) liquidator is willing to repay
    function liquidate(address borrower, uint256 maxRepayAmountUsdc) external whenNotPaused nonReentrant {
        if (borrower == address(0)) revert ZeroAddress();
        if (maxRepayAmountUsdc == 0) revert ZeroAmount();

        Position storage pos = positions[borrower];
        if (pos.debt == 0) revert InsufficientDebt();

        // Enforce Health Factor < 10000 bps (1.0 HF threshold)
        uint256 hf = _calculateHealthFactor(pos.collateral, pos.debt);
        if (hf >= HEALTH_FACTOR_DECIMALS) {
            revert PositionNotLiquidatable();
        }

        // Close factor calculation: 50% max per transaction unless debt <= DUST_DEBT_THRESHOLD
        uint256 maxAllowedRepay;
        if (pos.debt <= DUST_DEBT_THRESHOLD) {
            maxAllowedRepay = pos.debt;
        } else {
            maxAllowedRepay = (pos.debt * CLOSE_FACTOR_BPS) / BPS_DIVISOR;
        }

        uint256 actualRepay = maxRepayAmountUsdc > maxAllowedRepay ? maxAllowedRepay : maxRepayAmountUsdc;
        if (actualRepay == 0) revert ZeroAmount();

        uint256 price = _getSanitizedPrice();

        // Seizure calculation with 5% bonus: (repay * 1.05 * 1e18) / price
        uint256 targetCollateralUsd = (actualRepay * (BPS_DIVISOR + LIQUIDATION_BONUS_BPS)) / BPS_DIVISOR;
        uint256 targetWeth = (targetCollateralUsd * COLLATERAL_DECIMALS_SCALE) / price;

        uint256 actualWeth;
        if (targetWeth >= pos.collateral) {
            // Seize all remaining collateral (Bad Debt case if collateral < debt repaid value)
            actualWeth = pos.collateral;

            uint256 seizedCollateralValueUsdc = (actualWeth * price) / COLLATERAL_DECIMALS_SCALE;
            if (actualRepay > seizedCollateralValueUsdc) {
                uint256 unbackedDebt = actualRepay - seizedCollateralValueUsdc;
                totalBadDebt += unbackedDebt;
                emit BadDebtRealized(borrower, unbackedDebt);
            }
        } else {
            actualWeth = targetWeth;
        }

        pos.collateral -= actualWeth;
        pos.debt -= actualRepay;
        totalOutstandingDebt -= actualRepay;

        if (pos.debt == 0) {
            pos.collateral = 0;
        }

        borrowToken.safeTransferFrom(msg.sender, address(this), actualRepay);
        collateralToken.safeTransfer(msg.sender, actualWeth);

        emit PositionLiquidated(borrower, msg.sender, actualRepay, actualWeth, LIQUIDATION_BONUS_BPS);
    }

    /// @notice Funds the lending pool with USDC liquidity
    /// @param amount Amount of USDC base units (6 decimals) to transfer into pool
    function fundPool(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();

        totalLenderDeposits += amount;
        borrowToken.safeTransferFrom(msg.sender, address(this), amount);

        emit PoolFunded(msg.sender, amount);
    }

    // =========================================================================
    // ADMIN FUNCTIONS
    // =========================================================================

    /// @notice Withdraws unborrowed USDC pool liquidity (Admin only)
    function withdrawPoolLiquidity(uint256 amount) external onlyOwner nonReentrant {
        if (amount == 0) revert ZeroAmount();

        uint256 currentBalance = poolLiquidity();
        uint256 requiredReserve = totalOutstandingDebt;
        uint256 availableAdminLiquidity = currentBalance > requiredReserve ? currentBalance - requiredReserve : 0;

        if (amount > availableAdminLiquidity) {
            revert InsolventAdminWithdrawal();
        }

        borrowToken.safeTransfer(msg.sender, amount);

        emit PoolLiquidityWithdrawn(msg.sender, amount);
    }

    /// @notice Updates the max borrow LTV (Admin only)
    function setBorrowLtv(uint256 newLtvBps) external onlyOwner {
        if (newLtvBps == 0 || newLtvBps > liquidationThresholdBps) {
            revert InvalidRiskParameters();
        }

        uint256 oldLtv = borrowLtvBps;
        borrowLtvBps = newLtvBps;

        emit BorrowLtvUpdated(oldLtv, newLtvBps);
    }

    /// @notice Updates the liquidation threshold (Admin only)
    function setLiquidationThreshold(uint256 newThresholdBps) external onlyOwner {
        if (newThresholdBps < borrowLtvBps || newThresholdBps > BPS_DIVISOR) {
            revert InvalidRiskParameters();
        }

        uint256 oldThreshold = liquidationThresholdBps;
        liquidationThresholdBps = newThresholdBps;

        emit LiquidationThresholdUpdated(oldThreshold, newThresholdBps);
    }

    /// @notice Updates the price oracle contract address (Admin only)
    function setOracle(address newOracle) external onlyOwner {
        if (newOracle == address(0)) revert ZeroAddress();

        oracle = IPriceOracle(newOracle);

        emit OracleUpdated(newOracle);
    }

    /// @notice Pauses operations in emergency
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpauses operations
    function unpause() external onlyOwner {
        _unpause();
    }

    // =========================================================================
    // READ VIEW API FUNCTIONS
    // =========================================================================

    /// @notice Returns position details for a user
    /// @param user Address of user
    /// @return collateral Amount of WETH collateral (18 decimals)
    /// @return debt Amount of USDC debt (6 decimals)
    function getPosition(address user) external view returns (uint256 collateral, uint256 debt) {
        Position storage pos = positions[user];
        return (pos.collateral, pos.debt);
    }

    /// @notice Returns maximum additional USDC amount user can borrow currently
    /// @param user Address of user
    /// @return maxUsdcBorrow Max USDC base units (6 decimals) user can borrow
    function maxBorrow(address user) external view returns (uint256 maxUsdcBorrow) {
        Position storage pos = positions[user];
        if (pos.collateral == 0) return 0;

        uint256 price = _getSanitizedPrice();
        if (price == 0) return 0;

        uint256 collateralValue = (pos.collateral * price) / COLLATERAL_DECIMALS_SCALE;
        uint256 maxDebt = (collateralValue * borrowLtvBps) / BPS_DIVISOR;

        if (pos.debt >= maxDebt) return 0;

        uint256 capacity = maxDebt - pos.debt;
        uint256 liquidity = poolLiquidity();

        return capacity < liquidity ? capacity : liquidity;
    }

    /// @notice Returns Health Factor for a user in basis points (10000 = 1.0 HF)
    /// @param user Address of user
    /// @return hfBps Health factor in basis points (10000 = 1.0, type(uint256).max if debt == 0)
    function healthFactor(address user) external view returns (uint256 hfBps) {
        Position storage pos = positions[user];
        return _calculateHealthFactor(pos.collateral, pos.debt);
    }

    /// @notice Returns amount of WETH collateral user can freely withdraw without making position unsafe
    /// @param user Address of user
    /// @return withdrawableWeth Amount of WETH base units (18 decimals) free to withdraw
    function availableCollateral(address user) external view returns (uint256 withdrawableWeth) {
        Position storage pos = positions[user];
        if (pos.collateral == 0) return 0;
        if (pos.debt == 0) return pos.collateral;

        uint256 price = _getSanitizedPrice();
        if (price == 0) return 0;

        // Minimum required collateral value in USDC (6 decimals) at liquidation threshold (75%)
        uint256 minRequiredValueUsdc = (pos.debt * BPS_DIVISOR + liquidationThresholdBps - 1) / liquidationThresholdBps;

        // Minimum required WETH (18 decimals), rounded UP to protect against under-collateralization
        uint256 minRequiredWeth = (minRequiredValueUsdc * COLLATERAL_DECIMALS_SCALE + price - 1) / price;

        if (pos.collateral <= minRequiredWeth) return 0;
        return pos.collateral - minRequiredWeth;
    }

    /// @notice Returns available USDC held by contract for new borrowing
    function poolLiquidity() public view returns (uint256 availableUsdc) {
        return borrowToken.balanceOf(address(this));
    }

    /// @notice Returns current WETH price from oracle in 6-decimal USDC
    function collateralPrice() external view returns (uint256 priceUsdcPerWeth) {
        return _getSanitizedPrice();
    }

    // =========================================================================
    // INTERNAL HELPER FUNCTIONS
    // =========================================================================

    function _calculateHealthFactor(uint256 collateral, uint256 debt) internal view returns (uint256) {
        if (debt == 0) return type(uint256).max;

        uint256 price = _getSanitizedPrice();
        if (price == 0) return 0;

        uint256 collateralValue = (collateral * price) / COLLATERAL_DECIMALS_SCALE;
        return (collateralValue * liquidationThresholdBps) / debt;
    }

    function _getSanitizedPrice() internal view returns (uint256) {
        try IProductionOracle(address(oracle)).getPriceData() returns (
            uint256 p,
            uint8 dec,
            uint256 updatedAt,
            bool isValid
        ) {
            if (!isValid || p == 0) revert InvalidOraclePrice();
            if (block.timestamp < updatedAt || block.timestamp - updatedAt > 86400) {
                revert OraclePriceStale();
            }

            uint256 normPrice = p;
            if (dec > 6) {
                normPrice = p / (10 ** (dec - 6));
            } else if (dec < 6) {
                normPrice = p * (10 ** (6 - dec));
            }

            return normPrice;
        } catch {
            (uint256 p, uint8 dec) = oracle.getPrice();
            if (p == 0) revert InvalidOraclePrice();

            uint256 normPrice = p;
            if (dec > 6) {
                normPrice = p / (10 ** (dec - 6));
            } else if (dec < 6) {
                normPrice = p * (10 ** (6 - dec));
            }

            return normPrice;
        }
    }
}
