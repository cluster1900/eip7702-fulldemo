/**
 * 构建Calldata路由
 * POST /api/construct-calldata
 *
 * 功能:
 * 构造ERC-4337标准的UserOperation calldata
 * 用于Token转账和gas补偿场景
 *
 * 请求参数:
 * {
 *   sender: string,         // 必填, 发送者地址 (userB)
 *   to: string,             // 必填, 接收者地址 (userA)
 *   amount: string,         // 必填, 转账金额 (wei字符串)
 *   tokenAddress: string,   // 必填, Token合约地址
 *   gasAmount: string,      // 必填, Gas补偿金额 (wei字符串)
 *   nonce: number,          // 可选, 默认0
 *   callGasLimit: number,   // 可选, 默认150000
 *   verificationGasLimit: number, // 可选, 默认150000
 *   preVerificationGas: number,   // 可选, 默认21000
 *   maxFeePerGas: string,   // 可选, 默认1 gwei
 *   maxPriorityFeePerGas: string  // 可选, 默认1 gwei
 * }
 *
 * 响应:
 * {
 *   success: boolean,
 *   data: {
 *     userOp: Object,      // 完整的UserOperation对象
 *     userOpHash: string,  // UserOp hash (用于签名)
 *     message: string      // 提示信息
 *   }
 * }
 *
 * @module constructCalldata
 */
import { ethers } from 'ethers';
import { config } from '../config.js';
import { errorResponse, successResponse } from '../services/validation.js';

/**
 * 输入验证常量
 */
const MAX_UINT256 = 2n ** 256n - 1n;
const DEFAULT_CALL_GAS_LIMIT = 150000n;
const DEFAULT_VERIFICATION_GAS_LIMIT = 150000n;
const DEFAULT_PRE_VERIFICATION_GAS = 21000n;
const DEFAULT_MAX_FEE_PER_GAS = ethers.parseUnits('1', 'gwei');
const DEFAULT_MAX_PRIORITY_FEE_PER_GAS = ethers.parseUnits('1', 'gwei');

/**
 * 验证构造calldata的请求参数
 *
 * @param {Object} params - 请求参数
 * @returns {{valid: boolean, message: string}} 验证结果
 */
function validateParams(params) {
  const { sender, to, amount, tokenAddress, gasAmount } = params;

  // 验证必填字段
  if (!sender || !ethers.isAddress(sender)) {
    return { valid: false, message: '无效的sender地址' };
  }

  if (!to || !ethers.isAddress(to)) {
    return { valid: false, message: '无效的to地址' };
  }

  if (!amount) {
    return { valid: false, message: 'amount不能为空' };
  }

  if (!tokenAddress || !ethers.isAddress(tokenAddress)) {
    return { valid: false, message: '无效的tokenAddress' };
  }

  if (!gasAmount) {
    return { valid: false, message: 'gasAmount不能为空' };
  }

  // 验证amount格式
  try {
    const amountValue = BigInt(amount);
    if (amountValue <= 0n) {
      return { valid: false, message: 'amount必须大于0' };
    }
    if (amountValue > MAX_UINT256) {
      return { valid: false, message: 'amount超出范围' };
    }
  } catch {
    return { valid: false, message: 'amount格式无效' };
  }

  // 验证gasAmount格式
  try {
    const gasValue = BigInt(gasAmount);
    if (gasValue <= 0n) {
      return { valid: false, message: 'gasAmount必须大于0' };
    }
  } catch {
    return { valid: false, message: 'gasAmount格式无效' };
  }

  // 验证nonce
  if (params.nonce !== undefined && params.nonce !== null) {
    try {
      const nonce = BigInt(params.nonce);
      if (nonce < 0n) {
        return { valid: false, message: 'nonce必须为非负数' };
      }
    } catch {
      return { valid: false, message: 'nonce格式无效' };
    }
  }

  return { valid: true, message: 'OK' };
}

/**
 * 构造executeTokenTransfer的calldata
 *
 * 函数签名: executeTokenTransfer(address token, address from, address to, uint256 amount)
 *
 * @param {string} tokenAddress - Token合约地址
 * @param {string} sender - 发送者地址
 * @param {string} to - 接收者地址
 * @param {string|bigint} amount - 转账金额
 * @returns {string} 编码后的calldata
 */
