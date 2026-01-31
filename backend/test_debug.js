import { ethers } from 'ethers';

const ENTRY_POINT_ADDRESS = '0xe6e340d132b5f46d1e472debcd681b2abc16e57e';
const KERNEL_ADDRESS = '0xc3e53f4d16ae77db1c982e75a937b9f60fe63690';

const freshPrivateKey = '0x1234567890123456789012345678901234567890123456789012345678901234';
const userWallet = new ethers.Wallet(freshPrivateKey);

const accountGasLimits = '0x' + ethers.solidityPacked(['uint128', 'uint128'], [300000n, 100000n]).substring(2).padStart(64, '0');
const gasFees = '0x' + ethers.solidityPacked(['uint128', 'uint128'], [ethers.parseUnits('1', 'gwei'), ethers.parseUnits('1', 'gwei')]).substring(2).padStart(64, '0');

const kernelInterface = new ethers.Interface([
  'function executeBatch((address target, uint256 value, bytes data)[] calls) external'
]);

const calls = [{
  target: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  value: 1n * 10n**15n,
  data: '0x'
}];

const callData = kernelInterface.encodeFunctionData('executeBatch', [calls]);

const userOp = {
  sender: userWallet.address,
  nonce: 0n,
  initCode: '0x',
  callData: callData,
  accountGasLimits: accountGasLimits,
  preVerificationGas: 21000n,
  gasFees: gasFees,
  paymasterAndData: '0x',
  signature: '0x'
};

const handleOpsInterface = new ethers.Interface([
  'function handleOps((address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature)[] ops, address beneficiary) external'
]);

const handleOpsData = handleOpsInterface.encodeFunctionData('handleOps', [[userOp], userWallet.address]);

console.log('Calldata:', handleOpsData);
console.log('');
console.log('UserOp sender:', userOp.sender);
console.log('UserOp nonce:', userOp.nonce);
console.log('CallData:', userOp.callData);
console.log('accountGasLimits:', userOp.accountGasLimits);
console.log('gasFees:', userOp.gasFees);
