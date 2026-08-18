// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "./IPriceOracle.sol";

/// @title IProductionOracle
/// @notice Extended production oracle interface supporting timestamp, freshness, and validity reporting.
interface IProductionOracle is IPriceOracle {
    /// @notice Returns price, decimal precision, update timestamp, and validity state
    /// @return price Price of 1 cirBTC in base units
    /// @return decimals Precision scale of price (e.g. 6 or 8)
    /// @return updatedAt Timestamp of the last price update
    /// @return isValid Boolean flag indicating if price feed is operational and valid
    function getPriceData() external view returns (uint256 price, uint8 decimals, uint256 updatedAt, bool isValid);
}
