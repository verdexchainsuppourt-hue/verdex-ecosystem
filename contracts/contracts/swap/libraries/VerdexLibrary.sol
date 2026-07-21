// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IVerdexPair} from "../interfaces/IVerdexPair.sol";

/// @notice Quote / path helpers for Verdex AMM (0.25% total fee)
library VerdexLibrary {
    uint256 internal constant FEE_DENOMINATOR = 10_000;
    /// @notice 10000 - 25 = 9975 → 0.25% total protocol fee
    uint256 internal constant FEE_NUMERATOR = 9_975;

    function sortTokens(address tokenA, address tokenB) internal pure returns (address token0, address token1) {
        require(tokenA != tokenB, "VerdexLibrary: IDENTICAL_ADDRESSES");
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "VerdexLibrary: ZERO_ADDRESS");
    }

    /// @notice CREATE2 pair address. Use init code hash from deployments/*-amm.json after compile.
    function pairFor(address factory, bytes32 initCodeHash, address tokenA, address tokenB)
        internal
        pure
        returns (address pair)
    {
        (address token0, address token1) = sortTokens(tokenA, tokenB);
        pair = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            hex"ff",
                            factory,
                            keccak256(abi.encodePacked(token0, token1)),
                            initCodeHash
                        )
                    )
                )
            )
        );
    }

    function getReservesFromPair(
        address pair,
        address tokenA,
        address tokenB
    ) internal view returns (uint256 reserveA, uint256 reserveB) {
        (address token0, ) = sortTokens(tokenA, tokenB);
        (uint112 reserve0, uint112 reserve1, ) = IVerdexPair(pair).getReserves();
        (reserveA, reserveB) = tokenA == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
    }

    function quote(uint256 amountA, uint256 reserveA, uint256 reserveB) internal pure returns (uint256 amountB) {
        require(amountA > 0, "VerdexLibrary: INSUFFICIENT_AMOUNT");
        require(reserveA > 0 && reserveB > 0, "VerdexLibrary: INSUFFICIENT_LIQUIDITY");
        amountB = (amountA * reserveB) / reserveA;
    }

    /// @notice Given input amount and reserves, returns max output after 0.25% fee
    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) internal pure returns (uint256 amountOut) {
        require(amountIn > 0, "VerdexLibrary: INSUFFICIENT_INPUT_AMOUNT");
        require(reserveIn > 0 && reserveOut > 0, "VerdexLibrary: INSUFFICIENT_LIQUIDITY");
        uint256 amountInWithFee = amountIn * FEE_NUMERATOR;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = reserveIn * FEE_DENOMINATOR + amountInWithFee;
        amountOut = numerator / denominator;
    }

    /// @notice Given desired output, returns required input including 0.25% fee
    function getAmountIn(
        uint256 amountOut,
        uint256 reserveIn,
        uint256 reserveOut
    ) internal pure returns (uint256 amountIn) {
        require(amountOut > 0, "VerdexLibrary: INSUFFICIENT_OUTPUT_AMOUNT");
        require(reserveIn > 0 && reserveOut > 0, "VerdexLibrary: INSUFFICIENT_LIQUIDITY");
        uint256 numerator = reserveIn * amountOut * FEE_DENOMINATOR;
        uint256 denominator = (reserveOut - amountOut) * FEE_NUMERATOR;
        amountIn = (numerator / denominator) + 1;
    }

    function getAmountsOut(
        address factory,
        uint256 amountIn,
        address[] memory path
    ) internal view returns (uint256[] memory amounts) {
        require(path.length >= 2, "VerdexLibrary: INVALID_PATH");
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        for (uint256 i; i < path.length - 1; i++) {
            address pair = IVerdexPairFactory(factory).getPair(path[i], path[i + 1]);
            require(pair != address(0), "VerdexLibrary: PAIR_NOT_FOUND");
            (uint256 reserveIn, uint256 reserveOut) = getReservesFromPair(pair, path[i], path[i + 1]);
            amounts[i + 1] = getAmountOut(amounts[i], reserveIn, reserveOut);
        }
    }

    function getAmountsIn(
        address factory,
        uint256 amountOut,
        address[] memory path
    ) internal view returns (uint256[] memory amounts) {
        require(path.length >= 2, "VerdexLibrary: INVALID_PATH");
        amounts = new uint256[](path.length);
        amounts[amounts.length - 1] = amountOut;
        for (uint256 i = path.length - 1; i > 0; i--) {
            address pair = IVerdexPairFactory(factory).getPair(path[i - 1], path[i]);
            require(pair != address(0), "VerdexLibrary: PAIR_NOT_FOUND");
            (uint256 reserveIn, uint256 reserveOut) = getReservesFromPair(pair, path[i - 1], path[i]);
            amounts[i - 1] = getAmountIn(amounts[i], reserveIn, reserveOut);
        }
    }
}

interface IVerdexPairFactory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
}
