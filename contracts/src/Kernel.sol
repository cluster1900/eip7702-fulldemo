// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "lib/forge-std/src/interfaces/IERC20.sol";

/**
 * @title Kernel - EIP-7702 委托钱包合约
 * @notice 用于账户抽象的EIP-7702实现，支持ERC-4337标准
 *
 * 功能:
 * 1. 验证UserOperation签名
 * 2. 管理nonce防止重放攻击
 * 3. 执行ERC20代币转账
 * 4. 支持批量调用
 *
 * 授权流程 (EIP-7702):
 * 1. 用户签署authorization (chainId + address + nonce)
 * 2. Bundler构建type 0x04交易，包含authorizationList
 * 3. 交易执行后，用户账户的code变为Kernel合约代码
 * 4. 后续UserOp由Kernel验证并执行
 *
 * @author EIP-7702 Implementation
 */
contract Kernel {
    /// @notice EntryPoint合约地址 (不可变，保证安全性)
    address public immutable ENTRY_POINT;

    /// @notice 用户地址到UserOp nonce的映射
    mapping(address => uint256) public nonces;

    /// @notice 批量调用结构体
    struct Call {
        address target;   // 目标地址
        uint256 value;    // ETH金额
        bytes data;       // 调用数据
    }

    /// @notice Packed UserOperation结构体 (ERC-4337标准)
    struct PackedUserOperation {
        address sender;
        uint256 nonce;
        bytes callData;
        uint256 callGasLimit;
        uint256 verificationGasLimit;
        uint256 preVerificationGas;
        uint256 maxFeePerGas;
        uint256 maxPriorityFeePerGas;
        bytes paymasterAndData;
        bytes signature;
    }

    // ===== 事件 =====

    /// @notice UserOperation执行事件
    /// @param sender 发送者地址
    /// @param nonce UserOp nonce
    /// @param success 是否执行成功
    event UserOperationExecuted(address indexed sender, uint256 nonce, bool success);

    /// @notice 批量调用执行事件
    /// @param sender 发送者地址
    /// @param numCalls 调用的数量
    event BatchExecuted(address indexed sender, uint256 numCalls);

    /// @notice Gas支付处理事件
    /// @param sender 发送者地址
    /// @param token Token地址
    /// @param amount 支付金额
    /// @param payee 收款方地址 (bundler)
    event GasPaymentProcessed(address indexed sender, address indexed token, uint256 amount, address indexed payee);

    // ===== 错误 =====

    /// @notice 仅允许EntryPoint调用
    error OnlyEntryPoint();

    /// @notice 签名验证失败
    error InvalidSignature();

    /// @notice nonce验证失败
    error InvalidNonce();

    /// @notice 调用失败
    /// @param callIndex 失败的调用索引
    error CallFailed(uint256 callIndex);

    /// @notice paymasterAndData长度无效
    error InvalidPaymasterData();

    /// @notice Token转账失败
    error TransferFailed();

    // ===== 构造函数 =====

    /**
     * @notice 构造函数，设置不可变的EntryPoint地址
     * @param _entryPoint ERC-4337 EntryPoint合约地址
     */
    constructor(address _entryPoint) {
        require(_entryPoint != address(0), "Invalid EntryPoint");
        ENTRY_POINT = _entryPoint;
    }

    // ===== 核心函数 =====

    /**
     * @notice 验证UserOperation签名并处理gas支付
     * @param userOp 待验证的UserOperation
     * @param userOpHash UserOperation的hash (由EntryPoint计算)
     * @param missingAccountFunds 缺少的账户资金 (用于支付gas)
     * @return validationData 0表示成功, 1表示签名失败
     *
     * 验证流程:
     * 1. 仅允许EntryPoint调用
     * 2. 验证UserOp签名
     * 3. 验证并递增nonce
     * 4. 处理ERC20 gas支付 (如果需要)
     *
     * 安全性考虑:
     * - paymasterAndData最小长度为52字节 (20字节address + 32字节uint256)
     * - 使用assembly进行签名解析，避免校验绕过
     * - 限制s值防止签名可塑性攻击
     */
    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external returns (uint256 validationData) {
        // 1. 仅允许EntryPoint调用
        if (msg.sender != ENTRY_POINT) revert OnlyEntryPoint();

        // 2. 验证签名
        address signer = recoverSigner(userOpHash, userOp.signature);
        if (signer != userOp.sender) revert InvalidSignature();

        // 3. 验证并递增nonce
        if (userOp.nonce != nonces[userOp.sender]) revert InvalidNonce();
        nonces[userOp.sender]++;

        // 4. 处理ERC20 gas支付
        // 格式: address(20 bytes) + uint256(32 bytes) = 最小52字节
        // 支持动态编码和紧凑编码两种格式
        if (missingAccountFunds > 0 && userOp.paymasterAndData.length >= 20) {
            address token;
            uint256 amount;

            // 检查是否是紧凑编码格式 (20 + 32 = 52字节)
            // 紧凑编码: address (20) + amount (32)
            // 动态编码: offset (32) + address (32) + amount (32) = 96字节

            if (userOp.paymasterAndData.length >= 52) {
                // 检查第一个字节 - 紧凑编码以地址开头(非0x00或0x20), 动态编码以0x20开头
                if (userOp.paymasterAndData[0] != 0x00 && userOp.paymasterAndData[0] != 0x20) {
                    // 紧凑编码格式 - 使用内存拷贝
                    bytes memory data = userOp.paymasterAndData;
                    assembly {
                        token := mload(add(data, 20))
                        amount := mload(add(data, 52))
                    }
                } else {
                    // 动态编码格式 (abi.encode)
                    (token, amount) = abi.decode(
                        userOp.paymasterAndData,
                        (address, uint256)
                    );
                }

                // 执行ERC20转账
                address payee = tx.origin; // bundler地址
                if (!IERC20(token).transferFrom(userOp.sender, payee, amount)) {
                    revert TransferFailed();
                }

                emit GasPaymentProcessed(userOp.sender, token, amount, payee);
            }
        }

        return 0; // 验证成功
    }

    /**
     * @notice 批量执行多个调用
     * @param calls Call结构体数组，包含target、value和data
     *
     * 特点:
     * - 所有调用在单个交易中执行
     * - 任一调用失败则全部回滚
     * - 适用于多步骤操作，如先授权再转账
     */
    function executeBatch(Call[] calldata calls) external {
        if (msg.sender != ENTRY_POINT) revert OnlyEntryPoint();

        uint256 numCalls = calls.length;
        for (uint256 i = 0; i < numCalls; i++) {
            (bool success, ) = calls[i].target.call{value: calls[i].value}(calls[i].data);
            if (!success) revert CallFailed(i);
        }

        emit BatchExecuted(tx.origin, numCalls);
    }

    /**
     * @notice 执行ERC20代币转账
     * @param token 代币合约地址
     * @param from 源地址 (已授权的用户)
     * @param to 目标地址
     * @param amount 转账金额
     *
     * 用途:
     * - 由executeBatch内部调用
     * - 用于从用户账户转出代币
     *
     * 前提条件:
     * - 用户必须已授权Kernel合约
     * - Kernel合约有足够的allowance
     */
    function executeTokenTransfer(address token, address from, address to, uint256 amount) external {
        IERC20(token).transferFrom(from, to, amount);
    }

    // ===== 查询函数 =====

    /**
     * @notice 查询指定地址的当前nonce
     * @param user 要查询nonce的地址
     * @return 当前nonce值 (新地址返回0)
     *
     * 注意:
     * - 这是UserOp nonce，不是EOA交易nonce
     * - 每次validateUserOp成功后递增
     */
    function getNonce(address user) external view returns (uint256) {
        return nonces[user];
    }

    // ===== 内部函数 =====

    /**
     * @notice 从消息hash和签名中恢复签名者地址
     * @param messageHash 被签名的消息hash
     * @param signature ECDSA签名 (65字节: r, s, v)
     * @return 签名者的地址
     *
     * 安全性:
     * - 验证签名长度为65字节
     * - 限制s值在低半平面 (EIP-2)
     * - 验证v值为27或28
     */
    function recoverSigner(bytes32 messageHash, bytes memory signature)
        internal
        pure
        returns (address)
    {
        require(signature.length == 65, "Invalid signature length");

        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }

        // EIP-2: 限制s值防止签名可塑性攻击
        require(
            uint256(s) <= 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0,
            "Invalid signature 's' value"
        );
        // 验证v值
        require(v == 27 || v == 28, "Invalid signature 'v' value");

        return ecrecover(messageHash, v, r, s);
    }

    // ===== 回调函数 =====

    /**
     * @notice 允许合约接收ETH
     *
     * 用于:
     * - 接收ETH退款
     * - 接收用户支付的ETH (如果有)
     */
    receive() external payable {}
}
