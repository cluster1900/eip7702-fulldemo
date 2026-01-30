/**
 * 模拟执行路由
 * POST /api/simulate
 *
 * 功能:
 * 模拟UserOperation的执行，不实际发送交易
 *
 * 返回:
 * 1. 签名是否有效
 * 2. 是否需要delegation
 * 3. 预估gas消耗
 *
 * 请求参数:
 * {
 *   userOp: Object,       // UserOperation对象
 *   authorization?: Object // 可选, Authorization对象
 * }
 *
 * 响应:
 * {
 *   success: boolean,
 *   data: {
 *     needsAuth: boolean,      // 是否需要delegation
 *     signatureValid: boolean, // 签名是否有效
 *     estimatedGas: string,    // 预估gas
 *     willRevert: boolean      // 是否会revert
 *   }
 * }
 *
 * @module simulate
 */
import { ethers } from 'ethers';
import { verifyUserOpSignature } from '../services/validation.js';
import { buildType04Transaction, getProvider } from '../services/bundler.js';
import { errorResponse, successResponse } from '../services/validation.js';

/**
 * 模拟UserOperation执行
 *
 * POST /api/simulate
 *
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 */
export async function simulateUserOp(req, res) {
  try {
    const { userOp, authorization } = req.body;
    const requestId = req.id;

    // 1. 验证必填字段
    if (!userOp || !userOp.sender) {
      return errorResponse(res, 400, 'MISSING_USEROP', '缺少userOp参数', requestId);
    }

    // 2. 验证地址格式
    if (!ethers.isAddress(userOp.sender)) {
      return errorResponse(res, 400, 'INVALID_ADDRESS', '无效的sender地址', requestId);
    }

    // 3. 验证签名（可选，模拟时可跳过）
    let signatureValid = false;
    if (userOp.signature && userOp.signature !== '0x') {
      signatureValid = verifyUserOpSignature(userOp);
      if (!signatureValid) {
        return errorResponse(res, 400, 'INVALID_SIGNATURE', 'UserOp签名无效', requestId);
      }
    }

    // 4. 检查delegation状态
    const provider = getProvider();
    const code = await provider.getCode(userOp.sender);
    const needsAuth = (code === '0x');

    // 5. 估算gas
    const tx = buildType04Transaction(userOp, authorization);

    let estimatedGas;
    let willRevert = false;

    try {
      estimatedGas = await provider.estimateGas({
        ...tx,
        from: userOp.sender
      });
    } catch (error) {
      willRevert = true;
      return successResponse(res, {
        needsAuth,
        signatureValid,
        estimatedGas: '0',
        willRevert: true,
        revertReason: error.message
      });
    }

    // 6. 返回模拟结果
    return successResponse(res, {
      needsAuth,
      signatureValid,
      estimatedGas: estimatedGas.toString(),
      willRevert
    });

  } catch (error) {
    console.error('模拟执行失败:', error.message);
    return errorResponse(res, 500, 'SIMULATION_FAILED', error.message, req.id);
  }
}
