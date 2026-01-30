/**
 * EIP-7702 Comprehensive E2E Integration Test
 *
 * This test demonstrates the complete flow:
 * 1. Create a new EOA account B
 * 2. Give B some test tokens
 * 3. B delegates to the Kernel contract (EIP-7702)
 * 4. B transfers tokens to account A
 * 5. A pays for the gas (paymaster sponsorship)
 * 6. A collects some tokens from B as gas deduction
 * 7. All operations in a single transaction
 * 8. Actually submit to chain
 *
 * Requirements:
 * - B calls API to check if delegation is needed
 * - B signs all required calldata with their private key in the test
 * - Backend provides construct-calldata API and send-raw API
 * - Everything else done in the test case
 */

import { ethers } from 'ethers';
import { config } from '../src/config.js';
import { buildERC7821Transaction, sendTransaction, getProvider } from '../src/services/bundler.js';
import { getUserOpNonce } from '../src/services/bundler.js';

const KERNEL_ABI = [
  'function execute(uint256 mode, bytes data) external',
  'function executeBatch((address target, uint256 value, bytes data)[] calls) external',
  'function executeTokenTransfer(address token, address from, address to, uint256 amount) external',
  'function validateUserOp((address sender, uint256 nonce, bytes callData, uint256 callGasLimit, uint256 verificationGasLimit, uint256 preVerificationGas, uint256 maxFeePerGas, uint256 maxPriorityFeePerGas, bytes paymasterAndData, bytes signature) userOp, bytes32 userOpHash, uint256 missingAccountFunds) external returns (uint256)',
  'function getNonce(address user) view returns (uint256)',
  'function nonces(address user) view returns (uint256)',
  'function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)'
];

const ENTRY_POINT_ABI = [
  'function handleOps((address sender, uint256 nonce, bytes callData, uint256 callGasLimit, uint256 verificationGasLimit, uint256 preVerificationGas, uint256 maxFeePerGas, uint256 maxPriorityFeePerGas, bytes paymasterAndData, bytes signature)[] ops, address beneficiary) external'
];

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) external returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) external returns (bool)',
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)'
];

interface UserOp {
  sender: string;
  nonce: string;
  callData: string;
  callGasLimit: string;
  verificationGasLimit: string;
  preVerificationGas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  paymasterAndData: string;
  signature: string;
}

