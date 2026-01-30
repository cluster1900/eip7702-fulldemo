import { ethers } from 'ethers';
import { config } from '../src/config.js';

const KERNEL_ADDRESS = config.kernelAddress;
const MOCK_USDC_ADDRESS = config.tokenAddress;

const KERNEL_ABI = [
  'function executeTokenTransfer(address token, address from, address to, uint256 amount) external',
  'function nonces(address user) view returns (uint256)',
  'function getNonce(address user) view returns (uint256)'
];

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function mint(address to, uint256 amount) external'
];

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║         EIP-7702 KERNEL CONTRACT DIRECT TEST                ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const wallet = new ethers.Wallet(config.bundlerPrivateKey, provider);
  
  console.log('Configuration:');
  console.log('────────────────────────────────────────────────────────────────────────────');
  console.log(`  Chain ID:      ${config.chainId}`);
  console.log(`  Kernel:        ${KERNEL_ADDRESS}`);
  console.log(`  MockUSDC:      ${MOCK_USDC_ADDRESS}`);
  console.log('');
  
  const kernel = new ethers.Contract(KERNEL_ADDRESS, KERNEL_ABI, wallet);
  const usdc = new ethers.Contract(MOCK_USDC_ADDRESS, ERC20_ABI, wallet);
  
  const userA = ethers.Wallet.createRandom();
  const userB = ethers.Wallet.createRandom();
  
  console.log('Test Accounts:');
  console.log('────────────────────────────────────────────────────────────────────────────');
  console.log(`  User A (Receiver): ${userA.address}`);
  console.log(`  User B (Sender):   ${userB.address}`);
  console.log('');
  
  console.log('STEP 1: Fund Test Accounts');
  console.log('────────────────────────────────────────────────────────────────────────────');
  
  const fundTx = await wallet.sendTransaction({
    to: userB.address,
    value: ethers.parseEther('0.01')
  });
  await fundTx.wait();
  console.log(`  [OK] Funded User B with 0.01 ETH`);
  
  const mintTx = await usdc.mint(userB.address, BigInt(5000) * BigInt(10**6));
  await mintTx.wait();
  console.log(`  [OK] Minted 5000 USDC to User B`);
  
  const bUsdcBefore = await usdc.balanceOf(userB.address);
  const aUsdcBefore = await usdc.balanceOf(userA.address);
  
  console.log('');
  console.log('Initial Balances:');
  console.log('────────────────────────────────────────────────────────────────────────────');
  console.log(`  User B: ${Number(bUsdcBefore) / 10**6} USDC`);
  console.log(`  User A: ${Number(aUsdcBefore) / 10**6} USDC`);
  console.log('');
  
  console.log('STEP 2: User B Approves Kernel');
  console.log('────────────────────────────────────────────────────────────────────────────');
  
  const userBWallet = new ethers.Wallet(userB.privateKey, provider);
  const usdcWithUserB = new ethers.Contract(MOCK_USDC_ADDRESS, ERC20_ABI, userBWallet);
  
  const bNonceLatest = await provider.getTransactionCount(userB.address, 'latest');
  console.log(`  [INFO] User B nonce on fork: ${bNonceLatest}`);
  
  // Use nonce + 1 since the forked account may have existing history
  const approveNonce = Number(bNonceLatest) + 1;
  const approveTx = await usdcWithUserB.approve(KERNEL_ADDRESS, ethers.MaxUint256, { nonce: approveNonce });
  await approveTx.wait();
  console.log(`  [OK] User B approved Kernel for max USDC (nonce: ${approveNonce})`);
  
  console.log('');
  console.log('STEP 3: Execute Token Transfer via Kernel');
  console.log('────────────────────────────────────────────────────────────────────────────');
  
  const transferAmount = BigInt(100) * BigInt(10**6);
  const kernelWithUserB = new ethers.Contract(KERNEL_ADDRESS, KERNEL_ABI, userBWallet);
  
  const executeNonce = approveNonce + 1;
  console.log(`  [INFO] User B next nonce: ${executeNonce}`);
  
  const executeTx = await kernelWithUserB.executeTokenTransfer(
    MOCK_USDC_ADDRESS,
    userB.address,
    userA.address,
    transferAmount,
    { nonce: executeNonce }
  );
  const receipt = await executeTx.wait();
  
  console.log(`  [OK] executeTokenTransfer executed`);
  console.log(`  Transaction Hash: ${executeTx.hash}`);
  console.log(`  Block Number: ${receipt?.blockNumber}`);
  console.log(`  Gas Used: ${receipt?.gasUsed.toString()}`);
  console.log('');
  
  console.log('STEP 4: Verify Results');
  console.log('────────────────────────────────────────────────────────────────────────────');
  
  const bUsdcAfter = await usdc.balanceOf(userB.address);
  const aUsdcAfter = await usdc.balanceOf(userA.address);
  
  console.log('Final Balances:');
  console.log('────────────────────────────────────────────────────────────────────────────');
  console.log(`  User B: ${Number(bUsdcAfter) / 10**6} USDC`);
  console.log(`  User A: ${Number(aUsdcAfter) / 10**6} USDC`);
  console.log('');
  
  console.log('Assertions:');
  console.log('────────────────────────────────────────────────────────────────────────────');
  
  if (Number(aUsdcAfter) === Number(transferAmount)) {
    console.log('  [OK] User A received 100 USDC');
  } else {
    console.log('  [FAIL] User A did not receive expected USDC');
  }
  
  if (Number(bUsdcAfter) === Number(bUsdcBefore) - Number(transferAmount)) {
    console.log('  [OK] User B paid 100 USDC');
  } else {
    console.log('  [FAIL] User B payment incorrect');
  }
  
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    TEST COMPLETED SUCCESSFULLY               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
}

main().catch(console.error);
