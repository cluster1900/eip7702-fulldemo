/**
 * Complete E2E Test for EIP-7702 Account Abstraction
 * This test verifies:
 * 1. Hash calculation matches EntryPoint.getUserOpHash
 * 2. Signature verification works correctly
 * 3. Full transaction flow via EntryPoint.handleOps
 */

import { ethers } from 'ethers';
import { config } from '../src/config.js';

const ENTRYPOINT_ABI = [
  'function getUserOpHash((address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature) memory userOp) view returns (bytes32)',
  'function handleOps((address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature)[] ops, address beneficiary) external',
  'function nonceSequenceNumber(address, uint192) view returns (uint256)',
  'function getNonce(address sender, uint192 key) view returns (uint256)'
];

const KERNEL_ABI = [
  'function validateUserOp((address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature) memory userOp, bytes32 userOpHash, uint256 missingAccountFunds) returns (uint256)',
  'function nonces(address user) view returns (uint256)',
  'function _recoverSigner(bytes32 messageHash, bytes memory signature) pure returns (address)'
];

function buildPackedUserOp(params) {
  return {
    sender: params.sender,
    nonce: params.nonce,
    initCode: params.initCode || '0x',
    callData: params.callData,
    accountGasLimits: params.accountGasLimits,
    preVerificationGas: params.preVerificationGas || 21000n,
    gasFees: params.gasFees,
    paymasterAndData: params.paymasterAndData || '0x',
    signature: params.signature || '0x'
  };
}

