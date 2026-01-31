import { ethers } from 'ethers';

const KERNEL_ADDRESS = '0xe7f1725e7734ce288f8367e1bb143e90bb3f0512';
const BUNDLER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

const kernelInterface = new ethers.Interface([
  'function executeBatch((address target, uint256 value, bytes data)[] calls) external'
]);

const calls = [{
  target: BUNDLER,
  value: 1n * 10n**15n,
  data: '0x'
}];

const callData = kernelInterface.encodeFunctionData('executeBatch', [calls]);
console.log('CallData:', callData);

// Decode to verify
const decoded = kernelInterface.decodeFunctionData('executeBatch', callData);
console.log('Decoded calls:');
for (const call of decoded[0]) {
  console.log('  target:', call.target);
  console.log('  value:', ethers.formatEther(call.value), 'ETH');
}
