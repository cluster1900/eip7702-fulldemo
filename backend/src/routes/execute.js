/**
 * 执行 UserOperation 路由
 * POST /api/execute
 *
 * 功能:
 * 1. 验证 UserOp 签名 (支持 ECDSA)
 * 2. 验证 Authorization 签名 (如需要)
 * 3. 构建 ERC-7821 标准交易
 * 4. 发送到链上
 *
 * ERC-7821 支持:
 * - 模式 1: 普通批量执行 (Call[])
 * - 模式 3: 递归批量 (batch of batches)
 *
 * 请求参数:
 * {
 *   userOp: {           // 必填, UserOperation 对象
 *     sender: string,   // 发送者地址
 *     nonce: number,    // nonce 值
 *     callData: string, // 调用数据 (ERC-7821 格式)
 *     ...
 *     signature: string // 签名
 *   },
 *   authorization?: {   // 可选, 首次 delegation 需要
 *     chainId: number,
 *     address: string,
 *     nonce: number,
 *     signature: string
 *   },
 *   mode?: number        // 可选, 执行模式 (1 或 3, 默认 1)
 * }
 *
 * 响应:
 * {
 *   success: boolean,
 *   data: {
 *     txHash: string,       // 交易哈希
 *     blockNumber: number,  // 区块号
 *     delegated: boolean,   // 是否已 delegation
 *     executed: boolean,    // 是否执行成功
 *     gasUsed: string,      // 消耗的 gas
 *     mode: number          // 使用的执行模式
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
import {
  buildERC7821Transaction,
  sendTransaction,
  getProvider
} from '../services/bundler.js';
import { cache } from '../services/cache.js';
import { config } from '../config.js';

/**
 * 输入验证常量
 */
const MAX_GAS_LIMIT = 10_000_000;
const VALID_MODES = [1, 3];

/**
 * 验证 UserOp 参数
 * @param {Object} userOp - UserOperation 对象
 * @returns {{valid: boolean, message: string}} 验证结果
 */
function validateUserOp(userOp) {
  if (!userOp) {
    return { valid: false, message: 'userOp 不能为空' };
  }

  if (!userOp.sender || !ethers.isAddress(userOp.sender)) {
    return { valid: false, message: '无效的 sender 地址' };
  }

  if (!userOp.signature) {
    return { valid: false, message: 'signature 不能为空' };
  }

  if (userOp.nonce !== undefined) {
    const nonce = BigInt(userOp.nonce);
    if (nonce < 0n) {
      return { valid: false, message: 'nonce 必须为非负数' };
    }
  }

  const gasLimits = [
    { name: 'callGasLimit', value: userOp.callGasLimit },
    { name: 'verificationGasLimit', value: userOp.verificationGasLimit },
    { name: 'preVerificationGas', value: userOp.preVerificationGas }
  ];

  for (const { name, value } of gasLimits) {
    if (value !== undefined) {
      const gas = BigInt(value);
      if (gas < 0n) {
        return { valid: false, message: `${name} 必须为非负数` };
      }
      if (gas > MAX_GAS_LIMIT) {
        return { valid: false, message: `${name} 超过最大限制` };
      }
    }
  }

  if (userOp.callData && typeof userOp.callData !== 'string') {
    return { valid: false, message: 'callData 必须为字符串' };
  }

  return { valid: true, message: 'OK' };
}

/**
 * 验证 Authorization 参数
 * @param {Object} auth - Authorization 对象
 * @returns {{valid: boolean, message: string}} 验证结果
 */
function validateAuthorization(auth) {
  if (!auth) {
    return { valid: false, message: 'authorization 不能为空' };
  }

  if (!ethers.isAddress(auth.address)) {
    return { valid: false, message: '无效的 authorization 地址' };
  }

  if (auth.chainId !== config.chainId) {
    return { valid: false, message: `chainId 必须为 ${config.chainId}` };
  }

  if (auth.nonce === undefined || auth.nonce < 0) {
    return { valid: false, message: '无效的 nonce' };
  }

  if (!auth.signature) {
    return { valid: false, message: 'authorization.signature 不能为空' };
  }

  return { valid: true, message: 'OK' };
}

