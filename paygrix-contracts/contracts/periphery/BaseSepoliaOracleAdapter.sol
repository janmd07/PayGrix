// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IProductionOracle.sol";

interface AggregatorV3Interface {
    function decimals() external view returns (uint8);
    function description() external view returns (string memory);
    function version() external view returns (uint256);
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    );
}

/// @title BaseSepoliaOracleAdapter
/// @notice Production-grade oracle adapter connecting Chainlink ETH/USD feed to PayGrix Lending on Base Sepolia.
/// @dev Enforces freshness, non-zero checks, sanity bounds, and normalizes Chainlink's 8 decimals down to 6 decimals.
contract BaseSepoliaOracleAdapter is IProductionOracle, Ownable {
    AggregatorV3Interface public immutable chainlinkFeed;

    uint256 public maxStaleness; // In seconds (e.g. 86400 for testnet)
    uint256 public minPrice;    // In 6 decimals (e.g. $500 = 500_000_000)
    uint256 public maxPrice;    // In 6 decimals (e.g. $20,000 = 20_000_000_000)

    error InvalidOraclePrice();
    error OraclePriceStale();
    error OraclePriceOutOfBounds();
    error InvalidBounds();
    error ZeroAddress();

    event StalenessUpdated(uint256 oldStaleness, uint256 newStaleness);
    event BoundsUpdated(uint256 minPrice, uint256 maxPrice);

    constructor(
        address _chainlinkFeed,
        uint256 _maxStaleness,
        uint256 _minPrice,
        uint256 _maxPrice
    ) Ownable(msg.sender) {
        if (_chainlinkFeed == address(0)) revert ZeroAddress();
        if (_minPrice >= _maxPrice) revert InvalidBounds();

        chainlinkFeed = AggregatorV3Interface(_chainlinkFeed);
        maxStaleness = _maxStaleness;
        minPrice = _minPrice;
        maxPrice = _maxPrice;
    }

    /// @notice Updates max staleness threshold in seconds
    function setMaxStaleness(uint256 newStaleness) external onlyOwner {
        uint256 old = maxStaleness;
        maxStaleness = newStaleness;
        emit StalenessUpdated(old, newStaleness);
    }

    /// @notice Updates price sanity bounds (in 6 decimals)
    function setBounds(uint256 newMinPrice, uint256 newMaxPrice) external onlyOwner {
        if (newMinPrice >= newMaxPrice) revert InvalidBounds();
        minPrice = newMinPrice;
        maxPrice = newMaxPrice;
        emit BoundsUpdated(newMinPrice, newMaxPrice);
    }

    /// @notice Returns price and 6-decimal precision adhering to IPriceOracle
    function getPrice() external view override returns (uint256 price, uint8 decimals) {
        (uint256 normPrice, uint8 normDec, , ) = _getValidatedPriceData();
        return (normPrice, normDec);
    }

    /// @notice Returns full price data including timestamp and validity adhering to IProductionOracle
    function getPriceData() external view override returns (uint256 price, uint8 decimals, uint256 updatedAt, bool isValid) {
        return _getValidatedPriceData();
    }

    /// @dev Internal helper validating Chainlink round data and normalizing to 6 decimals
    function _getValidatedPriceData() internal view returns (uint256 normPrice, uint8 normDec, uint256 updatedAt, bool isValid) {
        (
            ,
            int256 answer,
            ,
            uint256 roundUpdatedAt,
            
        ) = chainlinkFeed.latestRoundData();

        if (answer <= 0) revert InvalidOraclePrice();
        if (roundUpdatedAt == 0 || block.timestamp < roundUpdatedAt || block.timestamp - roundUpdatedAt > maxStaleness) {
            revert OraclePriceStale();
        }

        uint8 feedDecimals = chainlinkFeed.decimals();
        uint256 rawPrice = uint256(answer);
        uint256 normalizedPrice = rawPrice;

        if (feedDecimals > 6) {
            normalizedPrice = rawPrice / (10 ** (feedDecimals - 6));
        } else if (feedDecimals < 6) {
            normalizedPrice = rawPrice * (10 ** (6 - feedDecimals));
        }

        if (normalizedPrice < minPrice || normalizedPrice > maxPrice) {
            revert OraclePriceOutOfBounds();
        }

        return (normalizedPrice, 6, roundUpdatedAt, true);
    }
}
