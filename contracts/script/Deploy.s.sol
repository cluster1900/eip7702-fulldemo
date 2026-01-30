// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/Kernel.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
        vm.startBroadcast(deployerPrivateKey);

        // Deploy Kernel with EntryPoint address
        address entryPoint = 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512;
        Kernel kernel = new Kernel(entryPoint);

        console.log("Kernel deployed at:", address(kernel));
        console.log("EntryPoint:", entryPoint);

        vm.stopBroadcast();
    }
}
