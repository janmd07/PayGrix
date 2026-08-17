// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IPriceOracle
/// @notice Interface for querying token prices in PayGrix Lending V1
interface IPriceOracle {
    /// @notice Returns the price of 1 cirBTC in USDC base units (6 decimals)
    /// @return price The price of 1 cirBTC in USDC (6 decimals, e.g. 60000000000 = $60,000.00)
    /// @return decimals The decimals of the returned price (always 6)
    function getPrice() external view returns (uint256 price, uint8 decimals);
}
