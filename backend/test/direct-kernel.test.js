import { ethers } from 'ethers';
const provider = new ethers.JsonRpcProvider('http://localhost:8545');

const PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

console.log('=== Funding Kernel and Testing Direct Execution ===');
console.log('Wallet:', wallet.address);

const kernelAddress = '0x1bbed5ce00949dc5b16e9f6a2e8a71f37c6fe86a';
let kernelBalance = await provider.getBalance(kernelAddress);
console.log('Kernel balance before:', ethers.formatEther(kernelBalance));

// Fund the Kernel
if (kernelBalance < ethers.parseEther('1')) {
  console.log('Funding Kernel with 1 ETH...');
  const fundTx = await wallet.sendTransaction({
    to: kernelAddress,
    value: ethers.parseEther('1') - kernelBalance
  });
  await fundTx.wait();
  console.log('Funding tx sent');
}

kernelBalance = await provider.getBalance(kernelAddress);
console.log('Kernel balance after funding:', ethers.formatEther(kernelBalance));

// Now try executeBatch
const kernelInterface = new ethers.Interface([
  'function executeBatch((address target, uint256 value, bytes data)[] calls) external'
]);

const calls = [{
  target: wallet.address,
  value: ethers.parseEther('0.001'),
  data: '0x'
}];

const calldata = kernelInterface.encodeFunctionData('executeBatch', [calls]);
console.log('Calldata:', calldata);

try {
  const walletBalanceBefore = await provider.getBalance(wallet.address);
  console.log('Wallet balance before:', ethers.formatEther(walletBalanceBefore));

  const tx = await wallet.sendTransaction({
    to: kernelAddress,
    data: calldata,
    value: 0
  });
  console.log('Direct tx hash:', tx.hash);
  const receipt = await tx.wait();
  console.log('Direct tx status:', receipt.status);

  const kernelBalanceAfter = await provider.getBalance(kernelAddress);
  console.log('Kernel balance after:', ethers.formatEther(kernelBalanceAfter));

  const walletBalanceAfter = await provider.getBalance(wallet.address);
  console.log('Wallet balance after:', ethers.formatEther(walletBalanceAfter));
} catch (e) {
  console.log('Error:', e.message);
  if (e.data) console.log('Error data:', e.data);
}
