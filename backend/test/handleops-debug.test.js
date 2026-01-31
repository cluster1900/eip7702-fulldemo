/**
 * Debug handleOps failure
 */

import { ethers } from 'ethers';
import { config } from '../src/config.js';

const ENTRY_POINT_ADDRESS = config.entryPointAddress;
const KERNEL_ADDRESS = config.kernelAddress;

const ENTRYPOINT_ABI = [
  'function getUserOpHash((address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature) memory userOp) view returns (bytes32)',
  'function handleOps((address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature)[] ops, address beneficiary) external',
  'function simulateValidation((address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature) memory userOp) payable returns (uint256 validationData, uint256)'
];

function signUserOpHash(privateKey, hash) {
  const signingKey = new ethers.SigningKey(privateKey);
  const sig = signingKey.sign(hash);
  const vHex = sig.v === 27 ? '1b' : '1c';
  return '0x' + sig.r.substring(2) + sig.s.substring(2) + vHex;
}

async function main() {
  console.log('=== HandleOps Debug ===\n');

  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const bundlerWallet = new ethers.Wallet(config.bundlerPrivateKey, provider);

  // Fresh account
  const freshPrivateKey = '0x1234567890123456789012345678901234567890123456789012345678901234';
  const userWallet = new ethers.Wallet(freshPrivateKey, provider);

  console.log('User:', userWallet.address);
  console.log('EntryPoint:', ENTRY_POINT_ADDRESS);
  console.log('Kernel:', KERNEL_ADDRESS);
  console.log('');

  // Set EIP-7702 code
  const eip7702Code = '0xef0100' + KERNEL_ADDRESS.substring(2).toLowerCase();
  await provider.send('anvil_setCode', [userWallet.address, eip7702Code]);
  console.log('EIP-7702 code set:', eip7702Code);

  // Verify code
  const userCode = await provider.getCode(userWallet.address);
  console.log('User code length:', userCode.length);
  console.log('');

  // Fund Kernel
  const kernelBalance = await provider.getBalance(KERNEL_ADDRESS);
  if (kernelBalance < 2n * 10n**18n) {
    console.log('Funding Kernel...');
    const tx = await bundlerWallet.sendTransaction({
      to: KERNEL_ADDRESS,
      value: 2n * 10n**18n - kernelBalance
    });
    await tx.wait();
  }
  console.log('Kernel balance:', ethers.formatEther(await provider.getBalance(KERNEL_ADDRESS)));
  console.log('');

  // Build UserOp
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

  const accountGasLimits = ethers.solidityPacked(['uint128', 'uint128'], [100000n, 100000n]);
  const gasFees = ethers.solidityPacked(['uint128', 'uint128'], [ethers.parseUnits('1', 'gwei'), ethers.parseUnits('1', 'gwei')]);

  const userOp = {
    sender: userWallet.address,
    nonce: 0n,
    initCode: '0x',
    callData: callData,
    accountGasLimits: accountGasLimits,
    preVerificationGas: 21000n,
    gasFees: gasFees,
    paymasterAndData: '0x',
    signature: '0x'
  };

  // Get UserOpHash
  const entryPoint = new ethers.Contract(ENTRY_POINT_ADDRESS, ENTRYPOINT_ABI, provider);
  const userOpHash = await entryPoint.getUserOpHash(userOp);
  console.log('UserOpHash:', userOpHash);

  // Sign
  const signature = signUserOpHash(freshPrivateKey, userOpHash);
  userOp.signature = signature;
  console.log('Signature:', signature);
  console.log('');

  // Verify signature
  const r = '0x' + signature.slice(2, 66);
  const s = '0x' + signature.slice(66, 130);
  const v = parseInt(signature.slice(130, 132), 16);
  const recovered = ethers.recoverAddress(userOpHash, { r, s, v });
  console.log('Signature verification:', recovered === userWallet.address ? 'PASS' : 'FAIL');

  // Try simulateValidation
  console.log('\nTrying simulateValidation...');
  try {
    const simulationResult = await entryPoint.simulateValidation(userOp);
    console.log('simulateValidation result:');
    console.log('  validationData:', simulationResult.validationData.toString());
  } catch (e) {
    console.log('simulateValidation failed:', e.message);
  }

  // Try handleOps
  console.log('\nTrying handleOps...');
  const handleOpsInterface = new ethers.Interface([
    'function handleOps((address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature)[] ops, address beneficiary) external'
  ]);
  const handleOpsData = handleOpsInterface.encodeFunctionData('handleOps', [[userOp], bundlerWallet.address]);

  try {
    const tx = await bundlerWallet.sendTransaction({
      to: ENTRY_POINT_ADDRESS,
      data: handleOpsData,
      gasLimit: 1000000
    });
    console.log('handleOps sent:', tx.hash);
    const receipt = await tx.wait();
    console.log('Status:', receipt.status === 1 ? 'SUCCESS' : 'FAILED');
  } catch (e) {
    console.log('handleOps failed:', e.message);
    if (e.data) console.log('Error data:', e.data);
  }
}

main().catch(console.error);
