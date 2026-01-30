/**
 * 模拟执行路由（可选功能）
 * POST /api/simulate
 */
import { ethers } from 'ethers';
import { verifyUserOpSignature } from '../services/validation.js';
import { buildType04Transaction, getProvider } from '../services/bundler.js';
import { config } from '../config.js';

/**
 * 模拟UserOperation执行（静态调用）
 * Body: { userOp, authorization? }
 */
export async function simulateUserOp(req, res) {
  try {
    const { userOp, authorization } = req.body;

    // 验证必需字段
    if (!userOp || !userOp.sender) {
      return res.status(400).json({
        error: 'Missing required fields'
      });
    }

    // 1. 验证UserOp签名（可选，模拟时可跳过）
    if (userOp.signature && userOp.signature !== '0x') {
      const isValid = verifyUserOpSignature(userOp);
      if (!isValid) {
        return res.status(400).json({
          error: 'Invalid UserOp signature',
          signatureValid: false
        });
      }
    }

    // 2. 检查delegation状态
    const provider = getProvider();
    const code = await provider.getCode(userOp.sender);
    const needsAuth = (code === '0x');

    // 3. 估算gas
    const tx = buildType04Transaction(userOp, authorization);
    
    let estimatedGas;
    try {
      estimatedGas = await provider.estimateGas({
        ...tx,
        from: userOp.sender
      });
    } catch (error) {
      return res.status(400).json({
        error: 'Simulation failed',
        reason: error.message,
        willRevert: true
      });
    }

    // 4. 返回模拟结果
    res.json({
      success: true,
      needsAuth,
      signatureValid: !!userOp.signature,
      estimatedGas: estimatedGas.toString(),
      willRevert: false
    });

  } catch (error) {
    console.error('Simulate UserOp error:', error);
    res.status(500).json({
      error: 'Simulation failed',
      message: error.message
    });
  }
}
