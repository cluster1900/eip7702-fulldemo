/**
 * 执行UserOperation路由
 * POST /api/execute
 *
 * 功能:
 * 1. 验证UserOp签名
 * 2. 验证Authorization签名(如需要)
 * 3. 构建EIP-7702 type 0x04交易
 * 4. 发送到链上
 *
 * 请求参数:
 * {
 *   userOp: {           // 必填, UserOperation对象
 *     sender: string,   // 发送者地址
 *     nonce: number,    // nonce值
 *     callData: string, // 调用数据 (bytes)
 *     callGasLimit: number, // 可选, 默认150000
 *     verificationGasLimit: number, // 可选
 *     preVerificationGas: number, // 可选
 *     maxFeePerGas: string, // 可选
 *     maxPriorityFeePerGas: string, // 可选
 *     paymasterAndData: string, // 可选
 *     signature: string  // 签名
 *   },
 *   authorization?: {   // 可选, 首次delegation需要
 *     chainId: number,
 *     address: string,
 *     nonce: number,
 *     signature: string
 *   }
 * }
 *
 * 响应:
 * {
 *   success: boolean,
 *   data: {
 *     txHash: string,       // 交易哈希
 *     blockNumber: number,  // 区块号
 *     delegated: boolean,   // 是否已delegation
 *     executed: boolean,    // 是否执行成功
 *     gasUsed: string       // 消耗的gas
 *   }
 * }
 */
import { ethers } from 'ethers';
import {
  verifyUserOpSignature,
  verifyAuthorizationSignature,
  errorResponse,
  successResponse
} from '../services/validation.js';
import { buildType04Transaction, sendTransaction, getProvider } from '../services/bundler.js';
import { cache } from '../services/cache.js';
import { config } from '../config.js';

/**
 * 输入验证常量
 */
const MAX_GAS_LIMIT = 10_000_000; // 最大gas限制
const MIN_GAS_LIMIT = 21_000;     // 最小gas限制

/**
 * 验证UserOp参数
 * @param {Object} userOp - UserOperation对象
 * @returns {{valid: boolean, message: string}} 验证结果
 */
function validateUserOp(userOp) {
  if (!userOp) {
    return { valid: false, message: 'userOp不能为空' };
  }

  if (!userOp.sender || !ethers.isAddress(userOp.sender)) {
    return { valid: false, message: '无效的sender地址' };
  }

  if (!userOp.signature) {
    return { valid: false, message: 'signature不能为空' };
  }

  // 验证nonce
  if (userOp.nonce !== undefined) {
    const nonce = BigInt(userOp.nonce);
    if (nonce < 0n) {
      return { valid: false, message: 'nonce必须为非负数' };
    }
  }

  // 验证gas限制
  const gasLimits = [
    { name: 'callGasLimit', value: userOp.callGasLimit },
    { name: 'verificationGasLimit', value: userOp.verificationGasLimit },
    { name: 'preVerificationGas', value: userOp.preVerificationGas }
  ];

  for (const { name, value } of gasLimits) {
    if (value !== undefined) {
      const gas = BigInt(value);
      if (gas < 0n) {
        return { valid: false, message: `${name}必须为非负数` };
      }
      if (gas > MAX_GAS_LIMIT) {
        return { valid: false, message: `${name}超过最大限制` };
      }
    }
  }

  // 验证callData格式
  if (userOp.callData && typeof userOp.callData !== 'string') {
    return { valid: false, message: 'callData必须为字符串' };
  }

  return { valid: true, message: 'OK' };
}

/**
 * 验证Authorization参数
 * @param {Object} auth - Authorization对象
 * @returns {{valid: boolean, message: string}} 验证结果
 */
function validateAuthorization(auth) {
  if (!auth) {
    return { valid: false, message: 'authorization不能为空' };
  }

  if (!ethers.isAddress(auth.address)) {
    return { valid: false, message: '无效的authorization地址' };
  }

  if (auth.chainId !== config.chainId) {
    return { valid: false, message: `chainId必须为${config.chainId}` };
  }

  if (auth.nonce === undefined || auth.nonce < 0) {
    return { valid: false, message: '无效的nonce' };
  }

  if (!auth.signature) {
    return { valid: false, message: 'authorization.signature不能为空' };
  }

  return { valid: true, message: 'OK' };
}

/**
 * 发送UserOperation到EntryPoint执行
 *
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 */
export async function executeUserOp(req, res) {
  const { userOp, authorization } = req.body;
  const requestId = req.id;

  try {
    // 1. 验证必填字段
    if (!userOp) {
      return errorResponse(res, 400, 'MISSING_USEROP', '缺少userOp参数', requestId);
    }

    // 2. 验证UserOp参数
    const userOpValidation = validateUserOp(userOp);
    if (!userOpValidation.valid) {
      return errorResponse(res, 400, 'INVALID_USEROP', userOpValidation.message, requestId);
    }

    // 3. 验证UserOp签名
    const isUserOpValid = verifyUserOpSignature(userOp);
    if (!isUserOpValid) {
      return errorResponse(res, 400, 'INVALID_SIGNATURE', 'UserOp签名无效', requestId);
    }

    // 4. 检查是否需要delegation
    const provider = getProvider();
    const code = await provider.getCode(userOp.sender);
    const needsAuth = (code === '0x');

    // 5. 如果需要delegation，验证authorization
    let finalAuthorization = null;
    if (needsAuth) {
      if (!authorization) {
        return errorResponse(res, 400, 'AUTHORIZATION_REQUIRED', '首次执行需要authorization', requestId);
      }

      const authValidation = validateAuthorization(authorization);
      if (!authValidation.valid) {
        return errorResponse(res, 400, 'INVALID_AUTHORIZATION', authValidation.message, requestId);
      }

      const isAuthValid = verifyAuthorizationSignature(authorization, userOp.sender);
      if (!isAuthValid) {
        return errorResponse(res, 400, 'INVALID_AUTH_SIGNATURE', 'Authorization签名无效', requestId);
      }

      finalAuthorization = authorization;
    }

    // 6. 构建type 0x04交易
    const tx = buildType04Transaction(userOp, finalAuthorization);

    // 7. 发送交易到链上
    const receipt = await sendTransaction(tx);

    // 8. 清除delegation状态缓存
    if (needsAuth && receipt.status === 1) {
      const cacheKey = `delegation:${userOp.sender.toLowerCase()}`;
      cache.delete(cacheKey);
    }

    // 9. 返回结果
    return successResponse(res, {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      delegated: !needsAuth,
      executed: receipt.status === 1,
      gasUsed: receipt.gasUsed.toString()
    });

  } catch (error) {
    console.error(`[${requestId}] 执行UserOp失败:`, error.message);

    // 处理特定错误
    if (error.message.includes('nonce')) {
      return errorResponse(res, 400, 'NONCE_ERROR', 'nonce错误或已使用', requestId);
    }

    if (error.message.includes('insufficient funds')) {
      return errorResponse(res, 400, 'INSUFFICIENT_FUNDS', ' bundler余额不足', requestId);
    }

    return errorResponse(res, 500, 'EXECUTION_FAILED', error.message, requestId);
  }
}
