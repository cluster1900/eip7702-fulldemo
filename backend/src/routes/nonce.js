/**
 * Nonce查询路由
 * GET /api/nonce/:address
 *
 * 功能:
 * 查询账户的UserOp nonce
 *
 * 说明:
 * UserOp nonce与EOA交易nonce不同:
 * - EOA nonce: 可通过eth_getTransactionCount查询
 * - UserOp nonce: 存储在Kernel合约中，用于ERC-4337流程
 *
 * 用途:
 * - 构造新的UserOp时需要正确的nonce
 * - 防止UserOp重放攻击
 *
 * 路径参数:
 * - address: 要查询的账户地址
 *
 * 响应:
 * {
 *   success: boolean,
 *   data: {
 *     address: string,       // 查询的地址
 *     nonce: string,         // 当前UserOp nonce
 *     timestamp: number      // 查询时间戳
 *   }
 * }
 *
 * 示例:
 * curl http://localhost:3000/api/nonce/0x1234...
 *
 * @module nonce
 */
import { ethers } from 'ethers';
import { getProvider } from '../services/bundler.js';
import { config } from '../config.js';
import { cache } from '../services/cache.js';
import { errorResponse, successResponse } from '../services/validation.js';

// Kernel ABI - 仅需要getNonce函数
const KERNEL_ABI = [
  'function getNonce(address user) view returns (uint256)'
];

/**
 * 缓存配置 (30秒)
 */
const CACHE_TTL = 30000;

/**
 * 查询UserOp nonce
 *
 * GET /api/nonce/:address
 *
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 */
export async function getNonce(req, res) {
  try {
    const { address } = req.params;
    const requestId = req.id;

    // 1. 验证地址格式
    if (!address || !ethers.isAddress(address)) {
      return errorResponse(res, 400, 'INVALID_ADDRESS', '无效的地址格式', requestId);
    }

    const normalizedAddress = address.toLowerCase();
    const cacheKey = `nonce:${normalizedAddress}`;

    // 2. 尝试从缓存获取
    const cached = cache.get(cacheKey);
    if (cached) {
      return successResponse(res, cached);
    }

    // 3. 查询Kernel合约获取UserOp nonce
    const provider = getProvider();
    const kernelContract = new ethers.Contract(
      config.kernelAddress,
      KERNEL_ABI,
      provider
    );

    const nonce = await kernelContract.getNonce(normalizedAddress);

    const result = {
      address: normalizedAddress,
      nonce: nonce.toString(),
      timestamp: Date.now()
    };

    // 4. 缓存结果
    cache.set(cacheKey, result, CACHE_TTL);

    // 5. 返回结果
    return successResponse(res, result);

  } catch (error) {
    console.error('查询nonce失败:', error.message);
    return errorResponse(res, 500, 'QUERY_FAILED', error.message, req.id);
  }
}
