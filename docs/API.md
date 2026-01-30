# EIP-7702 Backend API 文档

## 概述

本项目实现了EIP-7702账户抽象后端API，提供UserOperation构造、验证和执行功能。

### 核心功能

1. **UserOperation构造** (`/api/construct-calldata`)
2. **模拟执行** (`/api/simulate`)
3. **执行UserOp** (`/api/execute`)
4. **发送原始交易** (`/api/send-raw`)
5. **查询delegation状态** (`/api/delegation-status/:address`)

### 技术栈

- Node.js + Express
- ethers.js v6
- Solidity ^0.8.20

### 相关文档

- **合约文档**: [CONTRACT.md](CONTRACT.md) - 详细了解Kernel合约接口和用法

---

## API端点

### 1. 健康检查

```http
GET /health
```

**描述**: 检查服务状态

**响应** (200):
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "timestamp": 1700000000000,
    "chainId": 31337,
    "kernelAddress": "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    "entryPointAddress": "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"
  }
}
```

---

### 2. 构造UserOp Calldata

```http
POST /api/construct-calldata
Content-Type: application/json
```

**描述**: 构造ERC-4337标准的UserOperation calldata，用于Token转账和gas补偿。

**请求参数**:
```json
{
  "sender": "string",         // 必填, 发送者地址 (userB)
  "to": "string",             // 必填, 接收者地址 (userA)
  "amount": "string",         // 必填, 转账金额 (wei字符串)
  "tokenAddress": "string",   // 必填, Token合约地址
  "gasAmount": "string",      // 必填, Gas补偿金额 (wei字符串)
  "nonce": 0,                 // 可选, 默认0
  "callGasLimit": 150000,     // 可选, 默认150000
  "verificationGasLimit": 150000, // 可选, 默认150000
  "preVerificationGas": 21000,    // 可选, 默认21000
  "maxFeePerGas": "1000000000",   // 可选, 默认1 gwei
  "maxPriorityFeePerGas": "1000000000" // 可选, 默认1 gwei
}
```

**响应** (200):
```json
{
  "success": true,
  "data": {
    "userOp": {
      "sender": "0x...",
      "nonce": "0",
      "callData": "0x69d76bed...",
      "callGasLimit": "150000",
      "verificationGasLimit": "150000",
      "preVerificationGas": "21000",
      "maxFeePerGas": "1000000000",
      "maxPriorityFeePerGas": "1000000000",
      "paymasterAndData": "0x...",
      "signature": "0x"
    },
    "userOpHash": "0x...",
    "message": "UserOp calldata已构造完成。请使用sender私钥对userOpHash进行签名。"
  }
}
```

**错误响应** (400):
```json
{
  "success": false,
  "error": {
    "code": "INVALID_PARAMS",
    "message": "无效的sender地址",
    "requestId": "req_xxx"
  }
}
```

---

### 3. 模拟执行

```http
POST /api/simulate
Content-Type: application/json
```

**描述**: 模拟UserOperation的执行，不实际发送交易。

**请求参数**:
```json
{
  "userOp": {
    "sender": "string",
    "nonce": 0,
    "callData": "0x...",
    "signature": "0x..."  // 可选
  },
  "authorization": {  // 可选
    "chainId": 31337,
    "address": "0x...",
    "nonce": 0,
    "signature": "0x..."
  }
}
```

**响应** (200):
```json
{
  "success": true,
  "data": {
    "needsAuth": false,        // 是否需要delegation
    "signatureValid": true,    // 签名是否有效
    "estimatedGas": "150000",  // 预估gas
    "willRevert": false        // 是否会revert
  }
}
```

---

### 4. 执行UserOperation

```http
POST /api/execute
Content-Type: application/json
```

**描述**: 验证并执行UserOperation，发送到EntryPoint。

**请求参数**:
```json
{
  "userOp": {
    "sender": "string",
    "nonce": 0,
    "callData": "0x...",
    "callGasLimit": "150000",
    "verificationGasLimit": "150000",
    "preVerificationGas": "21000",
    "maxFeePerGas": "1000000000",
    "maxPriorityFeePerGas": "1000000000",
    "paymasterAndData": "0x...",
    "signature": "0x..."  // 必填
  },
  "authorization": {  // 首次delegation需要
    "chainId": 31337,
    "address": "0x...",
    "nonce": 0,
    "signature": "0x..."
  }
}
```

**响应** (200):
```json
{
  "success": true,
  "data": {
    "txHash": "0x...",        // 交易哈希
    "blockNumber": 123,       // 区块号
    "delegated": true,        // 是否已delegation
    "executed": true,         // 是否执行成功
    "gasUsed": "150000"       // 消耗的gas
  }
}
```

---

### 5. 发送原始交易

```http
POST /api/send-raw
Content-Type: application/json
```

**描述**: 发送已签名的UserOperation到链上。与`/api/execute`类似，但专门用于已签名的UserOp。

**请求参数**:
```json
{
  "signedUserOp": {
    "sender": "string",
    "nonce": 0,
    "callData": "0x...",
    "signature": "0x..."
  },
  "authorization": {  // 可选
    "chainId": 31337,
    "address": "0x...",
    "nonce": 0,
    "signature": "0x..."
  }
}
```

**响应** (200):
```json
{
  "success": true,
  "data": {
    "txHash": "0x...",
    "blockNumber": 123,
    "delegated": false,
    "executed": true,
    "gasUsed": "150000",
    "timestamp": 1700000000000
  }
}
```

---

### 6. 查询Delegation状态

```http
GET /api/delegation-status/:address
```

**描述**: 查询账户的EIP-7702 delegation状态。

**路径参数**:
- `address`: 要查询的账户地址

**响应** (200):
```json
{
  "success": true,
  "data": {
    "address": "0x...",       // 查询的地址
    "delegated": false,       // 是否已delegation
    "eoaNonce": 0,            // EOA交易nonce
    "userOpNonce": "0",       // UserOp nonce
    "timestamp": 1700000000000
  }
}
```

---

## 错误代码

| 代码 | 描述 |
|------|------|
| `INVALID_ADDRESS` | 无效的地址格式 |
| `INVALID_PARAMS` | 请求参数验证失败 |
| `MISSING_USEROP` | 缺少userOp参数 |
| `INVALID_USEROP` | userOp格式无效 |
| `INVALID_SIGNATURE` | UserOp签名无效 |
| `AUTHORIZATION_REQUIRED` | 首次执行需要authorization |
| `INVALID_AUTH_SIGNATURE` | Authorization签名无效 |
| `NONCE_ERROR` | nonce错误或已使用 |
| `INSUFFICIENT_FUNDS` | bundler余额不足 |
| `EXECUTION_FAILED` | 执行失败 |
| `NOT_FOUND` | 端点不存在 |
| `INTERNAL_ERROR` | 内部服务器错误 |

---

## 使用示例

### 完整流程示例

```javascript
const ethers = require('ethers');

