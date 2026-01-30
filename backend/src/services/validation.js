/**
 * 签名验证服务
 * 验证UserOp和Authorization的签名
 */
import { ethers } from 'ethers';

/**
 * 计算UserOp hash (简化版)
 * 实际应使用EIP-712标准hash
 * @param {Object} userOp - UserOperation对象
 * @returns {string} UserOp hash (bytes32)
 */
export function hashUserOp(userOp) {
  // 简化版：直接使用keccak256编码所有字段
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ['address', 'uint256', 'bytes', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'bytes'],
    [
      userOp.sender,
      userOp.nonce,
      userOp.callData,
      userOp.callGasLimit || 100000,
      userOp.verificationGasLimit || 100000,
      userOp.preVerificationGas || 21000,
      userOp.maxFeePerGas || ethers.parseUnits('1', 'gwei'),
      userOp.maxPriorityFeePerGas || ethers.parseUnits('1', 'gwei'),
      userOp.paymasterAndData || '0x'
    ]
  );
  return ethers.keccak256(encoded);
}

/**
 * 验证UserOp签名
 * @param {Object} userOp - UserOperation对象
 * @returns {boolean} 签名是否有效
 */
export function verifyUserOpSignature(userOp) {
  try {
    const userOpHash = hashUserOp(userOp);
    const recoveredAddress = ethers.verifyMessage(
      ethers.getBytes(userOpHash),
      userOp.signature
    );
    return recoveredAddress.toLowerCase() === userOp.sender.toLowerCase();
  } catch (error) {
    console.error('UserOp signature verification failed:', error);
    return false;
  }
}

/**
 * 计算Authorization hash
 * @param {Object} authorization - Authorization对象 {chainId, address, nonce, signature}
 * @returns {string} Authorization hash (bytes32)
 */
export function hashAuthorization(authorization) {
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ['uint256', 'address', 'uint256'],
    [authorization.chainId, authorization.address, authorization.nonce]
  );
  return ethers.keccak256(encoded);
}

/**
 * 验证Authorization签名
 * @param {Object} authorization - Authorization对象
 * @param {string} expectedSigner - 期望的签名者地址
 * @returns {boolean} 签名是否有效
 */
export function verifyAuthorizationSignature(authorization, expectedSigner) {
  try {
    const authHash = hashAuthorization(authorization);
    const recoveredAddress = ethers.verifyMessage(
      ethers.getBytes(authHash),
      authorization.signature
    );
    return recoveredAddress.toLowerCase() === expectedSigner.toLowerCase();
  } catch (error) {
    console.error('Authorization signature verification failed:', error);
    return false;
  }
}
