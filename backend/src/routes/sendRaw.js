/**
 * 发送原始交易路由
 * POST /api/send-raw
 *
 * 功能:
 * 发送预签名的UserOperation到EntryPoint
 *
 * 此端点与/api/execute功能类似，但专门用于发送已签名的UserOp
 * 适用于:
 * 1. 客户端已完成签名验证
 * 2. 批量发送UserOp场景
 *
 * 请求参数:
 * {
 *   signedUserOp: Object,   // 必填, 已签名的UserOperation
 *   authorization?: Object  // 可选, 首次delegation需要
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
 *     gasUsed: string,      // 消耗的gas
 *     timestamp: number     // 时间戳
 *   }
 * }
 *
 * @module sendRaw
 */
import { ethers } from 'ethers';
import { getProvider, sendTransaction, buildType04Transaction } from '../services/bundler.js';
import { verifyUserOpSignature, errorResponse, successResponse } from '../services/validation.js';
import { cache } from '../services/cache.js';

/**
 * 验证signedUserOp参数
 * @param {Object} userOp - UserOperation对象
 * @returns {{valid: boolean, message: string}} 验证结果
 */
function validateSignedUserOp(userOp) {
  if (!userOp) {
    return { valid: false, message: 'signedUserOp不能为空' };
  }

  if (!userOp.sender || !ethers.isAddress(userOp.sender)) {
    return { valid: false, message: '无效的sender地址' };
  }

  if (!userOp.signature) {
    return { valid: false, message: 'signature不能为空' };
  }

  return { valid: true, message: 'OK' };
}

/**
 * 发送预签名的UserOperation
 *
 * POST /api/send-raw
 *
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 */
export async function sendRawTransaction(req, res) {
  try {
    const { signedUserOp, authorization } = req.body;
    const requestId = req.id;

    // 1. 验证必填字段
    const validation = validateSignedUserOp(signedUserOp);
    if (!validation.valid) {
      return errorResponse(res, 400, 'INVALID_USEROP', validation.message, requestId);
    }

    // 2. 检查delegation状态
    const provider = getProvider();
    const code = await provider.getCode(signedUserOp.sender);
    const needsAuth = (code === '0x');

    // 3. 如果需要delegation，验证authorization
    let finalAuthorization = null;
    if (needsAuth) {
      if (!authorization) {
        return errorResponse(res, 400, 'AUTHORIZATION_REQUIRED', '首次执行需要authorization', requestId);
      }

      // 验证authorization签名
      // 注意: 这里简化验证，实际应更严格
      if (!authorization.signature) {
        return errorResponse(res, 400, 'INVALID_AUTH', 'authorization.signature不能为空', requestId);
      }

      finalAuthorization = authorization;
    }

    // 4. 构建type 0x04交易
    const tx = buildType04Transaction(signedUserOp, finalAuthorization);

    // 5. 发送交易到链上
    const receipt = await sendTransaction(tx);

    // 6. 清除delegation状态缓存
    if (needsAuth && receipt.status === 1) {
      const cacheKey = `delegation:${signedUserOp.sender.toLowerCase()}`;
      cache.delete(cacheKey);
    }

    // 7. 返回结果
    return successResponse(res, {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      delegated: !needsAuth,
      executed: receipt.status === 1,
      gasUsed: receipt.gasUsed.toString(),
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('发送原始交易失败:', error.message);

    if (error.message.includes('nonce')) {
      return errorResponse(res, 400, 'NONCE_ERROR', 'nonce错误或已使用', req.id);
    }

    return errorResponse(res, 500, 'SEND_FAILED', error.message, req.id);
  }
}