// 配置
const provider = new ethers.JsonRpcProvider('http://localhost:8545');
const wallet = new ethers.Wallet('0x...', provider); // 用户私钥
const kernelAddress = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const entryPointAddress = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';

// 1. 查询delegation状态
async function checkDelegationStatus(userAddress) {
  const response = await fetch(`http://localhost:3000/api/delegation-status/${userAddress}`);
  const result = await response.json();
  console.log('Delegation status:', result);
}

// 2. 构造UserOp calldata
async function constructCalldata(sender, to, amount, tokenAddress, gasAmount) {
  const response = await fetch('http://localhost:3000/api/construct-calldata', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender,
      to,
      amount: amount.toString(),
      tokenAddress,
      gasAmount: gasAmount.toString(),
      nonce: 0
    })
  });
  const result = await response.json();
  return result;
}

// 3. 用户签名UserOpHash
async function signUserOp(userOpHash) {
  const signature = await wallet.signMessage(userOpHash);
  return signature;
}

// 4. 执行UserOp
async function executeUserOp(userOp, authorization = null) {
  const response = await fetch('http://localhost:3000/api/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userOp, authorization })
  });
  const result = await response.json();
  return result;
}

// 主流程
async function main() {
  const userB = wallet.address;
  const userA = '0x...'; // 接收者地址
  const tokenAddress = '0x...'; // Token地址
  const amount = ethers.parseEther('100');
  const gasAmount = ethers.parseEther('5');

  // 查询delegation状态
  await checkDelegationStatus(userB);

  // 构造UserOp
  const calldataResult = await constructCalldata(userB, userA, amount, tokenAddress, gasAmount);
  console.log('UserOpHash:', calldataResult.data.userOpHash);

  // 签名
  const signature = await signUserOp(calldataResult.data.userOpHash);

  // 添加签名到userOp
  const signedUserOp = {
    ...calldataResult.data.userOp,
    signature
  };

  // 执行
  const result = await executeUserOp(signedUserOp);
  console.log('Execution result:', result);
}

main();
```

---

## 合约接口

### Kernel.sol

#### 主要函数

| 函数 | 描述 |
|------|------|
| `validateUserOp(PackedUserOperation, bytes32, uint256)` | 验证UserOp签名和nonce，处理gas支付 |
| `executeBatch(Call[])` | 批量执行调用 |
| `executeTokenTransfer(address, address, address, uint256)` | 执行ERC20代币转账 |
| `getNonce(address)` | 查询nonce |

#### 事件

| 事件 | 描述 |
|------|------|
| `UserOperationExecuted(address, uint256, bool)` | UserOp执行事件 |
| `BatchExecuted(address, uint256)` | 批量调用执行事件 |
| `GasPaymentProcessed(address, address, uint256, address)` | Gas支付处理事件 |

#### 错误

| 错误 | 描述 |
|------|------|
| `OnlyEntryPoint()` | 仅允许EntryPoint调用 |
| `InvalidSignature()` | 签名验证失败 |
| `InvalidNonce()` | nonce验证失败 |
| `CallFailed(uint256)` | 调用失败 |
| `InvalidPaymasterData()` | paymasterAndData长度无效 |
| `TransferFailed()` | Token转账失败 |

---

## 配置

### 环境变量

```env
# RPC配置
RPC_URL=http://localhost:8545
CHAIN_ID=31337

# Bundler私钥
BUNDLER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# 合约地址
KERNEL_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
ENTRY_POINT_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512

# 服务器配置
PORT=3000
LOG_LEVEL=info
```

---

## 测试

### 运行测试

```bash
# 运行所有测试
cd contracts
forge test

# 运行特定测试
forge test --match-test testName

# 运行后端测试
cd backend
npm test
```

### 测试网络

使用Anvil本地网络:

```bash
# 启动Anvil
anvil

# 部署合约
cd contracts
forge script Deploy.s.sol --broadcast
```

---

## 安全考虑

1. **签名验证**: 使用EIP-712标准进行签名验证
2. **Nonce管理**: 严格的nonce检查防止重放攻击
3. **输入验证**: 所有输入都经过验证
4. **Gas限制**: 限制最大gas防止DoS攻击
5. **重试机制**: RPC调用支持重试

---

## License

MIT
