# Kernel.sol 合约文档

## 概述

`Kernel.sol` 是基于EIP-7702实现的委托钱包合约，用于账户抽象场景。该合约遵循ERC-4337标准，支持UserOperation验证、批量调用执行和ERC20代币支付gas。

## 核心功能

1. **UserOperation验证** - 验证签名和nonce
2. **nonce管理** - 防止重放攻击
3. **批量调用** - 支持多步骤操作
4. **ERC20 Gas支付** - 支持代币支付交易费用

## 合约架构

```
Kernel
├── 状态变量
│   ├── ENTRY_POINT (不可变)
│   └── nonces (mapping)
├── 数据结构
│   ├── Call (批量调用结构)
│   └── PackedUserOperation (ERC-4337)
├── 事件
│   ├── UserOperationExecuted
│   ├── BatchExecuted
│   └── GasPaymentProcessed
├── 错误
│   ├── OnlyEntryPoint
│   ├── InvalidSignature
│   ├── InvalidNonce
│   ├── CallFailed
│   ├── InvalidPaymasterData
│   └── TransferFailed
└── 函数
    ├── 外部函数
    │   ├── validateUserOp
    │   ├── executeBatch
    │   ├── executeTokenTransfer
    │   └── getNonce
    └── 内部函数
        └── recoverSigner
```

---

## 状态变量

### ENTRY_POINT
```solidity
address public immutable ENTRY_POINT;
```
**说明**: ERC-4337 EntryPoint合约地址，在构造函数中设置，之后不可更改。

**用途**: 仅允许EntryPoint调用验证和执行函数，确保安全性。

### nonces
```solidity
mapping(address => uint256) public nonces;
```
**说明**: 记录每个用户的UserOp nonce。

**用途**:
- 防止UserOp重放攻击
- 确保UserOp按顺序执行

---

## 数据结构

### Call (批量调用)
```solidity
struct Call {
    address target;   // 目标合约地址
    uint256 value;    // ETH金额 (wei)
    bytes data;       // 调用数据
}
```

**示例**:
```solidity
Kernel.Call[] memory calls = new Kernel.Call[](2);
calls[0] = Kernel.Call({
    target: tokenAddress,
    value: 0,
    data: abi.encodeWithSignature("transfer(address,uint256)", to, amount)
});
calls[1] = Kernel.Call({
    target: anotherContract,
    value: 0,
    data: abi.encodeWithSignature("someFunction()")
});
kernel.executeBatch(calls);
```

### PackedUserOperation (ERC-4337)
```solidity
struct PackedUserOperation {
    address sender;                    // 发送者地址
    uint256 nonce;                     // UserOp nonce
    bytes callData;                    // 调用数据
    uint256 callGasLimit;              // 调用gas限制
    uint256 verificationGasLimit;      // 验证gas限制
    uint256 preVerificationGas;        // 预验证gas
    uint256 maxFeePerGas;              // 最大gas价格
    uint256 maxPriorityFeePerGas;      // 最大优先费
    bytes paymasterAndData;            // Paymaster数据
    bytes signature;                   // 用户签名
}
```

---

## 事件

### UserOperationExecuted
```solidity
event UserOperationExecuted(
    address indexed sender,
    uint256 nonce,
    bool success
);
```
**触发时机**: UserOp验证成功后触发

**参数**:
- `sender`: UserOp发送者地址
- `nonce`: 使用的nonce值
- `success`: 是否成功 (当前始终为true)

### BatchExecuted
```solidity
event BatchExecuted(
    address indexed sender,
    uint256 numCalls
);
```
**触发时机**: `executeBatch`执行完成后触发

**参数**:
- `sender`: 调用者 (tx.origin)
- `numCalls`: 批量调用的数量

### GasPaymentProcessed
```solidity
event GasPaymentProcessed(
    address indexed sender,
    address indexed token,
    uint256 amount,
    address indexed payee
);
```
**触发时机**: ERC20 Gas支付处理完成后触发

**参数**:
- `sender`: 支付方 (UserOp发送者)
- `token`: Token地址
- `amount`: 支付金额
- `payee`: 收款方 (bundler)

---

## 错误

### OnlyEntryPoint
```solidity
error OnlyEntryPoint();
```
**触发条件**: 非EntryPoint地址调用验证或执行函数

### InvalidSignature
```solidity
error InvalidSignature();
```
**触发条件**: UserOp签名验证失败

### InvalidNonce
```solidity
error InvalidNonce();
```
**触发条件**: UserOp nonce不正确或已使用