/**
 * 验证执行模式
 * @param {number} mode - 执行模式
 * @returns {{valid: boolean, message: string}} 验证结果
 */
function validateMode(mode) {
  if (mode === undefined || mode === null) {
    return { valid: true, message: 'OK', mode: 1 }; // 默认模式 1
  }

  if (!VALID_MODES.includes(mode)) {
    return { valid: false, message: `无效的执行模式, 支持 1 (普通批量) 和 3 (递归批量)` };
  }

  return { valid: true, message: 'OK', mode };
}

/**
 * 执行 UserOperation
 *
 * POST /api/execute
 *
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 */
export async function executeUserOp(req, res) {
  const { userOp, authorization, mode } = req.body;
  const requestId = req.id;

  try {
    // 1. 验证必填字段
    if (!userOp) {
      return errorResponse(res, 400, 'MISSING_USEROP', '缺少 userOp 参数', requestId);
    }

    // 2. 验证 UserOp 参数
    const userOpValidation = validateUserOp(userOp);
    if (!userOpValidation.valid) {
      return errorResponse(res, 400, 'INVALID_USEROP', userOpValidation.message, requestId);
    }

    // 3. 验证执行模式
    const modeValidation = validateMode(mode);
    if (!modeValidation.valid) {
      return errorResponse(res, 400, 'INVALID_MODE', modeValidation.message, requestId);
    }

    // 4. 验证 UserOp 签名
    const isUserOpValid = verifyUserOpSignature(userOp);
    if (!isUserOpValid) {
      return errorResponse(res, 400, 'INVALID_SIGNATURE', 'UserOp 签名无效', requestId);
    }

    // 5. 检查是否需要 delegation
    const provider = getProvider();
    const code = await provider.getCode(userOp.sender);
    const needsAuth = (code === '0x');

    // 6. 如果需要 delegation，验证 authorization
    let finalAuthorization = null;
    if (needsAuth) {
      if (!authorization) {
        return errorResponse(res, 400, 'AUTHORIZATION_REQUIRED', '首次执行需要 authorization', requestId);
      }

      const authValidation = validateAuthorization(authorization);
      if (!authValidation.valid) {
        return errorResponse(res, 400, 'INVALID_AUTHORIZATION', authValidation.message, requestId);
      }

      const isAuthValid = verifyAuthorizationSignature(authorization, userOp.sender);
      if (!isAuthValid) {
        return errorResponse(res, 400, 'INVALID_AUTH_SIGNATURE', 'Authorization 签名无效', requestId);
      }

      finalAuthorization = authorization;
    }

    // 7. 构建 ERC-7821 标准交易
    // 支持模式 1 (普通批量) 和模式 3 (递归批量)
    const tx = buildERC7821Transaction(userOp, finalAuthorization, modeValidation.mode);

    // 8. 发送交易到链上
    const receipt = await sendTransaction(tx);

    // 9. 清除 delegation 状态缓存
    if (needsAuth && receipt.status === 1) {
      const cacheKey = `delegation:${userOp.sender.toLowerCase()}`;
      cache.delete(cacheKey);
    }

    // 10. 返回结果
    return successResponse(res, {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      delegated: !needsAuth,
      executed: receipt.status === 1,
      gasUsed: receipt.gasUsed.toString(),
      mode: modeValidation.mode,
      standard: 'ERC-7821'
    });

  } catch (error) {
    console.error(`[${requestId}] 执行 UserOp 失败:`, error.message);

    if (error.message.includes('nonce')) {
      return errorResponse(res, 400, 'NONCE_ERROR', 'nonce 错误或已使用', requestId);
    }

    if (error.message.includes('insufficient funds')) {
      return errorResponse(res, 400, 'INSUFFICIENT_FUNDS', 'bundler 余额不足', requestId);
    }

    return errorResponse(res, 500, 'EXECUTION_FAILED', error.message, requestId);
  }
}
