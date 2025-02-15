pragma solidity ^0.6.0;

import "@openzeppelin/contracts/math/SafeMath.sol";

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/lib/contracts/libraries/Babylonian.sol";
import "@uniswap/lib/contracts/libraries/TransferHelper.sol";
import "@uniswap/lib/contracts/libraries/FullMath.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router01.sol";

/**
 * @title UniswapBroker
 * @notice Trading contract used to arb uniswap pairs to a desired "true" price. Intended use is to arb UMA perpetual
 * synthetics that trade off peg. This implementation can ber used in conjunction with a DSProxy contract to atomically
 * swap and move a uniswap market.
 */

contract UniswapBroker {
    using SafeMath for uint256;

    /**
     * @notice Swaps an amount of either token such that the trade results in the uniswap pair's price being as close as
     * possible to the truePrice.
     * @dev True price is expressed in the ratio of token A to token B.
     * @dev The caller must approve this contract to spend whichever token is intended to be swapped.
     * @param tradingAsEOA bool to indicate if the UniswapBroker is being called by a DSProxy or an EOA.
     * @param uniswapRouter address of the uniswap router used to facilitate trades.
     * @param uniswapFactory address of the uniswap factory used to fetch current pair reserves.
     * @param swappedTokens array of addresses which are to be swapped. The order does not matter as the function will figure
     * out which tokens need to be exchanged to move the market to the desired "true" price.
     * @param truePriceTokens array of unit used to represent the true price. 0th value is the numerator of the true price
     * and the 1st value is the the denominator of the true price.
     * @param maxSpendTokens array of unit to represent the max to spend in the two tokens.
     * @param to recipient of the trade proceeds.
     * @param deadline to limit when the trade can execute. If the tx is mined after this timestamp then revert.
     */
    function swapToPrice(
        bool tradingAsEOA,
        address uniswapRouter,
        address uniswapFactory,
        address[2] memory swappedTokens,
        uint256[2] memory truePriceTokens,
        uint256[2] memory maxSpendTokens,
        address to,
        uint256 deadline
    ) public {
        IUniswapV2Router01 router = IUniswapV2Router01(uniswapRouter);

        // true price is expressed as a ratio, so both values must be non-zero
        require(truePriceTokens[0] != 0 && truePriceTokens[1] != 0, "SwapToPrice: ZERO_PRICE");
        // caller can specify 0 for either if they wish to swap in only one direction, but not both
        require(maxSpendTokens[0] != 0 || maxSpendTokens[1] != 0, "SwapToPrice: ZERO_SPEND");

        bool aToB;
        uint256 amountIn;
        {
            (uint256 reserveA, uint256 reserveB) = getReserves(uniswapFactory, swappedTokens[0], swappedTokens[1]);
            (aToB, amountIn) = computeTradeToMoveMarket(truePriceTokens[0], truePriceTokens[1], reserveA, reserveB);
        }

        require(amountIn > 0, "SwapToPrice: ZERO_AMOUNT_IN");

        // spend up to the allowance of the token in
        uint256 maxSpend = aToB ? maxSpendTokens[0] : maxSpendTokens[1];
        if (amountIn > maxSpend) {
            amountIn = maxSpend;
        }

        address tokenIn = aToB ? swappedTokens[0] : swappedTokens[1];
        address tokenOut = aToB ? swappedTokens[1] : swappedTokens[0];

        TransferHelper.safeApprove(tokenIn, address(router), amountIn);

        if (tradingAsEOA) TransferHelper.safeTransferFrom(tokenIn, msg.sender, address(this), amountIn);

        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;

        router.swapExactTokensForTokens(
            amountIn,
            0, // amountOutMin: we can skip computing this number because the math is tested within the uniswap tests.
            path,
            to,
            deadline
        );
    }

    /**
     * @notice Given the "true" price a token (represented by truePriceTokenA/truePriceTokenB) and the reservers in the
     * uniswap pair, calculate: a) the direction of trade (aToB) and b) the amount needed to trade (amountIn) to move
     * the pool price to be equal to the true price.
     * @dev Note that this method uses the Babylonian square root method which has a small margin of error which will
     * result in a small over or under estimation on the size of the trade needed.
     * @param truePriceTokenA the nominator of the true price.
     * @param truePriceTokenB the denominator of the true price.
     * @param reserveA number of token A in the pair reserves
     * @param reserveB number of token B in the pair reserves
     */
    //
    function computeTradeToMoveMarket(
        uint256 truePriceTokenA,
        uint256 truePriceTokenB,
        uint256 reserveA,
        uint256 reserveB
    ) public pure returns (bool aToB, uint256 amountIn) {
        aToB = FullMath.mulDiv(reserveA, truePriceTokenB, reserveB) < truePriceTokenA;

        uint256 invariant = reserveA.mul(reserveB);

        // The trade ∆a of token a required to move the market to some desired price P' from the current price P can be
        // found with ∆a=(kP')^1/2-Ra.
        uint256 leftSide =
            Babylonian.sqrt(
                FullMath.mulDiv(
                    invariant,
                    aToB ? truePriceTokenA : truePriceTokenB,
                    aToB ? truePriceTokenB : truePriceTokenA
                )
            );
        uint256 rightSide = (aToB ? reserveA : reserveB);

        if (leftSide < rightSide) return (false, 0);

        // compute the amount that must be sent to move the price back to the true price.
        amountIn = leftSide.sub(rightSide);
    }

    // The methods below are taken from https://github.com/Uniswap/uniswap-v2-periphery/blob/master/contracts/libraries/UniswapV2Library.sol
    // We could import this library into this contract but this library is dependent Uniswap's SafeMath, which is bound
    // to solidity 6.6.6. Hardhat can easily deal with two different sets of solidity versions within one project so
    // unit tests would continue to work fine. However, this would break truffle support in the repo as truffle cant
    // handel having two different solidity versions. As a work around, the specific methods needed in the UniswapBroker
    // are simply moved here to maintain truffle support.
    function getReserves(
        address factory,
        address tokenA,
        address tokenB
    ) public view returns (uint256 reserveA, uint256 reserveB) {
        (address token0, ) = sortTokens(tokenA, tokenB);
        (uint256 reserve0, uint256 reserve1, ) = IUniswapV2Pair(pairFor(factory, tokenA, tokenB)).getReserves();
        (reserveA, reserveB) = tokenA == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
    }

    function sortTokens(address tokenA, address tokenB) internal pure returns (address token0, address token1) {
        require(tokenA != tokenB, "UniswapV2Library: IDENTICAL_ADDRESSES");
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "UniswapV2Library: ZERO_ADDRESS");
    }

    // calculates the CREATE2 address for a pair without making any external calls
    function pairFor(
        address factory,
        address tokenA,
        address tokenB
    ) internal pure returns (address pair) {
        (address token0, address token1) = sortTokens(tokenA, tokenB);
        pair = address(
            uint256(
                keccak256(
                    abi.encodePacked(
                        hex"ff",
                        factory,
                        keccak256(abi.encodePacked(token0, token1)),
                        hex"96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f" // init code hash
                    )
                )
            )
        );
    }
}
