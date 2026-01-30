/**
 * Bundler服务
 *
 * 功能:
 * 1. 构建EIP-7702 type 0x04交易
 * 2. 发送交易到链上
 * 3. 提供provider和bundler地址查询
 *
 * EIP-7702交易类型:
 * - Type 0x04: 授权交易类型
 * - 包含authorizationList字段用于授权
 *
 * @module bundler
 */
import { ethers } from 'ethers';
import { config } from '../config.js';

// 初始化provider和bundler钱包
const provider = new ethers.JsonRpcProvider(config.rpcUrl);
const bundlerWallet = new ethers.Wallet(config.bundlerPrivateKey, provider);

// EntryPoint ABI (PackedUserOperation格式)
const ENTRY_POINT_ABI = [
  'function handleOps((address sender, uint256 nonce, bytes callData, uint256 callGasLimit, uint256 verificationGasLimit, uint256 preVerificationGas, uint256 maxFeePerGas, uint256 maxPriorityFeePerGas, bytes paymasterAndData, bytes signature)[] ops, address beneficiary) external'
];

const entryPointContract = new ethers.Contract(
  config.entryPointAddress,
  ENTRY_POINT_ABI,
  bundlerWallet
);

/**
 * RPC重试配置
 */
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000,  // 1秒
  maxDelay: 10000      // 10秒
};

/**
 * 带重试的RPC调用
 * 处理临时网络故障和节点超时
 *
 * @param {Function} fn - 要执行的异步函数
 * @param {number} maxRetries - 最大重试次数
 * @returns {Promise<any>} 函数执行结果
 */
async function withRetry(fn, maxRetries = RETRY_CONFIG.maxRetries) {
  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // 不重试的错误
      if (error.message.includes('nonce') ||
          error.message.includes('insufficient funds') ||
          error.message.includes('execution reverted')) {
        throw error;
      }

      // 计算延迟时间 (指数退避)
      const delay = Math.min(
        RETRY_CONFIG.initialDelay * Math.pow(2, attempt),
        RETRY_CONFIG.maxDelay
      );

      console.warn(`RPC调用失败, ${delay}ms后重试 (${attempt + 1}/${maxRetries}):`, error.message);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * 构建EIP-7702 Type 0x04交易
 *
 * Type 0x04交易特点:
 * - 用于EIP-7702账户授权
 * - 包含authorizationList字段
 * - 由bundler发送到EntryPoint
 *
 * @param {Object} userOp - UserOperation对象
 * @param {Object|null} authorization - Authorization对象(如需delegation)
 * @returns {Object} 构建的交易对象
 *
 * @example
 * const tx = buildType04Transaction(userOp, auth);
 * await sendTransaction(tx);
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
    chainId: config.chainId
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
      signature: authorization.signature
    }];
  }

  return tx;
}

/**
 * 发送交易到链上
 *
 * @param {Object} tx - 交易对象
 * @returns {Promise<Object>} 交易receipt
 *
 * @example
 * const receipt = await sendTransaction(tx);
 * console.log('Block:', receipt.blockNumber);
 */
export async function sendTransaction(tx) {
  return withRetry(async () => {
    const txResponse = await bundlerWallet.sendTransaction(tx);
    const receipt = await txResponse.wait();
    return receipt;
  });
}

/**
 * 获取provider实例
 * 用于查询链上数据
 *
 * @returns {Object} ethers.JsonRpcProvider实例
 *
 * @example
 * const provider = getProvider();
 * const balance = await provider.getBalance(address);
 */
export function getProvider() {
  return provider;
}

/**
 * 获取bundler地址
 *
 * @returns {string} bundler钱包地址
 *
 * @example
 * const bundlerAddress = getBundlerAddress();
 * console.log('Bundler:', bundlerAddress);
 */
export function getBundlerAddress() {
  return bundlerWallet.address;
}

/**
 * 获取EntryPoint地址
 *
 * @returns {string} EntryPoint合约地址
 */
export function getEntryPointAddress() {
  return config.entryPointAddress;
}

/**
 * 获取Kernel地址
 *
 * @returns {string} Kernel合约地址
 */
export function getKernelAddress() {
  return config.kernelAddress;
}
