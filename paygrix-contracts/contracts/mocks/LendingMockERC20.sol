// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title LendingMockERC20
/// @notice Test-only mock ERC20 token with customizable decimals for PayGrix Lending testing.
contract LendingMockERC20 is ERC20 {
    uint8 private immutable _customDecimals;

    constructor(string memory name, string memory symbol, uint8 customDecimals_) ERC20(name, symbol) {
        _customDecimals = customDecimals_;
    }

    function decimals() public view override returns (uint8) {
        return _customDecimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