### CallFailed
```solidity
error CallFailed(uint256 callIndex);
```
**触发条件**: 批量调用中的某个调用失败

**参数**:
- `callIndex`: 失败的调用索引

### InvalidPaymasterData
```solidity
error InvalidPaymasterData();
```
**触发条件**: paymasterAndData长度无效 (非空但不足52字节)

### TransferFailed
```solidity
error TransferFailed();
```
**触发条件**: ERC20代币转账失败

---

## 函数详解

### 构造函数

```solidity
constructor(address _entryPoint)
```

**参数**:
- `_entryPoint`: ERC-4337 EntryPoint合约地址

**示例**:
```solidity
address entryPoint = 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512;
Kernel kernel = new Kernel(entryPoint);
```

---

### validateUserOp

```solidity
function validateUserOp(
    PackedUserOperation calldata userOp,
    bytes32 userOpHash,
    uint256 missingAccountFunds
) external returns (uint256 validationData)
```

**功能**: 验证UserOp签名、nonce，处理ERC20 gas支付

**参数**:
- `userOp`: UserOperation对象
- `userOpHash`: UserOp的hash (由EntryPoint计算)
- `missingAccountFunds`: 缺少的账户资金

**返回值**:
- `0`: 验证成功
- `1`: 签名失败

**执行流程**:
1. 验证调用者为EntryPoint
2. 验证UserOp签名
3. 验证并递增nonce
4. 处理ERC20 gas支付 (如果需要)

**paymasterAndData格式**:
```
紧凑编码 (52字节): address(20) + amount(32)
动态编码 (96字节): offset(32) + address(32) + amount(32)
```

**示例**:
```solidity
// 紧凑编码格式
bytes memory paymasterData = new bytes(52);
assembly {
    mstore(add(paymasterData, 20), tokenAddress)  // address
    mstore(add(paymasterData, 52), amount)         // uint256
}

// 动态编码格式
bytes memory paymasterData = abi.encode(tokenAddress, amount);
```

---

### executeBatch

```solidity
function executeBatch(Call[] calldata calls) external
```

**功能**: 批量执行多个调用

**参数**:
- `calls`: Call结构体数组

**特点**:
- 所有调用在单个交易中执行
- 任一调用失败则全部回滚
- 仅允许EntryPoint调用

**示例**:
```solidity
Kernel.Call[] memory calls = new Kernel.Call[](2);

// 1. 先授权
calls[0] = Kernel.Call({
    target: tokenAddress,
    value: 0,
    data: abi.encodeWithSignature(
        "approve(address,uint256)",
        kernelAddress,
        type(uint256).max
    )
});

// 2. 再转账
calls[1] = Kernel.Call({
    target: tokenAddress,
    value: 0,
    data: abi.encodeWithSignature(
        "transferFrom(address,address,uint256)",
        user,
        recipient,
        amount
    )
});

kernel.executeBatch(calls);
```

---

### executeTokenTransfer

```solidity
function executeTokenTransfer(
    address token,
    address from,
    address to,
    uint256 amount
) external
```

**功能**: 执行ERC20代币转账

**参数**:
- `token`: Token合约地址
- `from`: 源地址 (已授权的用户)
- `to`: 目标地址
- `amount`: 转账金额

**前提条件**:
- 用户必须已授权Kernel合约
- Kernel有足够的allowance

**示例**:
```solidity
// 用户调用
kernel.executeTokenTransfer(
    0xTokenAddress,
    msg.sender,
    recipient,
    1000 * 10**18
);
```

---

### getNonce

```solidity
function getNonce(address user) external view returns (uint256)
```

**功能**: 查询指定地址的当前nonce

**参数**:
- `user`: 要查询的地址

**返回值**:
- 当前nonce值 (新地址返回0)

**示例**:
```solidity
uint256 currentNonce = kernel.getNonce(userAddress);
console.log("Current nonce:", currentNonce);
```

**注意**: 这是UserOp nonce，不是EOA交易nonce

---

### recoverSigner (内部函数)

```solidity
function recoverSigner(
    bytes32 messageHash,
    bytes memory signature
) internal pure returns (address)
```

**功能**: 从签名中恢复签名者地址

**安全性**:
- 验证签名长度为65字节
- 限制s值在低半平面 (EIP-2)
- 验证v值为27或28

---

## 使用流程

### 1. 首次授权 (EIP-7702)

