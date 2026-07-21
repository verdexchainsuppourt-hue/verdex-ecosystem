// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IVerdexFactory} from "./interfaces/IVerdexFactory.sol";
import {IVerdexPair} from "./interfaces/IVerdexPair.sol";
import {VerdexPair} from "./VerdexPair.sol";

/**
 * @title VerdexFactory
 * @notice Deploys and indexes VerdexPair contracts. Holds fee / treasury config.
 *
 * Fee structure (bps of each swap):
 * | Recipient           | BPS | Percent |
 * |---------------------|-----|---------|
 * | Liquidity Providers | 17  | 0.17%   |
 * | Protocol Treasury   | 5   | 0.05%   |
 * | VDX Burn            | 3   | 0.03%   |
 * | Total               | 25  | 0.25%   |
 *
 * Protocol share (8/25 of fees) is minted as LP to `feeTo` (set to VerdexFeeSplitter).
 */
contract VerdexFactory is IVerdexFactory {
    uint256 public constant override TOTAL_FEE_BPS = 25;
    uint256 public constant override LP_FEE_BPS = 17;
    uint256 public constant override TREASURY_FEE_BPS = 5;
    uint256 public constant override BURN_FEE_BPS = 3;

    address public override treasury;
    address public override burnAddress;
    address public override feeTo;
    address public override feeToSetter;

    mapping(address => mapping(address => address)) public override getPair;
    address[] public override allPairs;

    constructor(address _feeToSetter, address _treasury, address _burnAddress) {
        require(_feeToSetter != address(0), "Verdex: ZERO_SETTER");
        feeToSetter = _feeToSetter;
        treasury = _treasury;
        burnAddress = _burnAddress == address(0)
            ? address(0x000000000000000000000000000000000000dEaD)
            : _burnAddress;
    }

    function allPairsLength() external view override returns (uint256) {
        return allPairs.length;
    }

    function createPair(address tokenA, address tokenB) external override returns (address pair) {
        require(tokenA != tokenB, "Verdex: IDENTICAL_ADDRESSES");
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "Verdex: ZERO_ADDRESS");
        require(getPair[token0][token1] == address(0), "Verdex: PAIR_EXISTS");

        bytes memory bytecode = type(VerdexPair).creationCode;
        bytes32 salt = keccak256(abi.encodePacked(token0, token1));
        assembly {
            pair := create2(0, add(bytecode, 32), mload(bytecode), salt)
        }
        require(pair != address(0), "Verdex: CREATE2_FAILED");

        IVerdexPair(pair).initialize(token0, token1);
        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair;
        allPairs.push(pair);
        emit PairCreated(token0, token1, pair, allPairs.length);
    }

    function setFeeTo(address _feeTo) external override {
        require(msg.sender == feeToSetter, "Verdex: FORBIDDEN");
        feeTo = _feeTo;
    }

    function setFeeToSetter(address _feeToSetter) external override {
        require(msg.sender == feeToSetter, "Verdex: FORBIDDEN");
        require(_feeToSetter != address(0), "Verdex: ZERO_SETTER");
        feeToSetter = _feeToSetter;
    }

    function setTreasury(address _treasury) external override {
        require(msg.sender == feeToSetter, "Verdex: FORBIDDEN");
        treasury = _treasury;
    }

    function setBurnAddress(address _burnAddress) external override {
        require(msg.sender == feeToSetter, "Verdex: FORBIDDEN");
        require(_burnAddress != address(0), "Verdex: ZERO_BURN");
        burnAddress = _burnAddress;
    }
}
