/**
 * 签名验证服务
 *
 * 功能:
 * 1. 计算符合EIP-712标准的UserOpHash
 * 2. 验证UserOp签名的有效性
 * 3. 计算和验证Authorization hash
 *
 * EIP-712标准:
 * - UserOp使用EntryPoint定义的域分隔符进行hash
 * - Authorization使用链ID和合约地址作为域信息
 *
 * @module validation
 */
import { ethers } from 'ethers';
import { config } from '../config.js';

/**
 * EIP-712 域分隔符类型定义
 * @typedef {Object} EIP712Domain
 * @property {string} name - 域名
 * @property {string} version - 版本号
 * @property {number} chainId - 链ID
 * @property {string} verifyingContract - 验证合约地址
 */

/**
 * UserOperation类型定义 (符合ERC-4337标准)
 * @typedef {Object} UserOperation
 * @property {string} sender - 发送者地址
 * @property {uint256} nonce - nonce值
 * @property {bytes} callData - 调用数据
 * @property {uint256} callGasLimit - 调用gas限制
 * @property {uint256} verificationGasLimit - 验证gas限制
 * @property {uint256} preVerificationGas - 预验证gas
 * @property {uint256} maxFeePerGas - 最大gas价格
 * @property {uint256} maxPriorityFeePerGas - 最大优先费
 * @property {bytes} paymasterAndData - paymaster数据
 * @property {bytes} signature - 签名
 */

/**
 * UserOperation的EIP-712类型名称
 * 用于构造类型哈希
 */
