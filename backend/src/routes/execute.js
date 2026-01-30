/**
 * 执行UserOperation路由
 * POST /api/execute
 */
import { ethers } from 'ethers';
import { verifyUserOpSignature, verifyAuthorizationSignature } from '../services/validation.js';
import { buildType04Transaction, sendTransaction, getProvider } from '../services/bundler.js';
import { cache } from '../services/cache.js';

/**
 * 执行UserOperation
 * Body: { userOp, authorization? }
 */
export async function executeUserOp(req, res) {
  try {
    const { userOp, authorization } = req.body;

    // 验证必需字段
    if (!userOp || !userOp.sender || !userOp.signature) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['userOp.sender', 'userOp.signature']
      });
    }

    // 1. 验证UserOp签名
    const isUserOpValid = verifyUserOpSignature(userOp);
    if (!isUserOpValid) {
      return res.status(400).json({
        error: 'Invalid UserOp signature'
      });
    }

    console.log('✓ UserOp signature verified');

    // 2. 检查是否需要delegation
    const provider = getProvider();
    const code = await provider.getCode(userOp.sender);
    const needsAuth = (code === '0x');

    console.log(`Sender ${userOp.sender} delegation status:`, needsAuth ? 'NEEDS AUTH' : 'DELEGATED');

    // 3. 如果需要delegation，验证authorization
    let finalAuthorization = null;
    if (needsAuth) {
      if (!authorization) {
        return res.status(400).json({
          error: 'Authorization required for first-time delegation',
          needsAuth: true
        });
      }

      // 验证authorization签名
      const isAuthValid = verifyAuthorizationSignature(authorization, userOp.sender);
      if (!isAuthValid) {
        return res.status(400).json({
          error: 'Invalid authorization signature'
        });
      }

      console.log('✓ Authorization signature verified');
      finalAuthorization = authorization;
    }

    // 4. 构建type 0x04交易
    const tx = buildType04Transaction(userOp, finalAuthorization);

    // 5. 发送交易到链上
    const receipt = await sendTransaction(tx);

    // 6. 清除delegation状态缓存（已delegation）
    if (needsAuth && receipt.status === 1) {
      const cacheKey = `delegation:${userOp.sender.toLowerCase()}`;
      cache.delete(cacheKey);
    }

    // 7. 返回结果
    res.json({
      success: true,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      delegated: !needsAuth,
      executed: receipt.status === 1,
      gasUsed: receipt.gasUsed.toString()
    });

  } catch (error) {
    console.error('Execute UserOp error:', error);
    res.status(500).json({
      error: 'Execution failed',
      message: error.message
    });
  }
}
