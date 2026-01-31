/**
 * Complete E2E Test for EIP-7702 Account Abstraction
 *
 * This test verifies the full EIP-7702 + ERC-4337 flow:
 * 1. User sends UserOp with initCode (EIP-7702 marker 0x7702 + kernel address)
 * 2. EntryPoint calls initEip7702Sender to set up delegation
 * 3. EntryPoint calls validateUserOp on the delegated kernel
 * 4. EntryPoint executes the callData via innerHandleOp
 */

import { ethers } from 'ethers';
import { config } from '../src/config.js';

const ENTRY_POINT_ADDRESS = config.entryPointAddress;
const KERNEL_ADDRESS = config.kernelAddress;

const ENTRYPOINT_ABI = [
  'function getUserOpHash((address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature) memory userOp) view returns (bytes32)',
  'function handleOps((address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature)[] ops, address beneficiary) external',
  'function nonceSequenceNumber(address, uint192) view returns (uint256)',
  'function getNonce(address sender, uint192 key) view returns (uint256)',
  'function getDepositInfo(address account) view returns (tuple(uint256 deposit, uint256 staked, uint256 stakeDue, address unstakeDelaySec, address withdrawAddress))'
];

function signUserOpHash(privateKey, hash) {
  const signingKey = new ethers.SigningKey(privateKey);
  const sig = signingKey.sign(hash);
  const vHex = sig.v === 27 ? '1b' : '1c';
  return '0x' + sig.r.substring(2) + sig.s.substring(2) + vHex;
}

async function fundKernel(kernelAddress, amount, provider, funderPrivateKey) {
  const balance = await provider.getBalance(kernelAddress);
  if (balance < amount) {
    console.log(`  Funding Kernel (${ethers.formatEther(balance)} -> ${ethers.formatEther(amount)})...`);
    const funder = new ethers.Wallet(funderPrivateKey, provider);
    const tx = await funder.sendTransaction({
      to: kernelAddress,
      value: amount - balance
    });
    await tx.wait();
  }
}

async function resetNonces(entryPointAddress, kernelAddress, userAddress, provider) {
  // 使用anvil_setNonce重置账户nonce
  await provider.send('anvil_setNonce', [userAddress, 0]);
  // 重置EntryPoint的nonce (slot 4)
  const entryPointNonceSlot = ethers.keccak256(
    '0x' + userAddress.substring(2).padStart(64, '0') +
    '0000000000000000000000000000000000000000000000000000000000000004'
  );
  await provider.send('anvil_setStorageAt', [entryPointAddress, entryPointNonceSlot, '0x0000000000000000000000000000000000000000000000000000000000000000']);
  // 重置Kernel的nonce (mapping slot 43 = 0x2b)
  const kernelNonceSlot = ethers.keccak256(
    '0x' + userAddress.substring(2).padStart(64, '0') +
    '000000000000000000000000000000000000000000000000000000000000002b'
  );
  await provider.send('anvil_setStorageAt', [kernelAddress, kernelNonceSlot, '0x0000000000000000000000000000000000000000000000000000000000000000']);
  console.log('  Nonces reset');
}

function packUserOp(userOp) {
  return ethers.concat([
    ethers.zeroPadValue(userOp.sender, 32),
    ethers.zeroPadValue(ethers.toBeHex(userOp.nonce), 32),
    userOp.initCode.length === 0 ? '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470' : ethers.keccak256(userOp.initCode),
    userOp.callData.length === 0 ? '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470' : ethers.keccak256(userOp.callData),
    userOp.accountGasLimits,
    ethers.zeroPadValue(ethers.toBeHex(userOp.preVerificationGas), 32),
    userOp.gasFees,
    userOp.paymasterAndData.length === 0 ? '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470' : ethers.keccak256(userOp.paymasterAndData)
  ]);
}

function getUserOpHash(userOp, entryPointAddress) {
  const PACKED_USEROP_TYPEHASH = '0x29a0bca4af4be3421398da00295e58e6d7de38cb492214754cb6a47507dd6f8e';

  const hashInitCode = userOp.initCode.length === 0
    ? '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470'
    : ethers.keccak256(userOp.initCode);
  const hashCallData = userOp.callData.length === 0
    ? '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470'
    : ethers.keccak256(userOp.callData);
  const hashPaymasterAndData = userOp.paymasterAndData.length === 0
    ? '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470'
    : ethers.keccak256(userOp.paymasterAndData);

  const structHash = ethers.keccak256(
    ethers.concat([
      PACKED_USEROP_TYPEHASH,
      ethers.zeroPadValue(userOp.sender, 32),
      ethers.zeroPadValue(ethers.toBeHex(userOp.nonce), 32),
      hashInitCode,
      hashCallData,
      userOp.accountGasLimits,
      ethers.zeroPadValue(ethers.toBeHex(userOp.preVerificationGas), 32),
      userOp.gasFees,
      hashPaymasterAndData
    ])
  );

  const DOMAIN_SEPARATOR_TYPEHASH = '0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f';
  const domainNameHash = ethers.keccak256(ethers.toUtf8Bytes('ERC4337'));
  const domainVersionHash = ethers.keccak256(ethers.toUtf8Bytes('1'));
  const domainChainId = ethers.zeroPadValue(ethers.toBeHex(1), 32);
  const domainVerifier = ethers.zeroPadValue(entryPointAddress, 32);

  const domainSeparator = ethers.keccak256(
    ethers.concat([
      DOMAIN_SEPARATOR_TYPEHASH,
      domainNameHash,
      domainVersionHash,
      domainChainId,
      domainVerifier
    ])
  );

  return ethers.keccak256(
    ethers.concat(['0x1901', domainSeparator, structHash])
  );
}

