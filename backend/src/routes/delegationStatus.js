/**
 * Delegation状态查询路由
 * GET /api/delegation-status/:address
 */
import { ethers } from 'ethers';
import { getProvider } from '../services/bundler.js';
import { config } from '../config.js';
import { cache } from '../services/cache.js';

// Kernel ABI
const KERNEL_ABI = [
  'function getNonce(address user) view returns (uint256)'
];

/**
 * 查询地址的delegation状态
 */
export async function getDelegationStatus(req, res) {
  try {
    const { address } = req.params;

    // 验证地址格式
    if (!ethers.isAddress(address)) {
      return res.status(400).json({
        error: 'Invalid address format'
      });
    }

    // 尝试从缓存获取
    const cacheKey = `delegation:${address.toLowerCase()}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const provider = getProvider();

    // 查询链上code（判断是否已delegation）
    const code = await provider.getCode(address);
    const delegated = code !== '0x';

    // 查询EOA nonce（用于构建authorization）
    const eoaNonce = await provider.getTransactionCount(address);

    // 查询UserOp nonce
    const kernelContract = new ethers.Contract(
      config.kernelAddress,
      KERNEL_ABI,
      provider
    );
    const userOpNonce = await kernelContract.getNonce(address);

    const result = {
      address,
      delegated,
      eoaNonce,
      userOpNonce: userOpNonce.toString(),
      timestamp: Date.now()
    };

    // 缓存结果
    cache.set(cacheKey, result);

    res.json(result);
  } catch (error) {
    console.error('Get delegation status error:', error);
    res.status(500).json({
      error: 'Failed to get delegation status',
      message: error.message
    });
  }
}
