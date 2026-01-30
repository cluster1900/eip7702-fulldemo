/**
 * 构建Calldata路由
 * POST /api/construct-calldata
 */
import { ethers } from 'ethers';
import { config } from '../config.js';

/**
 * 构建UserOp的calldata
 * Body: { sender, to, amount, tokenAddress, gasAmount }
 */
export async function constructCalldata(req, res) {
  try {
    const { 
      sender,           // 发送者地址 (userB)
      to,               // 接收者地址 (userA)
      amount,           // 转账金额 (字符串，wei)
      tokenAddress,     // Token地址
      gasAmount,        // Gas补偿金额 (字符串，wei)
      nonce,            // Nonce
      callGasLimit,
      verificationGasLimit,
      preVerificationGas,
      maxFeePerGas,
      maxPriorityFeePerGas
    } = req.body;

    // 验证必需字段
    if (!sender || !to || !amount || !tokenAddress || !gasAmount) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['sender', 'to', 'amount', 'tokenAddress', 'gasAmount']
      });
    }

    console.log('=========================================');
    console.log('CONSTRUCT CALLDATA API');
    console.log('=========================================');
    console.log('');
    console.log('[BEFORE] Input Parameters:');
    console.log('  sender:', sender);
    console.log('  to:', to);
    console.log('  amount:', amount);
    console.log('  tokenAddress:', tokenAddress);
    console.log('  gasAmount:', gasAmount);
    console.log('  nonce:', nonce || 0);
    console.log('');

    // 构造executeTokenTransfer的calldata
    const executeTokenTransferSig = 'executeTokenTransfer(address,address,address,uint256)';
    const funcSelector = ethers.id(executeTokenTransferSig).substring(0, 10);
    const callData = '0x' + funcSelector.substring(2) +
      tokenAddress.substring(2).padStart(64, '0') +
      sender.substring(2).padStart(64, '0') +
      to.substring(2).padStart(64, '0') +
      BigInt(amount).toString(16).padStart(64, '0');

    console.log('[DURING] Constructing calldata...');
    console.log('  Function signature:', executeTokenTransferSig);
    console.log('  callData hash:', ethers.keccak256(callData));
    console.log('  callData length:', callData.length, 'bytes');
    console.log('');

    // 构造paymasterAndData
    const paymasterAndData = ethers.solidityPacked(
      ['address', 'uint256'],
      [tokenAddress, gasAmount]
    );

    console.log('  paymasterAndData:', paymasterAndData);
    console.log('');

    // 构造完整的UserOp对象
    const userOp = {
      sender,
      nonce: nonce || 0,
      callData,
      callGasLimit: callGasLimit || 150000,
      verificationGasLimit: verificationGasLimit || 150000,
      preVerificationGas: preVerificationGas || 21000,
      maxFeePerGas: maxFeePerGas || ethers.parseUnits('1', 'gwei').toString(),
      maxPriorityFeePerGas: maxPriorityFeePerGas || ethers.parseUnits('1', 'gwei').toString(),
      paymasterAndData,
      signature: '0x' // 留空，由客户端签名
    };

    // 计算userOpHash - using packed encoding per EIP-712
    const userOpHash = ethers.keccak256(
      ethers.concat([
        userOp.sender,
        '0x' + BigInt(userOp.nonce).toString(16).padStart(64, '0'),
        ethers.keccak256(userOp.callData),
        ethers.keccak256(userOp.paymasterAndData),
        '0x' + BigInt(userOp.callGasLimit).toString(16).padStart(64, '0'),
        '0x' + BigInt(userOp.verificationGasLimit).toString(16).padStart(64, '0'),
        '0x' + BigInt(userOp.preVerificationGas).toString(16).padStart(64, '0'),
        '0x' + BigInt(userOp.maxFeePerGas).toString(16).padStart(64, '0'),
        '0x' + BigInt(userOp.maxPriorityFeePerGas).toString(16).padStart(64, '0'),
        '0x' + '0'.repeat(64)
      ])
    );

    console.log('[AFTER] UserOp constructed:');
    console.log('  userOpHash:', userOpHash);
    console.log('  Ready for client signature');
    console.log('');

    res.json({
      success: true,
      userOp,
      userOpHash,
      message: 'UserOp calldata constructed. Please sign userOpHash with sender private key.'
    });

  } catch (error) {
    console.error('Construct calldata error:', error);
    res.status(500).json({
      error: 'Failed to construct calldata',
      message: error.message
    });
  }
}
