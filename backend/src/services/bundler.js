/**
 * Bundler服务
 * 构建和发送EIP-7702 type 0x04交易
 */
import { ethers } from 'ethers';
import { config } from '../config.js';

// 初始化provider和bundler钱包
const provider = new ethers.JsonRpcProvider(config.rpcUrl);
const bundlerWallet = new ethers.Wallet(config.bundlerPrivateKey, provider);

// EntryPoint ABI (简化版，只包含handleOps)
const ENTRY_POINT_ABI = [
  'function handleOps((address sender, uint256 nonce, bytes callData, uint256 callGasLimit, uint256 verificationGasLimit, uint256 preVerificationGas, uint256 maxFeePerGas, uint256 maxPriorityFeePerGas, bytes paymasterAndData, bytes signature)[] ops, address beneficiary) external'
];

const entryPointContract = new ethers.Contract(
  config.entryPointAddress,
  ENTRY_POINT_ABI,
  bundlerWallet
);

/**
 * 构建Type 0x04交易
 * @param {Object} userOp - UserOperation对象
 * @param {Object|null} authorization - Authorization对象（如需delegation）
 * @returns {Object} 构建的交易对象
 */
export function buildType04Transaction(userOp, authorization) {
  // 编码handleOps calldata
  const handleOpsData = entryPointContract.interface.encodeFunctionData('handleOps', [
    [userOp],
    bundlerWallet.address
  ]);

  const tx = {
    type: 4, // EIP-7702 type
    to: config.entryPointAddress,
    data: handleOpsData,
    chainId: config.chainId,
  };

  // 如果有authorization，添加到交易中
  if (authorization) {
    tx.authorizationList = [{
      chainId: authorization.chainId,
      address: authorization.address,
      nonce: authorization.nonce,
      v: authorization.v || 0,
      r: authorization.r || '0x',
      s: authorization.s || '0x',
      // 或者直接传signature（ethers会自动解析）
      signature: authorization.signature
    }];
  }

  return tx;
}

/**
 * 发送交易到链上
 * @param {Object} tx - 交易对象
 * @returns {Promise<Object>} 交易receipt
 */
export async function sendTransaction(tx) {
  try {
    console.log('Sending transaction:', {
      type: tx.type,
      to: tx.to,
      hasAuthorization: !!tx.authorizationList
    });

    const txResponse = await bundlerWallet.sendTransaction(tx);
    console.log('Transaction sent:', txResponse.hash);

    const receipt = await txResponse.wait();
    console.log('Transaction confirmed:', receipt.hash);

    return receipt;
  } catch (error) {
    console.error('Transaction failed:', error);
    throw error;
  }
}

/**
 * 获取provider实例（供其他服务使用）
 */
export function getProvider() {
  return provider;
}

/**
 * 获取bundler地址
 */
export function getBundlerAddress() {
  return bundlerWallet.address;
}