function calculateStructHash(userOp) {
  const hashInitCode = userOp.initCode.length === 0 ? ethers.ZeroHash : ethers.keccak256(userOp.initCode);
  const hashCallData = userOp.callData.length === 0 ? ethers.ZeroHash : ethers.keccak256(userOp.callData);
  const hashPaymasterAndData = userOp.paymasterAndData.length === 0 ? ethers.ZeroHash : ethers.keccak256(userOp.paymasterAndData);

  const PACKED_USEROP_TYPEHASH = '0x29a0bca4af4be3421398da00295e58e6d7de38cb492214754cb6a47507dd6f8e';

  return ethers.keccak256(
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
}

function calculateDomainSeparator(entryPointAddress, chainId) {
  const DOMAIN_SEPARATOR_TYPEHASH = '0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f';
  const domainNameHash = ethers.keccak256(ethers.toUtf8Bytes('ERC4337'));
  const domainVersionHash = ethers.keccak256(ethers.toUtf8Bytes('1'));

  return ethers.keccak256(
    ethers.concat([
      DOMAIN_SEPARATOR_TYPEHASH,
      domainNameHash,
      domainVersionHash,
      ethers.zeroPadValue(ethers.toBeHex(chainId), 32),
      ethers.zeroPadValue(entryPointAddress, 32)
    ])
  );
}

function calculateUserOpHash(userOp, entryPointAddress, chainId) {
  const structHash = calculateStructHash(userOp);
  const domainSeparator = calculateDomainSeparator(entryPointAddress, chainId);

  return ethers.keccak256(
    ethers.concat(['0x1901', domainSeparator, structHash])
  );
}

function signUserOpHash(privateKey, hash) {
  const signingKey = new ethers.SigningKey(privateKey);
  const sig = signingKey.sign(hash);
  const vHex = sig.v === 27 ? '1b' : '1c';
  return '0x' + sig.r.substring(2) + sig.s.substring(2) + vHex;
}

async function setupUserAccount(userPrivateKey, kernelAddress, ethAmount, provider) {
  const userWallet = new ethers.Wallet(userPrivateKey, provider);

  const code = await provider.getCode(userWallet.address);
  if (code === '0x') {
    console.log('  Setting EIP-7702 delegation code...');
    const delegationCode = '0xef0100' + kernelAddress.substring(2);
    await provider.send('anvil_setCode', [userWallet.address, delegationCode]);
  }

  const balance = await provider.getBalance(userWallet.address);
  if (balance < ethAmount) {
    console.log('  Funding user account...');
    const funder = new ethers.Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', provider);
    const tx = await funder.sendTransaction({
      to: userWallet.address,
      value: ethAmount - balance
    });
    await tx.wait();
  }

  return userWallet;
}

async function fundKernel(kernelAddress, amount, provider) {
  const balance = await provider.getBalance(kernelAddress);
  if (balance < amount) {
    console.log('  Funding Kernel for prefund...');
    const funder = new ethers.Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', provider);
    const tx = await funder.sendTransaction({
      to: kernelAddress,
      value: amount - balance
    });
    await tx.wait();
  }
}

async function resetNonces(entryPointAddress, kernelAddress, userAddress, provider) {
  const nonceSlot = ethers.keccak256(
    '0x' + userAddress.substring(2).padStart(64, '0') +
    '0000000000000000000000000000000000000000000000000000000000000004'
  );
  await provider.send('anvil_setStorageAt', [entryPointAddress, nonceSlot, '0x0000000000000000000000000000000000000000000000000000000000000000']);

  const kernelNonceSlot = ethers.keccak256(
    '0x' + userAddress.substring(2).padStart(64, '0') +
    '0000000000000000000000000000000000000000000000000000000000000002'
  );
  await provider.send('anvil_setStorageAt', [kernelAddress, kernelNonceSlot, '0x0000000000000000000000000000000000000000000000000000000000000000']);
}

async function main() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║          COMPLETE E2E EIP-7702 TEST                               ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log('');

  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const bundlerWallet = new ethers.Wallet(config.bundlerPrivateKey, provider);
  const userBPrivateKey = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a';

  console.log('Configuration:');
  console.log(`  EntryPoint: ${config.entryPointAddress}`);
  console.log(`  Kernel: ${config.kernelAddress}`);
  console.log(`  Chain ID: ${config.chainId}`);
  console.log('');

  console.log('Setup Phase:');
  console.log('===========');

  const userB = await setupUserAccount(userBPrivateKey, config.kernelAddress, 1n * 10n**18n, provider);
  console.log(`  User B: ${userB.address}`);

  await fundKernel(config.kernelAddress, 1n * 10n**18n, provider);
  console.log(`  Kernel funded`);

  await resetNonces(config.entryPointAddress, config.kernelAddress, userB.address, provider);
  console.log('  Nonces reset');

  const bundlerBalanceBefore = await provider.getBalance(bundlerWallet.address);
  console.log(`  Bundler ETH balance: ${Number(bundlerBalanceBefore) / 10**18}`);
  console.log('');

  console.log('Building UserOp:');
  console.log('===============');

  const transferAmount = 1n * 10n**15n; // 0.001 ETH

  const calls = [{
    target: bundlerWallet.address,
    value: transferAmount,
    data: '0x'
  }];

  const kernelInterface = new ethers.Interface([
    'function executeBatch((address target, uint256 value, bytes data)[] calls)'
  ]);

  const callData = kernelInterface.encodeFunctionData('executeBatch', [calls]);

  console.log(`  CallData: ${callData.substring(0, 50)}...`);
  console.log(`  Function: executeBatch with ETH transfer`);
  console.log(`  Amount: ${Number(transferAmount) / 10**18} ETH`);
  console.log(`  From: ${userB.address}`);
  console.log(`  To: ${bundlerWallet.address}`);
  console.log('');

  const entryPointForNonce = new ethers.Contract(config.entryPointAddress, ENTRYPOINT_ABI, provider);
  const userOpNonce = await entryPointForNonce.getNonce(userB.address, 0n);
  console.log(`  EntryPoint nonce: ${userOpNonce}`);

  const accountGasLimits = ethers.solidityPacked(['uint128', 'uint128'], [100000n, 100000n]);
  const gasFees = ethers.solidityPacked(['uint128', 'uint128'], [ethers.parseUnits('1', 'gwei'), ethers.parseUnits('1', 'gwei')]);

  const userOp = buildPackedUserOp({
    sender: userB.address,
    nonce: userOpNonce,
    initCode: '0x',
    callData: callData,
    accountGasLimits: accountGasLimits,
    preVerificationGas: 21000n,
    gasFees: gasFees,
    paymasterAndData: '0x',
    signature: '0x'
  });

  console.log('UserOp:');
  console.log(`  Nonce: ${userOp.nonce}`);
  console.log(`  Sender: ${userOp.sender}`);
  console.log('');

  console.log('Hash Calculation:');
  console.log('================');

  const userOpHash = calculateUserOpHash(userOp, config.entryPointAddress, config.chainId);
  console.log(`  userOpHash: ${userOpHash}`);

  const entryPoint = new ethers.Contract(config.entryPointAddress, ENTRYPOINT_ABI, provider);
  const userOpForEP = {
    sender: userOp.sender,
    nonce: userOp.nonce,
    initCode: userOp.initCode,
    callData: userOp.callData,
    accountGasLimits: userOp.accountGasLimits,
    preVerificationGas: userOp.preVerificationGas,
    gasFees: userOp.gasFees,
    paymasterAndData: userOp.paymasterAndData,
    signature: userOp.signature
  };

  const userOpHashFromEP = await entryPoint.getUserOpHash(userOpForEP);
  console.log(`  userOpHash (EntryPoint): ${userOpHashFromEP}`);
  console.log(`  Match: ${userOpHash === userOpHashFromEP ? 'YES ✓' : 'NO ✗'}`);
  console.log('');

  console.log('Signature:');
  console.log('==========');

  const signature = signUserOpHash(userBPrivateKey, userOpHash);
  userOp.signature = signature;
  console.log(`  Signature: ${signature.substring(0, 50)}...`);
  console.log(`  Length: ${signature.length}`);

  const r = '0x' + signature.slice(2, 66);
  const s = '0x' + signature.slice(66, 130);
  const v = parseInt(signature.slice(130, 132), 16);

  const recovered = ethers.recoverAddress(userOpHash, { r, s, v });
  console.log(`  Recovered: ${recovered}`);
  console.log(`  Expected: ${userB.address}`);
  console.log(`  Match: ${recovered.toLowerCase() === userB.address.toLowerCase() ? 'YES ✓' : 'NO ✗'}`);
  console.log('');

  console.log('Sending Transaction:');
  console.log('===================');

  const entryPointInterface = new ethers.Interface([
    'function handleOps((address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature)[] ops, address beneficiary) external'
  ]);

  const handleOpsData = entryPointInterface.encodeFunctionData('handleOps', [[userOp], bundlerWallet.address]);

  try {
    const bundlerNonce = await provider.getTransactionCount(bundlerWallet.address);
    console.log(`  Bundler nonce: ${bundlerNonce}`);

    const tx = await bundlerWallet.sendTransaction({
      to: config.entryPointAddress,
      data: handleOpsData,
      nonce: bundlerNonce,
      gasLimit: 500000
    });

    console.log(`  Tx hash: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`  Confirmed in block: ${receipt.blockNumber}`);
    console.log(`  Status: ${receipt.status === 1 ? 'SUCCESS ✓' : 'FAILED ✗'}`);

    const bundlerBalanceAfter = await provider.getBalance(bundlerWallet.address);
    console.log('');
    console.log('Results:');
    console.log('=======');
    console.log(`  Bundler ETH before: ${Number(bundlerBalanceBefore) / 10**18}`);
    console.log(`  Bundler ETH after: ${Number(bundlerBalanceAfter) / 10**18}`);
    console.log(`  Transfer amount: ${Number(transferAmount) / 10**18} ETH`);

    if (Number(bundlerBalanceAfter) > Number(bundlerBalanceBefore)) {
      console.log('');
      console.log('╔════════════════════════════════════════════════════════════════════╗');
      console.log('║                    TEST PASSED ✓                                   ║');
      console.log('╚════════════════════════════════════════════════════════════════════╝');
    } else {
      console.log('');
      console.log('╔════════════════════════════════════════════════════════════════════╗');
      console.log('║                    TEST FAILED ✗                                   ║');
      console.log('╚════════════════════════════════════════════════════════════════════╝');
    }
  } catch (error) {
    console.log('');
    console.log('Transaction Error:');
    console.log(`  Message: ${error.message}`);
    console.log(`  Code: ${error.code}`);

    if (error.data) {
      console.log(`  Data: ${error.data}`);
    }

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
