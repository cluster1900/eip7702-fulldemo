// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/Kernel.sol";
import "./Kernel.t.sol"; // Import MockERC20 and MockTarget

/**
 * 端到端集成测试: 完整EIP-7702流程
 * 场景: A有USDC(无ETH), B是Bundler(有ETH), A用USDC支付gas执行批量交易
 */
contract E2EIntegrationTest is Test {
    Kernel public kernel;
    MockERC20 public usdc;
    MockTarget public target;
    
    address public bundler = address(0xBEEF);
    address public userA = vm.addr(1); // Derived from userAKey
    address public userC = address(0xC0FFEE);
    address public entryPoint = address(0xE47eee01);
    
    uint256 public userAKey = 0x1; // Simple test key

    function setUp() public {
        // Deploy contracts
        kernel = new Kernel(entryPoint);
        usdc = new MockERC20();
        target = new MockTarget();
        
        // Fund
        vm.deal(bundler, 10 ether);
        usdc.mint(userA, 1000 * 10**18);
        
        // A approves Kernel to spend USDC
        vm.prank(userA);
        usdc.approve(address(kernel), type(uint256).max);
    }

    function test_E2E_FullFlow() public {
        console.log("=== EIP-7702 E2E Integration Test ===");
        console.log("");
        
        // 1. Initial state
        console.log("1. Initial State:");
        console.log("   User A:");
        console.log("     Address:", userA);
        console.log("     USDC:", usdc.balanceOf(userA) / 10**18, "USDC");
        console.log("     ETH:", userA.balance / 10**18, "ETH (ZERO - no gas)");
        console.log("     Nonce:", kernel.getNonce(userA));
        console.log("   Bundler:");
        console.log("     Address:", bundler);
        console.log("     USDC:", usdc.balanceOf(bundler) / 10**18);
        console.log("     ETH:", bundler.balance / 10**18, "ETH");
        console.log("   User C:");
        console.log("     USDC:", usdc.balanceOf(userC) / 10**18);
        console.log("");
        
        // 2. Build UserOp: Batch(setValue + transfer USDC)
        console.log("2. Build UserOp (batch 2 calls):");
        Kernel.Call[] memory calls = new Kernel.Call[](2);
        calls[0] = Kernel.Call({
            target: address(target),
            value: 0,
            data: abi.encodeWithSignature("setValue(uint256)", 888)
        });
        calls[1] = Kernel.Call({
            target: address(usdc),
            value: 0,
            data: abi.encodeWithSignature("transferFrom(address,address,uint256)", userA, userC, 50 * 10**18)
        });
        console.log("   Call 1: target.setValue(888)");
        console.log("   Call 2: usdc.transferFrom(A, C, 50 USDC)");
        console.log("");
        
        uint256 gasPayment = 10 * 10**18; // 10 USDC for gas
        bytes memory paymasterData = abi.encode(address(usdc), gasPayment);
        
        Kernel.PackedUserOperation memory userOp = Kernel.PackedUserOperation({
            sender: userA,
            nonce: kernel.getNonce(userA),
            callData: abi.encodeWithSignature("executeBatch((address,uint256,bytes)[])", calls),
            callGasLimit: 200000,
            verificationGasLimit: 150000,
            preVerificationGas: 21000,
            maxFeePerGas: 2 gwei,
            maxPriorityFeePerGas: 1 gwei,
            paymasterAndData: paymasterData,
            signature: ""
        });
        
        // Sign UserOp (hash all fields properly)
        bytes32 userOpHash = keccak256(abi.encode(
            userOp.sender,
            userOp.nonce,
            userOp.callData,
            userOp.callGasLimit,
            userOp.verificationGasLimit,
            userOp.preVerificationGas,
            userOp.maxFeePerGas,
            userOp.maxPriorityFeePerGas,
            userOp.paymasterAndData
        ));
        (uint8 v, bytes32 r, bytes32 s_sig) = vm.sign(userAKey, userOpHash);
        userOp.signature = abi.encodePacked(r, s_sig, v);
        
        console.log("3. Sign UserOp:");
        console.log("   Signer: User A");
        console.log("   PaymasterData: 10 USDC to Bundler");
        console.log("");
        
        // Record balances before
        uint256 bundlerUsdcBefore = usdc.balanceOf(bundler);
        uint256 userAUsdcBefore = usdc.balanceOf(userA);
        
        // 4. Execute: validateUserOp (as EntryPoint)
        console.log("4. Execute validateUserOp:");
        vm.prank(entryPoint, bundler); // Set msg.sender=entryPoint, tx.origin=bundler
        uint256 validationResult = kernel.validateUserOp(userOp, userOpHash, gasPayment);
        
        console.log("   Result:", validationResult);
        console.log("   Gas payment processed:");
        console.log("     Bundler USDC +", (usdc.balanceOf(bundler) - bundlerUsdcBefore) / 10**18);
        console.log("     User A USDC -", (userAUsdcBefore - usdc.balanceOf(userA)) / 10**18);
        console.log("");
        
        // 5. Execute: executeBatch
        console.log("5. Execute executeBatch:");
        vm.prank(entryPoint);
        kernel.executeBatch(calls);
        
        console.log("   Batch executed successfully");
        console.log("   Target value:", target.value());
        console.log("   User C USDC:", usdc.balanceOf(userC) / 10**18);
        console.log("");
        
        // 6. Verify results
        console.log("6. Final Verification:");
        assertEq(target.value(), 888, "Target value should be 888");
        assertEq(usdc.balanceOf(userA), 940 * 10**18, "A should have 940 USDC (1000-50-10)");
        assertEq(usdc.balanceOf(bundler), 10 * 10**18, "Bundler should have 10 USDC");
        assertEq(usdc.balanceOf(userC), 50 * 10**18, "C should have 50 USDC");
        assertEq(kernel.getNonce(userA), 1, "Nonce should increment to 1");
        assertEq(userA.balance, 0, "A should still have 0 ETH (gasless)");
        
        console.log("   OK Target value: 888");
        console.log("   OK A USDC: 940 (1000 - 50 transfer - 10 gas)");
        console.log("   OK Bundler USDC: 10 (gas payment)");
        console.log("   OK C USDC: 50 (received)");
        console.log("   OK A nonce: 1 (incremented)");
        console.log("   OK A ETH: 0 (GASLESS!)");
        console.log("");
        console.log("SUCCESS EIP-7702 Full Flow Test!");
    }
}
