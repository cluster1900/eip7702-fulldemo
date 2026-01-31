import { ethers } from 'ethers';
const provider = new ethers.JsonRpcProvider('http://localhost:8545');

const bundlerWallet = new ethers.Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', provider);

// Generate a brand new fresh address that has never existed
const freshPrivateKey = ethers.hexlify(ethers.randomBytes(32));
const freshWallet = new ethers.Wallet(freshPrivateKey, provider);

const ENTRY_POINT = '0xd3ece3409b27aa484c303a41ec4ba83c4973335a';
const KERNEL = '0x1bbed5ce00949dc5b16e9f6a2e8a71f37c6fe86a';

console.log('=== Brand New Fresh Address Test ===');
console.log('Fresh wallet:', freshWallet.address);

// Check if this address has ever existed on mainnet
const code = await provider.getCode(freshWallet.address);
console.log('Code length:', code.length);

// Check storage using raw JSON-RPC
const storageResult = await provider.send('eth_getStorageAt', [freshWallet.address, '0x0000000000000000000000000000000000000000000000000000000000000000', 'latest']);
console.log('Storage at slot 0:', storageResult);

// Set EIP-7702 code
const delegationCode = '0xef0100' + KERNEL.substring(2);
console.log('Setting delegation code:', delegationCode.substring(0, 40) + '...');
await provider.send('anvil_setCode', [freshWallet.address, delegationCode]);

// Verify code
const codeAfter = await provider.getCode(freshWallet.address);
console.log('Code after:', codeAfter.substring(0, 40) + '...');
console.log('Code length:', codeAfter.length);

// Check storage after
const storageAfter = await provider.send('eth_getStorageAt', [freshWallet.address, '0x0000000000000000000000000000000000000000000000000000000000000000', 'latest']);
console.log('Storage after:', storageAfter);

// Now try the full flow
console.log('\n=== Building UserOp ===');

const kernelInterface = new ethers.Interface([
  'function executeBatch((address target, uint256 value, bytes data)[] calls) external'
]);

const calls = [{
  target: bundlerWallet.address,
  value: ethers.parseEther('0.001'),
  data: '0x'
}];

const callData = kernelInterface.encodeFunctionData('executeBatch', [calls]);

const entryPointInterface = new ethers.Interface([
  'function getUserOpHash((address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature) memory userOp) view returns (bytes32)'
]);

const entryPoint = new ethers.Contract(ENTRY_POINT, entryPointInterface, provider);

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

// Sign directly
const signingKey = new ethers.SigningKey(freshPrivateKey);
const sigObj = signingKey.sign(userOpHash);
const sig = '0x' + sigObj.r.slice(2) + sigObj.s.slice(2) + (sigObj.v === 27 ? '1b' : '1c');

// Verify signature
const recovered = ethers.recoverAddress(userOpHash, sig);
console.log('Signature valid:', recovered.toLowerCase() === freshWallet.address.toLowerCase());

// Send via handleOps
const handleOpsInterface = new ethers.Interface([
  'function handleOps((address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature)[] ops, address beneficiary) external'
]);

const userOpWithSig = { ...userOp, signature: sig };
const handleOpsData = handleOpsInterface.encodeFunctionData('handleOps', [[userOpWithSig], bundlerWallet.address]);

const bundlerNonce = await provider.getTransactionCount(bundlerWallet.address);
console.log('\nSending handleOps...');

try {
  const tx = await bundlerWallet.sendTransaction({
    to: ENTRY_POINT,
    data: handleOpsData,
    nonce: bundlerNonce,
    gasLimit: 1000000
  });
  console.log('Tx hash:', tx.hash);
  const receipt = await tx.wait();
  console.log('Tx status:', receipt.status);
  console.log('Gas used:', receipt.gasUsed);
} catch (e) {
  console.log('Error:', e.message);
  if (e.data) console.log('Error data:', e.data);
}
