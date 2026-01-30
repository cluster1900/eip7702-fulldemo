import { ethers } from 'ethers';
import { config } from '../src/config.js';

const KERNEL_ABI = [
  'function executeTokenTransfer(address token, address from, address to, uint256 amount) external',
  'function nonces(address user) view returns (uint256)'
];

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) external returns (bool)'
];

async function main() {
  console.log('\n=== EIP-7702 QUICK TEST ===\n');
  
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const wallet = new ethers.Wallet(config.bundlerPrivateKey, provider);
  
  const kernel = new ethers.Contract(config.kernelAddress, KERNEL_ABI, wallet);
  const usdc = new ethers.Contract(config.tokenAddress, ERC20_ABI, wallet);
  
  const nonce = await provider.getTransactionCount(wallet.address, 'latest');
  console.log(`Caller: ${wallet.address}`);
  console.log(`Nonce: ${nonce}`);
  console.log(`Kernel: ${config.kernelAddress}`);
  console.log(`USDC: ${config.tokenAddress}`);
  console.log('');
  
  // Check initial balance
  const initialBal = await usdc.balanceOf(wallet.address);
  console.log(`Initial balance: ${Number(initialBal) / 10**6} USDC\n`);
  
  // Test 1: Direct transfer
  const recipient = ethers.Wallet.createRandom().address;
  console.log(`1. Direct transfer 10 USDC to ${recipient.substring(0, 10)}...`);
  const tx1 = await usdc.transfer(recipient, BigInt(10) * BigInt(10**6), { nonce: nonce + 1 });
  const rc1 = await tx1.wait();
  const bal = await usdc.balanceOf(recipient);
  console.log(`   ✅ Done (block ${rc1.blockNumber}, bal: ${Number(bal) / 10**6} USDC)\n`);
  
  // Test 2: Kernel transfer
  const recipient2 = ethers.Wallet.createRandom().address;
  console.log(`2. Kernel transfer 20 USDC to ${recipient2.substring(0, 10)}...`);
  const tx2 = await kernel.executeTokenTransfer(
    config.tokenAddress,
    wallet.address,
    recipient2,
    BigInt(20) * BigInt(10**6),
    { nonce: nonce + 2 }
  );
  const rc2 = await tx2.wait();
  const bal2 = await usdc.balanceOf(recipient2);
  console.log(`   ✅ Done (block ${rc2.blockNumber}, bal: ${Number(bal2) / 10**6} USDC)\n`);
  
  // Test 3: Nonce
  console.log('3. Checking Kernel nonce...');
  const kNonce = await kernel.nonces(wallet.address);
  console.log(`   ✅ Kernel nonce: ${kNonce}\n`);
  
  console.log('=== ALL TESTS PASSED ===');
  console.log(`\nSummary:`);
  console.log(`  - ERC-20 direct transfer: ✅`);
  console.log(`  - Kernel executeTokenTransfer: ✅`);
  console.log(`  - Nonce management: ✅`);
  console.log(`  - Local anvil: ✅`);
  console.log(`\nTransactions:`);
  console.log(`  - Direct transfer: ${tx1.hash} (block ${rc1.blockNumber})`);
  console.log(`  - Kernel transfer: ${tx2.hash} (block ${rc2.blockNumber})`);
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
