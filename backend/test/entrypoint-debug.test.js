/**
 * Debug EntryPoint hash calculation
 */

import { ethers } from 'ethers';

const ENTRY_POINT_ADDRESS = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';
const KERNEL_ADDRESS = '0x1BBED5cE00949dc5b16E9f6A2e8A71F37c6FE86a';
const USER_ADDRESS = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

const ENTRYPOINT_ABI = [
  'function getUserOpHash((address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature) memory userOp) view returns (bytes32)',
  'function getDomainSeparatorV4() view returns (bytes32)',
  'function getPackedUserOpTypeHash() view returns (bytes32)'
];

async function main() {
  console.log('=== EntryPoint Hash Debug ===\n');

  const provider = new ethers.JsonRpcProvider('http://localhost:8545');
  const entryPoint = new ethers.Contract(ENTRY_POINT_ADDRESS, ENTRYPOINT_ABI, provider);

  // Set EIP-7702 code first
  const eip7702Code = '0xef0100' + KERNEL_ADDRESS.substring(2).toLowerCase();
  console.log('Setting EIP-7702 code:', eip7702Code);
  await provider.send('anvil_setCode', [USER_ADDRESS, eip7702Code]);

  // Verify code is set
  const userCode = await provider.getCode(USER_ADDRESS);
  console.log('User code:', userCode);
  console.log('');

  // Try calling getPackedUserOpTypeHash
  try {
    const typeHash = await entryPoint.getPackedUserOpTypeHash();
    console.log('getPackedUserOpTypeHash:', typeHash);
  } catch (e) {
    console.log('getPackedUserOpTypeHash failed:', e.message);
  }

  // Try calling getDomainSeparatorV4
  try {
    const domainSep = await entryPoint.getDomainSeparatorV4();
    console.log('getDomainSeparatorV4:', domainSep);
  } catch (e) {
    console.log('getDomainSeparatorV4 failed:', e.message);
  }

  // Build a simple UserOp with empty initCode and callData
  const accountGasLimits = '0x00000000000000000000000000000000000000000000000000000000000186a0' +
                          '00000000000000000000000000000000000000000000000000000000000186a0';
  const gasFees = '0x000000000000000000000000000000000000000000000000000000003b9aca000' +
                  '000000000000000000000000000000000000000000000000000000003b9aca000';

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

  console.log('\nUserOp:');
  console.log('  sender:', userOp.sender);
  console.log('  nonce:', userOp.nonce);
  console.log('  initCode:', userOp.initCode);
  console.log('  callData:', userOp.callData);
  console.log('  accountGasLimits:', userOp.accountGasLimits);
  console.log('  preVerificationGas:', userOp.preVerificationGas);
  console.log('  gasFees:', userOp.gasFees);
  console.log('');

  // Try getUserOpHash - this might revert on mainnet EntryPoint
  try {
    const userOpHash = await entryPoint.getUserOpHash(userOp);
    console.log('getUserOpHash SUCCESS:', userOpHash);
  } catch (e) {
    console.log('getUserOpHash FAILED:', e.message);
    console.log('This is expected on mainnet EntryPoint due to simulateValidation checks');
  }

  // Manual calculation
  console.log('\nManual calculation:');
  const PACKED_USEROP_TYPEHASH = '0x29a0bca4af4be3421398da00295e58e6d7de38cb492214754cb6a47507dd6f8e';
  console.log('  Expected typehash:', PACKED_USEROP_TYPEHASH);

  const hashInitCode = '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470';
  const hashCallData = '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470';
  const hashPaymasterAndData = '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470';

  const structHash = ethers.keccak256(
    ethers.concat([
      PACKED_USEROP_TYPEHASH,
      ethers.zeroPadValue(userOp.sender, 32),
      ethers.zeroPadValue(ethers.toBeHex(userOp.nonce), 32),
      hashInitCode,
      hashCallData,
      userOp.accountGasLimits,
      ethers.zeroPadValue(ethers.toBeHex(userOp.preVerificationGas), 32),
      userOp.gasFees,
      hashPaymasterAndData
    ])
  );
  console.log('  structHash:', structHash);

  const DOMAIN_SEPARATOR_TYPEHASH = '0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f';
  const domainNameHash = '0x21c3353240200136d47160000d7748a9a64b0e25f94bb6b3a5692119c09568c6';
  const domainVersionHash = '0xc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6';
  const domainChainId = '0x0000000000000000000000000000000000000000000000000000000000000001';
  const domainVerifier = '0x0000000000000000000000005ff137d4b0fdcd49dca30c7cf57e578a026d2789';

  console.log('  domainNameHash:', domainNameHash);
  console.log('  domainVersionHash:', domainVersionHash);

  const domainSeparator = ethers.keccak256(
    ethers.concat([
      DOMAIN_SEPARATOR_TYPEHASH,
      domainNameHash,
      domainVersionHash,
      domainChainId,
      domainVerifier
    ])
  );
  console.log('  domainSeparator:', domainSeparator);

  const userOpHash = ethers.keccak256(
    ethers.concat(['0x1901', domainSeparator, structHash])
  );
  console.log('  Final userOpHash:', userOpHash);
}

main().catch(console.error);