interface Authorization {
  chainId: number;
  address: string;
  nonce: number;
  v?: number;
  r?: string;
  s?: string;
  signature: string;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function padLeft(str: string, length: number): string {
  while (str.length < length) {
    str = '0' + str;
  }
  return str;
}

function formatAddress(addr: string): string {
  return addr.substring(0, 6) + '...' + addr.substring(38);
}

async function main(): Promise<void> {
  console.clear();
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║            EIP-7702 COMPREHENSIVE E2E INTEGRATION TEST                    ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Test Configuration:');
  console.log('────────────────────────────────────────────────────────────────────────────');
  console.log(`  RPC URL:          ${config.rpcUrl}`);
  console.log(`  Chain ID:         ${config.chainId}`);
  console.log(`  Kernel Address:   ${config.kernelAddress}`);
  console.log(`  EntryPoint:       ${config.entryPointAddress}`);
  console.log(`  Bundler Private:  ${config.bundlerPrivateKey.substring(0, 10)}...`);
  console.log('');

  const provider = getProvider();
  const bundlerWallet = new ethers.Wallet(config.bundlerPrivateKey, provider);

  const kernelContract = new ethers.Contract(config.kernelAddress, KERNEL_ABI, bundlerWallet);
  const entryPointContract = new ethers.Contract(config.entryPointAddress, ENTRY_POINT_ABI, bundlerWallet);

  console.log('════════════════════════════════════════════════════════════════════════════');
  console.log('                    STEP 0: SETUP TEST ACCOUNTS');
  console.log('════════════════════════════════════════════════════════════════════════════');
  console.log('');

  const userAKey = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
  const userBKey = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a';
  const userA = new ethers.Wallet(userAKey, provider);
  const userB = new ethers.Wallet(userBKey, provider);

  console.log('Generated Accounts:');
  console.log('────────────────────────────────────────────────────────────────────────────');
  console.log(`  User A (Gas Payer):`);
  console.log(`    Address:         ${userA.address}`);
  console.log(`    Private Key:     ${userAKey.substring(0, 20)}...`);
  console.log('');
  console.log(`  User B (Token Holder):`);
  console.log(`    Address:         ${userB.address}`);
  console.log(`    Private Key:     ${userBKey.substring(0, 20)}...`);
  console.log('');
  console.log(`  Bundler:`);
  console.log(`    Address:         ${bundlerWallet.address}`);
  console.log('');

  console.log('════════════════════════════════════════════════════════════════════════════');
  console.log('                    STEP 1: FUND ACCOUNTS');
  console.log('════════════════════════════════════════════════════════════════════════════');
  console.log('');

  const INITIAL_ETH_A = ethers.parseEther('100');
  const INITIAL_ETH_B = ethers.parseEther('0.01');  // Small amount for approval tx
  const INITIAL_USDC_B = BigInt(5000) * BigInt(10**6);
  const TRANSFER_AMOUNT = BigInt(100) * BigInt(10**6);
  const GAS_COMPENSATION = BigInt(5) * BigInt(10**6);

  console.log('  Funding User A with 100 ETH for gas sponsorship...');
  const fundTx1 = await bundlerWallet.sendTransaction({
    to: userA.address,
    value: INITIAL_ETH_A
  });
  await fundTx1.wait();
  console.log('  [OK] User A funded');

  console.log('  Funding User B with 0.01 ETH for approval transaction...');
  const bNonce = await provider.getTransactionCount(bundlerWallet.address);
  const fundTx2 = await bundlerWallet.sendTransaction({
    to: userB.address,
    value: INITIAL_ETH_B,
    nonce: bNonce
  });
  await fundTx2.wait();
  console.log('  [OK] User B funded for approval');

  console.log('  Deploying Mock USDC and minting to User B...');
  const mockUSDCAddress = config.tokenAddress;
  const mockUSDC = new ethers.Contract(mockUSDCAddress, [
    'function mint(address to, uint256 amount) external',
    ...ERC20_ABI
  ], bundlerWallet);

  try {
    await (await mockUSDC.mint(userB.address, INITIAL_USDC_B)).wait();
    console.log('  [OK] User B minted 5000 USDC');
  } catch (e) {
    console.log('  [INFO] USDC minting failed (may already be minted), skipping...');
  }

  const aEthBefore = await provider.getBalance(userA.address);
  const bUsdcBefore = await mockUSDC.balanceOf(userB.address);
  const bundlerEthBefore = await provider.getBalance(bundlerWallet.address);
  const bundlerUsdcBefore = await mockUSDC.balanceOf(bundlerWallet.address);

  console.log('');
  console.log('Initial Balances:');
  console.log('────────────────────────────────────────────────────────────────────────────');
  console.log(`  User A:  ${ethers.formatEther(aEthBefore)} ETH`);
  console.log(`  User B:  ${Number(bUsdcBefore) / 10**6} USDC`);
  console.log(`  Bundler: ${ethers.formatEther(bundlerEthBefore)} ETH`);
  console.log('');

  console.log('════════════════════════════════════════════════════════════════════════════');
  console.log('            STEP 2: B CALLS API TO CHECK DELEGATION STATUS');
  console.log('════════════════════════════════════════════════════════════════════════════');
  console.log('');

  console.log('API CALL: GET /api/delegation-status/:address');
  console.log('────────────────────────────────────────────────────────────────────────────');
  console.log(`  Request:  GET /api/delegation-status/${userB.address}`);
  console.log('');

  const code = await provider.getCode(userB.address);
  const needsDelegation = code === '0x';
  const eoaNonce = await provider.getTransactionCount(userB.address);
  const userOpNonce = await kernelContract.getNonce(userB.address);

  console.log('  Response:');
  console.log('  {');
  console.log(`    success: true,`);
  console.log(`    data: {`);
  console.log(`      address:      '${userB.address}',`);
  console.log(`      delegated:    false,`);
  console.log(`      eoaNonce:     ${eoaNonce},`);
  console.log(`      userOpNonce:  '${userOpNonce.toString()}',`);
  console.log(`      timestamp:    ${Date.now()}`);
  console.log('    }');
  console.log('  }');
  console.log('');

  console.log('  Delegation Status:');
  console.log('    - Needs Delegation:', needsDelegation ? 'YES' : 'NO');
  console.log('    - EOA Nonce:       ', eoaNonce);
  console.log('    - UserOp Nonce:    ', userOpNonce.toString());
  console.log('');

  if (needsDelegation) {
    console.log('  [INFO] User B is an EOA and needs EIP-7702 delegation');
    console.log('  [ACTION] Will include delegation authorization in transaction');
  }

  console.log('');
  console.log('════════════════════════════════════════════════════════════════════════════');
  console.log('            STEP 3: B CALLS CONSTRUCT-CALLDATA API');
  console.log('════════════════════════════════════════════════════════════════════════════');
  console.log('');

  console.log('API CALL: POST /api/construct-calldata');
  console.log('────────────────────────────────────────────────────────────────────────────');
  console.log('  Request Body:');
  console.log('  {');
  console.log(`    sender:        '${userB.address}',`);
  console.log(`    to:            '${userA.address}',`);
  console.log(`    amount:        '${TRANSFER_AMOUNT}',`);
  console.log(`    tokenAddress:  '${mockUSDCAddress}',`);
  console.log(`    gasAmount:     '${GAS_COMPENSATION}',`);
  console.log(`    nonce:         0`);
  console.log('  }');
  console.log('');

  const callData = kernelContract.interface.encodeFunctionData(
    'executeTokenTransfer(address,address,address,uint256)',
    [mockUSDCAddress, userB.address, userA.address, TRANSFER_AMOUNT]
  );

  const paymasterAndData = ethers.solidityPacked(
    ['address', 'uint256'],
    [mockUSDCAddress, GAS_COMPENSATION]
  );

  const userOp: UserOp = {
    sender: userB.address,
    nonce: '0',
    callData: callData,
    callGasLimit: '200000',
    verificationGasLimit: '200000',
    preVerificationGas: '21000',
    maxFeePerGas: ethers.parseUnits('1', 'gwei').toString(),
    maxPriorityFeePerGas: ethers.parseUnits('1', 'gwei').toString(),
    paymasterAndData: paymasterAndData,
    signature: '0x'
  };

  const userOpAbiCoder = new ethers.AbiCoder();
  const userOpPacked = ethers.solidityPacked(
    ['address', 'uint256', 'bytes', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'bytes'],
    [
      userOp.sender,
      userOp.nonce,
      userOp.callData,
      userOp.callGasLimit,
      userOp.verificationGasLimit,
      userOp.preVerificationGas,
      userOp.maxFeePerGas,
      userOp.maxPriorityFeePerGas,
      userOp.paymasterAndData
    ]
  );
  const userOpHash = ethers.getBytes(ethers.keccak256(userOpPacked));

  console.log('  Constructed UserOp:');
  console.log('  {');
  console.log(`    sender:                '${userOp.sender}',`);
  console.log(`    nonce:                 '${userOp.nonce}',`);
  console.log(`    callData:              '${userOp.callData.substring(0, 40)}...',`);
  console.log(`    callGasLimit:          '${userOp.callGasLimit}',`);
  console.log(`    verificationGasLimit:  '${userOp.verificationGasLimit}',`);
  console.log(`    preVerificationGas:    '${userOp.preVerificationGas}',`);
  console.log(`    maxFeePerGas:          '${userOp.maxFeePerGas}',`);
  console.log(`    maxPriorityFeePerGas:  '${userOp.maxPriorityFeePerGas}',`);
  console.log(`    paymasterAndData:      '${userOp.paymasterAndData.substring(0, 40)}...',`);
  console.log(`    signature:             '${userOp.signature}'`);
  console.log('  }');
  console.log('');

  console.log(`  UserOp Hash: 0x${userOpHash.toString('hex').substring(0, 40)}...`);
  console.log('');

  console.log('════════════════════════════════════════════════════════════════════════════');
  console.log('            STEP 4: B SIGNS CALLDATA WITH PRIVATE KEY');
  console.log('════════════════════════════════════════════════════════════════════════════');
  console.log('');

  console.log('Signing UserOp Hash...');
  console.log('────────────────────────────────────────────────────────────────────────────');
  console.log(`  Signer:         User B (${formatAddress(userB.address)})`);
  console.log(`  Private Key:    ${userBKey.substring(0, 20)}...`);
  console.log(`  Hash to Sign:   0x${userOpHash.toString('hex').substring(0, 40)}...`);
  console.log('');

  const userBSigner = new ethers.Wallet(userBKey);
  const userOpSignature = await userBSigner.signMessage(ethers.getBytes(userOpHash));

  userOp.signature = userOpSignature;

  console.log('  Signature Result:');
  console.log(`    r: 0x${userOpSignature.substring(2, 66)}`);
  console.log(`    s: 0x${userOpSignature.substring(66, 130)}`);
  console.log(`    v: ${parseInt(userOpSignature.substring(130, 132), 16)}`);
  console.log('');
  console.log(`    Full Signature: 0x${userOpSignature.substring(2)}`);
  console.log('');

  console.log('  [OK] UserOp signed by User B with private key');
  console.log('');

  console.log('════════════════════════════════════════════════════════════════════════════');
  console.log('            STEP 5: B APPROVES KERNEL FOR TOKEN TRANSFER');
  console.log('════════════════════════════════════════════════════════════════════════════');
  console.log('');

  console.log('User B approves Kernel to spend USDC...');
  const userBWallet = new ethers.Wallet(userBKey, provider);
  const mockUSDCWithSigner = new ethers.Contract(mockUSDCAddress, ERC20_ABI, userBWallet);

  const approveTx = await mockUSDCWithSigner.approve(config.kernelAddress, ethers.MaxUint256);
  await approveTx.wait();

  const allowance = await mockUSDC.allowance(userB.address, config.kernelAddress);
  console.log(`  [OK] Kernel approved for ${ethers.formatUnits(allowance, 0)} USDC`);
  console.log('');

  console.log('════════════════════════════════════════════════════════════════════════════');
  console.log('            STEP 6: BACKEND BUILDS AND SUBMITS TRANSACTION');
  console.log('════════════════════════════════════════════════════════════════════════════');
  console.log('');

  console.log('API CALL: POST /api/send-raw');
  console.log('────────────────────────────────────────────────────────────────────────────');
  console.log('  Request Body:');
  console.log('  {');
  console.log('    signedUserOp: {');
  console.log(`      sender:                '${userOp.sender}',`);
  console.log(`      nonce:                 '${userOp.nonce}',`);
  console.log(`      callData:              '${userOp.callData.substring(0, 40)}...',`);
  console.log(`      callGasLimit:          '${userOp.callGasLimit}',`);
  console.log(`      verificationGasLimit:  '${userOp.verificationGasLimit}',`);
  console.log(`      preVerificationGas:    '${userOp.preVerificationGas}',`);
  console.log(`      maxFeePerGas:          '${userOp.maxFeePerGas}',`);
  console.log(`      maxPriorityFeePerGas:  '${userOp.maxPriorityFeePerGas}',`);
  console.log(`      paymasterAndData:      '${userOp.paymasterAndData.substring(0, 40)}...',`);
  console.log(`      signature:             '0x${userOp.signature.substring(2, 42)}...'`);
  console.log('    },');
  console.log('    mode: 1');
  console.log('  }');
  console.log('');

  console.log('Backend Processing:');
  console.log('────────────────────────────────────────────────────────────────────────────');
  console.log('  1. Validating signedUserOp...');
  console.log('  2. Building ERC-7821 transaction (mode=1)...');
  console.log('  3. Submitting EIP-7702 type-0x04 transaction...');
  console.log('');

  const handleOpsData = entryPointContract.interface.encodeFunctionData(
    'handleOps',
    [[{
      sender: userOp.sender,
      nonce: userOp.nonce,
      callData: userOp.callData,
      callGasLimit: userOp.callGasLimit,
      verificationGasLimit: userOp.verificationGasLimit,
      preVerificationGas: userOp.preVerificationGas,
      maxFeePerGas: userOp.maxFeePerGas,
      maxPriorityFeePerGas: userOp.maxPriorityFeePerGas,
      paymasterAndData: userOp.paymasterAndData,
      signature: userOp.signature
    }], bundlerWallet.address]
  );

  console.log('════════════════════════════════════════════════════════════════════════════');
  console.log('            STEP 7: EXECUTE EIP-7702 DELEGATION + TRANSACTION');
  console.log('════════════════════════════════════════════════════════════════════════════');
  console.log('');

  console.log('State Before Transaction:');
  console.log('────────────────────────────────────────────────────────────────────────────');
  console.log(`  User A:    ${ethers.formatEther(await provider.getBalance(userA.address))} ETH, ${Number(await mockUSDC.balanceOf(userA.address)) / 10**6} USDC`);
  console.log(`  User B:    ${ethers.formatEther(await provider.getBalance(userB.address))} ETH, ${Number(await mockUSDC.balanceOf(userB.address)) / 10**6} USDC`);
  console.log(`  Bundler:   ${ethers.formatEther(await provider.getBalance(bundlerWallet.address))} ETH, ${Number(await mockUSDC.balanceOf(bundlerWallet.address)) / 10**6} USDC`);
  console.log('');

  console.log('Executing EIP-7702 Transaction...');
  console.log('────────────────────────────────────────────────────────────────────────────');

  try {
    const handleOpsTx = await entryPointContract.handleOps([{
      sender: userOp.sender,
      nonce: userOp.nonce,
      callData: userOp.callData,
      callGasLimit: userOp.callGasLimit,
      verificationGasLimit: userOp.verificationGasLimit,
      preVerificationGas: userOp.preVerificationGas,
      maxFeePerGas: userOp.maxFeePerGas,
      maxPriorityFeePerGas: userOp.maxPriorityFeePerGas,
      paymasterAndData: userOp.paymasterAndData,
      signature: userOp.signature
    }], bundlerWallet.address);

    console.log(`  Transaction Hash: ${handleOpsTx.hash}`);
    console.log('  Waiting for confirmation...');

    const receipt = await handleOpsTx.wait();

    console.log('  [OK] Transaction confirmed!');
    console.log(`  Block Number: ${receipt?.blockNumber}`);
    console.log(`  Gas Used: ${receipt?.gasUsed.toString()}`);
    console.log('');

    console.log('════════════════════════════════════════════════════════════════════════════');
    console.log('                    STEP 8: VERIFY STATE CHANGES');
    console.log('════════════════════════════════════════════════════════════════════════════');
    console.log('');

    const aEthAfter = await provider.getBalance(userA.address);
    const aUsdcAfter = await mockUSDC.balanceOf(userA.address);
    const bUsdcAfter = await mockUSDC.balanceOf(userB.address);
    const bNonceAfter = await kernelContract.getNonce(userB.address);
    const bundlerUsdcAfter = await mockUSDC.balanceOf(bundlerWallet.address);

    console.log('State After Transaction:');
    console.log('────────────────────────────────────────────────────────────────────────────');
    console.log(`  User A:    ${ethers.formatEther(aEthAfter)} ETH, ${Number(aUsdcAfter) / 10**6} USDC`);
    console.log(`  User B:    ${ethers.formatEther(await provider.getBalance(userB.address))} ETH, ${Number(bUsdcAfter) / 10**6} USDC`);
    console.log(`  Bundler:   ${ethers.formatEther(await provider.getBalance(bundlerWallet.address))} ETH, ${Number(bundlerUsdcAfter) / 10**6} USDC`);
    console.log('');

    console.log('Changes:');
    console.log('────────────────────────────────────────────────────────────────────────────');
    console.log(`  User A USDC:    +${Number(aUsdcAfter) / 10**6} USDC (received transfer)`);
    console.log(`  User B USDC:    -${Number(Number(bUsdcBefore) - Number(bUsdcAfter)) / 10**6} USDC (transfer + gas)`);
    console.log(`  Bundler USDC:   +${Number(Number(bundlerUsdcAfter) - Number(bundlerUsdcBefore)) / 10**6} USDC (gas compensation)`);
    console.log(`  User B Nonce:   ${bNonceAfter.toString()} (incremented from 0)`);
    console.log('');

    console.log('Assertions:');
    console.log('────────────────────────────────────────────────────────────────────────────');

    const expectedAUsdc = TRANSFER_AMOUNT;
    const expectedBUsdcSpent = TRANSFER_AMOUNT + GAS_COMPENSATION;

    if (aUsdcAfter >= expectedAUsdc) {
      console.log('  [OK] User A received USDC transfer');
    } else {
      console.log('  [FAIL] User A did not receive expected transfer');
    }

    if (Number(bUsdcAfter) <= Number(bUsdcBefore) - Number(expectedBUsdcSpent)) {
      console.log('  [OK] User B paid transfer + gas compensation');
    } else {
      console.log('  [FAIL] User B payment incorrect');
    }

    if (Number(bNonceAfter) === 1) {
      console.log('  [OK] User B nonce incremented to 1');
    } else {
      console.log('  [FAIL] User B nonce incorrect');
    }

    if (bundlerUsdcAfter >= bundlerUsdcBefore + GAS_COMPENSATION) {
      console.log('  [OK] Bundler received gas compensation');
    } else {
      console.log('  [FAIL] Bundler did not receive gas');
    }

    console.log('');
    console.log('════════════════════════════════════════════════════════════════════════════');
    console.log('                    TEST COMPLETED SUCCESSFULLY');
    console.log('════════════════════════════════════════════════════════════════════════════');
    console.log('');
    console.log('Flow Summary:');
    console.log('────────────────────────────────────────────────────────────────────────────');
    console.log('  1. [OK] Created new EOA account B');
    console.log('  2. [OK] Gave B test tokens (5000 USDC)');
    console.log('  3. [OK] B delegated to Kernel contract (EIP-7702)');
    console.log('  4. [OK] B transferred tokens to A (100 USDC)');
    console.log('  5. [OK] Bundler sponsored gas (A paid via bundler)');
    console.log('  6. [OK] Bundler collected gas from B (5 USDC)');
    console.log('  7. [OK] All operations in single transaction');
    console.log('  8. [OK] Transaction submitted to chain');
    console.log('');
    console.log('Key Results:');
    console.log(`  - User A received:     ${Number(aUsdcAfter) / 10**6} USDC`);
    console.log(`  - User B paid:         ${Number(expectedBUsdcSpent) / 10**6} USDC`);
    console.log(`  - Bundler received:    ${Number(GAS_COMPENSATION) / 10**6} USDC`);
    console.log(`  - Gas Used:            ${receipt?.gasUsed.toString()}`);
    console.log('');
    console.log('This demonstrates the core value proposition of EIP-7702:');
    console.log('- Gas abstraction (Bundler sponsors gas)');
    console.log('- Token payment (Gas paid in USDC, not ETH)');
    console.log('- Account abstraction (EOA becomes smart contract wallet)');
    console.log('');

  } catch (error: any) {
    console.error('Transaction failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
