/**
 * 发送原始交易路由
 * POST /api/send-raw
 */
import { ethers } from 'ethers';
import { getProvider, sendTransaction, buildType04Transaction } from '../services/bundler.js';
import { config } from '../config.js';

/**
 * 发送预签名的交易到链上
 * Body: { signedUserOp, authorization? }
 */
export async function sendRawTransaction(req, res) {
  try {
    const { signedUserOp, authorization } = req.body;

    // 验证必需字段
    if (!signedUserOp || !signedUserOp.sender || !signedUserOp.signature) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['signedUserOp.sender', 'signedUserOp.signature']
      });
    }

    console.log('=========================================');
    console.log('SEND RAW TRANSACTION API');
    console.log('=========================================');
    console.log('');
    console.log('[BEFORE] Transaction Details:');
    console.log('  sender:', signedUserOp.sender);
    console.log('  nonce:', signedUserOp.nonce);
    console.log('  signature:', signedUserOp.signature.slice(0, 20) + '...');
    console.log('  callData:', signedUserOp.callData?.slice(0, 30) + '...');
    console.log('');

    // 1. 检查是否需要delegation
    const provider = getProvider();
    const code = await provider.getCode(signedUserOp.sender);
    const needsAuth = (code === '0x');

    console.log('[DURING] Checking delegation status...');
    console.log('  sender code size:', code.length, 'bytes');
    console.log('  needsAuth:', needsAuth);
    console.log('');

    // 2. 如果需要delegation，验证authorization
    let finalAuthorization = null;
    if (needsAuth) {
      console.log('[DURING] Authorization required for delegation...');
      if (!authorization) {
        return res.status(400).json({
          error: 'Authorization required for first-time delegation',
          needsAuth: true
        });
      }
      finalAuthorization = authorization;
      console.log('  authorization provided: yes');
      console.log('');
    }

    // 3. 构建type 0x04交易
    console.log('[DURING] Building type 0x04 transaction...');
    const tx = buildType04Transaction(signedUserOp, finalAuthorization);
    console.log('  transaction to:', tx.to);
    console.log('  transaction data:', tx.data.slice(0, 50) + '...');
    console.log('');

    // 4. 发送交易到链上
    console.log('[DURING] Sending transaction to chain...');
    const startTime = Date.now();
    const receipt = await sendTransaction(tx);
    const endTime = Date.now();

    console.log('[AFTER] Transaction sent successfully!');
    console.log('  txHash:', receipt.hash);
    console.log('  blockNumber:', receipt.blockNumber);
    console.log('  gasUsed:', receipt.gasUsed.toString());
    console.log('  status:', receipt.status === 1 ? 'SUCCESS' : 'FAILED');
    console.log('  time:', (endTime - startTime) / 1000, 'seconds');
    console.log('');

    // 5. 返回结果
    res.json({
      success: true,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      delegated: !needsAuth,
      executed: receipt.status === 1,
      gasUsed: receipt.gasUsed.toString(),
      gasPrice: tx.gasPrice?.toString() || 'N/A',
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Send raw transaction error:', error);
    res.status(500).json({
      error: 'Transaction failed',
      message: error.message
    });
  }
}
