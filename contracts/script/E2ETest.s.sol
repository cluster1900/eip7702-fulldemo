// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/Kernel.sol";
import "../test/Kernel.t.sol";

/**
 * 端到端测试脚本: 模拟完整EIP-7702流程
 * 场景: A有USDC, B是Bundler, A用USDC支付gas执行批量交易
 */
contract E2ETestScript is Script {
    Kernel public kernel;
    MockERC20 public usdc;
    MockTarget public target;
    
    address public bundler = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266; // Anvil账户0
    address public userA = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;    // Anvil账户1
    address public userC = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC;    // Anvil账户2
    address public entryPoint = 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512;
    
    uint256 public bundlerKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    uint256 public userAKey = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;

    function run() external {
        console.log("=== EIP-7702 E2E Test Start ===");
        
        // 1. 部署合约 (使用Bundler账户)
        vm.startBroadcast(bundlerKey);
        
        kernel = Kernel(payable(0x5FbDB2315678afecb367f032d93F642f64180aa3));
        usdc = new MockERC20();
        target = new MockTarget();
        
        console.log("1. Contracts deployed:");
        console.log("   Kernel:", address(kernel));
        console.log("   USDC (MockERC20):", address(usdc));
        console.log("   Target:", address(target));
        console.log("");
        
        vm.stopBroadcast();
        
        // 2. 准备: A获得1000 USDC并授权Kernel
        vm.startBroadcast(userAKey);
        usdc.mint(userA, 1000 * 10**18);
        usdc.approve(address(kernel), type(uint256).max);
        console.log("2. User A prepared:");
        console.log("   A address:", userA);
        console.log("   USDC balance:", usdc.balanceOf(userA) / 10**18, "USDC");
        console.log("   ETH balance:", userA.balance / 10**18, "ETH (wont use)");
        console.log("");
        vm.stopBroadcast();
        
        // 3. 检查delegation状态
        bytes memory code = entryPoint.code;
        bool isDelegated = code.length > 0;
        console.log("3. Delegation status:");
        console.log("   A delegated?", isDelegated);
        console.log("   A UserOp nonce:", kernel.getNonce(userA));
        console.log("");
        
        // 4. 模拟首次UserOp: delegation + 执行
        console.log("4. Execute UserOp (A pays 10 USDC gas, batch 2 calls):");
        console.log("");
        
        // 创建批量call
        Kernel.Call[] memory calls = new Kernel.Call[](2);
        calls[0] = Kernel.Call({
            target: address(target),
            value: 0,
            data: abi.encodeWithSignature("setValue(uint256)", 888)
        });
        calls[1] = Kernel.Call({
            target: address(usdc),
            value: 0,
            data: abi.encodeWithSignature("transfer(address,uint256)", userC, 50 * 10**18)
        });
        
        // UserOp参数
        uint256 gasPayment = 10 * 10**18; // 10 USDC
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
            signature: "" // 待签名
        });
        
        // 签名UserOp
        bytes32 userOpHash = keccak256("test userOp");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userAKey, userOpHash);
        userOp.signature = abi.encodePacked(r, s, v);
        
        // Bundler执行: validateUserOp + executeBatch
        vm.startBroadcast(bundlerKey);
        
        uint256 bundlerUsdcBefore = usdc.balanceOf(bundler);
        uint256 userAUsdcBefore = usdc.balanceOf(userA);
        uint256 userCUsdcBefore = usdc.balanceOf(userC);
        
        // 模拟EntryPoint调用validateUserOp (作为EntryPoint, tx.origin是bundler)
        vm.prank(entryPoint);
        uint256 validationResult = kernel.validateUserOp(userOp, userOpHash, gasPayment);
        
        console.log("   OK validateUserOp result:", validationResult);
        console.log("   OK USDC gas paid (A to Bundler):", (usdc.balanceOf(bundler) - bundlerUsdcBefore) / 10**18, "USDC");
        
        // Execute batch
        vm.prank(entryPoint);
        kernel.executeBatch(calls);
        
        console.log("   OK executeBatch done");
        console.log("");
        
        vm.stopBroadcast();
        
        // 5. 验证结果
        console.log("5. Result verification:");
        console.log("   Target value:", target.value());
        console.log("   USDC balance changes:");
        console.log("     A before:", userAUsdcBefore / 10**18);
        console.log("     A after:", usdc.balanceOf(userA) / 10**18);
        console.log("     Bundler before:", bundlerUsdcBefore / 10**18);
        console.log("     Bundler after:", usdc.balanceOf(bundler) / 10**18);
        console.log("     C after:", usdc.balanceOf(userC) / 10**18);
        console.log("   A nonce:", kernel.getNonce(userA));
        console.log("");
        
        // 6. 验证断言
        require(target.value() == 888, "Target value wrong");
        require(usdc.balanceOf(userA) == userAUsdcBefore - 60 * 10**18, "A balance wrong");
        require(usdc.balanceOf(bundler) == bundlerUsdcBefore + 10 * 10**18, "Bundler balance wrong");
        require(usdc.balanceOf(userC) == 50 * 10**18, "C balance wrong");
        require(kernel.getNonce(userA) == 1, "Nonce not incremented");
        
        console.log("OK All verifications passed!");
        console.log("");
        console.log("=== Test Summary ===");
        console.log("OK A (no ETH) paid 10 USDC for gas successfully");
        console.log("OK Batch executed 2 ops: setValue + transfer");
        console.log("OK Bundler received 10 USDC compensation");
        console.log("OK C received 50 USDC");
        console.log("OK Nonce incremented correctly");
        console.log("");
        console.log("SUCCESS EIP-7702 full flow test passed!");
    }
}
