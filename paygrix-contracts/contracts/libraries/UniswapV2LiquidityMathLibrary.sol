pragma solidity >=0.5.0;

import '../interfaces/IUniswapV2Pair.sol';
import '../interfaces/IUniswapV2Factory.sol';
import './Babylonian.sol';
import './SafeMath.sol';

// library containing some math for dealing with liquidity shares
library UniswapV2LiquidityMathLibrary {
    using SafeMath for uint256;

    // computes result = (a * b) / denominator
    function mulDiv(
        uint256 a,
        uint256 b,
        uint256 denominator
    ) internal pure returns (uint256 result) {
        require(denominator > 0, "mulDiv: denominator is 0");
        uint256 product = a * b;
        require(product / a == b, "mulDiv: multiplication overflow");
        result = product / denominator;
    }

    // compute direction and magnitude of profit-maximizing trade
    function computeProfitMaximizingTrade(
        uint256 truePriceTokenA,
        uint256 truePriceTokenB,
        uint256 reserveA,
        uint256 reserveB
    ) internal pure returns (bool aToB, uint256 amountIn) {
        aToB = mulDiv(reserveA, truePriceTokenB, reserveB) < truePriceTokenA;

        uint256 invariant = reserveA.mul(reserveB);

        uint256 leftSide = Babylonian.sqrt(
            mulDiv(
                invariant,
                aToB ? truePriceTokenA : truePriceTokenB,
                (aToB ? truePriceTokenB : truePriceTokenA).mul(1000)
            ).mul(997)
        );
        uint256 rightSide = (aToB ? reserveA : reserveB).mul(1000) / 997;

        if (leftSide < rightSide) return (false, 0);

        // compute the amount that must be sent, without fee
        amountIn = leftSide - rightSide;
    }

    // gets the reserves after an arbitrage trade
    function getReservesAfterArbitrage(
        address factory,
        address tokenA,
        address tokenB,
        uint256 truePriceTokenA,
        uint256 truePriceTokenB
    ) internal view returns (uint256 reserveA, uint256 reserveB) {
        // first get reserves before the trade
        (address token0, ) = sortTokens(tokenA, tokenB);
        (uint256 reserve0, uint256 reserve1, ) = IUniswapV2Pair(IUniswapV2Factory(factory).getPair(tokenA, tokenB)).getReserves();
        (reserveA, reserveB) = tokenA == token0 ? (reserve0, reserve1) : (reserve1, reserve0);

        (bool aToB, uint256 amountIn) = computeProfitMaximizingTrade(
            truePriceTokenA,
            truePriceTokenB,
            reserveA,
            reserveB
        );

        if (amountIn == 0) return (reserveA, reserveB);

        // get the reserves after the trade
        (uint256 reserveOut, uint256 reserveIn) = aToB ? (reserveB, reserveA) : (reserveA, reserveB);
        uint256 amountInWithFee = amountIn.mul(997);
        uint256 numerator = amountInWithFee.mul(reserveOut);
        uint256 denominator = reserveIn.mul(1000).add(amountInWithFee);
        uint256 amountOut = numerator / denominator;

        reserveIn = reserveIn.add(amountIn);
        reserveOut = reserveOut.sub(amountOut);

        (reserveA, reserveB) = aToB ? (reserveIn, reserveOut) : (reserveOut, reserveIn);
    }

    function sortTokens(address tokenA, address tokenB) internal pure returns (address token0, address token1) {
        require(tokenA != tokenB, 'UniswapV2LiquidityMathLibrary: IDENTICAL_ADDRESSES');
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), 'UniswapV2LiquidityMathLibrary: ZERO_ADDRESS');
    }
}
