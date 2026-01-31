/**
 * Debug script to verify UserOpHash calculation
 */

import { ethers } from 'ethers';

const ENTRY_POINT_ADDRESS = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';
const KERNEL_ADDRESS = '0x1BBED5cE00949dc5b16E9f6A2e8A71F37c6FE86a';
const USER_ADDRESS = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const USER_PRIVATE_KEY = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a';

const ENTRYPOINT_ABI = [
  'function getUserOpHash((address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature) memory userOp) view returns (bytes32)',
  'function getDomainSeparatorV4() view returns (bytes32)',
  'function getPackedUserOpTypeHash() view returns (bytes32)'
];

async function main() {
  console.log('=== UserOpHash Debug ===\n');

  const provider = new ethers.JsonRpcProvider('http://localhost:8545');
  const entryPoint = new ethers.Contract(ENTRY_POINT_ADDRESS, ENTRYPOINT_ABI, provider);

  // Set EIP-7702 code
  const eip7702Code = '0xef0100' + KERNEL_ADDRESS.substring(2).toLowerCase();
  console.log('Setting EIP-7702 code:', eip7702Code);
  await provider.send('anvil_setCode', [USER_ADDRESS, eip7702Code]);

  // Build UserOp
  const accountGasLimits = ethers.solidityPacked(['uint128', 'uint128'], [100000n, 100000n]);
  const gasFees = ethers.solidityPacked(['uint128', 'uint128'], [1000000000n, 1000000000n]);

  const userOp = {
    sender: USER_ADDRESS,
    nonce: 0n,
    initCode: '0x',
    callData: '0x',
    accountGasLimits: accountGasLimits,
    preVerificationGas: 21000n,
    gasFees: gasFees,
    paymasterAndData: '0x',
    signature: '0x'
  };

  // Get hash from EntryPoint
  let userOpHash;
  try {
    userOpHash = await entryPoint.getUserOpHash(userOp);
    console.log('UserOpHash from EntryPoint:', userOpHash);
  } catch (e) {
    console.log('getUserOpHash failed:', e.message);
    return;
  }

  // Verify signature
  const signingKey = new ethers.SigningKey(USER_PRIVATE_KEY);
  const sig = signingKey.sign(userOpHash);
  const signature = '0x' + sig.r.substring(2) + sig.s.substring(2) + (sig.v === 27 ? '1b' : '1c');
  console.log('Signature:', signature);

  const recovered = ethers.recoverAddress(userOpHash, signature);
  console.log('Recovered address:', recovered);
  console.log('Expected address:', USER_ADDRESS);
  console.log('Match:', recovered.toLowerCase() === USER_ADDRESS.toLowerCase());

  // Also verify with ethers Wallet
  const wallet = new ethers.Wallet(USER_PRIVATE_KEY);
  const walletSig = await wallet.signMessage(ethers.getBytes(userOpHash));
  console.log('\nWallet signature:', walletSig);
  const walletRecovered = ethers.recoverAddress(userOpHash, walletSig);
  console.log('Wallet recovered:', walletRecovered);
}

main().catch(console.error);
