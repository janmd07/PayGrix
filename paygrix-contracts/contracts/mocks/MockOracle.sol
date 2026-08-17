// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "../interfaces/IPriceOracle.sol";

/// @title MockOracle
/// @notice Test-only mock oracle implementation for PayGrix Lending unit tests.
/// @dev Never deploy this contract as production infrastructure on Arc Testnet.
contract MockOracle is IPriceOracle {
    uint256 private _price;
    uint8 private _decimals;

    event PriceUpdated(uint256 oldPrice, uint256 newPrice);

    constructor(uint256 initialPrice, uint8 initialDecimals) {
        _price = initialPrice;
        _decimals = initialDecimals;
    }

    function setPrice(uint256 newPrice) external {
        uint256 oldPrice = _price;
        _price = newPrice;
        emit PriceUpdated(oldPrice, newPrice);
    }

    function setDecimals(uint8 newDecimals) external {
        _decimals = newDecimals;
    }

    function getPrice() external view override returns (uint256 price, uint8 decimals) {
        return (_price, _decimals);
    }
}
