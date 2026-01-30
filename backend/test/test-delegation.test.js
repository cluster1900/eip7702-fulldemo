import { ethers } from 'ethers';
const provider = new ethers.JsonRpcProvider('http://localhost:8545');

const bundlerWallet = new ethers.Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', provider);
const freshPrivateKey = '0x1234567890123456789012345678901234567890123456789012345678901234';
const freshWallet = new ethers.Wallet(freshPrivateKey, provider);

const KERNEL = '0x1bbed5ce00949dc5b16e9f6a2e8a71f37c6fe86a';

console.log('=== Test EIP-7702 Delegation ===');
console.log('Sender:', freshWallet.address);

// Set EIP-7702 code
const delegationCode = '0xef0100' + KERNEL.substring(2);
await provider.send('anvil_setCode', [freshWallet.address, delegationCode]);

// Check code
const code = await provider.getCode(freshWallet.address);
console.log('Sender code:', code.substring(0, 40) + '...');

// Try calling executeBatch on the sender (should delegate to Kernel)
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

// Try calling the sender with executeBatch calldata
console.log('\nCalling sender.executeBatch...');
try {
  const tx = await bundlerWallet.sendTransaction({
    to: freshWallet.address,
    data: callData,
    value: 0
  });
  console.log('Tx hash:', tx.hash);
  const receipt = await tx.wait();
  console.log('Tx status:', receipt.status);
  console.log('Gas used:', receipt.gasUsed);

  // Check balances
  const senderBalance = await provider.getBalance(freshWallet.address);
  const kernelBalance = await provider.getBalance(KERNEL);
  const bundlerBalance = await provider.getBalance(bundlerWallet.address);

  console.log('\nBalances:');
  console.log('Sender ETH:', ethers.formatEther(senderBalance));
  console.log('Kernel ETH:', ethers.formatEther(kernelBalance));
  console.log('Bundler ETH:', ethers.formatEther(bundlerBalance));
} catch (e) {
  console.log('Error:', e.message);
  if (e.data) console.log('Error data:', e.data);
}
