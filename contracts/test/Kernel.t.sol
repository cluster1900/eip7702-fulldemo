// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
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
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
}

contract MockTarget {
    uint256 public value;
    
    function setValue(uint256 _value) external {
        value = _value;
    }
    
    function revertCall() external pure {
        revert("Forced revert");
    }

    receive() external payable {}
}

contract KernelTest is Test {
    Kernel public kernel;
    MockERC20 public token;
    MockTarget public target;
    
    address public entryPoint = address(0xE47eee01);
    address public bundler = address(0xB0eee1eE);
    
    uint256 public userPrivateKey = 0xa11ce;
    address public user = vm.addr(userPrivateKey); // 从私钥生成正确的地址

    function setUp() public {
        kernel = new Kernel(entryPoint);
        token = new MockERC20();
        target = new MockTarget();
        
        // Fund user with tokens
        token.mint(user, 1000 * 10**18);
        
        // User approves Kernel to spend tokens
        vm.prank(user);
        token.approve(address(kernel), type(uint256).max);
        
        // Fund user and bundler with ETH
        vm.deal(user, 10 ether);
        vm.deal(bundler, 10 ether);
    }

    function testValidateUserOp_Success() public {
        Kernel.PackedUserOperation memory userOp = _createUserOp(user, 0);
        bytes32 userOpHash = keccak256("test hash");
        
        // Sign userOpHash
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userPrivateKey, userOpHash);
        userOp.signature = abi.encodePacked(r, s, v);
        
        // Simulate EntryPoint calling validateUserOp
        vm.prank(entryPoint);
        uint256 result = kernel.validateUserOp(userOp, userOpHash, 0);
        
        assertEq(result, 0, "Validation should succeed");
        assertEq(kernel.getNonce(user), 1, "Nonce should increment");
    }

    function testValidateUserOp_WithGasPayment() public {
        uint256 gasPayment = 10 * 10**18;
        bytes memory paymasterData = abi.encode(address(token), gasPayment);
        
        Kernel.PackedUserOperation memory userOp = _createUserOp(user, 0);
        userOp.paymasterAndData = paymasterData;
        
        bytes32 userOpHash = keccak256("test hash");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userPrivateKey, userOpHash);
        userOp.signature = abi.encodePacked(r, s, v);
        
        uint256 bundlerBalanceBefore = token.balanceOf(bundler);
        uint256 userBalanceBefore = token.balanceOf(user);
        
        // Use prank(entryPoint, bundler) to set tx.origin=bundler
        vm.prank(entryPoint, bundler);
        kernel.validateUserOp(userOp, userOpHash, gasPayment);
        
        assertEq(token.balanceOf(bundler), bundlerBalanceBefore + gasPayment, "Bundler should receive payment");
        assertEq(token.balanceOf(user), userBalanceBefore - gasPayment, "User should pay");
    }

    function testValidateUserOp_InvalidSignature() public {
        Kernel.PackedUserOperation memory userOp = _createUserOp(user, 0);
        bytes32 userOpHash = keccak256("test hash");
        
        // Wrong signature - all zeros
        userOp.signature = new bytes(65);
        
        vm.prank(entryPoint);
        vm.expectRevert(); // Expect any revert (could be "Invalid signature 'v' value" or InvalidSignature)
        kernel.validateUserOp(userOp, userOpHash, 0);
    }

    function testValidateUserOp_WrongNonce() public {
        Kernel.PackedUserOperation memory userOp = _createUserOp(user, 5); // Wrong nonce
        bytes32 userOpHash = keccak256("test hash");
        
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userPrivateKey, userOpHash);
        userOp.signature = abi.encodePacked(r, s, v);
        
        vm.prank(entryPoint);
        vm.expectRevert(Kernel.InvalidNonce.selector);
        kernel.validateUserOp(userOp, userOpHash, 0);
    }

    function testValidateUserOp_OnlyEntryPoint() public {
        Kernel.PackedUserOperation memory userOp = _createUserOp(user, 0);
        bytes32 userOpHash = keccak256("test hash");
        
        vm.prank(user); // Not EntryPoint
        vm.expectRevert(Kernel.OnlyEntryPoint.selector);
        kernel.validateUserOp(userOp, userOpHash, 0);
    }

    function testExecuteBatch_Success() public {
        Kernel.Call[] memory calls = new Kernel.Call[](2);
        calls[0] = Kernel.Call({
            target: address(target),
            value: 0,
            data: abi.encodeWithSignature("setValue(uint256)", 42)
        });
        calls[1] = Kernel.Call({
            target: address(target),
            value: 0,
            data: abi.encodeWithSignature("setValue(uint256)", 100)
        });
        
        vm.prank(entryPoint);
        kernel.executeBatch(calls);
        
        assertEq(target.value(), 100, "Final value should be 100");
    }

    function testExecuteBatch_FailedCall() public {
        Kernel.Call[] memory calls = new Kernel.Call[](2);
        calls[0] = Kernel.Call({
            target: address(target),
            value: 0,
            data: abi.encodeWithSignature("setValue(uint256)", 42)
        });
        calls[1] = Kernel.Call({
            target: address(target),
            value: 0,
            data: abi.encodeWithSignature("revertCall()")
        });
        
        vm.prank(entryPoint);
        vm.expectRevert(abi.encodeWithSelector(Kernel.CallFailed.selector, 1));
        kernel.executeBatch(calls);
        
        // First call should not be executed due to revert
        assertEq(target.value(), 0, "Value should remain 0 after batch revert");
    }

    function testExecuteBatch_OnlyEntryPoint() public {
        Kernel.Call[] memory calls = new Kernel.Call[](1);
        calls[0] = Kernel.Call({
            target: address(target),
            value: 0,
            data: abi.encodeWithSignature("setValue(uint256)", 42)
        });
        
        vm.prank(user); // Not EntryPoint
        vm.expectRevert(Kernel.OnlyEntryPoint.selector);
        kernel.executeBatch(calls);
    }

    function testGetNonce_NewAddress() public view {
        address newUser = address(0x123);
        assertEq(kernel.getNonce(newUser), 0, "New address should have nonce 0");
    }

    function testGetNonce_AfterExecution() public {
        Kernel.PackedUserOperation memory userOp = _createUserOp(user, 0);
        bytes32 userOpHash = keccak256("test hash");
        
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userPrivateKey, userOpHash);
        userOp.signature = abi.encodePacked(r, s, v);
        
        vm.prank(entryPoint);
        kernel.validateUserOp(userOp, userOpHash, 0);
        
        assertEq(kernel.getNonce(user), 1, "Nonce should increment after execution");
    }

    function _createUserOp(address sender, uint256 nonce) internal pure returns (Kernel.PackedUserOperation memory) {
        return Kernel.PackedUserOperation({
            sender: sender,
            nonce: nonce,
            callData: "",
            callGasLimit: 100000,
            verificationGasLimit: 100000,
            preVerificationGas: 21000,
            maxFeePerGas: 1 gwei,
            maxPriorityFeePerGas: 1 gwei,
            paymasterAndData: "",
            signature: ""
        });
    }
}
