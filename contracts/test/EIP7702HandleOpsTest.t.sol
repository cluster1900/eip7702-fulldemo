// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/Kernel.sol";
import { IEntryPoint } from "../../lib/account-abstraction/contracts/interfaces/IEntryPoint.sol";
import { PackedUserOperation } from "../../lib/account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import { EntryPoint } from "../../lib/account-abstraction/contracts/core/EntryPoint.sol";

struct Call {
    address to;
    uint256 value;
    bytes data;
}

contract EIP7702HandleOpsTest is Test {
    address constant ENTRY_POINT = 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789; // Mainnet standard
    address constant KERNEL = 0x1BBED5cE00949dc5b16E9f6A2e8A71F37c6FE86a;
    address constant USER_B = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC;
    uint256 constant USER_B_PRIVATE_KEY = 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a;
    address constant BUNDLER = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
    uint256 constant BUNDLER_PRIVATE_KEY = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    Kernel public kernel;
    EntryPoint public entryPoint;

    function setUp() external {
        entryPoint = EntryPoint(payable(ENTRY_POINT));
        kernel = Kernel(payable(KERNEL));
    }

    function testEIP7702WithHandleOps() external {
        console.log("EntryPoint:", ENTRY_POINT);
        console.log("Kernel:", KERNEL);
        
        // Step 1: Set EIP-7702 delegation
        bytes memory delegationCode = new bytes(23);
        delegationCode[0] = 0xef;
        delegationCode[1] = 0x01;
        delegationCode[2] = 0x00;
        for (uint i = 0; i < 20; i++) {
            delegationCode[3 + i] = bytes20(KERNEL)[i];
        }
        vm.etch(USER_B, delegationCode);
        
        console.log("User B code length after delegation:", USER_B.code.length);
        assertGt(USER_B.code.length, 0, "User B should have code after delegation");
        
        // Step 2: Fund the Kernel with ETH for prefund
        vm.deal(KERNEL, 1 ether);
        console.log("Kernel balance:", address(kernel).balance);
        
        // Step 3: Build UserOp callData - executeBatch with one transfer
        address recipient = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
        uint256 transferAmount = 0.001 ether;
        
        // Build Call[] using struct
        Call[] memory calls = new Call[](1);
        calls[0] = Call(recipient, transferAmount, "");
        
        // Build executeBatch calldata using abi.encode
        bytes memory callData = abi.encodeWithSelector(kernel.executeBatch.selector, calls);
        
        console.log("CallData length:", callData.length);
        
        // Build UserOp
        bytes32 accountGasLimits = bytes32(uint256(100000) << 128 | uint256(100000));
        bytes32 gasFees = bytes32(uint256(1 gwei) << 128 | uint256(1 gwei));
        
        PackedUserOperation memory userOp = PackedUserOperation({
            sender: USER_B,
            nonce: 0,
            initCode: "",
            callData: callData,
            accountGasLimits: accountGasLimits,
            preVerificationGas: 21000,
            gasFees: gasFees,
            paymasterAndData: "",
            signature: ""
        });
        
        // Get userOpHash from EntryPoint
        bytes32 userOpHash = entryPoint.getUserOpHash(userOp);
        console.log("userOpHash:", uint256(userOpHash));
        
        // Sign the userOpHash directly (no Ethereum prefix for ERC-4337)
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(USER_B_PRIVATE_KEY, userOpHash);
        
        // Build signature
        bytes memory signature = new bytes(65);
        assembly {
            mstore(add(signature, 32), r)
            mstore(add(signature, 64), s)
            mstore8(add(signature, 96), v)
        }
        userOp.signature = signature;
        
        console.log("Signature v:", v);
        console.log("Signature length:", signature.length);
        
        // Verify signature
        address recovered = ecrecover(userOpHash, v, r, s);
        console.log("Recovered address:", recovered);
        assertEq(recovered, USER_B, "Signature should recover to USER_B");
        
        // Check state before
        console.log("Kernel balance before handleOps:", address(kernel).balance);
        console.log("EntryPoint balance before:", address(ENTRY_POINT).balance);
        console.log("Recipient balance before:", recipient.balance);
        
        // Send through handleOps
        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = userOp;
        
        vm.startBroadcast(BUNDLER_PRIVATE_KEY);
        entryPoint.handleOps(ops, payable(BUNDLER));
        vm.stopBroadcast();
        
        // Verify results
        console.log("Kernel balance after handleOps:", address(kernel).balance);
        console.log("EntryPoint balance after:", address(ENTRY_POINT).balance);
        console.log("Recipient balance after:", recipient.balance);
        
        assertEq(recipient.balance, 10000.001 ether, "Recipient should receive transfer");
        
        console.log("EIP-7702 handleOps test PASSED!");
    }
}
