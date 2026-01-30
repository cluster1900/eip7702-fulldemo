// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/Kernel.sol";
import {IERC20} from "lib/forge-std/src/interfaces/IERC20.sol";

contract MockERC20 is IERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public totalSupply;

    string public name = "Mock USDC";
    string public symbol = "USDC";
    uint8 public decimals = 6;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "Insufficient balance");
        require(allowance[from][msg.sender] >= amount, "Allowance exceeded");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        allowance[from][msg.sender] -= amount;
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
}

contract DeployScript is Script {
    bytes32 constant MOCK_USDC_SALT = bytes32(uint256(0x123456789abcdef));

    function run() external {
        uint256 deployerPrivateKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
        vm.startBroadcast(deployerPrivateKey);

        address entryPoint = 0x5FbDB2315678afecb367f032d93F642f64180aa3;

        Kernel kernel = new Kernel(entryPoint);
        console.log("Kernel deployed at:", address(kernel));

        MockERC20 usdc = new MockERC20{salt: MOCK_USDC_SALT}();
        console.log("MockUSDC deployed at:", address(usdc));

        usdc.mint(0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266, 5000000000);
        console.log("Minted 5000 USDC to bundler");

        vm.stopBroadcast();
    }
}
