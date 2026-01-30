/**
 * Test to verify the exact hash calculation used by EntryPoint
 */

import { ethers } from 'ethers';
import { config } from '../src/config.js';

const KERNEL_ABI = [
  'function executeTokenTransfer(address token, address from, address to, uint256 amount) external',
  'function getNonce(address user) view returns (uint256)',
  'function nonces(address user) view returns (uint256)'
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'function mint(address to, uint256 amount) external'
];

function signEIP712Hash(privateKey, hash) {
  const signingKey = new ethers.SigningKey(privateKey);
  const sig = signingKey.sign(hash);
  const vByte = sig.v === 27 ? '1b' : '1c';
  return '0x' + sig.r.substring(2) + sig.s.substring(2) + vByte;
}

async function main() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║          EXACT HASH CALCULATION TEST                             ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log('');

  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const bundlerWallet = new ethers.Wallet(config.bundlerPrivateKey, provider);

  const userBPrivateKey = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a';
  const userB = new ethers.Wallet(userBPrivateKey, provider);

  console.log('User B:', userB.address);
  console.log('');

  const kernelContract = new ethers.Contract(config.kernelAddress, KERNEL_ABI, bundlerWallet);
  const mockUSDC = new ethers.Contract(config.tokenAddress, ERC20_ABI, bundlerWallet);
  const mockUSDCWithUserB = new ethers.Contract(config.tokenAddress, ERC20_ABI, userB);

  console.log('Minting 5000 USDC to User B...');
  try {
    await (await mockUSDC.mint(userB.address, 5000n * 10n**6n)).wait();
    console.log('  [OK] Minted');
  } catch (e) {
    console.log('  [INFO] May already be minted');
  }

  console.log('User B approving Kernel...');
  await (await mockUSDCWithUserB.approve(config.kernelAddress, ethers.MaxUint256)).wait();
  console.log('  [OK] Approved');
  console.log('');

  const bUsdcBefore = await mockUSDC.balanceOf(userB.address);
  console.log('User B USDC balance:', Number(bUsdcBefore) / 10**6);
  console.log('');

  // Build callData for executeTokenTransfer
  const callData = '0x69d76bed' + 
    config.tokenAddress.substring(2).padStart(40, '0') +
    userB.address.substring(2).padStart(40, '0') +
    bundlerWallet.address.substring(2).padStart(40, '0') +
    (100n * 10n**6n).toString(16).padStart(64, '0');

  console.log('CallData:', callData);
  console.log('');

  const accountGasLimits = ethers.solidityPacked(
    ['uint128', 'uint128'],
    [200000n, 200000n]
  );

  const gasFees = ethers.solidityPacked(
    ['uint128', 'uint128'],
    [ethers.parseUnits('1', 'gwei'), ethers.parseUnits('1', 'gwei')]
  );

  const userOp = {
    sender: userB.address,
    nonce: 0n,
    initCode: '0x',
    callData: callData,
    accountGasLimits: accountGasLimits,
    preVerificationGas: 21000n,
    gasFees: gasFees,
    paymasterAndData: '0x',
    signature: '0x'
  };

  // Step 1: Calculate structHash exactly like EntryPoint.UserOperationLib.hash()
  console.log('Step 1: Calculate structHash...');
  
  const hashInitCode = userOp.initCode.length === 0 ? ethers.ZeroHash : ethers.keccak256(userOp.initCode);
  const hashCallData = ethers.keccak256(userOp.callData);
  const hashPaymasterAndData = userOp.paymasterAndData.length === 0 ? ethers.ZeroHash : ethers.keccak256(userOp.paymasterAndData);

  console.log('  hashInitCode:', hashInitCode);
  console.log('  hashCallData:', hashCallData);
  console.log('  hashPaymasterAndData:', hashPaymasterAndData);

  const packedUserOpTypeHash = ethers.keccak256(
    ethers.toUtf8Bytes('PackedUserOperation(address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData)')
  );
  console.log('  PACKED_USEROP_TYPEHASH:', packedUserOpTypeHash);

  const structHash = ethers.keccak256(
    ethers.concat([
      packedUserOpTypeHash,
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
  console.log('');

  // Step 2: Calculate domainSeparator exactly like EntryPoint.getDomainSeparatorV4()
  console.log('Step 2: Calculate domainSeparator...');
  
  const domainSeparatorTypeHash = ethers.keccak256(
    ethers.toUtf8Bytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')
  );
  const domainNameHash = ethers.keccak256(ethers.toUtf8Bytes('ERC4337'));
  const domainVersionHash = ethers.keccak256(ethers.toUtf8Bytes('1'));
  
  const domainSeparator = ethers.keccak256(
    ethers.concat([
      domainSeparatorTypeHash,
      domainNameHash,
      domainVersionHash,
      ethers.zeroPadValue(ethers.toBeHex(config.chainId), 32),
      ethers.zeroPadValue(config.entryPointAddress, 32)
    ])
  );
  console.log('  DOMAIN_SEPARATOR_TYPEHASH:', domainSeparatorTypeHash);
  console.log('  domainSeparator:', domainSeparator);
  console.log('');

  // Step 3: Calculate final userOpHash exactly like EntryPoint.getUserOpHash()
  console.log('Step 3: Calculate userOpHash (0x1901 || domainSeparator || structHash)...');
  
  const userOpHash = ethers.keccak256(
    ethers.concat([
      '0x1901',
      domainSeparator,
      structHash
    ])
  );
  console.log('  userOpHash:', userOpHash);
  console.log('');

  // Step 4: Sign the hash
  console.log('Step 4: Sign the hash...');
  const signature = signEIP712Hash(userBPrivateKey, userOpHash);
  userOp.signature = signature;
  console.log('  Signature:', signature);
  console.log('');

  // Step 5: Verify the signature using ecrecover directly (no Ethereum prefix)
  console.log('Step 5: Verify signature using ecrecover...');
  
  const r = signature.slice(0, 66);
  const s = '0x' + signature.slice(66, 130);
  const v = parseInt(signature.slice(130, 132), 16);
  
  console.log('  r:', r);
  console.log('  s:', s);
  console.log('  v:', v);
  
  // Use ecrecover directly
  const recoveredAddress = ethers.recoverAddress(userOpHash, {
    r: r,
    s: s,
    v: v
  });
  
  console.log('  Expected:', userB.address);
  console.log('  Recovered:', recoveredAddress);
  console.log('  Match:', recoveredAddress.toLowerCase() === userB.address.toLowerCase());
  
  // Also verify with ethers.verifyMessage (adds Ethereum prefix - should NOT match)
  const recoveredWithPrefix = ethers.verifyMessage(ethers.getBytes(userOpHash), signature);
  console.log('  With Ethereum prefix:', recoveredWithPrefix, '(should NOT match)');
  console.log('');

  // Step 6: Send the transaction
  console.log('Step 6: Send transaction via EntryPoint.handleOps...');
  
  const entryPointInterface = new ethers.Interface([
    'function handleOps((address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature)[] ops, address beneficiary) external'
  ]);

  const handleOpsData = entryPointInterface.encodeFunctionData('handleOps', [
    [userOp],
    bundlerWallet.address
  ]);

  try {
    const tx = await bundlerWallet.sendTransaction({
      to: config.entryPointAddress,
      data: handleOpsData
    });
    console.log('  Tx hash:', tx.hash);
    const receipt = await tx.wait();
    console.log('  [OK] Confirmed in block', receipt.blockNumber);
    
    const bUsdcAfter = await mockUSDC.balanceOf(userB.address);
    const nonceAfter = await kernelContract.getNonce(userB.address);
    
    console.log('');
    console.log('Results:');
    console.log('  User B USDC before:', Number(bUsdcBefore) / 10**6);
    console.log('  User B USDC after:', Number(bUsdcAfter) / 10**6);
    console.log('  User B nonce:', nonceAfter.toString());
    
    if (Number(bUsdcAfter) < Number(bUsdcBefore)) {
      console.log('  [PASS] Transfer executed!');
    } else {
      console.log('  [FAIL] Transfer not executed');
    }
  } catch (error) {
    console.error('  [FAIL]', error.message);
    console.error('  Code:', error.code);
    if (error.data) {
      console.error('  Data:', error.data);
    }
  }

  console.log('');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
