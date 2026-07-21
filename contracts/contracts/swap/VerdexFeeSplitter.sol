// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IVerdexFactory} from "./interfaces/IVerdexFactory.sol";
import {IVerdexPair} from "./interfaces/IVerdexPair.sol";
import {IERC20Minimal} from "./interfaces/IERC20Minimal.sol";

/**
 * @title VerdexFeeSplitter
 * @notice Receives protocol LP fees (feeTo) and converts them into treasury + burn flows.
 *
 * When protocol LP tokens are minted to this contract, anyone may call `processPair`
 * to burn the LP for underlying tokens and split:
 *   - 5/8 → treasury  (0.05% of original swap volume share)
 *   - 3/8 → burn address (0.03% buyback/burn sink)
 *
 * For non-VDX tokens sent to burn, a keeper may later market-buy VDX off-chain;
 * native VDX (or wrapped VDX) is permanently removed at 0xdead.
 */
contract VerdexFeeSplitter {
    IVerdexFactory public immutable factory;

    event FeesProcessed(
        address indexed pair,
        address indexed token0,
        address indexed token1,
        uint256 amount0Treasury,
        uint256 amount1Treasury,
        uint256 amount0Burn,
        uint256 amount1Burn
    );

    constructor(address _factory) {
        require(_factory != address(0), "Verdex: ZERO_FACTORY");
        factory = IVerdexFactory(_factory);
    }

    function _safeTransfer(address token, address to, uint256 value) private {
        if (value == 0 || to == address(0)) return;
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(0xa9059cbb, to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "Verdex: TRANSFER_FAILED");
    }

    /**
     * @notice Burn all LP balance of `pair` held by this contract and split underlyings.
     */
    function processPair(address pair) external {
        uint256 liquidity = IVerdexPair(pair).balanceOf(address(this));
        require(liquidity > 0, "Verdex: NO_FEES");

        // Transfer LP to pair then burn
        require(IVerdexPair(pair).transfer(pair, liquidity), "Verdex: LP_TRANSFER");
        (uint256 amount0, uint256 amount1) = IVerdexPair(pair).burn(address(this));

        address token0 = IVerdexPair(pair).token0();
        address token1 = IVerdexPair(pair).token1();
        address treasury = factory.treasury();
        address burn = factory.burnAddress();

        // Split 5/8 treasury, 3/8 burn (matches 5 bps : 3 bps of the 8 bps protocol share)
        uint256 t0 = (amount0 * 5) / 8;
        uint256 b0 = amount0 - t0;
        uint256 t1 = (amount1 * 5) / 8;
        uint256 b1 = amount1 - t1;

        _safeTransfer(token0, treasury, t0);
        _safeTransfer(token1, treasury, t1);
        _safeTransfer(token0, burn, b0);
        _safeTransfer(token1, burn, b1);

        emit FeesProcessed(pair, token0, token1, t0, t1, b0, b1);
    }

    /// @notice Rescue any ERC20 accidentally sent here (not LP processing path)
    function rescueToken(address token, address to, uint256 amount) external {
        require(msg.sender == factory.feeToSetter(), "Verdex: FORBIDDEN");
        _safeTransfer(token, to, amount);
    }
}
