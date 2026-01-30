/**
 * ERC-1271 签名验证路由
 * POST /api/validate-signature
 *
 * 功能:
 * 使用 ERC-1271 标准在链上验证签名
 *
 * ERC-1271 是一种标准接口，允许智能合约验证链上签名。
 * 与传统链下验证不同，ERC-1271 直接在合约层面验证签名。
 *
 * 请求参数:
 * {
 *   hash: string,     // 必填, 被签名的消息 hash (bytes32)
 *   signature: string // 必填, 签名数据 (65字节: r, s, v)
 * }
 *
 * 响应:
 * {
 *   success: boolean,
 *   data: {
 *     valid: boolean,       // 签名是否有效
 *     magicValue: string,   // 0x1626ba7e 表示有效
 *     hash: string,         // 验证的消息 hash
 *     timestamp: number     // 验证时间戳
 *   }
 * }
 *
 * @module validateSignature
 */
import { ethers } from 'ethers';
import { getProvider } from '../services/bundler.js';
import { config } from '../config.js';
import { errorResponse, successResponse } from '../services/validation.js';

// ERC-1271 Magic Value
const MAGIC_VALUE = '0x1626ba7e';

/**
 * ERC-1271 ABI (简化版)
 */
const ERC1271_ABI = [
  'function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)'
];

/**
 * 验证 ERC-1271 签名参数
 * @param {Object} params - 请求参数
 * @returns {{valid: boolean, message: string}} 验证结果
 */
function validateParams(params) {
  const { hash, signature } = params;

  // 验证 hash
  if (!hash) {
    return { valid: false, message: 'hash 不能为空' };
  }

  // 验证 hash 格式 (bytes32)
  if (typeof hash === 'string') {
    if (!hash.startsWith('0x') || hash.length !== 66) {
      return { valid: false, message: 'hash 必须是 66 字符的 hex 字符串 (bytes32)' };
    }
  } else if (typeof hash === 'object' && hash.type === 'Buffer') {
    if (hash.data.length !== 32) {
      return { valid: false, message: 'hash 必须是 32 字节' };
    }
  }

  // 验证 signature
  if (!signature) {
    return { valid: false, message: 'signature 不能为空' };
  }

  // 验证 signature 长度 (65 字节用于 ECDSA)
  if (typeof signature === 'string') {
    if (!signature.startsWith('0x')) {
      return { valid: false, message: 'signature 必须是 hex 字符串' };
    }
    // 允许不同长度的签名 (多签等情况)
    if (signature.length < 66) {
      return { valid: false, message: 'signature 太短 (最少 66 字符)' };
    }
  }

  return { valid: true, message: 'OK' };
}

/**
 * ERC-1271 签名验证
 *
 * POST /api/validate-signature
 *
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 */
export async function validateSignature(req, res) {
  try {
    const params = req.body;
    const requestId = req.id;

    // 1. 验证参数
    const validation = validateParams(params);
    if (!validation.valid) {
      return errorResponse(res, 400, 'INVALID_PARAMS', validation.message, requestId);
    }

    const { hash, signature } = params;

    // 2. 获取 provider 和 Kernel 合约
    const provider = getProvider();
    const kernelAddress = config.kernelAddress;

    // 3. 调用合约的 isValidSignature 方法
    const kernelContract = new ethers.Contract(kernelAddress, ERC1271_ABI, provider);

    let isValid = false;
    let magicValue = '0x00000000';

    try {
      const result = await kernelContract.isValidSignature(hash, signature);
      magicValue = result;
      isValid = result === MAGIC_VALUE;
    } catch (contractError) {
      // 合约调用失败，可能是账户未初始化等原因
      console.error('ERC-1271 合约验证失败:', contractError.message);
      return errorResponse(res, 400, 'VALIDATION_FAILED', '合约验证失败: ' + contractError.message, requestId);
    }

    // 4. 返回结果
    return successResponse(res, {
      valid: isValid,
      magicValue: magicValue,
      hash: hash,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('ERC-1271 验证失败:', error.message);
    return errorResponse(res, 500, 'INTERNAL_ERROR', error.message, req.id);
  }
}

/**
 * 批量验证 ERC-1271 签名
 *
 * POST /api/validate-signature/batch
 *
 * 请求参数:
 * {
 *   signatures: [
 *     { hash: string, signature: string },
 *     { hash: string, signature: string },
 *     ...
 *   ]
 * }
 *
 * 响应:
 * {
 *   success: boolean,
 *   data: {
 *     results: [
 *       { hash: string, valid: boolean, magicValue: string },
 *       ...
 *     ]
 *   }
 * }
 */
export async function validateSignatureBatch(req, res) {
  try {
    const { signatures } = req.body;
    const requestId = req.id;

    // 1. 验证输入
    if (!signatures || !Array.isArray(signatures)) {
      return errorResponse(res, 400, 'INVALID_PARAMS', 'signatures 必须是数组', requestId);
    }

    if (signatures.length === 0) {
      return errorResponse(res, 400, 'INVALID_PARAMS', 'signatures 数组不能为空', requestId);
    }

    if (signatures.length > 100) {
      return errorResponse(res, 400, 'INVALID_PARAMS', '最多支持 100 个签名验证', requestId);
    }

    // 2. 获取 provider 和 Kernel 合约
    const provider = getProvider();
    const kernelAddress = config.kernelAddress;

    const kernelContract = new ethers.Contract(kernelAddress, ERC1271_ABI, provider);

    // 3. 批量验证
    const results = await Promise.all(
      signatures.map(async (item) => {
        const { hash, signature } = item;

        try {
          const result = await kernelContract.isValidSignature(hash, signature);
          return {
            hash: hash,
            valid: result === MAGIC_VALUE,
            magicValue: result
          };
        } catch {
          return {
            hash: hash,
            valid: false,
            magicValue: '0x00000000'
          };
        }
      })
    );

    // 4. 返回结果
    return successResponse(res, {
      results: results,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('批量验证失败:', error.message);
    return errorResponse(res, 500, 'INTERNAL_ERROR', error.message, req.id);
  }
}
