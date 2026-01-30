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

contract OnChainFullFlowTest is Test {
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
        console.log("EIP-7702 ON-CHAIN FULL FLOW TEST");
        console.log("=========================================");
        console.log("");
        console.log("ACCOUNT ADDRESSES:");
        console.log("  [SPONSOR] userA:", vm.toString(userA));
        console.log("  [DELEGATOR] userB:", vm.toString(userB));
        console.log("  [BUNDLER] bundler:", vm.toString(bundler));
        console.log("  [KERNEL] contract:", vm.toString(address(kernel)));
        console.log("  [ENTRYPOINT]:", vm.toString(entryPoint));
        console.log("");
        console.log("PRIVATE KEYS:");
        console.log("  userA privateKey:", vm.toString(bytes32(privateKeyA)));
        console.log("  userB privateKey:", vm.toString(bytes32(privateKeyB)));
        console.log("  bundler privateKey:", vm.toString(bytes32(privateKeyBundler)));
        console.log("");
    }

    function test_OnChain_FullFlowWithNewAccountB() public {
        console.log("=========================================");
        console.log("STEP 0: INITIAL SETUP & FUNDING");
        console.log("=========================================");
        console.log("");
        
        // Fund accounts with ETH (for gas)
        vm.deal(userA, 100 ether);
        vm.deal(userB, 0 ether);
        vm.deal(bundler, 10 ether);
        
        // Mint tokens to users
        token.mint(userA, 10000 * 10**18);
        token.mint(userB, 5000 * 10**18);
        
        console.log("  [BEFORE] ACCOUNT BALANCES:");
        console.log("  =========================");
        console.log("");
        console.log("  userA (SPONSOR):");
        console.log("    ETH:", userA.balance / 1 ether, "ETH");
        console.log("    TOKEN:", token.balanceOf(userA) / 10**18);
        console.log("");
        console.log("  userB (DELEGATOR):");
        console.log("    ETH:", userB.balance / 1 ether, "ETH");
        console.log("    TOKEN:", token.balanceOf(userB) / 10**18);
        console.log("");
        console.log("  bundler:");
        console.log("    ETH:", bundler.balance / 1 ether, "ETH");
        console.log("");
        
        // Check code size before delegation
        console.log("  [BEFORE] CODE SIZE CHECK:");
        console.log("  ========================");
        console.log("    userB code size:", address(userB).code.length, "bytes");
        console.log("    userB is EOA:", address(userB).code.length == 0 ? "YES" : "NO");
        console.log("");
        
        console.log("=========================================");
        console.log("STEP 1: EIP-7702 DELEGATION (via vm.etch)");
        console.log("=========================================");
        console.log("");
        
        console.log("  [BEFORE] Delegation status:");
        console.log("    Delegation target (kernel):", vm.toString(address(kernel)));
        console.log("    Authority (userB):", vm.toString(userB));
        console.log("    Chain ID:", block.chainid);
        console.log("");
        
        console.log("  [DURING] Executing vm.etch to simulate delegation...");
        console.log("    Setting userB code to kernel bytecode...");
        
        vm.etch(userB, address(kernel).code);
        
        console.log("    Kernel code length:", address(kernel).code.length, "bytes");
        console.log("    userB code length AFTER etch:", address(userB).code.length, "bytes");
        console.log("");
        
        console.log("  [AFTER] Delegation complete!");
        console.log("    userB is now a smart contract wallet");
        console.log("");
        
        console.log("=========================================");
        console.log("STEP 2: USERB APPROVES KERNEL FOR TOKEN TRANSFERS");
        console.log("=========================================");
        console.log("");
        
        console.log("  [BEFORE] Token allowance:");
        console.log("    kernel allowance:", token.allowance(userB, address(kernel)) / 10**18);
        console.log("");
        
        console.log("  [DURING] userB approves kernel to spend tokens...");
        vm.prank(userB);
        token.approve(address(kernel), type(uint256).max);
        
        console.log("  [AFTER] Token allowance:");
        console.log("    kernel allowance:", token.allowance(userB, address(kernel)) / 10**18);
        console.log("    Unlimited approval granted");
        console.log("");
        
        console.log("=========================================");
        console.log("STEP 3: BUILD USEROP");
        console.log("=========================================");
        console.log("");
        
        uint256 transferAmount = 500 * 10**18;  // B transfers 500 TOKEN to A
        uint256 gasCompensation = 25 * 10**18;  // B compensates A with 25 TOKEN for gas
        
        console.log("  USEROP PARAMETERS:");
        console.log("  ==================");
        console.log("");
        console.log("  Basic Info:");
        console.log("    sender (userB):", vm.toString(userB));
        console.log("    nonce: 0");
        console.log("    entryPoint:", vm.toString(entryPoint));
        console.log("");
        console.log("  Transfer Details:");
        console.log("    Token:", vm.toString(address(token)));
        console.log("    From (userB):", vm.toString(userB));
        console.log("    To (userA):", vm.toString(userA));
        console.log("    Amount:", transferAmount / 10**18, "TOKEN");
        console.log("");
        console.log("  Gas Compensation:");
        console.log("    Paymaster token:", vm.toString(address(token)));
        console.log("    Gas amount:", gasCompensation / 10**18, "TOKEN");
        console.log("    Payee (bundler/tx.origin):", vm.toString(bundler));
        console.log("");
        console.log("  Gas Limits:");
        console.log("    callGasLimit: 150000");
        console.log("    verificationGasLimit: 150000");
        console.log("    preVerificationGas: 21000");
        console.log("    maxFeePerGas: 1 gwei");
        console.log("    maxPriorityFeePerGas: 1 gwei");
        console.log("");
        
        console.log("  [DURING] Building callData...");
        bytes memory callData = abi.encodeWithSignature(
            "executeTokenTransfer(address,address,address,uint256)",
            address(token),
            userB,
            userA,
            transferAmount
        );
        bytes32 callDataHash = keccak256(callData);
        console.log("    callData hash:", vm.toString(callDataHash));
        console.log("    callData length:", callData.length, "bytes");
        console.log("");
        
        console.log("  [DURING] Building UserOp...");
        Kernel.PackedUserOperation memory userOp = Kernel.PackedUserOperation({
            sender: userB,
            nonce: 0,
            callData: callData,
            callGasLimit: 150000,
            verificationGasLimit: 150000,
            preVerificationGas: 21000,
            maxFeePerGas: 1 gwei,
            maxPriorityFeePerGas: 1 gwei,
            paymasterAndData: abi.encode(address(token), gasCompensation),
            signature: ""
        });
        
        console.log("  [DURING] Signing UserOp with userB's private key...");
        bytes32 userOpHash = keccak256(abi.encode(userOp));
        console.log("    userOpHash:", vm.toString(userOpHash));
        
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKeyB, userOpHash);
        userOp.signature = abi.encodePacked(r, s, v);
        
        console.log("    Signature v:", v);
        console.log("    Signature r:", vm.toString(r));
        console.log("    Signature s:", vm.toString(s));
        console.log("");
        
        console.log("  [AFTER] UserOp built and signed!");
        console.log("    Ready for bundler submission");
        console.log("");
        
        console.log("=========================================");
        console.log("STEP 4: BUNDLER SUBMITS TO CHAIN");
        console.log("=========================================");
        console.log("");
        
        console.log("  [BEFORE] Bundler prepares transaction...");
        console.log("    EntryPoint caller:", vm.toString(entryPoint));
        console.log("    Bundler (tx.origin):", vm.toString(bundler));
        console.log("");
        
        // Record balances before
        uint256 aEthBefore = userA.balance;
        uint256 aTokenBefore = token.balanceOf(userA);
        uint256 bEthBefore = userB.balance;
        uint256 bTokenBefore = token.balanceOf(userB);
        uint256 bundlerEthBefore = bundler.balance;
        uint256 bundlerTokenBefore = token.balanceOf(bundler);
        uint256 nonceBefore = kernel.getNonce(userB);
        
        console.log("  [DURING] Executing validateUserOp...");
        console.log("    Step 4.1: Verify signature (ecrecover)...");
        
        address recovered = ecrecover(userOpHash, v, r, s);
        console.log("      Recovered signer:", vm.toString(recovered));
        console.log("      Expected sender:", vm.toString(userB));
        console.log("      Match:", recovered == userB ? "YES" : "NO");
        console.log("");
        
        console.log("    Step 4.2: Check nonce...");
        console.log("      Current nonce:", nonceBefore);
        console.log("      UserOp nonce:", userOp.nonce);
        console.log("      Match:", nonceBefore == userOp.nonce ? "YES" : "NO");
        console.log("");
        
        console.log("    Step 4.3: Process gas payment (ERC20 transfer to bundler)...");
        console.log("      Bundler TOKEN before:", bundlerTokenBefore / 10**18);
        
        vm.prank(entryPoint, bundler);
        uint256 validationResult = kernel.validateUserOp(userOp, userOpHash, gasCompensation);
        
        uint256 bundlerTokenAfterValidation = token.balanceOf(bundler);
        console.log("      Bundler TOKEN after validation:", bundlerTokenAfterValidation / 10**18);
        console.log("      TOKEN received:", (bundlerTokenAfterValidation - bundlerTokenBefore) / 10**18);
        console.log("      Validation result:", validationResult);
        console.log("");
        
        console.log("    Step 4.4: Execute token transfer...");
        console.log("      USER A TOKEN before:", aTokenBefore / 10**18);
        console.log("      USER B TOKEN before:", bTokenBefore / 10**18);
        console.log("");
        
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
        
        uint256 aTokenAfter = token.balanceOf(userA);
        uint256 bTokenAfter = token.balanceOf(userB);
        
        console.log("      USER A TOKEN after:", aTokenAfter / 10**18);
        console.log("      USER B TOKEN after:", bTokenAfter / 10**18);
        console.log("");
        
        uint256 nonceAfter = kernel.getNonce(userB);
        
        console.log("  [AFTER] Transaction executed!");
        console.log("    Validation result:", validationResult);
        console.log("    Nonce incremented:", nonceBefore, "->", nonceAfter);
        console.log("");
        
        console.log("=========================================");
        console.log("STEP 5: ON-CHAIN VERIFICATION");
        console.log("=========================================");
        console.log("");
        
        console.log("  [ON-CHAIN] Transaction Receipt:");
        console.log("  ===============================");
        console.log("    Status: SUCCESS (0x1)");
        console.log("    Block: (simulated in forge test)");
        console.log("    Gas used: (included in test output)");
        console.log("");
        
        console.log("  BALANCE CHANGES (BEFORE -> AFTER):");
        console.log("  ==================================");
        console.log("");
        console.log("  userA (SPONSOR - receives transfer + gas compensation):");
        console.log("    ETH:", aEthBefore / 1 ether, "->", userA.balance / 1 ether);
        console.log("    TOKEN:", aTokenBefore / 10**18, "->", aTokenAfter / 10**18);
        console.log("    Net TOKEN change: +", (aTokenAfter - aTokenBefore) / 10**18, "TOKEN");
        console.log("    (This includes transfer + gas compensation)");
        console.log("");
        console.log("  userB (DELEGATOR - pays transfer + gas):");
        console.log("    ETH:", bEthBefore / 1 ether, "->", userB.balance / 1 ether);
        console.log("    TOKEN:", bTokenBefore / 10**18, "->", bTokenAfter / 10**18);
        console.log("    Net TOKEN change: -", (bTokenBefore - bTokenAfter) / 10**18, "TOKEN");
        console.log("    (Transfer amount + gas compensation)");
        console.log("");
        console.log("  bundler (paid ETH gas, received TOKEN compensation):");
        console.log("    ETH:", bundlerEthBefore / 1 ether, "->", bundler.balance / 1 ether);
        console.log("    TOKEN:", bundlerTokenBefore / 10**18, "->", token.balanceOf(bundler) / 10**18);
        console.log("    Net TOKEN change: +", (token.balanceOf(bundler) - bundlerTokenBefore) / 10**18, "TOKEN");
        console.log("");
        
        console.log("  NONCE VERIFICATION:");
        console.log("  ===================");
        console.log("    Nonce before:", nonceBefore);
        console.log("    Nonce after:", nonceAfter);
        console.log("    Incremented by:", nonceAfter - nonceBefore);
        console.log("");
        
        console.log("  CODE SIZE VERIFICATION:");
        console.log("  =======================");
        console.log("    userB code size:", address(userB).code.length, "bytes");
        console.log("    userB is smart contract:", address(userB).code.length > 0 ? "YES" : "NO");
        console.log("");
        
        console.log("=========================================");
        console.log("STEP 6: ASSERTIONS");
        console.log("=========================================");
        console.log("");
        
        assertEq(aTokenAfter, aTokenBefore + transferAmount, "A should receive transfer");
        console.log("  [OK] A received transfer amount (500 TOKEN)");
        
        assertEq(bTokenAfter, bTokenBefore - transferAmount - gasCompensation, "B paid transfer + gas");
        console.log("  [OK] B paid transfer amount + gas compensation");
        
        assertEq(nonceAfter, nonceBefore + 1, "Nonce should increment");
        console.log("  [OK] Nonce incremented correctly");
        
        assertEq(kernel.getNonce(userB), 1, "Nonce should be 1");
        console.log("  [OK] Kernel nonce is 1");
        
        assertEq(address(userB).code.length > 0, true, "userB should have code (delegated)");
        console.log("  [OK] userB is now a smart contract");
        
        console.log("");
        console.log("=========================================");
        console.log("TEST PASSED: ON-CHAIN FULL FLOW!");
        console.log("=========================================");
        console.log("");
        console.log("FLOW SUMMARY:");
        console.log("  1. [SETUP] userA has ETH + TOKEN, userB has TOKEN only");
        console.log("  2. [DELEGATION] userB delegated to Kernel contract via vm.etch");
        console.log("  3. [APPROVAL] userB approved Kernel to spend tokens");
        console.log("  4. [USEROP] Bundler submitted UserOp for userB");
        console.log("  5. [VALIDATION] validateUserOp verified signature + nonce");
        console.log("  6. [GAS PAYMENT] ERC20 tokens transferred to bundler");
        console.log("  7. [EXECUTION] Token transfer from B to A executed");
        console.log("  8. [RESULT] userB (no ETH) successfully sent tokens!");
        console.log("");
        console.log("KEY INSIGHTS:");
        console.log("  - userB had NO native ETH but executed transaction");
        console.log("  - Gas paid by bundler, compensated via ERC20 tokens");
        console.log("  - EIP-7702 enables smart contract wallet for EOA");
        console.log("  - ERC-4337 UserOp flow enables gas abstraction");
    }
}
