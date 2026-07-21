// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/**
 * @title VerdexMainnetVDX
 * @notice The immutable PRC20/ERC-20 VDX asset for the EVM-compatible Verdex mainnet.
 * @dev The maximum issuance is minted once, during construction, to the genesis
 *      vault. There is intentionally no owner, minter, upgrade hook, blacklist,
 *      forced-transfer function, or recovery method. Holder-initiated burns are
 *      permitted, so the outstanding supply can decrease but can never increase.
 */
contract VerdexMainnetVDX is ERC20, ERC20Burnable {
    uint256 public constant MAXIMUM_SUPPLY = 1_000_000_000 ether;

    error ZeroGenesisVault();

    constructor(address genesisVault) ERC20("Verdex", "VDX") {
        if (genesisVault == address(0)) revert ZeroGenesisVault();
        _mint(genesisVault, MAXIMUM_SUPPLY);
    }
}
