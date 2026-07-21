// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IVerdexFactory {
    event PairCreated(address indexed token0, address indexed token1, address pair, uint256 pairIndex);

    /// @notice Protocol treasury receives fee share (0.05% of volume via LP mint / fee splitter)
    function treasury() external view returns (address);
    /// @notice Burn sink for deflationary fee share (0.03%)
    function burnAddress() external view returns (address);
    /// @notice Optional feeTo for Uniswap-style protocol LP mint (usually FeeSplitter)
    function feeTo() external view returns (address);
    function feeToSetter() external view returns (address);

    /// @notice Total swap fee in basis points (25 = 0.25%)
    function TOTAL_FEE_BPS() external pure returns (uint256);
    /// @notice LP share of swap fee (17 = 0.17%)
    function LP_FEE_BPS() external pure returns (uint256);
    /// @notice Treasury share (5 = 0.05%)
    function TREASURY_FEE_BPS() external pure returns (uint256);
    /// @notice Burn / buyback share (3 = 0.03%)
    function BURN_FEE_BPS() external pure returns (uint256);

    function getPair(address tokenA, address tokenB) external view returns (address pair);
    function allPairs(uint256) external view returns (address pair);
    function allPairsLength() external view returns (uint256);

    function createPair(address tokenA, address tokenB) external returns (address pair);

    function setFeeTo(address) external;
    function setFeeToSetter(address) external;
    function setTreasury(address) external;
    function setBurnAddress(address) external;
}
