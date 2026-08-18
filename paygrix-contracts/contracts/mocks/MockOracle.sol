// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "../interfaces/IProductionOracle.sol";

/// @title MockOracle
/// @notice Test-only mock oracle implementation for PayGrix Lending unit tests.
/// @dev Never deploy this contract as production infrastructure on Arc Testnet.
contract MockOracle is IProductionOracle {
    uint256 private _price;
    uint8 private _decimals;
    uint256 private _updatedAt;
    bool private _isValid;

    event PriceUpdated(uint256 oldPrice, uint256 newPrice);

    constructor(uint256 initialPrice, uint8 initialDecimals) {
        _price = initialPrice;
        _decimals = initialDecimals;
        _updatedAt = block.timestamp;
        _isValid = true;
    }

    function setPrice(uint256 newPrice) external {
        uint256 oldPrice = _price;
        _price = newPrice;
        _updatedAt = block.timestamp;
        emit PriceUpdated(oldPrice, newPrice);
    }

    function setDecimals(uint8 newDecimals) external {
        _decimals = newDecimals;
    }

    function setUpdatedAt(uint256 timestamp) external {
        _updatedAt = timestamp;
    }

    function setIsValid(bool valid) external {
        _isValid = valid;
    }

    function getPrice() external view override returns (uint256 price, uint8 decimals) {
        return (_price, _decimals);
    }

    function getPriceData() external view override returns (uint256 price, uint8 decimals, uint256 updatedAt, bool isValid) {
        return (_price, _decimals, _updatedAt, _isValid);
    }
}
