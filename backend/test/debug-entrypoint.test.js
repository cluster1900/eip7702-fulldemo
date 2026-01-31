import { ethers } from 'ethers';
const provider = new ethers.JsonRpcProvider('http://localhost:8545');

const bundlerWallet = new ethers.Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', provider);
const freshPrivateKey = '0x1234567890123456789012345678901234567890123456789012345678901234';
const freshWallet = new ethers.Wallet(freshPrivateKey, provider);

const ENTRY_POINT = '0xd3ece3409b27aa484c303a41ec4ba83c4973335a';
const KERNEL = '0x1bbed5ce00949dc5b16e9f6a2e8a71f37c6fe86a';

console.log('=== Debug EntryPoint Calls ===');

// Check EntryPoint code
const entryPointCode = await provider.getCode(ENTRY_POINT);
console.log('EntryPoint code length:', entryPointCode.length);

// Check Kernel code
const kernelCode = await provider.getCode(KERNEL);
console.log('Kernel code length:', kernelCode.length);

// Check sender code
const senderCode = await provider.getCode(freshWallet.address);
console.log('Sender code:', senderCode);

// Try calling EntryPoint.getNonce
const entryPointInterface = new ethers.Interface([
  'function getNonce(address sender, uint192 key) view returns (uint256)'
]);
const entryPoint = new ethers.Contract(ENTRY_POINT, entryPointInterface, provider);
const nonce = await entryPoint.getNonce(freshWallet.address, 0);
console.log('EntryPoint nonce for sender:', nonce);

// Try calling EntryPoint.getUserOpHash
const userOpHashInterface = new ethers.Interface([
  'function getUserOpHash((address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature) memory userOp) view returns (bytes32)'
]);
const entryPoint2 = new ethers.Contract(ENTRY_POINT, userOpHashInterface, provider);

const userOp = {
  sender: freshWallet.address,
  nonce: 0n,
  initCode: '0x',
  callData: '0x',
  accountGasLimits: '0x000000000000000000000000000186a0000000000000000000000000000186a0',
  preVerificationGas: 21000n,
  gasFees: '0x0000000000000000000000003b9aca000000000000000000000000003b9aca00',
  paymasterAndData: '0x',
  signature: '0x'
};

const userOpHash = await entryPoint2.getUserOpHash(userOp);
console.log('UserOpHash:', userOpHash);

// Try calling EntryPoint.simulateValidation
console.log('\n=== Trying simulateValidation ===');
const simulateValidationInterface = new ethers.Interface([
  'function simulateValidation((address,uint256,bytes,bytes,bytes32,uint256,bytes32,bytes,bytes))'
]);
const entryPoint3 = new ethers.Contract(ENTRY_POINT, simulateValidationInterface, provider);

// Build packed userOp
const packedUserOp = [
  userOp.sender,
  userOp.nonce,
  userOp.initCode,
  userOp.callData,
  userOp.accountGasLimits,
  userOp.preVerificationGas,
  userOp.gasFees,
  userOp.paymasterAndData,
  userOp.signature
];

try {
  const result = await entryPoint3.simulateValidation.staticCall(packedUserOp);
  console.log('simulateValidation result:', result);
} catch (e) {
  console.log('simulateValidation error:', e.message);
  if (e.data) console.log('Error data:', e.data);
}
