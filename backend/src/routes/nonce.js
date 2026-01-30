/**
 * Nonce查询路由
 * GET /api/nonce/:address
 */
import { ethers } from 'ethers';
import { getProvider } from '../services/bundler.js';
import { config } from '../config.js';

// Kernel ABI (只需getNonce)
const KERNEL_ABI = [
  'function getNonce(address user) view returns (uint256)'
];

/**
 * 查询用户的UserOp nonce
 */
export async function getNonce(req, res) {
  try {
    const { address } = req.params;

    // 验证地址格式
    if (!ethers.isAddress(address)) {
      return res.status(400).json({
        error: 'Invalid address format'
      });
    }

    const provider = getProvider();
    const kernelContract = new ethers.Contract(
      config.kernelAddress,
      KERNEL_ABI,
      provider
    );

    // 调用Kernel.getNonce()
    const nonce = await kernelContract.getNonce(address);

    res.json({
      address,
      nonce: nonce.toString()
    });
  } catch (error) {
    console.error('Get nonce error:', error);
    res.status(500).json({
      error: 'Failed to get nonce',
      message: error.message
    });
  }
}
