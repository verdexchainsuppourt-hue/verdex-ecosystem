// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IVerdexFactory} from "./interfaces/IVerdexFactory.sol";
import {IVerdexPair} from "./interfaces/IVerdexPair.sol";
import {VerdexLibrary} from "./libraries/VerdexLibrary.sol";
import {TransferHelper} from "./libraries/TransferHelper.sol";

/**
 * @title VerdexAggregator
 * @notice Intelligent multi-path router for Verdex Swap.
 *
 * Flow:
 * 1. Collect tokenIn, tokenOut, amountIn, slippage (via amountOutMin)
 * 2. Discover liquidity via Factory.getPair
 * 3. Evaluate direct path and multi-hop via intermediate tokens (e.g. WVDX, USDT)
 * 4. Pick the route with the highest output
 * 5. Revert if output < amountOutMin (slippage guard)
 *
 * Pools use x * y = k with 0.25% fee (0.17% LP / 0.05% treasury / 0.03% burn).
 */
contract VerdexAggregator {
    address public immutable factory;
    address public immutable router;
    address public immutable WVDX;

    address[] public hopTokens;
    address public owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event HopTokensUpdated(uint256 count);
    event AggregatedSwap(
        address indexed sender,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 hops
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "VerdexAgg: FORBIDDEN");
        _;
    }

    modifier ensure(uint256 deadline) {
        require(deadline >= block.timestamp, "VerdexAgg: EXPIRED");
        _;
    }

    constructor(address _factory, address _router, address _WVDX) {
        require(_factory != address(0) && _router != address(0) && _WVDX != address(0), "VerdexAgg: ZERO");
        factory = _factory;
        router = _router;
        WVDX = _WVDX;
        owner = msg.sender;
        hopTokens.push(_WVDX);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "VerdexAgg: ZERO");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setHopTokens(address[] calldata tokens) external onlyOwner {
        delete hopTokens;
        for (uint256 i; i < tokens.length; i++) {
            require(tokens[i] != address(0), "VerdexAgg: ZERO_HOP");
            hopTokens.push(tokens[i]);
        }
        emit HopTokensUpdated(tokens.length);
    }

    function hopTokensLength() external view returns (uint256) {
        return hopTokens.length;
    }

    function _pairExists(address a, address b) internal view returns (bool) {
        return IVerdexFactory(factory).getPair(a, b) != address(0);
    }

    function _pathReady(address[] memory path) internal view returns (bool) {
        if (path.length < 2) return false;
        for (uint256 i; i < path.length - 1; i++) {
            if (!_pairExists(path[i], path[i + 1])) return false;
            address pair = IVerdexFactory(factory).getPair(path[i], path[i + 1]);
            (uint112 r0, uint112 r1, ) = IVerdexPair(pair).getReserves();
            if (r0 == 0 || r1 == 0) return false;
        }
        return true;
    }

    function _amountOut(uint256 amountIn, address[] memory path) internal view returns (uint256) {
        if (!_pathReady(path)) return 0;
        uint256[] memory amounts = VerdexLibrary.getAmountsOut(factory, amountIn, path);
        return amounts[amounts.length - 1];
    }

    function _copyPath(address[] memory src) internal pure returns (address[] memory dst) {
        dst = new address[](src.length);
        for (uint256 i; i < src.length; i++) dst[i] = src[i];
    }

    /**
     * @notice Find best route among direct, 1-hop, and 2-hop paths via hopTokens.
     */
    function findBestRoute(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) public view returns (address[] memory bestPath, uint256 bestOut) {
        require(tokenIn != tokenOut, "VerdexAgg: IDENTICAL");
        require(amountIn > 0, "VerdexAgg: ZERO_IN");

        // Direct
        {
            address[] memory direct = new address[](2);
            direct[0] = tokenIn;
            direct[1] = tokenOut;
            uint256 out = _amountOut(amountIn, direct);
            if (out > bestOut) {
                bestOut = out;
                bestPath = _copyPath(direct);
            }
        }

        // tokenIn → mid → tokenOut
        for (uint256 i; i < hopTokens.length; i++) {
            address mid = hopTokens[i];
            if (mid == tokenIn || mid == tokenOut) continue;
            address[] memory path = new address[](3);
            path[0] = tokenIn;
            path[1] = mid;
            path[2] = tokenOut;
            uint256 out = _amountOut(amountIn, path);
            if (out > bestOut) {
                bestOut = out;
                bestPath = _copyPath(path);
            }
        }

        // tokenIn → a → b → tokenOut
        uint256 n = hopTokens.length;
        for (uint256 i; i < n; i++) {
            for (uint256 j; j < n; j++) {
                if (i == j) continue;
                address a = hopTokens[i];
                address b = hopTokens[j];
                if (a == tokenIn || a == tokenOut || b == tokenIn || b == tokenOut) continue;
                address[] memory path = new address[](4);
                path[0] = tokenIn;
                path[1] = a;
                path[2] = b;
                path[3] = tokenOut;
                uint256 out = _amountOut(amountIn, path);
                if (out > bestOut) {
                    bestOut = out;
                    bestPath = _copyPath(path);
                }
            }
        }

        require(bestPath.length >= 2 && bestOut > 0, "VerdexAgg: NO_ROUTE");
    }

    function quoteBest(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) external view returns (address[] memory path, uint256 amountOut) {
        return findBestRoute(tokenIn, tokenOut, amountIn);
    }

    function quotePath(
        uint256 amountIn,
        address[] calldata path
    ) external view returns (uint256[] memory amounts) {
        return VerdexLibrary.getAmountsOut(factory, amountIn, path);
    }

    function swapExactTokensForTokensBest(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256 amountOut, address[] memory path) {
        (path, amountOut) = findBestRoute(tokenIn, tokenOut, amountIn);
        require(amountOut >= amountOutMin, "VerdexAgg: SLIPPAGE");

        TransferHelper.safeTransferFrom(
            path[0],
            msg.sender,
            IVerdexFactory(factory).getPair(path[0], path[1]),
            amountIn
        );

        uint256[] memory amounts = VerdexLibrary.getAmountsOut(factory, amountIn, path);
        _swap(amounts, path, to);

        amountOut = amounts[amounts.length - 1];
        emit AggregatedSwap(msg.sender, tokenIn, tokenOut, amountIn, amountOut, path.length - 1);
    }

    function swapExactTokensForTokensPath(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        amounts = VerdexLibrary.getAmountsOut(factory, amountIn, path);
        require(amounts[amounts.length - 1] >= amountOutMin, "VerdexAgg: SLIPPAGE");
        TransferHelper.safeTransferFrom(
            path[0],
            msg.sender,
            IVerdexFactory(factory).getPair(path[0], path[1]),
            amounts[0]
        );
        _swap(amounts, path, to);
        emit AggregatedSwap(
            msg.sender,
            path[0],
            path[path.length - 1],
            amountIn,
            amounts[amounts.length - 1],
            path.length - 1
        );
    }

    function _swap(uint256[] memory amounts, address[] memory path, address _to) internal {
        for (uint256 i; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0, ) = VerdexLibrary.sortTokens(input, output);
            uint256 amountOut = amounts[i + 1];
            (uint256 amount0Out, uint256 amount1Out) = input == token0
                ? (uint256(0), amountOut)
                : (amountOut, uint256(0));
            address to = i < path.length - 2 ? IVerdexFactory(factory).getPair(output, path[i + 2]) : _to;
            address pair = IVerdexFactory(factory).getPair(input, output);
            IVerdexPair(pair).swap(amount0Out, amount1Out, to, new bytes(0));
        }
    }

    function feeInfo()
        external
        view
        returns (
            uint256 totalBps,
            uint256 lpBps,
            uint256 treasuryBps,
            uint256 burnBps,
            address treasury,
            address burn
        )
    {
        IVerdexFactory f = IVerdexFactory(factory);
        return (
            f.TOTAL_FEE_BPS(),
            f.LP_FEE_BPS(),
            f.TREASURY_FEE_BPS(),
            f.BURN_FEE_BPS(),
            f.treasury(),
            f.burnAddress()
        );
    }
}
