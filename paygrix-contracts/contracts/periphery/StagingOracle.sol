// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "../interfaces/IPriceOracle.sol";

/// @title StagingOracle
/// @notice Isolated testnet staging oracle implementation for PayGrix Lending Arc Testnet evaluation ONLY.
/// @dev NEVER deploy or present this contract as production oracle infrastructure.
contract StagingOracle is IPriceOracle {
    uint256 private _price;
    uint8 private immutable _decimals;

    event StagingPriceUpdated(uint256 oldPrice, uint256 newPrice);

    /// @notice Constructor initializing staging price and decimals
    /// @param initialPrice Initial cirBTC reference price in USDC base units (6 decimals, e.g. 60,000.00 = 60,000,000,000)
    /// @param initialDecimals Decimal scale (6 decimals for USDC)
    constructor(uint256 initialPrice, uint8 initialDecimals) {
        _price = initialPrice;
        _decimals = initialDecimals;
    }

    /// @notice Updates staging price
    /// @param newPrice New cirBTC reference price in USDC base units (6 decimals)
    function setPrice(uint256 newPrice) external {
        uint256 oldPrice = _price;
        _price = newPrice;
        emit StagingPriceUpdated(oldPrice, newPrice);
    }

    /// @notice Queries staging price and decimal scale
    /// @return price Price of 1 cirBTC in USDC base units
    /// @return decimals Decimal precision of price (6)
    function getPrice() external view override returns (uint256 price, uint8 decimals) {
        return (_price, _decimals);
    }
}
