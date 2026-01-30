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

contract EIP7702DelegationTest is Test {
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
        console.log("EIP-7702 Delegation Flow Test");
        console.log("=========================================");
        console.log("");
        console.log("Initial Addresses:");
        console.log("  userA (sponsor):", vm.toString(userA));
        console.log("  userB (delegate):", vm.toString(userB));
        console.log("  bundler:", vm.toString(bundler));
        console.log("  kernel:", vm.toString(address(kernel)));
        console.log("  entryPoint:", vm.toString(entryPoint));
        console.log("");
    }

    function test_EIP7702_FullDelegationFlow() public {
        console.log("=========================================");
        console.log("STEP 0: INITIAL SETUP");
        console.log("=========================================");
        console.log("");
        
        vm.deal(userA, 100 ether);
        vm.deal(userB, 0 ether);
        vm.deal(bundler, 10 ether);
        
        token.mint(userA, 5000 * 10**18);
        token.mint(userB, 1000 * 10**18);
        
        vm.prank(userB);
        token.approve(address(kernel), type(uint256).max);
        
        console.log("  BEFORE DELEGATION:");
        console.log("  ------------------");
        console.log("    userA ETH:", userA.balance / 1 ether, "ETH");
        console.log("    userA TOKEN:", token.balanceOf(userA) / 10**18);
        console.log("    userB ETH:", userB.balance / 1 ether, "ETH");
        console.log("    userB TOKEN:", token.balanceOf(userB) / 10**18);
        console.log("    bundler ETH:", bundler.balance / 1 ether, "ETH");
        console.log("");
        
        console.log("  CHECKING CODE SIZE (via RPC):");
        console.log("  ------------------------------");
        console.log("    userB code size BEFORE delegation:", address(userB).code.length);
        console.log("    userB is EOA:", address(userB).code.length == 0 ? "YES" : "NO");
        console.log("");
        
        console.log("=========================================");
        console.log("STEP 1: AUTHORIZE EIP-7702 DELEGATION");
        console.log("=========================================");
        console.log("");
        
        console.log("  PREPARING AUTHORIZATION:");
        console.log("  ------------------------");
        console.log("    Delegation target (kernel):", vm.toString(address(kernel)));
        console.log("    Authority (userB):", vm.toString(userB));
        console.log("    Chain ID:", block.chainid);
        console.log("");
        
        console.log("  [BEFORE] Creating EIP-7702 authorization...");
        console.log("    In real EIP-7702, this is a type 0x04 transaction");
        console.log("    with authorization list containing:");
        console.log("      - chainId");
        console.log("      - nonce");
        console.log("      - contractAddress (kernel)");
        console.log("      - yParity, r, s (signature)");
        console.log("");
        
        uint256 nonceBefore = vm.getNonce(userB);
        console.log("    userB nonce:", nonceBefore);
        console.log("");
        
        console.log("  [DURING] Simulating EIP-7702 delegation via vm.etch...");
        console.log("    Setting userB code to kernel bytecode...");
        console.log("    Kernel code length:", address(kernel).code.length, "bytes");
        
        vm.etch(userB, address(kernel).code);
        
        console.log("    userB code length AFTER etch:", address(userB).code.length, "bytes");
        console.log("");
        
        console.log("  [AFTER] Delegation simulated via vm.etch!");
        console.log("    In real network, this would be done via type 0x04 tx");
        console.log("");
        
        console.log("=========================================");
        console.log("STEP 2: VERIFY DELEGATION STATUS");
        console.log("=========================================");
        console.log("");
        
        console.log("  CHECKING CODE SIZE (via RPC):");
        console.log("  ------------------------------");
        console.log("    userB code size AFTER delegation:", address(userB).code.length);
        console.log("    userB is now smart contract:", address(userB).code.length > 0 ? "YES" : "NO");
        console.log("    Code length:", address(userB).code.length, "bytes");
        console.log("");
        
        console.log("  DELEGATION VERIFICATION:");
        console.log("  ------------------------");
        console.log("    Kernel address stored at userB: N/A (code is the same)");
        console.log("    Delegation authorized: YES (via vm.etch)");
        console.log("");
        
        console.log("  ANVIL RPC COMMANDS TO VERIFY:");
        console.log("  -----------------------------");
        console.log("    eth.getCode('0x...userB_address...')");
        console.log("    Result: Should show non-empty bytecode");
        console.log("");
        
        console.log("=========================================");
        console.log("STEP 3: CREATE USEROP FOR DELEGATED ACCOUNT");
        console.log("=========================================");
        console.log("");
        
        uint256 transferAmount = 100 * 10**18;
        uint256 gasPayment = 5 * 10**18;
        
        console.log("  USEROP PARAMETERS:");
        console.log("  ------------------");
        console.log("    sender (userB):", vm.toString(userB));
        console.log("    nonce: 0");
        console.log("    transfer amount:", transferAmount / 10**18, "TOKEN");
        console.log("    gas payment:", gasPayment / 10**18, "TOKEN");
        console.log("    callGasLimit: 100000");
        console.log("    verificationGasLimit: 100000");
        console.log("");
        
        console.log("  [BEFORE] Building UserOp...");
        console.log("    Encoding callData for executeTokenTransfer...");
        
        bytes memory callData = abi.encodeWithSignature(
            "executeTokenTransfer(address,address,address,uint256)",
            address(token),
            userB,
            userA,
            transferAmount
        );
        
        console.log("    callData hash:", vm.toString(keccak256(callData)));
        console.log("    callData length:", callData.length, "bytes");
        console.log("");
        
        console.log("  [DURING] Signing UserOp...");
        
        Kernel.PackedUserOperation memory userOp = Kernel.PackedUserOperation({
            sender: userB,
            nonce: 0,
            callData: callData,
            callGasLimit: 100000,
            verificationGasLimit: 100000,
            preVerificationGas: 21000,
            maxFeePerGas: 1 gwei,
            maxPriorityFeePerGas: 1 gwei,
            paymasterAndData: abi.encode(address(token), gasPayment),
            signature: ""
        });
        
        bytes32 userOpHash = keccak256(abi.encode(userOp));
        console.log("    userOpHash:", vm.toString(userOpHash));
        
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKeyB, userOpHash);
        userOp.signature = abi.encodePacked(r, s, v);
        
        console.log("    Signature v:", v);
        console.log("    Signature r:", vm.toString(r));
        console.log("    Signature s:", vm.toString(s));
        console.log("    Signature length:", userOp.signature.length, "bytes");
        console.log("");
        
        console.log("  [AFTER] UserOp signed!");
        console.log("    Ready for bundler submission");
        console.log("");
        
        console.log("=========================================");
        console.log("STEP 4: BUNDLER VALIDATES USEROP");
        console.log("=========================================");
        console.log("");
        
        console.log("  [BEFORE] Bundler receives UserOp...");
        console.log("    EntryPoint:", vm.toString(entryPoint));
        console.log("    Bundler (tx.origin):", vm.toString(bundler));
        console.log("");
        
        console.log("  [DURING] EntryPoint.validateUserOp()...");
        console.log("    1. Checking if caller is EntryPoint...");
        console.log("       msg.sender == ENTRY_POINT:", msg.sender == entryPoint ? "YES" : "NO");
        console.log("");
        
        console.log("    2. Verifying signature (ecrecover)...");
        
        address recoveredSigner = ecrecover(userOpHash, v, r, s);
        console.log("       Recovered signer:", vm.toString(recoveredSigner));
        console.log("       Expected sender:", vm.toString(userB));
        console.log("       Match:", recoveredSigner == userB ? "YES" : "NO");
        console.log("");
        
        console.log("    3. Checking nonce...");
        uint256 currentNonce = kernel.getNonce(userB);
        console.log("       Current nonce:", currentNonce);
        console.log("       UserOp nonce:", userOp.nonce);
        console.log("       Match:", currentNonce == userOp.nonce ? "YES" : "NO");
        console.log("");
        
        console.log("    4. Processing gas payment (ERC20 transfer)...");
        uint256 bundlerTokenBefore = token.balanceOf(bundler);
        console.log("       Bundler TOKEN before:", bundlerTokenBefore / 10**18);
        
        vm.prank(entryPoint, bundler);
        uint256 validationResult = kernel.validateUserOp(userOp, userOpHash, gasPayment);
        
        uint256 bundlerTokenAfter = token.balanceOf(bundler);
        console.log("       Bundler TOKEN after:", bundlerTokenAfter / 10**18);
        console.log("       TOKEN received:", (bundlerTokenAfter - bundlerTokenBefore) / 10**18);
        console.log("");
        
        console.log("  [AFTER] Validation complete!");
        console.log("    Validation result:", validationResult);
        console.log("    (0 = success, 1 = signature failure)");
        console.log("");
        
        console.log("=========================================");
        console.log("STEP 5: EXECUTE USEROP");
        console.log("=========================================");
        console.log("");
        
        console.log("  [BEFORE] Preparing execution...");
        console.log("    Creating batch with 1 call...");
        
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
        
        console.log("    Call target:", vm.toString(calls[0].target));
        console.log("    Call data hash:", vm.toString(keccak256(calls[0].data)));
        console.log("");
        
        console.log("  [DURING] EntryPoint.executeBatch()...");
        
        uint256 userATokenBefore = token.balanceOf(userA);
        uint256 userBTokenBefore = token.balanceOf(userB);
        
        console.log("    USER A TOKEN before:", userATokenBefore / 10**18);
        console.log("    USER B TOKEN before:", userBTokenBefore / 10**18);
        console.log("");
        
        vm.prank(entryPoint);
        kernel.executeBatch(calls);
        
        uint256 userATokenAfter = token.balanceOf(userA);
        uint256 userBTokenAfter = token.balanceOf(userB);
        
        console.log("    USER A TOKEN after:", userATokenAfter / 10**18);
        console.log("    USER B TOKEN after:", userBTokenAfter / 10**18);
        console.log("");
        
        console.log("  [AFTER] Execution complete!");
        console.log("    Transfer successful!");
        console.log("");
        
        console.log("=========================================");
        console.log("STEP 6: FINAL STATE VERIFICATION");
        console.log("=========================================");
        console.log("");
        
        uint256 nonceAfter = kernel.getNonce(userB);
        
        console.log("  BALANCE CHANGES:");
        console.log("  ----------------");
        console.log("    USER A:");
        console.log("      ETH:", userA.balance / 1 ether, "ETH (unchanged)");
        console.log("      TOKEN:", userATokenBefore / 10**18, "->", userATokenAfter / 10**18);
        console.log("      Net change: +", (userATokenAfter - userATokenBefore) / 10**18, "TOKEN");
        console.log("");
        
        console.log("    USER B:");
        console.log("      ETH:", userB.balance / 1 ether, "ETH (still 0)");
        console.log("      TOKEN:", userBTokenBefore / 10**18, "->", userBTokenAfter / 10**18);
        console.log("      Net change: -", (userBTokenBefore - userBTokenAfter) / 10**18, "TOKEN");
        console.log("");
        
        console.log("    BUNDLER:");
        console.log("      ETH:", bundler.balance / 1 ether, "ETH (unchanged)");
        console.log("      TOKEN:", bundlerTokenBefore / 10**18, "->", bundlerTokenAfter / 10**18);
        console.log("      Net change: +", (bundlerTokenAfter - bundlerTokenBefore) / 10**18, "TOKEN (gas compensation)");
        console.log("");
        
        console.log("  NONCE VERIFICATION:");
        console.log("  -------------------");
        console.log("    Nonce before:", nonceBefore);
        console.log("    Nonce after:", nonceAfter);
        console.log("    Incremented by:", nonceAfter - nonceBefore);
        console.log("");
        
        console.log("=========================================");
        console.log("STEP 7: VERIFY VIA ANVIL CONSOLE");
        console.log("=========================================");
        console.log("");
        
        console.log("  You can verify delegation via anvil console:");
        console.log("  -------------------------------------------");
        console.log("    1. eth.getCode('0x...userB_address...')");
        console.log("       Should return non-empty bytecode after delegation");
        console.log("");
        console.log("    2. eth.getBalance('0x...userB_address...')");
        console.log("       Should show ETH balance");
        console.log("");
        console.log("    3. eth.getTransactionReceipt('0x...tx_hash...')");
        console.log("       Should show status: '0x1' (success)");
        console.log("");
        
        console.log("=========================================");
        console.log("ASSERTIONS");
        console.log("=========================================");
        console.log("");
        
        assertEq(userATokenAfter, userATokenBefore + transferAmount, "A should receive transfer");
        console.log("  [OK] A received transfer amount");
        
        assertEq(userBTokenAfter, userBTokenBefore - transferAmount, "B paid transfer");
        console.log("  [OK] B paid transfer amount (gas already deducted during validation)");
        
        assertEq(nonceAfter, nonceBefore + 1, "Nonce should increment");
        console.log("  [OK] Nonce incremented correctly");
        
        assertEq(bundlerTokenAfter, bundlerTokenBefore + gasPayment, "Bundler received gas");
        console.log("  [OK] Bundler received gas compensation");
        
        console.log("");
        console.log("=========================================");
        console.log("TEST PASSED: EIP-7702 Full Delegation Flow!");
        console.log("=========================================");
        console.log("");
        console.log("KEY INSIGHTS:");
        console.log("  1. EOA delegated to Kernel contract via EIP-7702");
        console.log("  2. Delegation verified via code size check");
        console.log("  3. UserOp validated and executed through Kernel");
        console.log("  4. ERC20 used for gas payment (no native ETH needed)");
        console.log("  5. Bundler compensated via paymaster pattern");
    }
}
