// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IProductionOracle.sol";

/// @title ProductionOracleAdapter
/// @notice Production-grade oracle adapter supporting freshness verification, sanity boundaries, and decimal normalization.
/// @dev Wraps underlying price feeds and enforces staleness, bounds checking, and USDC 6-decimal scaling.
contract ProductionOracleAdapter is IProductionOracle, Ownable {
    // --- STATE VARIABLES ---
    uint256 private _price;
    uint8 private _decimals;
    uint256 private _updatedAt;
    bool private _isValid;

    uint256 public maxStaleness; // Max allowed staleness in seconds (e.g. 3600)
    uint256 public minPrice;    // Min allowed price (normalized 6 decimals, e.g. $1,000 = 1,000,000,000)
    uint256 public maxPrice;    // Max allowed price (normalized 6 decimals, e.g. $500,000 = 500,000,000,000)

    // --- ERRORS ---
    error InvalidOraclePrice();
    error OraclePriceStale();
    error OraclePriceOutOfBounds();
    error InvalidBounds();

    // --- EVENTS ---
    event FeedUpdated(uint256 price, uint8 decimals, uint256 updatedAt, bool isValid);
    event StalenessUpdated(uint256 oldStaleness, uint256 newStaleness);
    event BoundsUpdated(uint256 minPrice, uint256 maxPrice);

    constructor(
        uint256 initialPrice,
        uint8 initialDecimals,
        uint256 initialStaleness,
        uint256 initialMinPrice,
        uint256 initialMaxPrice
    ) Ownable(msg.sender) {
        if (initialPrice == 0) revert InvalidOraclePrice();
        if (initialMinPrice >= initialMaxPrice) revert InvalidBounds();

        _price = initialPrice;
        _decimals = initialDecimals;
        _updatedAt = block.timestamp;
        _isValid = true;

        maxStaleness = initialStaleness;
        minPrice = initialMinPrice;
        maxPrice = initialMaxPrice;
    }

    /// @notice Updates feed data (admin / keeper simulated feed update)
    function updateFeed(uint256 newPrice, uint8 newDecimals, uint256 newUpdatedAt, bool newIsValid) external onlyOwner {
        _price = newPrice;
        _decimals = newDecimals;
        _updatedAt = newUpdatedAt;
        _isValid = newIsValid;

        emit FeedUpdated(newPrice, newDecimals, newUpdatedAt, newIsValid);
    }

    /// @notice Updates max staleness threshold
    function setMaxStaleness(uint256 newStaleness) external onlyOwner {
        uint256 old = maxStaleness;
        maxStaleness = newStaleness;
        emit StalenessUpdated(old, newStaleness);
    }

    /// @notice Updates price sanity bounds
    function setBounds(uint256 newMinPrice, uint256 newMaxPrice) external onlyOwner {
        if (newMinPrice >= newMaxPrice) revert InvalidBounds();
        minPrice = newMinPrice;
        maxPrice = newMaxPrice;
        emit BoundsUpdated(newMinPrice, newMaxPrice);
    }

    /// @notice Returns price and 6-decimal precision adhering to IPriceOracle interface
    function getPrice() external view override returns (uint256 price, uint8 decimals) {
        (uint256 normPrice, uint8 normDec, , ) = _getValidatedPriceData();
        return (normPrice, normDec);
    }

    /// @notice Returns full price data including timestamp and validity status
    function getPriceData() external view override returns (uint256 price, uint8 decimals, uint256 updatedAt, bool isValid) {
        return _getValidatedPriceData();
    }

    /// @dev Internal helper validating freshness, non-zero state, and sanity bounds, normalizing to 6 decimals
    function _getValidatedPriceData() internal view returns (uint256 normPrice, uint8 normDec, uint256 updatedAt, bool isValid) {
        if (!_isValid || _price == 0) revert InvalidOraclePrice();
        if (block.timestamp < _updatedAt || block.timestamp - _updatedAt > maxStaleness) {
            revert OraclePriceStale();
        }

        // Decimal normalization to 6 decimals
        uint256 normalizedPrice = _price;
        if (_decimals > 6) {
            normalizedPrice = _price / (10 ** (_decimals - 6));
        } else if (_decimals < 6) {
            normalizedPrice = _price * (10 ** (6 - _decimals));
        }

        if (normalizedPrice < minPrice || normalizedPrice > maxPrice) {
            revert OraclePriceOutOfBounds();
        }

        return (normalizedPrice, 6, _updatedAt, _isValid);
    }
}