function buildExecuteTokenTransferCalldata(tokenAddress, sender, to, amount) {
  // 函数选择器: executeTokenTransfer(address,address,address,uint256)
  const funcSelector = '0x69d76bed';

  // 打包参数: token(20 bytes) + sender(20 bytes) + to(20 bytes) + amount(32 bytes)
  const calldata =
    funcSelector +
    tokenAddress.substring(2).padStart(40, '0') +
    sender.substring(2).padStart(40, '0') +
    to.substring(2).padStart(40, '0') +
    BigInt(amount).toString(16).padStart(64, '0');

  return calldata;
}

/**
 * 构造paymasterAndData
 * 格式: address(token) + uint256(amount)
 *
 * @param {string} tokenAddress - Token地址
 * @param {string|bigint} gasAmount - Gas补偿金额
 * @returns {string} 编码后的paymasterAndData
 */
function buildPaymasterAndData(tokenAddress, gasAmount) {
  return '0x' +
    tokenAddress.substring(2).padStart(40, '0') +
    BigInt(gasAmount).toString(16).padStart(64, '0');
}

/**
 * 计算UserOp的EIP-712 hash
 *
 * @param {Object} userOp - UserOperation对象
 * @returns {string} UserOp hash
 */
function computeUserOpHash(userOp) {
  const domain = {
    name: 'Account Abstraction',
    version: '1',
    chainId: config.chainId,
    verifyingContract: config.entryPointAddress
  };

  const userOpTypes = [
    { name: 'sender', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'callData', type: 'bytes' },
    { name: 'callGasLimit', type: 'uint256' },
    { name: 'verificationGasLimit', type: 'uint256' },
    { name: 'preVerificationGas', type: 'uint256' },
    { name: 'maxFeePerGas', type: 'uint256' },
    { name: 'maxPriorityFeePerGas', type: 'uint256' },
    { name: 'paymasterAndData', type: 'bytes' }
  ];

  const userOpData = {
    sender: userOp.sender,
    nonce: BigInt(userOp.nonce),
    callData: userOp.callData,
    callGasLimit: BigInt(userOp.callGasLimit),
    verificationGasLimit: BigInt(userOp.verificationGasLimit),
    preVerificationGas: BigInt(userOp.preVerificationGas),
    maxFeePerGas: BigInt(userOp.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(userOp.maxPriorityFeePerGas),
    paymasterAndData: userOp.paymasterAndData
  };

  return ethers.hashTypedData(domain, {
    UserOperation: userOpTypes,
    ...userOpData
  });
}

/**
 * 构建UserOperation对象
 *
 * @param {Object} params - 请求参数
 * @returns {Object} UserOperation对象
 */
function buildUserOp(params) {
  const {
    sender,
    to,
    amount,
    tokenAddress,
    gasAmount,
    nonce = 0
  } = params;

  // 构造calldata
  const callData = buildExecuteTokenTransferCalldata(tokenAddress, sender, to, amount);

  // 构造paymasterAndData
  const paymasterAndData = buildPaymasterAndData(tokenAddress, gasAmount);

  // 返回完整的UserOp
  return {
    sender,
    nonce: BigInt(nonce),
    callData,
    callGasLimit: DEFAULT_CALL_GAS_LIMIT,
    verificationGasLimit: DEFAULT_VERIFICATION_GAS_LIMIT,
    preVerificationGas: DEFAULT_PRE_VERIFICATION_GAS,
    maxFeePerGas: DEFAULT_MAX_FEE_PER_GAS.toString(),
    maxPriorityFeePerGas: DEFAULT_MAX_PRIORITY_FEE_PER_GAS.toString(),
    paymasterAndData,
    signature: '0x' // 留空，由客户端签名
  };
}

/**
 * 构造UserOp calldata
 *
 * POST /api/construct-calldata
 */
export async function constructCalldata(req, res) {
  try {
    const params = req.body;
    const requestId = req.id;

    // 1. 验证参数
    const validation = validateParams(params);
    if (!validation.valid) {
      return errorResponse(res, 400, 'INVALID_PARAMS', validation.message, requestId);
    }

    // 2. 构建UserOp
    const userOp = buildUserOp(params);

    // 3. 计算UserOpHash (用于客户端签名)
    const userOpHash = computeUserOpHash(userOp);

    // 4. 返回结果
    return successResponse(res, {
      userOp,
      userOpHash,
      message: 'UserOp calldata已构造完成。请使用sender私钥对userOpHash进行签名。'
    });

  } catch (error) {
    console.error('构造calldata失败:', error.message);
    return errorResponse(res, 500, 'CONSTRUCTION_FAILED', error.message, req.id);
  }
}
