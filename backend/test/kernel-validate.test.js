import { ethers } from 'ethers';
const provider = new ethers.JsonRpcProvider('http://localhost:8545');

const bundlerWallet = new ethers.Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', provider);
const freshPrivateKey = '0x1234567890123456789012345678901234567890123456789012345678901234';
const freshWallet = new ethers.Wallet(freshPrivateKey, provider);

const ENTRY_POINT = '0xd3ece3409b27aa484c303a41ec4ba83c4973335a';
const KERNEL = '0x1bbed5ce00949dc5b16e9f6a2e8a71f37c6fe86a';

console.log('=== Direct Kernel Validation Test ===');
console.log('Fresh wallet:', freshWallet.address);
console.log('Kernel:', KERNEL);

// Build callData
const kernelInterface = new ethers.Interface([
  'function executeBatch((address target, uint256 value, bytes data)[] calls) external'
]);

const calls = [{
  target: bundlerWallet.address,
  value: ethers.parseEther('0.001'),
  data: '0x'
}];

const callData = kernelInterface.encodeFunctionData('executeBatch', [calls]);

const userOp = {
  sender: freshWallet.address,
  nonce: 0n,
  initCode: '0x',
  callData: callData,
  accountGasLimits: '0x000000000000000000000000000186a0000000000000000000000000000186a0',
  preVerificationGas: 21000n,
  gasFees: '0x0000000000000000000000003b9aca000000000000000000000000003b9aca00',
  paymasterAndData: '0x',
  signature: '0x'
};

// Get hash
const entryPointInterface = new ethers.Interface([
  'function getUserOpHash((address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature) memory userOp) view returns (bytes32)'
]);

const entryPoint = new ethers.Contract(ENTRY_POINT, entryPointInterface, provider);
const userOpForHash = {
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

const userOpHash = await entryPoint.getUserOpHash(userOpForHash);
console.log('UserOpHash:', userOpHash);

// Sign directly (no Ethereum prefix)
const signingKey = new ethers.SigningKey(freshPrivateKey);
const sigObj = signingKey.sign(userOpHash);
const sig = '0x' + sigObj.r.slice(2) + sigObj.s.slice(2) + (sigObj.v === 27 ? '1b' : '1c');
console.log('Signature:', sig);

// Verify signature
const r = '0x' + sig.slice(2, 66);
const s = '0x' + sig.slice(66, 130);
const v = parseInt(sig.slice(130, 132), 16);
const recovered = ethers.recoverAddress(userOpHash, { r, s, v });
console.log('Recovered:', recovered);
console.log('Match:', recovered.toLowerCase() === freshWallet.address.toLowerCase());

// Try calling Kernel.validateUserOp directly
console.log('\n=== Calling Kernel.validateUserOp directly ===');
const kernelValidateInterface = new ethers.Interface([
  'function validateUserOp((address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature) memory userOp, bytes32 userOpHash, uint256 missingAccountFunds) returns (uint256)'
]);

const userOpWithSig = { ...userOp, signature: sig };
const validateData = kernelValidateInterface.encodeFunctionData('validateUserOp', [
  userOpWithSig,
  userOpHash,
  0n
]);

try {
  const result = await provider.call({
    to: KERNEL,
    data: validateData
  });
  console.log('Validation result:', result);
} catch (e) {
  console.log('Validation error:', e.message);
  if (e.data) console.log('Error data:', e.data);
}