const USER_OP_TYPE = [
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

/**
 * 获取UserOp的EIP-712域分隔符
 * 遵循ERC-4337规范
 *
 * @returns {EIP712Domain} 域分隔符对象
 */
function getUserOpDomain() {
  return {
    name: 'Account Abstraction',
    version: '1',
    chainId: config.chainId,
    verifyingContract: config.entryPointAddress
  };
}

/**
 * 获取Authorization的EIP-712域分隔符
 * 用于EIP-7702授权
 *
 * @param {string} contractAddress - 授权目标合约地址
 * @returns {EIP712Domain} 域分隔符对象
 */
function getAuthorizationDomain(contractAddress) {
  return {
    name: 'EIP7702Authorization',
    version: '1',
    chainId: config.chainId,
    verifyingContract: contractAddress
  };
}

/**
 * 计算UserOperation的EIP-712 hash
 *
 * 计算流程:
 * 1. 构建UserOp类型数据
 * 2. 使用EIP-712域分隔符进行结构化hash
 *
 * @param {Object} userOp - UserOperation对象
 * @returns {string} UserOp hash (bytes32, 0x开头)
 *
 * @example
 * const userOpHash = hashUserOp({
 *   sender: '0x1234...',
 *   nonce: '0',
 *   callData: '0xabcd...',
 *   ...
 * });
 */
export function hashUserOp(userOp) {
  // 构造UserOp数据对象 (所有BigInt转换为字符串)
  const userOpData = {
    sender: userOp.sender,
    nonce: BigInt(userOp.nonce || 0).toString(),
    callData: userOp.callData || '0x',
    callGasLimit: BigInt(userOp.callGasLimit || 0).toString(),
    verificationGasLimit: BigInt(userOp.verificationGasLimit || 0).toString(),
    preVerificationGas: BigInt(userOp.preVerificationGas || 0).toString(),
    maxFeePerGas: BigInt(userOp.maxFeePerGas || 0).toString(),
    maxPriorityFeePerGas: BigInt(userOp.maxPriorityFeePerGas || 0).toString(),
    paymasterAndData: userOp.paymasterAndData || '0x'
  };

  // 使用 ethers.js v6 的 TypedDataEncoder 计算 EIP-712 hash
  const domain = getUserOpDomain();
  const typedData = {
    domain: domain,
    types: {
      UserOperation: USER_OP_TYPE
    },
    primaryType: 'UserOperation',
    message: userOpData
  };

  return ethers.TypedDataEncoder.hash(typedData.domain, typedData.types, typedData.message);
}

/**
 * 验证UserOperation签名
 *
 * 验证流程:
 * 1. 计算UserOp的EIP-712 hash
 * 2. 使用hash和签名恢复签名者地址
 * 3. 验证签名者是否为sender
 *
 * @param {Object} userOp - UserOperation对象
 * @returns {boolean} 签名是否有效
 *
 * @example
 * const isValid = verifyUserOpSignature({
 *   sender: '0x1234...',
 *   signature: '0xabcd...',
 *   ...
 * });
 */
export function verifyUserOpSignature(userOp) {
  try {
    // 1. 参数验证
    if (!userOp || !userOp.sender || !userOp.signature) {
      return false;
    }

    // 2. 地址格式验证
    if (!ethers.isAddress(userOp.sender)) {
      return false;
    }

    // 3. 计算UserOp hash
    const userOpHash = hashUserOp(userOp);

    // 4. 验证签名
    const recoveredAddress = ethers.verifyMessage(
      ethers.getBytes(userOpHash),
      userOp.signature
    );

    // 5. 比较签名者 (不区分大小写)
    return recoveredAddress.toLowerCase() === userOp.sender.toLowerCase();
  } catch (error) {
    console.error('UserOp签名验证失败:', error.message);
    return false;
  }
}

/**
 * 计算Authorization的EIP-712 hash
 *
 * EIP-7702授权格式:
 * - chainId: 链ID
 * - address: 授权目标地址 (如Kernel合约)
 * - nonce: 防止重放攻击
 *
 * @param {Object} authorization - Authorization对象
 * @param {number} authorization.chainId - 链ID
 * @param {string} authorization.address - 授权合约地址
 * @param {number} authorization.nonce - nonce值
 * @returns {string} Authorization hash (bytes32)
 */
export function hashAuthorization(authorization) {
  const domain = getAuthorizationDomain(authorization.address);

  const authData = {
    chainId: BigInt(authorization.chainId).toString(),
    address: authorization.address,
    nonce: BigInt(authorization.nonce).toString()
  };

  const typedData = {
    domain: domain,
    types: {
      Authorization: [
        { name: 'chainId', type: 'uint256' },
        { name: 'address', type: 'address' },
        { name: 'nonce', type: 'uint256' }
      ]
    },
    primaryType: 'Authorization',
    message: authData
  };

  return ethers.TypedDataEncoder.hash(typedData.domain, typedData.types, typedData.message);
}

/**
 * 验证Authorization签名
 *
 * 验证流程:
 * 1. 计算Authorization的EIP-712 hash
 * 2. 使用hash和签名恢复签名者地址
 * 3. 验证签名者是否为期望的地址
 *
 * @param {Object} authorization - Authorization对象
 * @param {string} expectedSigner - 期望的签名者地址
 * @returns {boolean} 签名是否有效
 */
export function verifyAuthorizationSignature(authorization, expectedSigner) {
  try {
    // 1. 参数验证
    if (!authorization || !authorization.signature) {
      return false;
    }

    // 2. 地址格式验证
    if (!ethers.isAddress(expectedSigner)) {
      return false;
    }

    // 3. 计算Authorization hash
    const authHash = hashAuthorization(authorization);

    // 4. 验证签名
    const recoveredAddress = ethers.verifyMessage(
      ethers.getBytes(authHash),
      authorization.signature
    );

    // 5. 比较签名者 (不区分大小写)
    return recoveredAddress.toLowerCase() === expectedSigner.toLowerCase();
  } catch (error) {
    console.error('Authorization签名验证失败:', error.message);
    return false;
  }
}

/**
 * 标准化错误响应
 *
 * @param {Object} res - Express响应对象
 * @param {number} statusCode - HTTP状态码
 * @param {string} code - 错误代码
 * @param {string} message - 错误消息
 * @param {string} [requestId] - 请求ID
 * @returns {Object} 错误响应对象
 */
export function errorResponse(res, statusCode, code, message, requestId = null) {
  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      requestId: requestId || res.req?.id
    }
  });
}

/**
 * 标准化成功响应
 *
 * @param {Object} res - Express响应对象
 * @param {Object} data - 响应数据
 * @returns {Object} 成功响应对象
 */
export function successResponse(res, data) {
  return res.json({
    success: true,
    data
  });
}