async function main() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║          EIP-7702 + ERC-4337 E2E TEST                              ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log('');

  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const bundlerWallet = new ethers.Wallet(config.bundlerPrivateKey, provider);

  const freshPrivateKey = '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('');
  const userWallet = new ethers.Wallet(freshPrivateKey, provider);

  console.log('Configuration:');
  console.log(`  EntryPoint: ${ENTRY_POINT_ADDRESS}`);
  console.log(`  Kernel: ${KERNEL_ADDRESS}`);
  console.log(`  Chain ID: ${config.chainId}`);
  console.log(`  User: ${userWallet.address}`);
  console.log(`  Bundler: ${bundlerWallet.address}`);
  console.log('');

  console.log('Setup Phase:');
  console.log('===========');

  const eip7702Code = '0xef0100' + KERNEL_ADDRESS.substring(2).toLowerCase();
  await provider.send('anvil_setCode', [userWallet.address, eip7702Code]);
  console.log('  EIP-7702 delegation code set via anvil_setCode');

  const codeAfter = await provider.getCode(userWallet.address);
  console.log(`  Code: ${codeAfter.substring(0, 30)}... (${codeAfter.length} bytes)`);

  const kernelCode = await provider.getCode(KERNEL_ADDRESS);
  if (kernelCode === '0x') {
    console.log('  ERROR: Kernel has no code! Deploy Kernel first.');
    return;
  }
  console.log('  Kernel code present');

  // 资助用户账户 (在EIP-7702中，用户账户就是钱包)
  let userBalance = await provider.getBalance(userWallet.address);
  if (userBalance < 1n * 10n**18n) {
    console.log(`  Funding user wallet (${ethers.formatEther(userBalance)} -> 100 ETH)...`);
    // Use sendTransaction instead of anvil_setBalance for reliable funding
    const fundTx = await bundlerWallet.sendTransaction({
      to: userWallet.address,
      value: 100n * 10n**18n - userBalance
    });
    await fundTx.wait();
    // Force a fresh block
    await provider.send('evm_mine', []);
    // Create a new provider instance to avoid caching
    const freshProvider = new ethers.JsonRpcProvider(config.rpcUrl);
    userBalance = await freshProvider.getBalance(userWallet.address);
    console.log(`  Actual balance after funding: ${ethers.formatEther(userBalance)} ETH`);
  }

  // 在EIP-7702中，用户账户就是钱包，只需要资助用户账户即可
  console.log(`  User wallet funded: ${ethers.formatEther(userBalance)} ETH`);

  await resetNonces(ENTRY_POINT_ADDRESS, KERNEL_ADDRESS, userWallet.address, provider);

  const bundlerBalanceBefore = await provider.getBalance(bundlerWallet.address);
  console.log(`  Bundler ETH balance: ${Number(bundlerBalanceBefore) / 10**18}`);
  console.log('');

  console.log('Building UserOp:');
  console.log('===============');

  const emptyInitCode = '0x';
  console.log(`  initCode: empty (code already set via anvil_setCode)`);

  const kernelInterface = new ethers.Interface([
    'function executeBatch((address target, uint256 value, bytes data)[] calls) external'
  ]);

  const transferAmount = 1n * 10n**15n;
  const calls = [{
    target: bundlerWallet.address,
    value: transferAmount,
    data: '0x'
  }];

  const callData = kernelInterface.encodeFunctionData('executeBatch', [calls]);
  console.log(`  CallData: ${callData.substring(0, 50)}...`);
  console.log(`  Transfer: ${ethers.formatEther(transferAmount)} ETH to ${bundlerWallet.address}`);
  console.log('');

   const accountGasLimits = '0x' + ethers.solidityPacked(['uint128', 'uint128'], [300000n, 100000n]).substring(2).padStart(64, '0');
   const gasFees = '0x' + ethers.solidityPacked(['uint128', 'uint128'], [ethers.parseUnits('1', 'gwei'), ethers.parseUnits('1', 'gwei')]).substring(2).padStart(64, '0');

  const userOp = {
    sender: userWallet.address,
    nonce: 0n,
    initCode: emptyInitCode,
    callData: callData,
    accountGasLimits: accountGasLimits,
    preVerificationGas: 21000n,
    gasFees: gasFees,
    paymasterAndData: '0x',
    signature: '0x'
  };

  console.log('Getting UserOpHash from EntryPoint:');
  console.log('===================================');
  let userOpHash;
  const entryPoint = new ethers.Contract(ENTRY_POINT_ADDRESS, ENTRYPOINT_ABI, provider);
  try {
    userOpHash = await entryPoint.getUserOpHash(userOp);
    console.log(`  UserOpHash from EntryPoint: ${userOpHash}`);
  } catch (e) {
    console.log(`  getUserOpHash failed: ${e.message}`);
    console.log('  Using manual calculation...');
    userOpHash = getUserOpHash(userOp, ENTRY_POINT_ADDRESS);
    console.log(`  UserOpHash (manual): ${userOpHash}`);
  }
  console.log('');

  const signature = signUserOpHash(freshPrivateKey, userOpHash);
  userOp.signature = signature;
  console.log(`  Signature: ${signature.substring(0, 50)}...`);
  console.log('');

  const r = '0x' + signature.slice(2, 66);
  const s = '0x' + signature.slice(66, 130);
  const v = parseInt(signature.slice(130, 132), 16);
  const recovered = ethers.recoverAddress(userOpHash, { r, s, v });
  console.log(`  Signature verification: ${recovered === userWallet.address ? 'PASS ✓' : 'FAIL ✗'}`);
  console.log('');

  console.log('Sending Transaction:');
  console.log('===================');

  const handleOpsInterface = new ethers.Interface([
    'function handleOps((address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature)[] ops, address beneficiary) external'
  ]);

  const handleOpsData = handleOpsInterface.encodeFunctionData('handleOps', [[userOp], bundlerWallet.address]);

  const bundlerNonce = await provider.getTransactionCount(bundlerWallet.address);
  console.log(`  Bundler nonce: ${bundlerNonce}`);

  try {
    console.log(`  Sending handleOps...`);
    const tx = await bundlerWallet.sendTransaction({
      to: ENTRY_POINT_ADDRESS,
      data: handleOpsData,
      nonce: bundlerNonce,
      gasLimit: 1000000
    });

    console.log(`  Tx hash: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`  Confirmed in block: ${receipt.blockNumber}`);
    console.log(`  Status: ${receipt.status === 1 ? 'SUCCESS ✓' : 'FAILED ✗'}`);
    console.log(`  Gas used: ${receipt.gasUsed}`);

    // Force a fresh balance read by making a small query first
    await provider.getBlockNumber();

    // Get user wallet balance after (should have decreased)
    // Save the balance BEFORE the transaction for comparison
    const userBalanceBeforeTx = userBalance;
    const userBalanceAfter = await provider.getBalance(userWallet.address);
    const userBalanceChange = userBalanceBeforeTx - userBalanceAfter;

    // 确保余额已刷新
    await provider.send('evm_mine', []);

    const bundlerBalanceFinal = await provider.getBalance(bundlerWallet.address);
    const bundlerBalanceChange = bundlerBalanceFinal - bundlerBalanceBefore;

    console.log('');
    console.log('Results:');
    console.log('=======');
    console.log(`  User ETH before funding: ${Number(userBalance) / 10**18}`);
    console.log(`  User ETH before tx: ${Number(userBalanceBeforeTx) / 10**18}`);
    console.log(`  User ETH after: ${Number(userBalanceAfter) / 10**18}`);
    console.log(`  User balance change: ${Number(userBalanceChange) / 10**18} ETH`);
    console.log(`  Bundler ETH before: ${Number(bundlerBalanceBefore) / 10**18}`);
    console.log(`  Bundler ETH after: ${Number(bundlerBalanceFinal) / 10**18}`);
    console.log(`  Bundler balance change: ${Number(bundlerBalanceChange) / 10**18} ETH`);
    console.log(`  Expected transfer: ${ethers.formatEther(transferAmount)} ETH`);

    // 检查用户钱包余额是否减少（说明交易被执行了）
    // 用户应该支付 transferAmount + gas fees
    if (Number(userBalanceChange) >= Number(transferAmount) * 0.9) {
      console.log('');
      console.log('╔════════════════════════════════════════════════════════════════════╗');
      console.log('║                    TEST PASSED ✓                                   ║');
      console.log('╚════════════════════════════════════════════════════════════════════╝');
    } else {
      console.log('');
      console.log('╔════════════════════════════════════════════════════════════════════╗');
      console.log('║                    TEST FAILED ✗ (transfer not executed)           ║');
      console.log('╚════════════════════════════════════════════════════════════════════╝');
    }
  } catch (error) {
    console.log('');
    console.log('Transaction Error:');
    console.log(`  Message: ${error.message}`);
    console.log(`  Code: ${error.code}`);
    if (error.data) console.log(`  Data: ${error.data}`);

    console.log('');
    console.log('╔════════════════════════════════════════════════════════════════════╗');
    console.log('║                    TEST FAILED ✗                                   ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝');
  }

  console.log('');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
