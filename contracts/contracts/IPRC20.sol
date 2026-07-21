// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IPRC20
 * @notice Verdex fungible token interface — identical to ERC-20.
 *         Named PRC20 for Verdex branding; wallets and tools treat it as ERC-20.
 */
interface IPRC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
}

interface IPRC20Metadata is IPRC20 {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
}

interface IPRC20Burnable is IPRC20 {
    function burn(uint256 amount) external;
    function burnFrom(address account, uint256 amount) external;
}

interface IPRC20Mintable is IPRC20 {
    function mint(address to, uint256 amount) external;
}