```solidity
// 用户签署authorization
struct Authorization {
    uint256 chainId;
    address address;  // Kernel地址
    uint256 nonce;
    uint8 v;
    bytes32 r;
    bytes32 s;
}

// Bundler构建type 0x04交易，包含authorizationList
// 交易执行后，用户账户的code变为Kernel代码
```

### 2. 发起UserOp

```solidity
// 构造UserOp
Kernel.PackedUserOperation memory userOp;
userOp.sender = userAddress;
userOp.nonce = kernel.getNonce(userAddress);
userOp.callData = encodedCallData;
userOp.signature = userSignature;

// 计算userOpHash (使用EIP-712)
bytes32 userOpHash = computeUserOpHash(userOp);

// 用户签名
(userOp.v, userOp.r, userOp.s) = vm.sign(userPrivateKey, userOpHash);
userOp.signature = abi.encodePacked(userOp.r, userOp.s, userOp.v);

// 发送到EntryPoint
entryPoint.handleOps([userOp], bundler);
```

### 3. Gas支付

```solidity
// 在UserOp中包含paymasterAndData
userOp.paymasterAndData = abi.encode(tokenAddress, gasAmount);

// EntryPoint调用validateUserOp时
// Kernel会从用户账户转 gasAmount 的token给bundler
```

---

## 安全性考虑

### 1. EntryPoint限制
仅允许EntryPoint调用验证和执行函数，防止未授权调用。

### 2. Nonce管理
严格的nonce检查确保UserOp按顺序执行，防止重放攻击。

### 3. 签名验证
- EIP-2签名 malleability防护
- 65字节签名长度验证
- s值范围限制

### 4. Paymaster数据验证
- 最小长度检查 (52字节)
- 支持紧凑编码和动态编码

### 5. ERC20转账安全
- 检查转账返回值
- 使用IERC20接口

---

## 测试

### 单元测试

```solidity
function testValidateUserOp_Success() public {
    // 验证签名验证成功
}

function testValidateUserOp_InvalidSignature() public {
    // 验证签名失败回退
}

function testValidateUserOp_WrongNonce() public {
    // 验证nonce错误回退
}

function testExecuteBatch_Success() public {
    // 验证批量调用成功
}

function testExecuteBatch_FailedCall() public {
    // 验证单个调用失败则全部回滚
}
```

### 集成测试

```solidity
function test_FullPaymasterFlow_TransferWithGasCompensation() public {
    // 测试完整流程: 授权 + UserOp + Gas支付
}
```

---

## 部署

### 部署脚本

```solidity
// Deploy.s.sol
contract DeployScript is Script {
    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address entryPoint = vm.envAddress("ENTRY_POINT_ADDRESS");
        
        vm.startBroadcast(deployerPrivateKey);
        
        Kernel kernel = new Kernel(entryPoint);
        
        console.log("Kernel deployed at:", address(kernel));
        
        vm.stopBroadcast();
    }
}
```

### 部署命令

```bash
# 设置环境变量
export PRIVATE_KEY=0x...
export ENTRY_POINT_ADDRESS=0x...

# 部署
forge script Deploy.s.sol --broadcast
```

---

## 交互示例

### 使用ethers.js

```javascript
const ethers = require('ethers');
const kernelABI = [
  "function getNonce(address user) view returns (uint256)",
  "function executeTokenTransfer(address token, address from, address to, uint256 amount) external"
];

const kernel = new ethers.Contract(kernelAddress, kernelABI, wallet);

// 查询nonce
const nonce = await kernel.getNonce(userAddress);

// 执行转账
await kernel.executeTokenTransfer(tokenAddress, from, to, amount);
```

### 使用cast

```bash
# 查询nonce
cast call <kernel-address> "getNonce(address)" <user-address>

# 批量调用
cast send <kernel-address> "executeBatch((address,uint256,bytes)[])" \
  --from <bundler-address> \
  --gas-limit <limit>
```

---

## 常见问题

### Q: UserOp nonce和EOA nonce有什么区别?

A: 
- **EOA nonce**: 账户的交易计数，通过`eth_getTransactionCount`查询
- **UserOp nonce**: Kernel合约中的nonce，通过`getNonce`查询，用于ERC-4337流程

两者独立管理。

### Q: paymasterAndData的两种格式有什么区别?

A:
- **紧凑编码** (52字节): 直接拼接address和amount，gas更低
- **动态编码** (96字节): 使用abi.encode，更灵活但gas更高

### Q: 如果转账失败会怎样?

A: 
- `transferFrom`返回false会触发`TransferFailed`错误
- 整个UserOp会回滚

---

## 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.0.0 | 2024-01 | 初始版本 |

---

## License

MIT
