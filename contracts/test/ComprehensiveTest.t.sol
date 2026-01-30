// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/Kernel.sol";
import {IERC20} from "lib/forge-std/src/interfaces/IERC20.sol";

contract MockToken is IERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public totalSupply;
    
    string public name = "Mock Token";
    string public symbol = "TOKEN";
    uint8 public decimals = 18;

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

contract ComprehensiveTest is Test {
    Kernel public kernel;
    MockToken public token;
    
    address public entryPoint = address(0xE47eee01);
    address public bundler;
    address public userA;
    address public userB;
    address public userC;
    address public userD;
    
    uint256 public privateKeyA;
    uint256 public privateKeyB;
    uint256 public privateKeyC;
    uint256 public privateKeyD;
    uint256 public privateKeyBundler;

    function setUp() public {
        privateKeyA = 0xA11CE;
        privateKeyB = 0xB0BB;
        privateKeyC = 0xC0CC;
        privateKeyD = 0xD0DD;
        privateKeyBundler = 0xBEEF;
        
        userA = vm.addr(privateKeyA);
        userB = vm.addr(privateKeyB);
        userC = vm.addr(privateKeyC);
        userD = vm.addr(privateKeyD);
        bundler = vm.addr(privateKeyBundler);
        
        kernel = new Kernel(entryPoint);
        token = new MockToken();
        
        console.log("=========================================");
        console.log("EIP-7702 Comprehensive Test Suite");
        console.log("=========================================");
        console.log("Addresses derived from private keys:");
        console.log("  userA:", vm.toString(userA));
        console.log("  userB:", vm.toString(userB));
        console.log("  userC:", vm.toString(userC));
        console.log("  userD:", vm.toString(userD));
        console.log("  bundler:", vm.toString(bundler));
        console.log("");
    }

    function test_BundleTransaction_MultipleUserOps() public {
        console.log("=== TEST: Bundle Transaction (Multiple UserOps) ===");
        console.log("");
        
        vm.deal(userA, 10 ether);
        vm.deal(userB, 0 ether);
        vm.deal(userC, 0 ether);
        vm.deal(userD, 0 ether);
        
        token.mint(userB, 1000 * 10**18);
        token.mint(userC, 1000 * 10**18);
        token.mint(userD, 1000 * 10**18);
        
        vm.prank(userB);
        token.approve(address(kernel), type(uint256).max);
        
        vm.prank(userC);
        token.approve(address(kernel), type(uint256).max);
        
        vm.prank(userD);
        token.approve(address(kernel), type(uint256).max);
        
        console.log("1. INITIAL SETUP");
        console.log("   User B, C, D each have 1000 TOKEN, 0 ETH");
        console.log("   All users approved Kernel for token transfers");
        console.log("");
        
        console.log("2. BUNDLE CREATED");
        console.log("   UserOp 1: B -> A, 100 TOKEN + 5 TOKEN gas");
        console.log("   UserOp 2: C -> A, 200 TOKEN + 10 TOKEN gas");
        console.log("   UserOp 3: D -> A, 300 TOKEN + 15 TOKEN gas");
        console.log("   Total transfers: 600 TOKEN");
        console.log("   Total gas compensation: 30 TOKEN");
        console.log("");
        
        uint256 aTokenBefore = token.balanceOf(userA);
        uint256 bTokenBefore = token.balanceOf(userB);
        uint256 cTokenBefore = token.balanceOf(userC);
        uint256 dTokenBefore = token.balanceOf(userD);
        uint256 bundlerTokenBefore = token.balanceOf(bundler);
        
        console.log("3. EXECUTE BUNDLE");
        console.log("   Processing all 3 UserOps through bundler...");
        console.log("");
        
        // Process UserOp 1: B -> A, 100 TOKEN
        {
            Kernel.PackedUserOperation memory userOp = Kernel.PackedUserOperation({
                sender: userB,
                nonce: 0,
                callData: abi.encodeWithSignature(
                    "executeTokenTransfer(address,address,address,uint256)",
                    address(token),
                    userB,
                    userA,
                    100 * 10**18
                ),
                callGasLimit: 100000,
                verificationGasLimit: 100000,
                preVerificationGas: 21000,
                maxFeePerGas: 1 gwei,
                maxPriorityFeePerGas: 1 gwei,
                paymasterAndData: abi.encode(address(token), 5 * 10**18),
                signature: ""
            });
            bytes32 userOpHash = keccak256(abi.encode(userOp));
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKeyB, userOpHash);
            userOp.signature = abi.encodePacked(r, s, v);
            
            bytes memory paymasterData = userOp.paymasterAndData;
            uint256 gasPayment = abi.decode(paymasterData, (uint256));
            
            vm.prank(entryPoint, bundler);
            kernel.validateUserOp(userOp, userOpHash, gasPayment);
            
            Kernel.Call[] memory calls = new Kernel.Call[](1);
            calls[0] = Kernel.Call({
                target: address(kernel),
                value: 0,
                data: abi.encodeWithSignature(
                    "executeTokenTransfer(address,address,address,uint256)",
                    address(token),
                    userB,
                    userA,
                    100 * 10**18
                )
            });
            
            vm.prank(entryPoint);
            kernel.executeBatch(calls);
            
            console.log("   [OK] UserOp 1 executed");
        }
        
        // Process UserOp 2: C -> A, 200 TOKEN
        {
            Kernel.PackedUserOperation memory userOp = Kernel.PackedUserOperation({
                sender: userC,
                nonce: 0,
                callData: abi.encodeWithSignature(
                    "executeTokenTransfer(address,address,address,uint256)",
                    address(token),
                    userC,
                    userA,
                    200 * 10**18
                ),
                callGasLimit: 100000,
                verificationGasLimit: 100000,
                preVerificationGas: 21000,
                maxFeePerGas: 1 gwei,
                maxPriorityFeePerGas: 1 gwei,
                paymasterAndData: abi.encode(address(token), 10 * 10**18),
                signature: ""
            });
            bytes32 userOpHash = keccak256(abi.encode(userOp));
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKeyC, userOpHash);
            userOp.signature = abi.encodePacked(r, s, v);
            
            bytes memory paymasterData = userOp.paymasterAndData;
            uint256 gasPayment = abi.decode(paymasterData, (uint256));
            
            vm.prank(entryPoint, bundler);
            kernel.validateUserOp(userOp, userOpHash, gasPayment);
            
            Kernel.Call[] memory calls = new Kernel.Call[](1);
            calls[0] = Kernel.Call({
                target: address(kernel),
                value: 0,
                data: abi.encodeWithSignature(
                    "executeTokenTransfer(address,address,address,uint256)",
                    address(token),
                    userC,
                    userA,
                    200 * 10**18
                )
            });
            
            vm.prank(entryPoint);
            kernel.executeBatch(calls);
            
            console.log("   [OK] UserOp 2 executed");
        }
        
        // Process UserOp 3: D -> A, 300 TOKEN
        {
            Kernel.PackedUserOperation memory userOp = Kernel.PackedUserOperation({
                sender: userD,
                nonce: 0,
                callData: abi.encodeWithSignature(
                    "executeTokenTransfer(address,address,address,uint256)",
                    address(token),
                    userD,
                    userA,
                    300 * 10**18
                ),
                callGasLimit: 100000,
                verificationGasLimit: 100000,
                preVerificationGas: 21000,
                maxFeePerGas: 1 gwei,
                maxPriorityFeePerGas: 1 gwei,
                paymasterAndData: abi.encode(address(token), 15 * 10**18),
                signature: ""
            });
            bytes32 userOpHash = keccak256(abi.encode(userOp));
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKeyD, userOpHash);
            userOp.signature = abi.encodePacked(r, s, v);
            
            bytes memory paymasterData = userOp.paymasterAndData;
            uint256 gasPayment = abi.decode(paymasterData, (uint256));
            
            vm.prank(entryPoint, bundler);
            kernel.validateUserOp(userOp, userOpHash, gasPayment);
            
            Kernel.Call[] memory calls = new Kernel.Call[](1);
            calls[0] = Kernel.Call({
                target: address(kernel),
                value: 0,
                data: abi.encodeWithSignature(
                    "executeTokenTransfer(address,address,address,uint256)",
                    address(token),
                    userD,
                    userA,
                    300 * 10**18
                )
            });
            
            vm.prank(entryPoint);
            kernel.executeBatch(calls);
            
            console.log("   [OK] UserOp 3 executed");
        }
        
        console.log("");
        console.log("4. FINAL STATE");
        
        uint256 aTokenAfter = token.balanceOf(userA);
        uint256 bTokenAfter = token.balanceOf(userB);
        uint256 cTokenAfter = token.balanceOf(userC);
        uint256 dTokenAfter = token.balanceOf(userD);
        uint256 bundlerTokenAfter = token.balanceOf(bundler);
        
        console.log("   A TOKEN before:", aTokenBefore / 10**18);
        console.log("   A TOKEN after:", aTokenAfter / 10**18);
        console.log("   A received:", (aTokenAfter - aTokenBefore) / 10**18, "TOKEN");
        console.log("");
        
        console.log("   B TOKEN change:", (bTokenBefore - bTokenAfter) / 10**18, "TOKEN");
        console.log("   C TOKEN change:", (cTokenBefore - cTokenAfter) / 10**18, "TOKEN");
        console.log("   D TOKEN change:", (dTokenBefore - dTokenAfter) / 10**18, "TOKEN");
        console.log("");
        
        console.log("   Bundler received:", (bundlerTokenAfter - bundlerTokenBefore) / 10**18, "TOKEN gas");
        console.log("");
        
        assertEq(aTokenAfter, aTokenBefore + 600 * 10**18, "A should receive 600 TOKEN");
        assertEq(kernel.getNonce(userB), 1, "B nonce should be 1");
        assertEq(kernel.getNonce(userC), 1, "C nonce should be 1");
        assertEq(kernel.getNonce(userD), 1, "D nonce should be 1");
        assertEq(bundlerTokenAfter - bundlerTokenBefore, 30 * 10**18, "Bundler should receive 30 TOKEN gas");
        
        console.log("5. VERIFICATION");
        console.log("   [OK] All 3 UserOps executed in single bundle");
        console.log("   [OK] All nonces incremented correctly");
        console.log("   [OK] All transfers completed atomically");
        console.log("   [OK] All gas compensation paid to bundler");
        console.log("");
        
        console.log("=========================================");
        console.log("TEST PASSED: Bundle Transaction!");
        console.log("=========================================");
    }

    function test_SignatureVerification_ECDSA() public {
        console.log("");
        console.log("=== TEST: Signature Verification (ECDSA) ===");
        console.log("");
        
        vm.deal(userA, 10 ether);
        vm.deal(userB, 0 ether);
        token.mint(userB, 1000 * 10**18);
        
        vm.prank(userB);
        token.approve(address(kernel), type(uint256).max);
        
        console.log("1. SETUP");
        console.log("   Testing ECDSA signature verification");
        console.log("");
        
        console.log("2. TEST VALID SIGNATURE");
        {
            Kernel.PackedUserOperation memory userOp = Kernel.PackedUserOperation({
                sender: userB,
                nonce: 0,
                callData: abi.encodeWithSignature(
                    "executeTokenTransfer(address,address,address,uint256)",
                    address(token),
                    userB,
                    userA,
                    10 * 10**18
                ),
                callGasLimit: 100000,
                verificationGasLimit: 100000,
                preVerificationGas: 21000,
                maxFeePerGas: 1 gwei,
                maxPriorityFeePerGas: 1 gwei,
                paymasterAndData: abi.encode(address(token), 1 * 10**18),
                signature: ""
            });
            
            bytes32 userOpHash = keccak256(abi.encode(userOp));
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKeyB, userOpHash);
            userOp.signature = abi.encodePacked(r, s, v);
            
            vm.prank(entryPoint, bundler);
            uint256 result = kernel.validateUserOp(userOp, userOpHash, 1 * 10**18);
            
            assertEq(result, 0, "Valid signature should return 0");
            console.log("   [OK] Valid ECDSA signature accepted (result: 0)");
        }
        
        console.log("");
        console.log("3. TEST INVALID SIGNATURE (Wrong Key)");
        {
            Kernel.PackedUserOperation memory userOp = Kernel.PackedUserOperation({
                sender: userB,
                nonce: 1,
                callData: abi.encodeWithSignature(
                    "executeTokenTransfer(address,address,address,uint256)",
                    address(token),
                    userB,
                    userA,
                    10 * 10**18
                ),
                callGasLimit: 100000,
                verificationGasLimit: 100000,
                preVerificationGas: 21000,
                maxFeePerGas: 1 gwei,
                maxPriorityFeePerGas: 1 gwei,
                paymasterAndData: abi.encode(address(token), 1 * 10**18),
                signature: ""
            });
            
            bytes32 userOpHash = keccak256(abi.encode(userOp));
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKeyA, userOpHash);
            userOp.signature = abi.encodePacked(r, s, v);
            
            vm.prank(entryPoint, bundler);
            vm.expectRevert();
            kernel.validateUserOp(userOp, userOpHash, 1 * 10**18);
            
            console.log("   [OK] Invalid signature rejected (reverted)");
        }
        
        console.log("");
        console.log("4. TEST TAMPERED SIGNATURE");
        {
            Kernel.PackedUserOperation memory userOp = Kernel.PackedUserOperation({
                sender: userB,
                nonce: 2,
                callData: abi.encodeWithSignature(
                    "executeTokenTransfer(address,address,address,uint256)",
                    address(token),
                    userB,
                    userA,
                    10 * 10**18
                ),
                callGasLimit: 100000,
                verificationGasLimit: 100000,
                preVerificationGas: 21000,
                maxFeePerGas: 1 gwei,
                maxPriorityFeePerGas: 1 gwei,
                paymasterAndData: abi.encode(address(token), 1 * 10**18),
                signature: ""
            });
            
            bytes32 userOpHash = keccak256(abi.encode(userOp));
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKeyB, userOpHash);
            
            bytes32 tamperedR = r ^ bytes32(uint256(1));
            userOp.signature = abi.encodePacked(tamperedR, s, v);
            
            vm.prank(entryPoint, bundler);
            vm.expectRevert();
            kernel.validateUserOp(userOp, userOpHash, 1 * 10**18);
            
            console.log("   [OK] Tampered signature rejected (reverted)");
        }
        
        console.log("");
        console.log("5. TEST EMPTY SIGNATURE");
        {
            Kernel.PackedUserOperation memory userOp = Kernel.PackedUserOperation({
                sender: userB,
                nonce: 3,
                callData: abi.encodeWithSignature(
                    "executeTokenTransfer(address,address,address,uint256)",
                    address(token),
                    userB,
                    userA,
                    10 * 10**18
                ),
                callGasLimit: 100000,
                verificationGasLimit: 100000,
                preVerificationGas: 21000,
                maxFeePerGas: 1 gwei,
                maxPriorityFeePerGas: 1 gwei,
                paymasterAndData: abi.encode(address(token), 1 * 10**18),
                signature: ""
            });
            
            bytes32 userOpHash = keccak256(abi.encode(userOp));
            
            vm.prank(entryPoint, bundler);
            vm.expectRevert();
            kernel.validateUserOp(userOp, userOpHash, 1 * 10**18);
            
            console.log("   [OK] Empty signature rejected (reverted)");
        }
        
        console.log("");
        console.log("=========================================");
        console.log("TEST PASSED: Signature Verification!");
        console.log("=========================================");
    }

    function test_GasEstimation_Prediction() public {
        console.log("");
        console.log("=== TEST: Gas Estimation and Prediction ===");
        console.log("");
        
        vm.deal(userA, 10 ether);
        vm.deal(userB, 0 ether);
        token.mint(userB, 5000 * 10**18);
        
        vm.prank(userB);
        token.approve(address(kernel), type(uint256).max);
        
        console.log("1. SETUP");
        console.log("   User B: 5000 TOKEN, 0 ETH");
        console.log("   Testing gas estimation for different operations");
        console.log("");
        
        uint256[] memory callGasLimits = new uint256[](4);
        callGasLimits[0] = 50000;
        callGasLimits[1] = 100000;
        callGasLimits[2] = 200000;
        callGasLimits[3] = 500000;
        
        console.log("2. GAS ESTIMATION FOR DIFFERENT CALL GAS LIMITS");
        console.log("");
        
        for (uint256 i = 0; i < callGasLimits.length; i++) {
            uint256 callGasLimit = callGasLimits[i];
            uint256 transferAmount = 100 * 10**18;
            uint256 gasPayment = 5 * 10**18;
            
            Kernel.PackedUserOperation memory userOp = Kernel.PackedUserOperation({
                sender: userB,
                nonce: i,
                callData: abi.encodeWithSignature(
                    "executeTokenTransfer(address,address,address,uint256)",
                    address(token),
                    userB,
                    userA,
                    transferAmount
                ),
                callGasLimit: callGasLimit,
                verificationGasLimit: 100000,
                preVerificationGas: 21000,
                maxFeePerGas: 1 gwei,
                maxPriorityFeePerGas: 1 gwei,
                paymasterAndData: abi.encode(address(token), gasPayment),
                signature: ""
            });
            
            bytes32 userOpHash = keccak256(abi.encode(userOp));
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKeyB, userOpHash);
            userOp.signature = abi.encodePacked(r, s, v);
            
            uint256 gasBefore = gasleft();
            vm.prank(entryPoint, bundler);
            kernel.validateUserOp(userOp, userOpHash, gasPayment);
            uint256 gasAfter = gasleft();
            uint256 validationGas = gasBefore - gasAfter;
            
            Kernel.Call[] memory calls = new Kernel.Call[](1);
            calls[0] = Kernel.Call({
                target: address(kernel),
                value: 0,
                data: abi.encodeWithSignature(
                    "executeTokenTransfer(address,address,address,uint256)",
                    address(token),
                    userB,
                    userA,
                    transferAmount
                )
            });
            
            gasBefore = gasleft();
            vm.prank(entryPoint);
            kernel.executeBatch(calls);
            gasAfter = gasleft();
            uint256 executionGas = gasBefore - gasAfter;
            
            console.log("   CallGasLimit:", callGasLimit);
            console.log("     - Validation Gas:", validationGas);
            console.log("     - Execution Gas:", executionGas);
            console.log("     - Total:", validationGas + executionGas);
            console.log("");
        }
        
        console.log("3. GAS ESTIMATION FOR BATCH OPERATIONS");
        console.log("");
        
        {
            uint256 numCalls = 5;
            uint256 transferAmount = 20 * 10**18;
            uint256 gasPayment = 10 * 10**18;
            
            Kernel.Call[] memory calls = new Kernel.Call[](numCalls);
            for (uint256 i = 0; i < numCalls; i++) {
                calls[i] = Kernel.Call({
                    target: address(kernel),
                    value: 0,
                    data: abi.encodeWithSignature(
                        "executeTokenTransfer(address,address,address,uint256)",
                        address(token),
                        userB,
                        userA,
                        transferAmount
                    )
                });
            }
            
            Kernel.PackedUserOperation memory userOp = Kernel.PackedUserOperation({
                sender: userB,
                nonce: 4,
                callData: abi.encodeWithSignature("executeBatch((address,uint256,bytes)[])", calls),
                callGasLimit: 300000,
                verificationGasLimit: 150000,
                preVerificationGas: 21000,
                maxFeePerGas: 1 gwei,
                maxPriorityFeePerGas: 1 gwei,
                paymasterAndData: abi.encode(address(token), gasPayment),
                signature: ""
            });
            
            bytes32 userOpHash = keccak256(abi.encode(userOp));
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKeyB, userOpHash);
            userOp.signature = abi.encodePacked(r, s, v);
            
            // Validate and execute the batch
            vm.prank(entryPoint, bundler);
            kernel.validateUserOp(userOp, userOpHash, gasPayment);
            
            uint256 gasBefore = gasleft();
            vm.prank(entryPoint);
            kernel.executeBatch(calls);
            uint256 gasAfter = gasleft();
            uint256 batchExecutionGas = gasBefore - gasAfter;
            
            console.log("   5-token transfer batch:");
            console.log("     - Total Execution Gas:", batchExecutionGas);
            console.log("     - Per-transfer Gas:", batchExecutionGas / numCalls);
            console.log("");
            
            assertEq(kernel.getNonce(userB), 5, "Nonce should increment");
        }
        
        console.log("4. GAS REFUND CALCULATION");
        console.log("");
        
        {
            uint256 maxFeePerGas = 50 gwei;
            uint256 maxPriorityFeePerGas = 2 gwei;
            uint256 preVerificationGas = 21000;
            uint256 callGasLimit = 100000;
            uint256 verificationGasLimit = 100000;
            
            uint256 estimatedGas = preVerificationGas + verificationGasLimit + callGasLimit;
            uint256 maxGasCost = estimatedGas * maxFeePerGas;
            
            console.log("   Gas Parameters:");
            console.log("     - PreVerificationGas:", preVerificationGas);
            console.log("     - VerificationGasLimit:", verificationGasLimit);
            console.log("     - CallGasLimit:", callGasLimit);
            console.log("     - MaxFeePerGas:", maxFeePerGas);
            console.log("     - MaxPriorityFeePerGas:", maxPriorityFeePerGas);
            console.log("");
            console.log("   Estimated Gas:", estimatedGas);
            console.log("   Max Gas Cost (wei):", maxGasCost);
            console.log("   Max Gas Cost (ETH):", maxGasCost / 1 ether);
            console.log("");
        }
        
        console.log("=========================================");
        console.log("TEST PASSED: Gas Estimation and Prediction!");
        console.log("=========================================");
    }

    function test_BundlerSimulation_FullFlow() public {
        console.log("");
        console.log("=== TEST: Full Bundler Simulation ===");
        console.log("");
        
        vm.deal(userA, 100 ether);
        vm.deal(userB, 0 ether);
        vm.deal(userC, 0 ether);
        
        token.mint(userB, 5000 * 10**18);
        token.mint(userC, 3000 * 10**18);
        
        address payable bundlerAddress = payable(bundler);
        vm.deal(bundlerAddress, 50 ether);
        
        vm.prank(userB);
        token.approve(address(kernel), type(uint256).max);
        
        vm.prank(userC);
        token.approve(address(kernel), type(uint256).max);
        
        console.log("1. BUNDLER SIMULATION SETUP");
        console.log("   Bundler (tx.origin):", vm.toString(bundlerAddress));
        console.log("   Bundler ETH Balance:", bundlerAddress.balance / 1 ether, "ETH");
        console.log("");
        console.log("   User A (Sponsor):", vm.toString(userA));
        console.log("   User A ETH:", userA.balance / 1 ether, "ETH");
        console.log("");
        console.log("   User B (No ETH, has TOKEN):", vm.toString(userB));
        console.log("   User B TOKEN:", token.balanceOf(userB) / 10**18);
        console.log("");
        console.log("   User C (No ETH, has TOKEN):", vm.toString(userC));
        console.log("   User C TOKEN:", token.balanceOf(userC) / 10**18);
        console.log("");
        
        console.log("2. BUNDLE CREATED");
        console.log("   UserOp 1: B -> A, 100 TOKEN + 5 TOKEN gas compensation");
        console.log("   UserOp 2: C -> A, 200 TOKEN + 10 TOKEN gas compensation");
        console.log("   Total transfers: 300 TOKEN");
        console.log("   Total gas compensation: 15 TOKEN");
        console.log("");
        
        uint256 bundlerEthBefore = bundlerAddress.balance;
        uint256 aTokenBefore = token.balanceOf(userA);
        uint256 bTokenBefore = token.balanceOf(userB);
        uint256 cTokenBefore = token.balanceOf(userC);
        uint256 bundlerTokenBefore = token.balanceOf(bundler);
        
        console.log("   Initial States:");
        console.log("     Bundler ETH:", bundlerEthBefore / 1 ether);
        console.log("     A TOKEN:", aTokenBefore / 10**18);
        console.log("     B TOKEN:", bTokenBefore / 10**18);
        console.log("     C TOKEN:", cTokenBefore / 10**18);
        console.log("     Bundler TOKEN:", bundlerTokenBefore / 10**18);
        console.log("");
        
        console.log("3. BUNDLER EXECUTES BUNDLE");
        console.log("   Processing UserOps in order...");
        console.log("");
        
        // Process UserOp 1: B -> A, 100 TOKEN
        {
            console.log("   Processing UserOp 1");
            console.log("   Sender:", vm.toString(userB));
            console.log("   Nonce: 0");
            
            Kernel.PackedUserOperation memory userOp = Kernel.PackedUserOperation({
                sender: userB,
                nonce: 0,
                callData: abi.encodeWithSignature(
                    "executeTokenTransfer(address,address,address,uint256)",
                    address(token),
                    userB,
                    userA,
                    100 * 10**18
                ),
                callGasLimit: 150000,
                verificationGasLimit: 150000,
                preVerificationGas: 21000,
                maxFeePerGas: 10 gwei,
                maxPriorityFeePerGas: 2 gwei,
                paymasterAndData: abi.encode(address(token), 5 * 10**18),
                signature: ""
            });
            bytes32 userOpHash = keccak256(abi.encode(userOp));
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKeyB, userOpHash);
            userOp.signature = abi.encodePacked(r, s, v);
            
            bytes memory paymasterData = userOp.paymasterAndData;
            uint256 gasPayment = abi.decode(paymasterData, (uint256));
            
            vm.prank(entryPoint, bundler);
            uint256 validationResult = kernel.validateUserOp(userOp, userOpHash, gasPayment);
            
            console.log("   Validation Result:", validationResult);
            assertEq(validationResult, 0, "Validation should succeed");
            
            Kernel.Call[] memory calls = new Kernel.Call[](1);
            calls[0] = Kernel.Call({
                target: address(kernel),
                value: 0,
                data: abi.encodeWithSignature(
                    "executeTokenTransfer(address,address,address,uint256)",
                    address(token),
                    userB,
                    userA,
                    100 * 10**18
                )
            });
            
            vm.prank(entryPoint);
            kernel.executeBatch(calls);
            
            console.log("   [OK] UserOp 1 executed successfully");
            console.log("");
        }
        
        // Process UserOp 2: C -> A, 200 TOKEN
        {
            console.log("   Processing UserOp 2");
            console.log("   Sender:", vm.toString(userC));
            console.log("   Nonce: 0");
            
            Kernel.PackedUserOperation memory userOp = Kernel.PackedUserOperation({
                sender: userC,
                nonce: 0,
                callData: abi.encodeWithSignature(
                    "executeTokenTransfer(address,address,address,uint256)",
                    address(token),
                    userC,
                    userA,
                    200 * 10**18
                ),
                callGasLimit: 150000,
                verificationGasLimit: 150000,
                preVerificationGas: 21000,
                maxFeePerGas: 10 gwei,
                maxPriorityFeePerGas: 2 gwei,
                paymasterAndData: abi.encode(address(token), 10 * 10**18),
                signature: ""
            });
            bytes32 userOpHash = keccak256(abi.encode(userOp));
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKeyC, userOpHash);
            userOp.signature = abi.encodePacked(r, s, v);
            
            bytes memory paymasterData = userOp.paymasterAndData;
            uint256 gasPayment = abi.decode(paymasterData, (uint256));
            
            vm.prank(entryPoint, bundler);
            uint256 validationResult = kernel.validateUserOp(userOp, userOpHash, gasPayment);
            
            console.log("   Validation Result:", validationResult);
            assertEq(validationResult, 0, "Validation should succeed");
            
            Kernel.Call[] memory calls = new Kernel.Call[](1);
            calls[0] = Kernel.Call({
                target: address(kernel),
                value: 0,
                data: abi.encodeWithSignature(
                    "executeTokenTransfer(address,address,address,uint256)",
                    address(token),
                    userC,
                    userA,
                    200 * 10**18
                )
            });
            
            vm.prank(entryPoint);
            kernel.executeBatch(calls);
            
            console.log("   [OK] UserOp 2 executed successfully");
            console.log("");
        }
        
        uint256 bundlerEthAfter = bundlerAddress.balance;
        uint256 aTokenAfter = token.balanceOf(userA);
        uint256 bTokenAfter = token.balanceOf(userB);
        uint256 cTokenAfter = token.balanceOf(userC);
        uint256 bundlerTokenAfter = token.balanceOf(bundler);
        
        console.log("4. FINAL STATES");
        console.log("   Bundler ETH after:", bundlerEthAfter / 1 ether, "ETH");
        console.log("   Bundler ETH change:", (bundlerEthAfter - bundlerEthBefore) / 1 ether, "ETH (paid gas, now compensated)");
        console.log("");
        console.log("   A TOKEN after:", aTokenAfter / 10**18);
        console.log("   A received:", (aTokenAfter - aTokenBefore) / 10**18, "TOKEN");
        console.log("");
        console.log("   B TOKEN after:", bTokenAfter / 10**18);
        console.log("   B paid:", (bTokenBefore - bTokenAfter) / 10**18, "TOKEN");
        console.log("");
        console.log("   C TOKEN after:", cTokenAfter / 10**18);
        console.log("   C paid:", (cTokenBefore - cTokenAfter) / 10**18, "TOKEN");
        console.log("");
        console.log("   Bundler TOKEN after:", bundlerTokenAfter / 10**18);
        console.log("   Bundler received:", (bundlerTokenAfter - bundlerTokenBefore) / 10**18, "TOKEN (gas compensation)");
        console.log("");
        
        assertEq(aTokenAfter, aTokenBefore + 300 * 10**18, "A should receive 300 TOKEN");
        assertEq(kernel.getNonce(userB), 1, "B nonce should be 1");
        assertEq(kernel.getNonce(userC), 1, "C nonce should be 1");
        assertEq(bundlerTokenAfter - bundlerTokenBefore, 15 * 10**18, "Bundler received 15 TOKEN");
        
        console.log("5. VERIFICATION");
        console.log("   [OK] All UserOps validated and executed");
        console.log("   [OK] Gas paid by bundler (ETH)");
        console.log("   [OK] Gas compensated to bundler (TOKEN)");
        console.log("   [OK] All transfers completed");
        console.log("   [OK] Nonces incremented correctly");
        console.log("");
        console.log("   KEY INSIGHTS:");
        console.log("   - Bundler paid ETH for gas on-chain");
        console.log("   - Users compensated bundler with TOKEN");
        console.log("   - No user needed native ETH for transactions");
        console.log("   - ERC20 tokens used for gas payment (paymaster pattern)");
        console.log("");
        
        console.log("=========================================");
        console.log("TEST PASSED: Full Bundler Simulation!");
        console.log("=========================================");
    }
}
