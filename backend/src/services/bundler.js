/**
 * Bundler服务
 *
 * 功能:
 * 1. 构建 ERC-7821 标准交易
 * 2. 发送交易到链上
 * 3. 提供 provider 和 bundler 地址查询
 *
 * ERC-7821 执行模式:
 * - mode = 1: 普通批量 (Call[])
 * - mode = 3: 递归批量 (batch of batches)
 *
 * @module bundler
 */
import { ethers } from 'ethers';
import { config } from '../config.js';

// ERC-7821 执行模式常量
const MODE_FLAT_BATCH = 1n;
const MODE_RECURSIVE_BATCH = 3n;

// 初始化 provider 和 bundler 钱包
const provider = new ethers.JsonRpcProvider(config.rpcUrl);
const bundlerWallet = new ethers.Wallet(config.bundlerPrivateKey, provider);

// EntryPoint ABI (PackedUserOperation 格式)
const ENTRY_POINT_ABI = [
  'function handleOps((address sender, uint256 nonce, bytes callData, uint256 callGasLimit, uint256 verificationGasLimit, uint256 preVerificationGas, uint256 maxFeePerGas, uint256 maxPriorityFeePerGas, bytes paymasterAndData, bytes signature)[] ops, address beneficiary) external'
];

// Kernel ABI (ERC-7821 标准接口)
const KERNEL_ABI = [
  'function execute(uint256 mode, bytes data) external',
  'function executeBatch((address target, uint256 value, bytes data)[] calls) external',
  'function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)',
  'function getNonce(address user) view returns (uint256)',
  'function nonces(address user) view returns (uint256)'
];

const entryPointContract = new ethers.Contract(
  config.entryPointAddress,
  ENTRY_POINT_ABI,
  bundlerWallet
);

const kernelContract = new ethers.Contract(
  config.kernelAddress,
  KERNEL_ABI,
  bundlerWallet
);

/**
 * RPC 重试配置
 */
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000
};

/**
 * 带重试的 RPC 调用
 * @param {Function} fn - 要执行的异步函数
 * @param {number} maxRetries - 最大重试次数
 */
async function withRetry(fn, maxRetries = RETRY_CONFIG.maxRetries) {
  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (error.message.includes('nonce') ||
          error.message.includes('insufficient funds') ||
          error.message.includes('execution reverted')) {
        throw error;
      }

      const delay = Math.min(
        RETRY_CONFIG.initialDelay * Math.pow(2, attempt),
        RETRY_CONFIG.maxDelay
      );

      console.warn(`RPC 调用失败, ${delay}ms 后重试 (${attempt + 1}/${maxRetries}):`, error.message);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * 构建 ERC-7821 标准交易
 *
 * ERC-7821 执行模式:
 * - mode = 1 (0x01): 普通批量
 * - mode = 3 (0x03): 递归批量
 *
 * @param {Object} userOp - UserOperation 对象
 * @param {Object|null} authorization - Authorization 对象 (如需 delegation)
 * @param {number} [mode=1] - 执行模式
 * @returns {Object} 构建的交易对象
 *
 * @example
 * // 普通批量
 * const tx = buildERC7821Transaction(userOp, null, 1);
 *
 * // 递归批量
 * const tx = buildERC7821Transaction(userOp, null, 3);
 */
export function buildERC7821Transaction(userOp, authorization, mode = 1) {
  // 编码 handleOps calldata
  const handleOpsData = entryPointContract.interface.encodeFunctionData('handleOps', [
    [userOp],
    bundlerWallet.address
  ]);

  // 构建 ERC-7821 交易
  const tx = {
    type: 4, // EIP-7702 type
    to: config.entryPointAddress,
    data: handleOpsData,
    chainId: config.chainId
  };

  // 如果有 authorization，添加到交易中
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
 * 构建 ERC-7821 标准交易 (别名兼容)
 * @deprecated 请使用 buildERC7821Transaction
 */
export { buildERC7821Transaction as buildType04Transaction };

/**
 * 构建 ERC-7821 execute 调用数据
 *
 * @param {Array} calls - Call 结构体数组
 * @param {number} [mode=1] - 执行模式 (1 或 3)
 * @returns {Object} { mode, data }
 *
 * @example
 * const { mode, data } = buildExecuteData([
 *   { target: tokenAddress, value: 0, data: transferData },
 *   { target: anotherContract, value: 0, data: callData }
 * ], 1);
 */
export function buildExecuteData(calls, mode = 1) {
  // ERC-7821 模式
  const modeValue = mode === 3 ? MODE_RECURSIVE_BATCH : MODE_FLAT_BATCH;

  // 编码 calls
  const data = ethers.AbiCoder.defaultAbiCoder().encode(
    ['(address target, uint256 value, bytes data)[]'],
    [calls]
  );

  return { mode: modeValue, data };
}

/**
 * 发送交易到链上
 * @param {Object} tx - 交易对象
 * @returns {Promise<Object>} 交易 receipt
 */
export async function sendTransaction(tx) {
  return withRetry(async () => {
    const txResponse = await bundlerWallet.sendTransaction(tx);
    const receipt = await txResponse.wait();
    return receipt;
  });
}

/**
 * 获取 provider 实例
 * @returns {Object} ethers.JsonRpcProvider 实例
 */
export function getProvider() {
  return provider;
}

/**
 * 获取 bundler 地址
 * @returns {string} bundler 钱包地址
 */
export function getBundlerAddress() {
  return bundlerWallet.address;
}

/**
 * 获取 EntryPoint 地址
 * @returns {string} EntryPoint 合约地址
 */
export function getEntryPointAddress() {
  return config.entryPointAddress;
}

/**
 * 获取 Kernel 地址
 * @returns {string} Kernel 合约地址
 */
export function getKernelAddress() {
  return config.kernelAddress;
}

/**
 * ERC-1271: 验证链上签名
 *
 * @param {string} hash - 消息 hash
 * @param {string} signature - 签名数据
 * @returns {Promise<boolean>} 签名是否有效
 *
 * @example
 * const isValid = await validateERC1271Signature(hash, signature);
 * if (isValid) {
 *   console.log('签名有效');
 * }
 */
export async function validateERC1271Signature(hash, signature) {
  const MAGIC_VALUE = '0x1626ba7e';

  try {
    const result = await kernelContract.isValidSignature(hash, signature);
    return result === MAGIC_VALUE;
  } catch (error) {
    console.error('ERC-1271 验证失败:', error.message);
    return false;
  }
}

/**
 * 获取账户 UserOp nonce
 *
 * @param {string} address - 账户地址
 * @returns {Promise<string>} 当前 nonce
 *
 * @example
 * const nonce = await getUserOpNonce('0x1234...');
 * console.log('当前 nonce:', nonce);
 */
export async function getUserOpNonce(address) {
  try {
    const nonce = await kernelContract.nonces(address);
    return nonce.toString();
  } catch (error) {
    console.error('获取 nonce 失败:', error.message);
    throw error;
  }
}

/**
 * 构建标准 Call 结构体
 *
 * @param {string} target - 目标地址
 * @param {bigint} value - ETH 金额 (wei)
 * @param {string} data - 调用数据
 * @returns {Object} Call 结构体
 *
 * @example
 * const call = buildCall(tokenAddress, 0n, transferData);
 */
export function buildCall(target, value = 0n, data = '0x') {
  return {
    target,
    value,
    data
  };
}
