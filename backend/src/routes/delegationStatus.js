/**
 * Delegation状态查询路由
 * GET /api/delegation-status/:address
 *
 * 功能:
 * 查询账户的EIP-7702 delegation状态
 *
 * 查询内容:
 * 1. 是否已delegation (通过检查code是否为空)
 * 2. EOA nonce (用于构建authorization)
 * 3. UserOp nonce (Kernel合约中的nonce)
 *
 * 响应:
 * {
 *   success: boolean,
 *   data: {
 *     address: string,        // 查询的地址
 *     delegated: boolean,     // 是否已delegation
 *     eoaNonce: number,       // EOA交易nonce
 *     userOpNonce: string,    // UserOp nonce
 *     timestamp: number       // 查询时间戳
 *   }
 * }
 *
 * @module delegationStatus
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
 * 缓存配置
 */
const CACHE_TTL = 60000; // 60秒

/**
 * 查询地址的delegation状态
 *
 * GET /api/delegation-status/:address
 *
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 */
export async function getDelegationStatus(req, res) {
  try {
    const { address } = req.params;
    const requestId = req.id;

    // 1. 验证地址格式
    if (!address || !ethers.isAddress(address)) {
      return errorResponse(res, 400, 'INVALID_ADDRESS', '无效的地址格式', requestId);
    }

    const normalizedAddress = address.toLowerCase();
    const cacheKey = `delegation:${normalizedAddress}`;

    // 2. 尝试从缓存获取
    const cached = cache.get(cacheKey);
    if (cached) {
      return successResponse(res, cached);
    }

    const provider = getProvider();

    // 3. 查询链上code（判断是否已delegation）
    // 如果code不为0x，表示账户已设置delegation
    const code = await provider.getCode(address);
    const delegated = code !== '0x';

    // 4. 查询EOA nonce
    // 用于构建EIP-7702 authorization
    const eoaNonce = await provider.getTransactionCount(address);

    // 5. 查询UserOp nonce
    // 从Kernel合约获取
    const kernelContract = new ethers.Contract(
      config.kernelAddress,
      KERNEL_ABI,
      provider
    );
    const userOpNonce = await kernelContract.getNonce(address);

    const result = {
      address: normalizedAddress,
      delegated,
      eoaNonce,
      userOpNonce: userOpNonce.toString(),
      timestamp: Date.now()
    };

    // 6. 缓存结果
    cache.set(cacheKey, result, CACHE_TTL);

    // 7. 返回结果
    return successResponse(res, result);

  } catch (error) {
    console.error('查询delegation状态失败:', error.message);
    return errorResponse(res, 500, 'QUERY_FAILED', error.message, req.id);
  }
}
