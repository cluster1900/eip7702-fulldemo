/**
 * 发送原始交易路由
 * POST /api/send-raw
 *
 * 功能:
 * 发送预签名的 UserOperation 到 EntryPoint
 *
 * 使用 ERC-7821 标准接口:
 * - 模式 1: 普通批量执行 (Call[])
 * - 模式 3: 递归批量 (batch of batches)
 *
 * 请求参数:
 * {
 *   signedUserOp: Object,   // 必填, 已签名的 UserOperation
 *   authorization?: Object  // 可选, 首次 delegation 需要
 *   mode?: number           // 可选, 执行模式 (1 或 3, 默认 1)
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
 *     mode: number,         // 使用的执行模式
 *     standard: string      // 'ERC-7821'
 *   }
 * }
 */
import { ethers } from 'ethers';
import { getProvider, sendTransaction, buildERC7821Transaction } from '../services/bundler.js';
import { errorResponse, successResponse } from '../services/validation.js';
import { cache } from '../services/cache.js';

/**
 * 验证 signedUserOp 参数
 * @param {Object} userOp - UserOperation 对象
 * @returns {{valid: boolean, message: string}} 验证结果
 */
function validateSignedUserOp(userOp) {
  if (!userOp) {
    return { valid: false, message: 'signedUserOp 不能为空' };
  }

  if (!userOp.sender || !ethers.isAddress(userOp.sender)) {
    return { valid: false, message: '无效的 sender 地址' };
  }

  if (!userOp.signature) {
    return { valid: false, message: 'signature 不能为空' };
  }

  return { valid: true, message: 'OK' };
}

/**
 * 验证执行模式
 * @param {number} mode - 执行模式
 * @returns {{valid: boolean, message: string, mode: number}} 验证结果
 */
function validateMode(mode) {
  if (mode === undefined || mode === null) {
    return { valid: true, message: 'OK', mode: 1 };
  }

  if (mode !== 1 && mode !== 3) {
    return { valid: false, message: '无效的执行模式, 支持 1 (普通批量) 和 3 (递归批量)', mode: 1 };
  }

  return { valid: true, message: 'OK', mode };
}

/**
 * 发送预签名的 UserOperation
 *
 * POST /api/send-raw
 *
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 */
export async function sendRawTransaction(req, res) {
  try {
    const { signedUserOp, authorization, mode } = req.body;
    const requestId = req.id;

    // 1. 验证必填字段
    const validation = validateSignedUserOp(signedUserOp);
    if (!validation.valid) {
      return errorResponse(res, 400, 'INVALID_USEROP', validation.message, requestId);
    }

    // 2. 验证执行模式
    const modeValidation = validateMode(mode);
    if (!modeValidation.valid) {
      return errorResponse(res, 400, 'INVALID_MODE', modeValidation.message, requestId);
    }

    // 3. 检查 delegation 状态
    const provider = getProvider();
    const code = await provider.getCode(signedUserOp.sender);
    const needsAuth = (code === '0x');

    // 4. 如果需要 delegation，验证 authorization
    let finalAuthorization = null;
    if (needsAuth) {
      if (!authorization) {
        return errorResponse(res, 400, 'AUTHORIZATION_REQUIRED', '首次执行需要 authorization', requestId);
      }

      if (!authorization.signature) {
        return errorResponse(res, 400, 'INVALID_AUTH', 'authorization.signature 不能为空', requestId);
      }

      finalAuthorization = authorization;
    }

    // 5. 构建 ERC-7821 标准交易
    const tx = buildERC7821Transaction(signedUserOp, finalAuthorization, modeValidation.mode);

    // 6. 发送交易到链上
    const receipt = await sendTransaction(tx);

    // 7. 清除 delegation 状态缓存
    if (needsAuth && receipt.status === 1) {
      const cacheKey = `delegation:${signedUserOp.sender.toLowerCase()}`;
      cache.delete(cacheKey);
    }

    // 8. 返回结果
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
    console.error('发送原始交易失败:', error.message);

    if (error.message.includes('nonce')) {
      return errorResponse(res, 400, 'NONCE_ERROR', 'nonce 错误或已使用', req.id);
    }

    return errorResponse(res, 500, 'SEND_FAILED', error.message, req.id);
  }
}
