import { ethers } from 'ethers';
const provider = new ethers.JsonRpcProvider('http://localhost:8545');

const ENTRY_POINT = '0xd3ece3409b27aa484c303a41ec4ba83c4973335a';
const KERNEL = '0x1bbed5ce00949dc5b16e9f6a2e8a71f37c6fe86a';

// Generate a fresh private key
const freshPrivateKey = '0x' + Array.from({ length: 32 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');
const freshWallet = new ethers.Wallet(freshPrivateKey, provider);
const bundlerWallet = new ethers.Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', provider);

console.log('=== Fresh Account EIP-7702 Test ===');
console.log('Fresh wallet:', freshWallet.address);
console.log('Bundler:', bundlerWallet.address);
console.log('EntryPoint:', ENTRY_POINT);
console.log('Kernel:', KERNEL);

// Step 1: Check if fresh wallet has any code
const freshCodeBefore = await provider.getCode(freshWallet.address);
console.log('Fresh wallet code before:', freshCodeBefore.length > 0 ? 'has code' : 'no code');

// Step 2: Set EIP-7702 delegation code for fresh wallet
console.log('\nSetting EIP-7702 delegation...');
const delegationCode = '0xef0100' + KERNEL.substring(2);
await provider.send('anvil_setCode', [freshWallet.address, delegationCode]);

const freshCodeAfter = await provider.getCode(freshWallet.address);
console.log('Fresh wallet code after:', freshCodeAfter.substring(0, 30) + '...');

// Step 3: Fund the Kernel with more ETH (for gas + transfer)
console.log('\nFunding Kernel...');
const kernelBalanceBefore = await provider.getBalance(KERNEL);
console.log('Kernel balance before:', ethers.formatEther(kernelBalanceBefore));

const fundTx = await bundlerWallet.sendTransaction({
  to: KERNEL,
  value: ethers.parseEther('2') // Fund with 2 ETH
});
await fundTx.wait();
console.log('Funded Kernel with 2 ETH');

const kernelBalanceAfter = await provider.getBalance(KERNEL);
console.log('Kernel balance after:', ethers.formatEther(kernelBalanceAfter));

// Step 4: Reset nonces
console.log('\nResetting nonces...');
const nonceSlot = ethers.keccak256(
  '0x' + freshWallet.address.substring(2).padStart(64, '0') +
  '0000000000000000000000000000000000000000000000000000000000000004'
);
await provider.send('anvil_setStorageAt', [ENTRY_POINT, nonceSlot, '0x0000000000000000000000000000000000000000000000000000000000000000']);
console.log('Nonce reset to 0');

// Step 5: Build and send UserOp
console.log('\nBuilding UserOp...');

const kernelInterface = new ethers.Interface([
  'function executeBatch((address target, uint256 value, bytes data)[] calls) external'
]);

const calls = [{
  target: bundlerWallet.address,
  value: ethers.parseEther('0.001'),
  data: '0x'
}];

const callData = kernelInterface.encodeFunctionData('executeBatch', [calls]);
console.log('CallData:', callData.substring(0, 50) + '...');

const accountGasLimits = ethers.solidityPacked(['uint128', 'uint128'], [100000n, 100000n]);
const gasFees = ethers.solidityPacked(['uint128', 'uint128'], [ethers.parseUnits('1', 'gwei'), ethers.parseUnits('1', 'gwei')]);

const userOp = {
  sender: freshWallet.address,
  nonce: 0n,
  initCode: '0x',
  callData: callData,
  accountGasLimits: accountGasLimits,
  preVerificationGas: 21000n,
  gasFees: gasFees,
  paymasterAndData: '0x',
  signature: '0x'
};

// Calculate hash
const PACKED_USEROP_TYPEHASH = '0x29a0bca4af4be3421398da00295e58e6d7de38cb492214754cb6a47507dd6f8e';
const DOMAIN_SEPARATOR_TYPEHASH = '0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f';

const structHash = ethers.keccak256(
  ethers.concat([
    PACKED_USEROP_TYPEHASH,
    ethers.zeroPadValue(userOp.sender, 32),
    ethers.zeroPadValue(ethers.toBeHex(userOp.nonce), 32),
    userOp.initCode.length === 0 ? ethers.ZeroHash : ethers.keccak256(userOp.initCode),
    userOp.callData.length === 0 ? ethers.ZeroHash : ethers.keccak256(userOp.callData),
    userOp.accountGasLimits,
    ethers.zeroPadValue(ethers.toBeHex(userOp.preVerificationGas), 32),
    userOp.gasFees,
    userOp.paymasterAndData.length === 0 ? ethers.ZeroHash : ethers.keccak256(userOp.paymasterAndData)
  ])
);

const domainSeparator = ethers.keccak256(
  ethers.concat([
    DOMAIN_SEPARATOR_TYPEHASH,
    ethers.keccak256(ethers.toUtf8Bytes('ERC4337')),
    ethers.keccak256(ethers.toUtf8Bytes('1')),
    ethers.zeroPadValue(ethers.toBeHex(1), 32), // mainnet chainId
    ethers.zeroPadValue(ENTRY_POINT, 32)
  ])
);

const userOpHash = ethers.keccak256(
  ethers.concat(['0x1901', domainSeparator, structHash])
);

console.log('UserOpHash:', userOpHash);

// Sign
const sig = await freshWallet.signMessage(ethers.getBytes(userOpHash));
console.log('Signature:', sig);

// Send via handleOps
console.log('\nSending via handleOps...');
const entryPointInterface = new ethers.Interface([
  'function handleOps((address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature)[] ops, address beneficiary) external'
]);

const userOpWithSig = { ...userOp, signature: sig };
const handleOpsData = entryPointInterface.encodeFunctionData('handleOps', [[userOpWithSig], bundlerWallet.address]);

const bundlerNonce = await provider.getTransactionCount(bundlerWallet.address);
console.log('Bundler nonce:', bundlerNonce);

const bundlerBalanceBefore = await provider.getBalance(bundlerWallet.address);
console.log('Bundler balance before:', ethers.formatEther(bundlerBalanceBefore));

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

  const bundlerBalanceAfter = await provider.getBalance(bundlerWallet.address);
  console.log('Bundler balance after:', ethers.formatEther(bundlerBalanceAfter));
  console.log('Balance change:', ethers.formatEther(bundlerBalanceAfter - bundlerBalanceBefore));
} catch (e) {
  console.log('Error:', e.message);
  if (e.data) console.log('Error data:', e.data);
}
