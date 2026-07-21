// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IVerdexFactory} from "./interfaces/IVerdexFactory.sol";
import {IVerdexPair} from "./interfaces/IVerdexPair.sol";
import {IWVDX} from "./interfaces/IWVDX.sol";
import {IERC20Minimal} from "./interfaces/IERC20Minimal.sol";
import {TransferHelper} from "./libraries/TransferHelper.sol";
import {VerdexLibrary} from "./libraries/VerdexLibrary.sol";

/**
 * @title VerdexRouter
 * @notice User-facing entry for add/remove liquidity and multi-hop swaps.
 * @dev Slippage guards: amountOutMin / amountInMax. Deadline enforced.
 *      Uses factory.getPair for discovery (no hard-coded init code hash).
 */
contract VerdexRouter {
    address public immutable factory;
    address public immutable WVDX;

    modifier ensure(uint256 deadline) {
        require(deadline >= block.timestamp, "VerdexRouter: EXPIRED");
        _;
    }

    constructor(address _factory, address _WVDX) {
        require(_factory != address(0) && _WVDX != address(0), "VerdexRouter: ZERO");
        factory = _factory;
        WVDX = _WVDX;
    }

    receive() external payable {
        assert(msg.sender == WVDX);
    }

    // ─── Liquidity helpers ───────────────────────────────────────────

    function _addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin
    ) internal returns (uint256 amountA, uint256 amountB) {
        if (IVerdexFactory(factory).getPair(tokenA, tokenB) == address(0)) {
            IVerdexFactory(factory).createPair(tokenA, tokenB);
        }
        address pair = IVerdexFactory(factory).getPair(tokenA, tokenB);
        (uint256 reserveA, uint256 reserveB) = VerdexLibrary.getReservesFromPair(pair, tokenA, tokenB);
        if (reserveA == 0 && reserveB == 0) {
            (amountA, amountB) = (amountADesired, amountBDesired);
        } else {
            uint256 amountBOptimal = VerdexLibrary.quote(amountADesired, reserveA, reserveB);
            if (amountBOptimal <= amountBDesired) {
                require(amountBOptimal >= amountBMin, "VerdexRouter: INSUFFICIENT_B_AMOUNT");
                (amountA, amountB) = (amountADesired, amountBOptimal);
            } else {
                uint256 amountAOptimal = VerdexLibrary.quote(amountBDesired, reserveB, reserveA);
                require(amountAOptimal <= amountADesired && amountAOptimal >= amountAMin, "VerdexRouter: INSUFFICIENT_A_AMOUNT");
                (amountA, amountB) = (amountAOptimal, amountBDesired);
            }
        }
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        (amountA, amountB) = _addLiquidity(tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin);
        address pair = IVerdexFactory(factory).getPair(tokenA, tokenB);
        TransferHelper.safeTransferFrom(tokenA, msg.sender, pair, amountA);
        TransferHelper.safeTransferFrom(tokenB, msg.sender, pair, amountB);
        liquidity = IVerdexPair(pair).mint(to);
    }

    function addLiquidityVDX(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountVDXMin,
        address to,
        uint256 deadline
    ) external payable ensure(deadline) returns (uint256 amountToken, uint256 amountVDX, uint256 liquidity) {
        (amountToken, amountVDX) = _addLiquidity(
            token,
            WVDX,
            amountTokenDesired,
            msg.value,
            amountTokenMin,
            amountVDXMin
        );
        address pair = IVerdexFactory(factory).getPair(token, WVDX);
        TransferHelper.safeTransferFrom(token, msg.sender, pair, amountToken);
        IWVDX(WVDX).deposit{value: amountVDX}();
        assert(IWVDX(WVDX).transfer(pair, amountVDX));
        liquidity = IVerdexPair(pair).mint(to);
        if (msg.value > amountVDX) TransferHelper.safeTransferETH(msg.sender, msg.value - amountVDX);
    }

    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) public ensure(deadline) returns (uint256 amountA, uint256 amountB) {
        address pair = IVerdexFactory(factory).getPair(tokenA, tokenB);
        require(pair != address(0), "VerdexRouter: PAIR_NOT_FOUND");
        IVerdexPair(pair).transferFrom(msg.sender, pair, liquidity);
        (uint256 amount0, uint256 amount1) = IVerdexPair(pair).burn(to);
        (address token0, ) = VerdexLibrary.sortTokens(tokenA, tokenB);
        (amountA, amountB) = tokenA == token0 ? (amount0, amount1) : (amount1, amount0);
        require(amountA >= amountAMin, "VerdexRouter: INSUFFICIENT_A_AMOUNT");
        require(amountB >= amountBMin, "VerdexRouter: INSUFFICIENT_B_AMOUNT");
    }

    function removeLiquidityVDX(
        address token,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountVDXMin,
        address to,
        uint256 deadline
    ) public ensure(deadline) returns (uint256 amountToken, uint256 amountVDX) {
        (amountToken, amountVDX) = removeLiquidity(
            token,
            WVDX,
            liquidity,
            amountTokenMin,
            amountVDXMin,
            address(this),
            deadline
        );
        TransferHelper.safeTransfer(token, to, amountToken);
        IWVDX(WVDX).withdraw(amountVDX);
        TransferHelper.safeTransferETH(to, amountVDX);
    }

    // ─── Swap core ───────────────────────────────────────────────────

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

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        amounts = VerdexLibrary.getAmountsOut(factory, amountIn, path);
        require(amounts[amounts.length - 1] >= amountOutMin, "VerdexRouter: INSUFFICIENT_OUTPUT_AMOUNT");
        TransferHelper.safeTransferFrom(
            path[0],
            msg.sender,
            IVerdexFactory(factory).getPair(path[0], path[1]),
            amounts[0]
        );
        _swap(amounts, path, to);
    }

    function swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        amounts = VerdexLibrary.getAmountsIn(factory, amountOut, path);
        require(amounts[0] <= amountInMax, "VerdexRouter: EXCESSIVE_INPUT_AMOUNT");
        TransferHelper.safeTransferFrom(
            path[0],
            msg.sender,
            IVerdexFactory(factory).getPair(path[0], path[1]),
            amounts[0]
        );
        _swap(amounts, path, to);
    }

    function swapExactVDXForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable ensure(deadline) returns (uint256[] memory amounts) {
        require(path[0] == WVDX, "VerdexRouter: INVALID_PATH");
        amounts = VerdexLibrary.getAmountsOut(factory, msg.value, path);
        require(amounts[amounts.length - 1] >= amountOutMin, "VerdexRouter: INSUFFICIENT_OUTPUT_AMOUNT");
        IWVDX(WVDX).deposit{value: amounts[0]}();
        assert(IWVDX(WVDX).transfer(IVerdexFactory(factory).getPair(path[0], path[1]), amounts[0]));
        _swap(amounts, path, to);
    }

    function swapExactTokensForVDX(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        require(path[path.length - 1] == WVDX, "VerdexRouter: INVALID_PATH");
        amounts = VerdexLibrary.getAmountsOut(factory, amountIn, path);
        require(amounts[amounts.length - 1] >= amountOutMin, "VerdexRouter: INSUFFICIENT_OUTPUT_AMOUNT");
        TransferHelper.safeTransferFrom(
            path[0],
            msg.sender,
            IVerdexFactory(factory).getPair(path[0], path[1]),
            amounts[0]
        );
        _swap(amounts, path, address(this));
        IWVDX(WVDX).withdraw(amounts[amounts.length - 1]);
        TransferHelper.safeTransferETH(to, amounts[amounts.length - 1]);
    }

    // ─── Views ───────────────────────────────────────────────────────

    function quote(uint256 amountA, uint256 reserveA, uint256 reserveB) external pure returns (uint256 amountB) {
        return VerdexLibrary.quote(amountA, reserveA, reserveB);
    }

    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) external pure returns (uint256 amountOut) {
        return VerdexLibrary.getAmountOut(amountIn, reserveIn, reserveOut);
    }

    function getAmountIn(
        uint256 amountOut,
        uint256 reserveIn,
        uint256 reserveOut
    ) external pure returns (uint256 amountIn) {
        return VerdexLibrary.getAmountIn(amountOut, reserveIn, reserveOut);
    }

    function getAmountsOut(uint256 amountIn, address[] memory path) external view returns (uint256[] memory amounts) {
        return VerdexLibrary.getAmountsOut(factory, amountIn, path);
    }

    function getAmountsIn(uint256 amountOut, address[] memory path) external view returns (uint256[] memory amounts) {
        return VerdexLibrary.getAmountsIn(factory, amountOut, path);
    }
}
