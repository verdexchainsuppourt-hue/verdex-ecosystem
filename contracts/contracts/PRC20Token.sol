// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PRC20Token
 * @notice Production-ready Verdex PRC20 token (ERC-20 compatible).
 * @dev Deploy on Verdex Testnet (chainId 7201) or any EVM network.
 *      Phase 3 PRC20 — use with Phase 4 AMM under contracts/swap/.
 */
contract PRC20Token is ERC20, ERC20Burnable, Ownable {
    uint8 private immutable _decimals;

    /**
     * @param name_ Token name
     * @param symbol_ Token symbol
     * @param decimals_ Token decimals (usually 18)
     * @param initialSupply Whole tokens (not wei) minted to deployer
     * @param initialOwner Owner / minter admin
     */
    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 initialSupply,
        address initialOwner
    ) ERC20(name_, symbol_) Ownable(initialOwner) {
        _decimals = decimals_;
        if (initialSupply > 0) {
            _mint(initialOwner, initialSupply * (10 ** uint256(decimals_)));
        }
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    /** @notice Owner-only mint (optional; disable by renouncing ownership). */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
