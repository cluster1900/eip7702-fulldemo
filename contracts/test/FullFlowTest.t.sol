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

contract FullFlowTest is Test {
    Kernel public kernel;
    MockToken public token;
    
    address public entryPoint = address(0xE47eee01);
    address public bundler;
    address public userA;
    address public userB;
    
    uint256 public privateKeyA;
    uint256 public privateKeyB;
    uint256 public privateKeyBundler;

    function setUp() public {
        privateKeyA = 0xA11CE;
        privateKeyB = 0xB0BB;
        privateKeyBundler = 0xBEEF;
        
        userA = vm.addr(privateKeyA);
        userB = vm.addr(privateKeyB);
        bundler = vm.addr(privateKeyBundler);
        
        kernel = new Kernel(entryPoint);
        token = new MockToken();
        
        console.log("=========================================");
        console.log("EIP-7702 Full Paymaster Flow Test");
        console.log("=========================================");
        console.log("");
    }

    function test_FullPaymasterFlow_TransferWithGasCompensation() public {
        console.log("=== TEST: Full Paymaster Gas Compensation Flow ===");
        console.log("");
        
        // Step 1: Setup - A has native tokens, B has tokens
        console.log("1. INITIAL SETUP");
        console.log("----------------");
        
        vm.deal(userA, 100 ether);  // A has native ETH for potential gas
        vm.deal(userB, 0 ether);     // B has no native ETH
        token.mint(userB, 5000 * 10**18);  // B has tokens
        
        console.log("   User A (Paymaster/Sponsor):");
        console.log("     Address:", vm.toString(userA));
        console.log("     ETH Balance:", userA.balance / 1 ether, "ETH");
        console.log("     Token Balance:", token.balanceOf(userA) / 10**18, "TOKEN");
        console.log("");
        
        console.log("   User B (Delegator/TokenHolder):");
        console.log("     Address:", vm.toString(userB));
        console.log("     ETH Balance:", userB.balance / 1 ether, "ETH (NO NATIVE TOKEN)");
        console.log("     Token Balance:", token.balanceOf(userB) / 10**18, "TOKEN");
        console.log("");
        
        assertEq(userA.balance, 100 ether, "A should have 100 ETH");
        assertEq(userB.balance, 0 ether, "B should have 0 ETH");
        assertEq(token.balanceOf(userB), 5000 * 10**18, "B should have 5000 tokens");
        
        // B approves Kernel to spend tokens (for gas payment)
        vm.prank(userB);
        token.approve(address(kernel), type(uint256).max);
        console.log("   [OK] B approved Kernel to spend tokens for gas");
        console.log("");
        
        // Step 2: UserOp - B transfers tokens to A with gas compensation to bundler
        console.log("2. BUILD USEROP (B transfers to A, pays gas via tokens)");
        console.log("--------------------------------------------------------");
        
        uint256 gasPaymentAmount = 10 * 10**18;  // 10 tokens as gas payment
        uint256 transferAmount = 100 * 10**18;   // B transfers 100 tokens to A
        
        // Create UserOp where B transfers to A using executeTokenTransfer
        Kernel.PackedUserOperation memory userOp = Kernel.PackedUserOperation({
            sender: userB,
            nonce: 0,
            callData: abi.encodeWithSignature(
                "executeTokenTransfer(address,address,address,uint256)",
                address(token),
                userB,
                userA,
                transferAmount
            ),
            callGasLimit: 100000,
            verificationGasLimit: 100000,
            preVerificationGas: 21000,
            maxFeePerGas: 1 gwei,
            maxPriorityFeePerGas: 1 gwei,
            paymasterAndData: abi.encode(address(token), gasPaymentAmount),
            signature: ""
        });
        
        // Sign the UserOp with B's key
        bytes32 userOpHash = keccak256(abi.encode(userOp));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKeyB, userOpHash);
        userOp.signature = abi.encodePacked(r, s, v);
        
        console.log("   UserOp Details:");
        console.log("     - Sender (B):", vm.toString(userB));
        console.log("     - CallData: transfer", transferAmount / 10**18, "TOKEN to A via Kernel");
        console.log("     - PaymasterAndData: TOKEN +", gasPaymentAmount / 10**18, "TOKEN for gas");
        console.log("     - Nonce: 0");
        console.log("");
        
        // Record balances before
        uint256 aTokenBefore = token.balanceOf(userA);
        uint256 bTokenBefore = token.balanceOf(userB);
        uint256 bundlerTokenBefore = token.balanceOf(bundler);
        uint256 bNonceBefore = kernel.getNonce(userB);
        
        console.log("   Balances Before:");
        console.log("     - A TOKEN:", aTokenBefore / 10**18);
        console.log("     - B TOKEN:", bTokenBefore / 10**18);
        console.log("     - Bundler TOKEN:", bundlerTokenBefore / 10**18);
        console.log("     - B Nonce:", bNonceBefore);
        console.log("");
        
        // Step 3: Execute validateUserOp
        console.log("3. EXECUTE VALIDATEUSEROP (Gas Payment)");
        console.log("----------------------------------------");
        
        vm.prank(entryPoint, bundler);
        uint256 validationResult = kernel.validateUserOp(userOp, userOpHash, gasPaymentAmount);
        
        console.log("   Validation Result:", validationResult);
        assertEq(validationResult, 0, "Validation should succeed");
        console.log("   [OK] Validation passed!");
        
        // Check gas payment
        uint256 bundlerTokenAfter = token.balanceOf(bundler);
        console.log("   Gas Payment:");
        console.log("     - Bundler received:", (bundlerTokenAfter - bundlerTokenBefore) / 10**18, "TOKEN");
        console.log("");
        
        // Step 4: Execute the actual transfer
        console.log("4. EXECUTE BATCH (Token Transfer)");
        console.log("---------------------------------");
        
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
        
        vm.prank(entryPoint);
        kernel.executeBatch(calls);
        
        console.log("   [OK] Transfer executed successfully!");
        console.log("");
        
        // Step 5: Final state verification
        console.log("5. FINAL STATE VERIFICATION");
        console.log("---------------------------");
        
        uint256 aTokenAfter = token.balanceOf(userA);
        uint256 bTokenAfter = token.balanceOf(userB);
        uint256 bNonceAfter = kernel.getNonce(userB);
        
        console.log("   Balances After:");
        console.log("     - A TOKEN:", aTokenAfter / 10**18);
        console.log("     - B TOKEN:", bTokenAfter / 10**18);
        console.log("     - B Nonce:", bNonceAfter);
        console.log("");
        
        // Assertions
        console.log("   Assertions:");
        
        assertEq(aTokenAfter, aTokenBefore + transferAmount, "A should receive transfer");
        console.log("     [OK] A received", transferAmount / 10**18, "TOKEN");
        
        assertEq(bTokenAfter, bTokenBefore - transferAmount - gasPaymentAmount, "B should pay transfer + gas");
        console.log("     [OK] B paid", (transferAmount + gasPaymentAmount) / 10**18, "TOKEN total");
        
        assertEq(bNonceAfter, bNonceBefore + 1, "B nonce should increment");
        console.log("     [OK] B Nonce incremented from", bNonceBefore, "to", bNonceAfter);
        
        console.log("");
        console.log("   KEY RESULTS:");
        console.log("     - B had NO native ETH but executed transaction!");
        console.log("     - B used TOKEN to pay gas via paymaster!");
        console.log("     - Transfer completed successfully via executeTokenTransfer!");
        console.log("");
        
        console.log("=========================================");
        console.log("TEST PASSED: Full Paymaster Flow!");
        console.log("=========================================");
    }

    function test_BatchTransfersWithGasCompensation() public {
        console.log("");
        console.log("=== TEST: Batch Transfers with Gas Compensation ===");
        console.log("");
        
        // Setup
        vm.deal(userA, 50 ether);
        vm.deal(userB, 0 ether);
        token.mint(userB, 10000 * 10**18);
        
        vm.prank(userB);
        token.approve(address(kernel), type(uint256).max);
        
        console.log("1. SETUP");
        console.log("   - A: 50 ETH");
        console.log("   - B: 10000 TOKEN, 0 ETH");
        console.log("");
        
        // Build batch UserOp
        uint256 gasCompensation = 5 * 10**18;
        
        // Create batch calls - 3 transfers totaling 100 TOKEN
        Kernel.Call[] memory calls = new Kernel.Call[](3);
        calls[0] = Kernel.Call({
            target: address(kernel),
            value: 0,
            data: abi.encodeWithSignature(
                "executeTokenTransfer(address,address,address,uint256)",
                address(token),
                userB,
                userA,
                50 * 10**18
            )
        });
        calls[1] = Kernel.Call({
            target: address(kernel),
            value: 0,
            data: abi.encodeWithSignature(
                "executeTokenTransfer(address,address,address,uint256)",
                address(token),
                userB,
                userA,
                30 * 10**18
            )
        });
        calls[2] = Kernel.Call({
            target: address(kernel),
            value: 0,
            data: abi.encodeWithSignature(
                "executeTokenTransfer(address,address,address,uint256)",
                address(token),
                userB,
                userA,
                20 * 10**18
            )
        });
        
        Kernel.PackedUserOperation memory userOp = Kernel.PackedUserOperation({
            sender: userB,
            nonce: 0,
            callData: abi.encodeWithSignature("executeBatch((address,uint256,bytes)[])", calls),
            callGasLimit: 200000,
            verificationGasLimit: 150000,
            preVerificationGas: 21000,
            maxFeePerGas: 1 gwei,
            maxPriorityFeePerGas: 1 gwei,
            paymasterAndData: abi.encode(address(token), gasCompensation),
            signature: ""
        });
        
        bytes32 userOpHash = keccak256(abi.encode(userOp));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKeyB, userOpHash);
        userOp.signature = abi.encodePacked(r, s, v);
        
        console.log("2. BATCH USEROP");
        console.log("   - 3 transfers: 50 + 30 + 20 = 100 TOKEN");
        console.log("   - Gas compensation: 5 TOKEN");
        console.log("");
        
        uint256 aTokenBefore = token.balanceOf(userA);
        uint256 bTokenBefore = token.balanceOf(userB);
        
        // Execute validateUserOp
        vm.prank(entryPoint, bundler);
        kernel.validateUserOp(userOp, userOpHash, gasCompensation);
        
        // Execute batch
        vm.prank(entryPoint);
        kernel.executeBatch(calls);
        
        console.log("3. EXECUTION COMPLETE");
        
        uint256 aTokenAfter = token.balanceOf(userA);
        uint256 bTokenAfter = token.balanceOf(userB);
        
        console.log("   - A TOKEN before:", aTokenBefore / 10**18);
        console.log("   - A TOKEN after:", aTokenAfter / 10**18);
        console.log("   - A received:", (aTokenAfter - aTokenBefore) / 10**18, "TOKEN");
        console.log("");
        
        assertEq(aTokenAfter, aTokenBefore + 100 * 10**18, "A should receive 100 TOKEN");
        assertEq(bTokenAfter, bTokenBefore - 105 * 10**18, "B paid 105 TOKEN total");
        assertEq(kernel.getNonce(userB), 1, "B nonce incremented");
        
        console.log("4. VERIFICATION");
        console.log("   [OK] All 3 transfers executed atomically");
        console.log("   [OK] Gas compensation processed");
        console.log("");
        
        console.log("=========================================");
        console.log("TEST PASSED: Batch Transfers with Gas!");
        console.log("=========================================");
    }

    function test_GaslessSponsorFlow() public {
        console.log("");
        console.log("=== TEST: Gasless Sponsor Flow (A sponsors B) ===");
        console.log("");
        
        // Scenario: A sponsors B's gasless transaction
        vm.deal(userA, 100 ether);
        vm.deal(userB, 0 ether);
        token.mint(userA, 1000 * 10**18);  // A has tokens
        token.mint(userB, 200 * 10**18);   // B has tokens
        
        vm.prank(userA);
        token.approve(address(kernel), type(uint256).max);
        
        vm.prank(userB);
        token.approve(address(kernel), type(uint256).max);
        
        console.log("1. SETUP: A sponsors B's gasless transaction");
        console.log("   - A: 100 ETH, 1000 TOKEN");
        console.log("   - B: 0 ETH, 200 TOKEN");
        console.log("");
        
        // B creates UserOp with A as payee
        uint256 gasCost = 2 * 10**18;
        
        Kernel.PackedUserOperation memory userOp = Kernel.PackedUserOperation({
            sender: userB,
            nonce: 0,
            callData: abi.encodeWithSignature(
                "executeTokenTransfer(address,address,address,uint256)",
                address(token),
                userB,
                userA,
                50 * 10**18
            ),
            callGasLimit: 100000,
            verificationGasLimit: 100000,
            preVerificationGas: 21000,
            maxFeePerGas: 1 gwei,
            maxPriorityFeePerGas: 1 gwei,
            paymasterAndData: abi.encode(address(token), gasCost),
            signature: ""
        });
        
        bytes32 userOpHash = keccak256(abi.encode(userOp));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKeyB, userOpHash);
        userOp.signature = abi.encodePacked(r, s, v);
        
        console.log("2. USEROP: B transfers 50 TOKEN to A, pays 2 TOKEN gas");
        console.log("");
        
        uint256 aTokenBefore = token.balanceOf(userA);
        uint256 bTokenBefore = token.balanceOf(userB);
        
        // Execute via bundler (tx.origin)
        vm.prank(entryPoint, bundler);
        kernel.validateUserOp(userOp, userOpHash, gasCost);
        
        Kernel.Call[] memory calls = new Kernel.Call[](1);
        calls[0] = Kernel.Call({
            target: address(kernel),
            value: 0,
            data: abi.encodeWithSignature(
                "executeTokenTransfer(address,address,address,uint256)",
                address(token),
                userB,
                userA,
                50 * 10**18
            )
        });
        
        vm.prank(entryPoint);
        kernel.executeBatch(calls);
        
        console.log("3. EXECUTION COMPLETE");
        
        uint256 aTokenAfter = token.balanceOf(userA);
        uint256 bTokenAfter = token.balanceOf(userB);
        
        console.log("   - A TOKEN before:", aTokenBefore / 10**18);
        console.log("   - A TOKEN after:", aTokenAfter / 10**18);
        console.log("   - Net received by A:", (aTokenAfter - aTokenBefore) / 10**18, "TOKEN (50 - 2 gas = 48)");
        console.log("");
        
        // A received 50 but paid 2 in gas (to bundler), net +48
        assertEq(bTokenAfter, bTokenBefore - 52 * 10**18, "B paid 50 transfer + 2 gas");
        assertEq(kernel.getNonce(userB), 1, "B nonce incremented");
        
        console.log("4. VERIFICATION");
        console.log("   [OK] B executed gasless transaction");
        console.log("   [OK] Gas paid via tokens to bundler");
        console.log("");
        
        console.log("=========================================");
        console.log("TEST PASSED: Gasless Sponsor Flow!");
        console.log("=========================================");
    }

    function test_MultipleUserOps() public {
        console.log("");
        console.log("=== TEST: Multiple Sequential UserOps ===");
        console.log("");
        
        // Setup
        vm.deal(userA, 50 ether);
        vm.deal(userB, 0 ether);
        token.mint(userB, 1000 * 10**18);
        
        vm.prank(userB);
        token.approve(address(kernel), type(uint256).max);
        
        console.log("1. SETUP");
        console.log("   - B will execute 3 sequential transactions");
        console.log("   - Each transaction uses different nonce");
        console.log("");
        
        uint256 totalGasPaid = 0;
        
        for (uint256 i = 0; i < 3; i++) {
            uint256 gasPayment = (i + 1) * 1 * 10**18;
            uint256 transferAmount = 10 * 10**18;
            
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
                callGasLimit: 100000,
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
            
            // Execute
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
                    transferAmount
                )
            });
            
            vm.prank(entryPoint);
            kernel.executeBatch(calls);
            
            totalGasPaid += gasPayment;
            
            console.log("   Transaction", i + 1, "executed:");
            console.log("     - Transfer:", transferAmount / 10**18, "TOKEN");
            console.log("     - Gas:", gasPayment / 10**18, "TOKEN");
            console.log("     - Nonce:", kernel.getNonce(userB));
            console.log("");
        }
        
        uint256 aTokenFinal = token.balanceOf(userA);
        uint256 bTokenFinal = token.balanceOf(userB);
        
        console.log("2. FINAL STATE");
        console.log("   - A received:", aTokenFinal / 10**18, "TOKEN total (30 TOKEN)");
        console.log("   - B paid:", (1000 * 10**18 - bTokenFinal) / 10**18, "TOKEN total (30 transfer + 6 gas)");
        console.log("   - B final nonce:", kernel.getNonce(userB));
        console.log("");
        
        assertEq(kernel.getNonce(userB), 3, "Nonce should be 3 after 3 transactions");
        assertEq(aTokenFinal, 30 * 10**18, "A should receive 30 TOKEN");
        assertEq(bTokenFinal, 1000 * 10**18 - 36 * 10**18, "B should have paid 36 TOKEN");
        
        console.log("=========================================");
        console.log("TEST PASSED: Multiple Sequential UserOps!");
        console.log("=========================================");
    }
}
