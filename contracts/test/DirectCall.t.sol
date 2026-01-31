// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/Kernel.sol";
import { EntryPoint } from "../../lib/account-abstraction/contracts/core/EntryPoint.sol";

contract DirectCallTest is Test {
    address constant ENTRY_POINT = 0x5FbDB2315678afecb367f032d93F642f64180aa3;
    address constant KERNEL = 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512;
    address constant BUNDLER = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;

    Kernel public kernel;

    function setUp() external {
        kernel = new Kernel(ENTRY_POINT);
    }

    function testDirectCall() external {
        // Fund kernel
        vm.deal(address(kernel), 1 ether);
        console.log("Kernel balance before:", address(kernel).balance);

        // Build Call struct using Kernel's Call type
        Kernel.Call[] memory calls = new Kernel.Call[](1);
        calls[0] = Kernel.Call(BUNDLER, 0.001 ether, "");

        // Try calling directly as entry point
        vm.startPrank(ENTRY_POINT);
        console.log("Calling executeBatch as ENTRY_POINT");
        console.log("msg.sender:", msg.sender);
        console.log("ENTRY_POINT:", ENTRY_POINT);

        kernel.executeBatch(calls);

        console.log("Kernel balance after:", address(kernel).balance);
        console.log("Bundler balance:", BUNDLER.balance);
    }
}
