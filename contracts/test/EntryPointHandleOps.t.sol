// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/Kernel.sol";
import { EntryPoint } from "../../lib/account-abstraction/contracts/core/EntryPoint.sol";
import { PackedUserOperation } from "../../lib/account-abstraction/contracts/interfaces/PackedUserOperation.sol";

contract EntryPointHandleOpsTest is Test {
    EntryPoint public entryPoint;
    Kernel public kernel;
    address constant BUNDLER = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
    uint256 constant BUNDLER_PRIVATE_KEY = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    function setUp() external {
        // Deploy EntryPoint
        entryPoint = new EntryPoint();

        // Deploy Kernel with EntryPoint address
        kernel = new Kernel(address(entryPoint));
    }

    function testHandleOps() external {
        // Use the address corresponding to the private key 0x1234567890123456789012345678901234567890123456789012345678901234
        address user = 0x2e988A386a799F506693793c6A5AF6B54dfAaBfB;
        uint256 userPrivateKey = 0x1234567890123456789012345678901234567890123456789012345678901234;

        // Check initial balances
        console.log("EntryPoint address:", address(entryPoint));
        console.log("Kernel address:", address(kernel));
        console.log("User address:", user);
        console.log("Kernel balance before funding:", address(kernel).balance);
        console.log("User balance before funding:", user.balance);

        // Fund user address (in EIP-7702, the user account IS the wallet)
        vm.deal(user, 10 ether);
        console.log("User balance after funding:", user.balance);

        // Set EIP-7702 delegation code on user
        bytes memory delegationCode = new bytes(23);
        delegationCode[0] = 0xef;
        delegationCode[1] = 0x01;
        delegationCode[2] = 0x00;
        for (uint i = 0; i < 20; i++) {
            delegationCode[3 + i] = bytes20(address(kernel))[i];
        }
        vm.etch(user, delegationCode);
        console.log("User code length:", user.code.length);

        // Build UserOp
        Kernel.Call[] memory calls = new Kernel.Call[](1);
        calls[0] = Kernel.Call(BUNDLER, 0.001 ether, "");

        bytes memory callData = abi.encodeWithSelector(kernel.executeBatch.selector, calls);

        bytes32 accountGasLimits = bytes32(uint256(200000) << 128 | uint256(200000));
        bytes32 gasFees = bytes32(uint256(1 gwei) << 128 | uint256(1 gwei));

        PackedUserOperation memory userOp = PackedUserOperation({
            sender: user,
            nonce: 0,
            initCode: "",
            callData: callData,
            accountGasLimits: accountGasLimits,
            preVerificationGas: 21000,
            gasFees: gasFees,
            paymasterAndData: "",
            signature: ""
        });

        // Get UserOpHash and sign
        bytes32 userOpHash = entryPoint.getUserOpHash(userOp);
        console.log("UserOpHash:", uint256(userOpHash));

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userPrivateKey, userOpHash);

        bytes memory signature = new bytes(65);
        assembly {
            mstore(add(signature, 32), r)
            mstore(add(signature, 64), s)
            mstore8(add(signature, 96), v)
        }
        userOp.signature = signature;

        // Verify signature
        address recovered = ecrecover(userOpHash, v, r, s);
        console.log("Recovered:", recovered);
        console.log("Expected:", user);
        require(recovered == user, "Signature mismatch");

        // Send handleOps
        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = userOp;

        console.log("Bundler balance before:", BUNDLER.balance);

        vm.startBroadcast(BUNDLER_PRIVATE_KEY);
        entryPoint.handleOps(ops, payable(BUNDLER));
        vm.stopBroadcast();

        console.log("Bundler balance after:", BUNDLER.balance);
        console.log("Kernel balance after:", address(kernel).balance);

        require(BUNDLER.balance >= 0.001 ether, "Transfer not received");
        console.log("TEST PASSED!");
    }
}
