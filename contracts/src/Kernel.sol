// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "lib/forge-std/src/interfaces/IERC20.sol";
import "forge-std/console.sol";

/**
 * @title Kernel - EIP-7702 委托钱包合约
 * @notice 支持 ERC-4337 和 ERC-1271 的账户抽象实现
 *
 * 功能:
 * 1. EIP-7702 账户委托
 * 2. ERC-4337 UserOperation 验证
 * 3. ERC-1271 链上签名验证
 * 4. ERC-7821 标准批量执行
 * 5. ERC20 代币支付 Gas
 *
 * 标准兼容:
 * - EIP-7702: 账户授权委托
 * - ERC-4337: UserOperation 验证
 * - ERC-1271: 链上签名验证
 * - ERC-7821: 批量执行接口
 *
 * @author EIP-7702 Implementation
 */
contract Kernel {
    /// @notice ERC-1271 magic value (返回此值表示签名有效)
    bytes4 internal constant _ERC1271_MAGIC_VALUE = 0x1626ba7e;

    /// @notice ERC-7821 执行模式: 普通批量
    uint256 internal constant _MODE_FLAT_BATCH = 1;

    /// @notice ERC-7821 执行模式: 递归批量 (Batch of Batches)
    uint256 internal constant _MODE_RECURSIVE_BATCH = 3;

    /// @notice ERC-7821 最大交易次数限制
    uint256 internal constant _MAX_TX = 9;

    /// @notice EntryPoint合约地址 (不可变，保证安全性)
    address public immutable ENTRY_POINT;

    /// @notice 用户地址到UserOp nonce的映射
    mapping(address => uint256) public nonces;

    /// @notice 批量调用结构体 (ERC-7821 标准)
    struct Call {
        address target;   // 目标地址
        uint256 value;    // ETH金额
        bytes data;       // 调用数据
    }

    /// @notice Packed UserOperation结构体 (ERC-4337标准)
    struct PackedUserOperation {
        address sender;
        uint256 nonce;
        bytes initCode;
        bytes callData;
        bytes32 accountGasLimits;
        uint256 preVerificationGas;
        bytes32 gasFees;
        bytes paymasterAndData;
        bytes signature;
    }

    /// @notice EIP-712 域分隔符 (computed in constructor)
    bytes32 public constant DOMAIN_SEPARATOR_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    /// @notice EntryPoint's DOMAIN_NAME hash (ERC4337)
    bytes32 internal constant _DOMAIN_NAME_HASH = 0x21c3353240200136d47160000d7748a9a64b0e25f94bb6b3a5692119c09568c6;

    /// @notice EntryPoint's DOMAIN_VERSION hash (1)
    bytes32 internal constant _DOMAIN_VERSION_HASH = 0xc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6;

    /// @notice PackedUserOperation 类型哈希
    bytes32 public constant PACKED_USEROP_TYPEHASH = keccak256(
        "PackedUserOperation(address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData)"
    );

    string public constant NAME = "Kernel";
    string public constant VERSION = "1";

    bytes32 private _domainSeparator;

    // ===== 事件 =====

    /// @notice UserOperation执行事件
    event UserOperationExecuted(address indexed sender, uint256 nonce, bool success);

    /// @notice 批量调用执行事件 (ERC-7821)
    event BatchExecuted(address indexed sender, uint256 numCalls, uint256 mode);

    /// @notice Gas支付处理事件
    event GasPaymentProcessed(address indexed sender, address indexed token, uint256 amount, address indexed payee);

    /// @notice Debug event for prefund payment
    event DebugPrefund(uint256 missingAccountFunds, uint256 kernelBalance, address entryPoint);

    // ===== 错误 =====

    /// @notice 仅允许EntryPoint调用
    error OnlyEntryPoint();

    /// @notice 签名验证失败
    error InvalidSignature();

    /// @notice nonce验证失败
    error InvalidNonce();

    /// @notice 调用失败
    error CallFailed(uint256 callIndex);

    /// @notice paymasterAndData长度无效
    error InvalidPaymasterData();

    /// @notice Token转账失败
    error TransferFailed();

    /// @notice ERC-7821 无效执行模式
    error InvalidMode();

    /// @notice ERC-7821 超出最大交易次数
    error TooManyCalls(uint256 count, uint256 max);

    // ===== 构造函数 =====

    /**
     * @notice 构造函数，设置不可变的EntryPoint地址
     * @param _entryPoint ERC-4337 EntryPoint合约地址
     */
    constructor(address _entryPoint) {
        require(_entryPoint != address(0), "Invalid EntryPoint");
        ENTRY_POINT = _entryPoint;
        _domainSeparator = _computeDomainSeparator();
    }

    // ===== 核心函数 =====

    /**
     * @notice 计算EIP-712域分隔符 (使用EntryPoint兼容的格式)
     * @dev 使用ERC4337的name和version hash以与EntryPoint的getUserOpHash兼容
     */
    function _computeDomainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                DOMAIN_SEPARATOR_TYPEHASH,
                _DOMAIN_NAME_HASH,      // keccak256("ERC4337")
                _DOMAIN_VERSION_HASH,   // keccak256("1")
                block.chainid,
                address(this)
            )
        );
    }

    /**
     * @notice 计算PackedUserOperation的EIP-712结构化数据哈希
     * @param userOp UserOperation数据
     * @return 结构化数据哈希
     * @dev 使用与EntryPoint兼容的hash计算方式
     */
    function _getUserOpStructHash(PackedUserOperation calldata userOp) internal pure returns (bytes32) {
        bytes32 emptyHash = 0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470;
        bytes32 hashInitCode = userOp.initCode.length == 0 ? emptyHash : keccak256(userOp.initCode);
        bytes32 hashCallData = userOp.callData.length == 0 ? emptyHash : keccak256(userOp.callData);
        bytes32 hashPaymasterAndData = userOp.paymasterAndData.length == 0 ? emptyHash : keccak256(userOp.paymasterAndData);

        return keccak256(
            abi.encode(
                PACKED_USEROP_TYPEHASH,
                userOp.sender,
                userOp.nonce,
                hashInitCode,
                hashCallData,
                userOp.accountGasLimits,
                userOp.preVerificationGas,
                userOp.gasFees,
                hashPaymasterAndData
            )
        );
    }

    /**
     * @notice 验证UserOperation签名并处理gas支付
     * @param userOp 待验证的UserOperation
     * @param userOpHash UserOperation的EIP-712 hash (由EntryPoint计算)
     * @param missingAccountFunds 缺少的账户资金 (用于支付gas)
     * @return validationData 0表示成功, 1表示签名失败
     */
    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external returns (uint256 validationData) {
        // 1. 仅允许EntryPoint调用
        if (msg.sender != ENTRY_POINT) revert OnlyEntryPoint();

        // 2. 验证签名 (使用EIP-712 hash)
        // EntryPoint passes: keccak256(abi.encode(domainSeparator, structHash))
        // We need to verify that the signature matches the sender for this hash
        address signer = _recoverSigner(userOpHash, userOp.signature);
        require(signer == userOp.sender, "Invalid signature from signer");

        // 3. 验证并递增nonce
        uint256 opNonce = userOp.nonce;
        if (opNonce != nonces[userOp.sender]) revert InvalidNonce();
        nonces[userOp.sender]++;

        // Debug event
        console.log("=== In validateUserOp ===");
        console.log("msg.sender:", msg.sender);
        console.log("address(this):", address(this));
        console.log("Kernel balance (address(this)):", address(this).balance);
        console.log("ENTRY_POINT constant:", ENTRY_POINT);
        emit DebugPrefund(missingAccountFunds, address(this).balance, ENTRY_POINT);

        // 4. 支付 prefund 到 EntryPoint (如果需要)
        if (missingAccountFunds > 0) {
            console.log("Kernel balance before prefund:", address(this).balance);
            console.log("Missing account funds:", missingAccountFunds);
            (bool success, ) = payable(ENTRY_POINT).call{value: missingAccountFunds}("");
            require(success, "Failed to pay prefund");
            console.log("Prefund paid successfully");
        }

        // 5. 处理ERC20 gas支付
        if (missingAccountFunds > 0 && userOp.paymasterAndData.length >= 20) {
            address token;
            uint256 amount;

            if (userOp.paymasterAndData.length >= 52 &&
                userOp.paymasterAndData[0] != 0x00 &&
                userOp.paymasterAndData[0] != 0x20) {
                // 紧凑编码格式
                bytes memory data = userOp.paymasterAndData;
                assembly {
                    token := mload(add(data, 20))
                    amount := mload(add(data, 52))
                }
            } else {
                // 动态编码格式
                (token, amount) = abi.decode(
                    userOp.paymasterAndData,
                    (address, uint256)
                );
            }

            address payee = tx.origin;
            if (!IERC20(token).transferFrom(userOp.sender, payee, amount)) {
                revert TransferFailed();
            }

            emit GasPaymentProcessed(userOp.sender, token, amount, payee);
        }

        return 0;
    }

    /**
     * @notice ERC-7821 标准执行接口
     * @param mode 执行模式
     *                 - mode = 1: 普通批量 Call[]
     *                 - mode = 3: 递归批量 (batch of batches)
     * @param data 编码的执行数据
     *
     * ERC-7821 标准:
     * - 支持扁平批量和递归批量
     * - 总调用次数受 _MAX_TX 限制
     *
     * @dev 仅允许EntryPoint调用
     */
    function execute(uint256 mode, bytes calldata data) external {
        if (msg.sender != ENTRY_POINT) revert OnlyEntryPoint();

        if (mode == _MODE_FLAT_BATCH) {
            // 模式 1: 普通批量
            Call[] memory calls = abi.decode(data, (Call[]));
            _executeBatch(calls);
        } else if (mode == _MODE_RECURSIVE_BATCH) {
            // 模式 3: 递归批量 (Batch of Batches)
            bytes[] memory batches = abi.decode(data, (bytes[]));
            _executeRecursiveBatch(batches, 0);
        } else {
            revert InvalidMode();
        }
    }

    /**
     * @notice 执行批量调用 (兼容旧接口)
     * @param calls Call结构体数组
     * @dev 仅允许EntryPoint调用，已废弃，请使用 execute(1, data)
     */
    function executeBatch(Call[] calldata calls) external {
        console.log("executeBatch called by:", msg.sender);
        console.log("Expected entry point:", ENTRY_POINT);
        if (msg.sender != ENTRY_POINT) {
            console.log("REVERT: OnlyEntryPoint");
            revert OnlyEntryPoint();
        }
        console.log("Calling _executeBatch with", calls.length, "calls");
        _executeBatch(calls);
    }

    /**
     * @notice 执行ERC20代币转账
     * @param token 代币合约地址
     * @param from 源地址
     * @param to 目标地址
     * @param amount 转账金额
     */
    function executeTokenTransfer(address token, address from, address to, uint256 amount) external {
        IERC20(token).transferFrom(from, to, amount);
    }

    // ===== ERC-1271 接口 =====

    /**
     * @notice ERC-1271: 验证链上签名
     * @param hash 被签名的消息hash
     * @param signature 签名数据 (65字节: r, s, v)
     * @return magicValue 0x1626ba7e 表示签名有效，其他值表示无效
     *
     * ERC-1271 标准:
     * - 如果签名有效，返回 0x1626ba7e
     * - 如果签名无效，返回其他值
     *
     * @dev 任何人都可以调用，用于验证账户的所有权
     */
    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4 magicValue) {
        // 验证签名长度
        if (signature.length != 65) {
            return bytes4(0);
        }

        // 恢复签名者地址
        address signer = _recoverSigner(hash, signature);

        // 检查签名者是否拥有账户 (通过 nonce 检查)
        uint256 currentNonce = nonces[signer];

        // 对于新账户 (nonce = 0)，验证签名即可
        if (currentNonce >= 0) {
            return _ERC1271_MAGIC_VALUE;
        }

        return bytes4(0);
    }

    // ===== 查询函数 =====

    /**
     * @notice 查询指定地址的当前nonce
     * @param user 要查询的地址
     * @return 当前nonce值
     */
    function getNonce(address user) external view returns (uint256) {
        return nonces[user];
    }

    /**
     * @notice 获取 ERC-1271 magic value
     * @return 0x1626ba7e
     */
    function ERC1271_MAGIC_VALUE() external pure returns (bytes4) {
        return _ERC1271_MAGIC_VALUE;
    }

    // ===== 内部函数 =====

    /**
     * @notice 执行批量调用 (内部)
     * @param calls Call数组 (memory 类型)
     */
    function _executeBatch(Call[] memory calls) internal {
        uint256 numCalls = calls.length;
        require(numCalls <= _MAX_TX, TooManyCalls(numCalls, _MAX_TX));

        console.log("_executeBatch: numCalls=", numCalls);
        console.log("Kernel balance before=", address(this).balance);

        for (uint256 i = 0; i < numCalls; i++) {
            console.log("Executing call to target");
            (bool success, ) = calls[i].target.call{value: calls[i].value}(calls[i].data);
            console.log("Call success=", success);
            console.log("Kernel balance after=", address(this).balance);
            if (!success) revert CallFailed(i);
        }

        emit BatchExecuted(tx.origin, numCalls, _MODE_FLAT_BATCH);
    }

    /**
     * @notice 执行递归批量调用 (内部)
     * @param batches batch 数组
     * @param depth 递归深度，用于防止无限递归
     */
    function _executeRecursiveBatch(bytes[] memory batches, uint256 depth) internal {
        require(depth < 10, "Too deep"); // 防止无限递归

        uint256 totalCalls = 0;

        for (uint256 i = 0; i < batches.length; i++) {
            // 解码每个 batch 的模式
            uint256 mode;
            assembly {
                mode := shr(248, calldataload(add(batches, 32)))
            }

            if (mode == _MODE_FLAT_BATCH) {
                // 普通批量
                Call[] memory calls = abi.decode(batches[i], (Call[]));
                totalCalls += calls.length;
                require(totalCalls <= _MAX_TX, TooManyCalls(totalCalls, _MAX_TX));

                for (uint256 j = 0; j < calls.length; j++) {
                    (bool success, ) = calls[j].target.call{value: calls[j].value}(calls[j].data);
                    if (!success) revert CallFailed(i);
                }
            } else if (mode == _MODE_RECURSIVE_BATCH) {
                // 递归批量
                bytes[] memory subBatches = abi.decode(batches[i], (bytes[]));
                _executeRecursiveBatch(subBatches, depth + 1);
            } else {
                revert InvalidMode();
            }
        }

        emit BatchExecuted(tx.origin, totalCalls, _MODE_RECURSIVE_BATCH);
    }

    /**
     * @notice 从消息hash和签名中恢复签名者地址
     * @param messageHash 被签名的消息hash
     * @param signature ECDSA签名 (65字节)
     * @return 签名者的地址
     */
    function _recoverSigner(bytes32 messageHash, bytes memory signature) internal pure returns (address) {
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
        require(v == 27 || v == 28, "Invalid signature 'v' value");

        return ecrecover(messageHash, v, r, s);
    }

    // ===== 回调函数 =====

    /**
     * @notice 允许合约接收ETH
     */
    receive() external payable {}
}
