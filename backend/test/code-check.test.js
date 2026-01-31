/**
 * Check if EIP-7702 code is set correctly
 */

import { ethers } from 'ethers';

const KERNEL_ADDRESS = '0x1BBED5cE00949dc5b16E9f6A2e8A71F37c6FE86a';
const USER_ADDRESS = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

async function main() {
  console.log('=== Code Check ===\n');

  const provider = new ethers.JsonRpcProvider('http://localhost:8545');

  // Check user code
  const userCode = await provider.getCode(USER_ADDRESS);
  console.log('User code:', userCode);
  console.log('User code length:', userCode.length);

  // Check kernel code
  const kernelCode = await provider.getCode(KERNEL_ADDRESS);
  console.log('Kernel code length:', kernelCode.length);
  console.log('Kernel code starts with 363d3d373d3d3d363d73:', kernelCode.startsWith('363d3d373d3d3d363d73'));

  // Set EIP-7702 code with proper format
  const eip7702Code = '0xef0100' + KERNEL_ADDRESS.substring(2).toLowerCase();
  console.log('\nSetting EIP-7702 code:', eip7702Code);
  console.log('Expected length:', eip7702Code.length);

  await provider.send('anvil_setCode', [USER_ADDRESS, eip7702Code]);

  // Check user code again
  const userCodeAfter = await provider.getCode(USER_ADDRESS);
  console.log('User code after:', userCodeAfter);
  console.log('User code length after:', userCodeAfter.length);

  // Verify the code
  if (userCodeAfter.length > 0) {
    const expectedCode = '0xef01001bbed5ce00949dc5b16e9f6a2e8a71f37c6fe86a';
    console.log('Matches expected:', userCodeAfter === expectedCode);
  }
}

main().catch(console.error);
