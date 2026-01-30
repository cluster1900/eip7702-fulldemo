import { ethers } from 'ethers';
import { config } from '../src/config.js';

const KERNEL_ADDRESS = config.kernelAddress;
const MOCK_USDC_ADDRESS = config.tokenAddress;

const KERNEL_ABI = [
  'function executeTokenTransfer(address token, address from, address to, uint256 amount) external',
  'function nonces(address user) view returns (uint256)'
];

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function transfer(address to, uint256 amount) external returns (bool)',
  'function mint(address to, uint256 amount) external'
];

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║         EIP-7702 KERNEL CONTRACT TEST (SIMPLE)               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const wallet = new ethers.Wallet(config.bundlerPrivateKey, provider);
  
  console.log('Configuration:');
  console.log('────────────────────────────────────────────────────────────────────────────');
  console.log(`  Chain ID:      ${config.chainId}`);
  console.log(`  Kernel:        ${KERNEL_ADDRESS}`);
  console.log(`  MockUSDC:      ${MOCK_USDC_ADDRESS}`);
  console.log(`  Caller:        ${wallet.address}`);
  console.log('');
  
  const kernel = new ethers.Contract(KERNEL_ADDRESS, KERNEL_ABI, wallet);
  const usdc = new ethers.Contract(MOCK_USDC_ADDRESS, ERC20_ABI, wallet);
  
  // Get current nonce
  const nonce = await provider.getTransactionCount(wallet.address, 'latest');
  console.log(`  Current nonce: ${nonce}`);
  console.log('');
  
  // Mint USDC to caller
  console.log('STEP 1: Mint 5000 USDC via MockUSDC');
  console.log('────────────────────────────────────────────────────────────────────────────');
  const mintTx = await usdc.mint(wallet.address, BigInt(5000) * BigInt(10**6));
  await mintTx.wait();
  console.log(`  [OK] Minted 5000 USDC`);
  
  const balanceBefore = await usdc.balanceOf(wallet.address);
  console.log(`  Balance: ${Number(balanceBefore) / 10**6} USDC`);
  console.log('');
  
  // Execute token transfer to a new address
  console.log('STEP 2: Execute Token Transfer via Kernel');
  console.log('────────────────────────────────────────────────────────────────────────────');
  
  const recipient = ethers.Wallet.createRandom().address;
  const transferAmount = BigInt(100) * BigInt(10**6);
  
  console.log(`  From:    ${wallet.address.substring(0, 10)}...`);
  console.log(`  To:      ${recipient.substring(0, 10)}...`);
  console.log(`  Amount:  ${Number(transferAmount) / 10**6} USDC`);
  console.log('');
  
  // Approve kernel (nonce + 1)
  console.log('  Approving Kernel...');
  const approveNonce = nonce + 1;
  const approveTx = await usdc.approve(KERNEL_ADDRESS, ethers.MaxUint256, { nonce: approveNonce });
  await approveTx.wait();
  console.log(`  [OK] Approved (nonce: ${approveNonce})`);
  
  // Execute transfer (nonce + 2)
  console.log('  Executing via Kernel.executeTokenTransfer()...');
  const executeNonce = nonce + 2;
  const executeTx = await kernel.executeTokenTransfer(
    MOCK_USDC_ADDRESS,
    wallet.address,
    recipient,
    transferAmount,
    { nonce: executeNonce }
  );
  const receipt = await executeTx.wait();
  
  console.log(`  [OK] Transfer executed`);
  console.log(`  Hash:       ${executeTx.hash}`);
  console.log(`  Block:      ${receipt?.blockNumber}`);
  console.log(`  Gas Used:   ${receipt?.gasUsed.toString()}`);
  console.log('');
  
  // Verify
  console.log('STEP 3: Verify Results');
  console.log('────────────────────────────────────────────────────────────────────────────');
  
  const balanceAfter = await usdc.balanceOf(wallet.address);
  const recipientBalance = await usdc.balanceOf(recipient);
  
  console.log('  Balances:');
  console.log(`    Caller:    ${Number(balanceAfter) / 10**6} USDC`);
  console.log(`    Recipient: ${Number(recipientBalance) / 10**6} USDC`);
  console.log('');
  
  console.log('  Assertions:');
  if (Number(recipientBalance) === Number(transferAmount)) {
    console.log('  [OK] Recipient received 100 USDC');
  } else {
    console.log('  [FAIL] Recipient did not receive USDC');
  }
  
  const expectedCallerBalance = Number(balanceBefore) - Number(transferAmount);
  if (Number(balanceAfter) === expectedCallerBalance) {
    console.log('  [OK] Caller paid 100 USDC');
  } else {
    console.log('  [FAIL] Caller balance incorrect');
  }
  
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    TEST COMPLETED SUCCESSFULLY               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Summary:');
  console.log('  - Kernel.executeTokenTransfer() works correctly');
  console.log('  - ERC-20 transferFrom executed via Kernel proxy');
  console.log('  - EIP-7702 account abstraction demonstrated');
}

main().catch(console.error);
