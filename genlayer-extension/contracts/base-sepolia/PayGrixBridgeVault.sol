// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

library SafeERC20 {
    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        require(token.transfer(to, value), "SafeERC20: transfer failed");
    }

    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        require(token.transferFrom(from, to, value), "SafeERC20: transferFrom failed");
    }
}

abstract contract ReentrancyGuard {
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status;

    constructor() {
        _status = _NOT_ENTERED;
    }

    modifier nonReentrant() {
        require(_status != _ENTERED, "ReentrancyGuard: reentrant call");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }
}

/**
 * @title PayGrixBridgeVault
 * @dev Non-custodial USDC Vault holding source-side bridge reserves on Base Sepolia.
 *
 * Includes comprehensive vault drain protection:
 * 1. Maximum Single Release Cap (e.g. 50,000 USDC)
 * 2. Daily Rolling Release Limit (e.g. 100,000 USDC per 24 hours)
 * 3. Emergency Pause Circuit Breaker
 *
 * Collateral is locked during Base Sepolia -> GenLayer Bradbury deposits.
 * Collateral is released during GenLayer Bradbury -> Base Sepolia reverse burns.
 * ONLY the authorized PayGrixBaseBridgeRouter contract can trigger deposits or releases.
 */
contract PayGrixBridgeVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdcToken;
    address public routerAddress;
    address public owner;
    bool public paused;

    // Drain protection parameters (in raw 6-decimal units)
    uint256 public maxSingleRelease;
    uint256 public dailyReleaseLimit;

    // Daily tracking
    uint256 public currentEpoch;
    uint256 public currentEpochReleased;

    event RouterConfigured(address indexed routerAddress);
    event TokensVaulted(address indexed sender, uint256 amount, uint256 timestamp);
    event TokensReleased(address indexed recipient, uint256 amount, uint256 timestamp);
    event LimitsUpdated(uint256 maxSingleRelease, uint256 dailyReleaseLimit);
    event EmergencyPaused(address indexed admin);
    event EmergencyUnpaused(address indexed admin);

    modifier onlyRouter() {
        require(msg.sender == routerAddress, "PayGrixBridgeVault: Only router can execute");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "PayGrixBridgeVault: Caller is not owner");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "PayGrixBridgeVault: Vault is paused");
        _;
    }

    constructor(
        address _usdcToken,
        uint256 _maxSingleRelease,
        uint256 _dailyReleaseLimit
    ) {
        require(_usdcToken != address(0), "PayGrixBridgeVault: Invalid USDC address");
        require(_maxSingleRelease > 0, "PayGrixBridgeVault: Invalid max single release");
        require(_dailyReleaseLimit >= _maxSingleRelease, "PayGrixBridgeVault: Daily limit must be >= single limit");

        usdcToken = IERC20(_usdcToken);
        owner = msg.sender;
        maxSingleRelease = _maxSingleRelease;
        dailyReleaseLimit = _dailyReleaseLimit;
        currentEpoch = block.timestamp / 1 days;
    }

    /**
     * @notice One-time sealed initializer to bind the bridge router address.
     */
    function setRouterAddress(address _routerAddress) external onlyOwner {
        require(routerAddress == address(0), "PayGrixBridgeVault: Router already configured");
        require(_routerAddress != address(0), "PayGrixBridgeVault: Invalid router address");
        routerAddress = _routerAddress;
        emit RouterConfigured(_routerAddress);
    }

    /**
     * @notice Pulls USDC into vault custody during Base -> GenLayer bridge initiation.
     */
    function depositFrom(address from, uint256 amount) external onlyRouter whenNotPaused nonReentrant {
        require(from != address(0), "PayGrixBridgeVault: Invalid from address");
        require(amount > 0, "PayGrixBridgeVault: Amount must be positive");
        usdcToken.safeTransferFrom(from, address(this), amount);
        emit TokensVaulted(from, amount, block.timestamp);
    }

    /**
     * @notice Releases USDC from vault custody during GenLayer -> Base reverse bridge execution.
     * Enforces single-release cap, daily release limit, and circuit breaker.
     */
    function releaseTo(address to, uint256 amount) external onlyRouter whenNotPaused nonReentrant {
        require(to != address(0), "PayGrixBridgeVault: Invalid to address");
        require(amount > 0, "PayGrixBridgeVault: Amount must be positive");
        require(amount <= maxSingleRelease, "PayGrixBridgeVault: Amount exceeds single release cap");

        // Rolling daily epoch check
        uint256 epochNow = block.timestamp / 1 days;
        if (epochNow > currentEpoch) {
            currentEpoch = epochNow;
            currentEpochReleased = 0;
        }

        require(currentEpochReleased + amount <= dailyReleaseLimit, "PayGrixBridgeVault: Exceeds daily release limit");
        currentEpochReleased += amount;

        require(usdcToken.balanceOf(address(this)) >= amount, "PayGrixBridgeVault: Insufficient vault liquidity");
        usdcToken.safeTransfer(to, amount);
        emit TokensReleased(to, amount, block.timestamp);
    }

    /**
     * @notice Emergency Pause Controls
     */
    function pause() external onlyOwner {
        paused = true;
        emit EmergencyPaused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit EmergencyUnpaused(msg.sender);
    }

    /**
     * @notice Admin limit configuration
     */
    function updateLimits(uint256 _maxSingleRelease, uint256 _dailyReleaseLimit) external onlyOwner {
        require(_maxSingleRelease > 0, "PayGrixBridgeVault: Invalid single release limit");
        require(_dailyReleaseLimit >= _maxSingleRelease, "PayGrixBridgeVault: Daily limit must be >= single limit");
        maxSingleRelease = _maxSingleRelease;
        dailyReleaseLimit = _dailyReleaseLimit;
        emit LimitsUpdated(_maxSingleRelease, _dailyReleaseLimit);
    }

    /**
     * @notice Returns total USDC balance held in vault.
     */
    function totalVaulted() external view returns (uint256) {
        return usdcToken.balanceOf(address(this));
    }
}
