# EIP-7702 账户抽象项目开发指南

## 项目目标
让普通 EOA 用户无需迁移地址，无需持有 ETH，即可拥有智能合约钱包的所有能力。

**核心能力**：
- 批处理交易（一次执行多个操作）
- 用 USDC 等 ERC20 支付 gas
- 完全 gasless（Paymaster 赞助）
- 首次使用即可零门槛上手

---

## 核心架构（一图看懂）

```
前端
  ↓ 
  构建一个 UserOperation
  {
    callData: [swap, transfer, mint, ...]  ← 用户想做的所有操作
    paymasterAndData: [USDC地址, 金额]    ← 指定用什么代币支付 gas
  }
  ↓
  签名 UserOp + 签名授权消息（如果首次使用）
  ↓
后端 API
  ↓
  检查用户是否已授权
  ├─ 未授权 → 构建 type 0x04 交易（包含 authorizationList + UserOp）
  └─ 已授权 → 构建普通交易（只包含 UserOp）
  ↓
  Bundler 钱包发送交易到链上
  ↓
链上执行
  ├─ 执行 authorizationList（如果有）→ 用户 EOA 临时委托给 Kernel
  ├─ EntryPoint 调用用户 EOA（现在运行的是 Kernel 代码）
  ├─ Kernel.validateUserOp()
  │   ├─ 验证签名
  │   ├─ 检查 nonce
  │   └─ 从 paymasterAndData 解析 ERC20 信息，自动转账给 Bundler（补偿 gas）
  ├─ Kernel.executeBatch(calls)
  │   └─ 依次执行 swap, transfer, mint 等操作
  └─ 完成
```

**关键点**：
- 前端只发送**一个** UserOperation（不是多个）
- callData 里可以包含多个操作（这是批处理的含义）
- ERC20 支付 gas 通过 `paymasterAndData` 字段，不是额外的转账操作
- 后端根据授权状态决定是否包含 `authorizationList`

---

## 核心概念澄清

### 1. UserOperation 结构（前端构建）

```javascript
const userOp = {
  sender: "0x用户地址",
  nonce: 5,  // Kernel 内部的 nonce（不是链上 nonce）
  
  // callData：用户想做的所有操作（批处理）
  callData: "executeBatch([
    { target: DEX, data: swap(...) },
    { target: TOKEN, data: transfer(...) },
    { target: NFT, data: mint(...) }
  ])",
  
  // gas 参数
  callGasLimit: 500000,
  verificationGasLimit: 150000,
  preVerificationGas: 50000,
  maxFeePerGas: "30 gwei",
  maxPriorityFeePerGas: "2 gwei",
  
  // 关键：指定用什么代币支付 gas
  paymasterAndData: "encode([USDC地址, 10 USDC])",
  
  // 用户签名
  signature: "0x..."
};
```

**重点理解**：
- 这是**一个** UserOperation，不是多个
- `callData` 调用的是 Kernel 合约的 `executeBatch` 函数
- `executeBatch` 里面可以包含任意多个操作
- `paymasterAndData` 告诉 Kernel："用 10 USDC 补偿 Bundler"

### 2. 授权消息结构（首次使用时前端构建）

```javascript
const authorization = {
  chainId: 1,
  address: "0xKernel合约地址",
  nonce: 0,  // 用户在链上的 nonce（不是 UserOp nonce）
  signature: "0x用户对上述信息的签名"
};
```

**重点理解**：
- 这**不是** UserOperation，这是授权消息
- 用于告诉链："我同意把我的 EOA 代码临时设置为 Kernel 合约"
- 只在首次使用时需要
- 后端会把它放在 `authorizationList` 字段

### 3. 两种 Nonce 的区别

| 类型 | 管理者 | 用途 | 何时递增 |
|------|--------|------|----------|
| **链上 Nonce** | 区块链 | 防止普通交易重放 | 每次发送任何交易 |
| **UserOp Nonce** | Kernel 合约 | 防止 UserOperation 重放 | 每次执行 UserOp |

**示例**：
```
用户首次使用：
  - 链上 nonce = 0
  - UserOp nonce = 0
  
用户发送一笔普通转账（非 AA）：
  - 链上 nonce = 1
  - UserOp nonce = 0（不变）
  
用户执行第二个 UserOp：
  - 链上 nonce = 1（不变，因为是 Bundler 发送的交易）
  - UserOp nonce = 1（递增）
```

### 4. ERC20 支付 gas 的原理

**不要这样理解**：❌
> 前端多构建一个"转 USDC 给 Bundler"的操作

**正确理解**：✅
1. 前端在 `paymasterAndData` 字段指定 `[USDC地址, 10 USDC]`
2. Kernel 合约的 `validateUserOp` 函数会自动解析这个字段
3. Kernel 合约内部执行 `USDC.transfer(bundler, 10 USDC)`
4. 用户的 callData 不需要包含这个转账

**代码流程**（Kernel 合约内部）：
```solidity
function validateUserOp(..., uint256 missingAccountFunds) external {
  // 1. 验证签名 ✓
  // 2. 检查 nonce ✓
  
  // 3. 如果需要补偿 Bundler
  if (missingAccountFunds > 0) {
    // 从 paymasterAndData 解析 ERC20 信息
    (address token, uint256 amount) = abi.decode(
      userOp.paymasterAndData, 
      (address, uint256)
    );
    
    // 自动转账给 Bundler（这是 Kernel 的逻辑，不是用户的 callData）
    IERC20(token).transfer(msg.sender, amount);
  }
}
```

---

## 完整流程（从前端到链上）

### 场景：用户想用 USDC 支付 gas，执行 swap + transfer

#### 第 1 步：前端检查用户是否已授权

```javascript
// 调用后端 API
const status = await fetch(`/api/delegation-status/${userAddress}`).json();

if (!status.delegated) {
  // 需要用户签名授权消息
  showAuthorizationModal();
}
```

#### 第 2 步：前端构建 UserOperation

```javascript
// 用户想做的操作
const calls = [
  { target: DEX_ADDRESS, value: 0, data: "swap(USDC, ETH, 1000)" },
  { target: TOKEN_ADDRESS, value: 0, data: "transfer(alice, 100)" }
];

// 构建 UserOp
const userOp = {
  sender: userAddress,
  nonce: await fetch(`/api/nonce/${userAddress}`).json(),  // 从后端获取
  callData: "executeBatch(calls)",  // 批处理
  // ... gas 参数 ...
  paymasterAndData: "encode([USDC_ADDRESS, 10 USDC])",  // 用 USDC 支付
  signature: "待签名"
};

// 用户签名 UserOp
userOp.signature = await signer.signMessage(getUserOpHash(userOp));
```

#### 第 3 步：如果未授权，前端构建授权消息

```javascript
let authorization = null;

if (!status.delegated) {
  const eoaNonce = await provider.getTransactionCount(userAddress);
  
  authorization = {
    chainId: 1,
    address: KERNEL_ADDRESS,
    nonce: eoaNonce
  };
  
  // 用户签名授权消息
  const authHash = keccak256(encode([chainId, address, nonce]));
  authorization.signature = await signer.signMessage(authHash);
}
```

#### 第 4 步：前端发送到后端

```javascript
// 只发一次请求
const response = await fetch('/api/execute', {
  method: 'POST',
  body: JSON.stringify({
    userOp: userOp,               // 必须
    authorization: authorization   // 首次使用才有，否则为 null
  })
});
```

#### 第 5 步：后端处理

```javascript
function execute(req, res) {
  const { userOp, authorization } = req.body;
  
  // 1. 验证 UserOp 签名 ✓
  // 2. 验证授权签名（如果有）✓
  
  // 3. 检查用户是否已授权
  const code = await provider.getCode(userOp.sender);
  const needsAuth = (code === "0x");
  
  // 4. 构建交易
  const tx = {
    type: 0x04,
    
    // 关键：只有首次使用才包含 authorizationList
    authorizationList: needsAuth ? [authorization] : [],
    
    to: ENTRYPOINT_ADDRESS,
    data: "EntryPoint.handleOps([userOp], bundlerAddress)"
  };
  
  // 5. Bundler 发送交易（Bundler 支付 ETH gas）
  await bundlerWallet.sendTransaction(tx);
  
  // 6. 链上执行后，Bundler 会收到 10 USDC 补偿
}
```

#### 第 6 步：链上执行

```
1. 如果有 authorizationList
   → 用户 EOA 的代码指向 Kernel 合约（临时委托）

2. EntryPoint 调用 userOp.sender（即用户 EOA）
   → 但实际执行的是 Kernel 合约的代码

3. Kernel.validateUserOp() 被调用
   ├─ 验证 userOp.signature 是否是用户签的 ✓
   ├─ 检查 userOp.nonce 是否正确 ✓
   └─ 解析 paymasterAndData = [USDC, 10 USDC]
       执行 USDC.transfer(bundler, 10 USDC)  ← 自动补偿 gas

4. Kernel.executeBatch(calls) 被调用
   ├─ 调用 DEX.swap(USDC, ETH, 1000) ✓
   └─ 调用 TOKEN.transfer(alice, 100) ✓

5. 完成
```

**结果**：
- 用户成功执行了 swap + transfer
- 用户只花费了 10 USDC（用于支付 gas）
- Bundler 收到了 10 USDC（补偿了支付的 ETH gas）
- 如果是首次使用，用户的 EOA 已经授权给 Kernel

---

## 合约设计要点

### Kernel 合约（核心）

**关键函数 1：validateUserOp**
```solidity
function validateUserOp(
  PackedUserOperation calldata userOp,
  bytes32 userOpHash,
  uint256 missingAccountFunds
) external returns (uint256) {
  // 只允许 EntryPoint 调用
  require(msg.sender == ENTRYPOINT);
  
  // 验证签名
  require(recoverSigner(userOpHash, userOp.signature) == userOp.sender);
  
  // 验证 nonce
  require(userOp.nonce == nonces[userOp.sender]);
  nonces[userOp.sender]++;
  
  // 如果需要补偿 Bundler（解析 paymasterAndData）
  if (missingAccountFunds > 0) {
    (address token, uint256 amount) = abi.decode(
      userOp.paymasterAndData,
      (address, uint256)
    );
    IERC20(token).transfer(msg.sender, amount);  // 自动转账
  }
  
  return 0;  // 验证成功
}
```

**关键函数 2：executeBatch**
```solidity
function executeBatch(Call[] calldata calls) external {
  // 只允许 EntryPoint 调用
  require(msg.sender == ENTRYPOINT);
  
  // 依次执行所有操作
  for (uint i = 0; i < calls.length; i++) {
    (bool success,) = calls[i].target.call{value: calls[i].value}(calls[i].data);
    require(success);
  }
}
```

**关键函数 3：getNonce**
```solidity
function getNonce(address user) external view returns (uint256) {
  return nonces[user];
}
```

---

## 后端 API 设计

### 核心接口

#### 1. POST /api/execute（唯一的执行接口）

**请求**：
```json
{
  "userOp": {
    "sender": "0x...",
    "nonce": 5,
    "callData": "0x...",
    "paymasterAndData": "0x...",
    "signature": "0x..."
  },
  "authorization": {  // 可选，首次使用才需要
    "chainId": 1,
    "address": "0xKernel地址",
    "nonce": 0,
    "signature": "0x..."
  }
}
```

**响应**：
```json
{
  "success": true,
  "txHash": "0x...",
  "delegated": true,  // 是否完成了授权
  "executed": true    // UserOp 是否执行成功
}
```

**后端逻辑**：
1. 验证 UserOp 签名
2. 验证授权签名（如果提供了）
3. 检查链上代码判断是否已授权
4. 构建 type 0x04 交易（根据授权状态决定是否包含 authorizationList）
5. Bundler 发送交易
6. 等待确认并返回结果

#### 2. GET /api/delegation-status/:address

**响应**：
```json
{
  "delegated": true,
  "eoaNonce": 5,
  "userOpNonce": 12
}
```

#### 3. GET /api/nonce/:address

**响应**：
```json
{
  "nonce": 12  // UserOp nonce（不是链上 nonce）
}
```

#### 4. GET /api/kernel/address

**响应**：
```json
{
  "kernelAddress": "0x...",
  "entryPointAddress": "0x...",
  "chainId": 1
}
```

---

## 关键决策点总结

### ✅ 正确的理解

1. **前端发送一个 UserOperation**，callData 包含多个操作（批处理）
2. **后端根据授权状态**自动决定是否包含 authorizationList
3. **ERC20 支付通过 paymasterAndData 字段**，不是额外的转账操作
4. **Kernel 合约自动处理 gas 补偿**，在 validateUserOp 阶段完成
5. **用户只需要两次签名**：签名 UserOp + 签名授权（首次）

### ❌ 常见误解

1. ~~前端发送多个 UserOperation (delegate, swap, transfer)~~
2. ~~需要单独的 /api/delegate 接口~~
3. ~~前端需要多构建一个"转账给 Bundler"的操作~~
4. ~~delegate 是一个 UserOperation~~
5. ~~后端需要分别处理授权和执行~~

---

## 测试检查清单

### 合约测试
- [ ] validateUserOp 正确验证签名
- [ ] validateUserOp 正确验证 nonce
- [ ] validateUserOp 正确转账 ERC20 给 Bundler
- [ ] executeBatch 能执行多个操作
- [ ] 只有 EntryPoint 能调用关键函数

### 后端测试
- [ ] 首次使用：authorizationList + UserOp 同时上链
- [ ] 后续使用：只提交 UserOp（更快更便宜）
- [ ] 正确识别用户是否已授权
- [ ] 并发请求正确处理 nonce 冲突
- [ ] 签名验证正确拒绝伪造请求

### 集成测试
- [ ] 新用户从授权到执行的完整流程
- [ ] 用户用 USDC 支付 gas 成功
- [ ] 批处理 5 个操作成功
- [ ] 用户取消授权后无法执行

---

## 部署清单

### 智能合约
- [ ] 部署 Kernel 合约（记录地址）
- [ ] 部署 Paymaster 合约（可选）
- [ ] 验证合约代码（Etherscan）

### 后端服务
- [ ] 配置环境变量（RPC_URL, BUNDLER_PRIVATE_KEY 等）
- [ ] 部署到服务器
- [ ] 配置监控（Bundler 余额、成功率）

### 前端集成
- [ ] 实现 UserOp 构建逻辑
- [ ] 实现授权签名流程
- [ ] 实现 ERC20 余额检查
- [ ] 添加错误处理和重试

---

## 常见问题速查

**Q: 用户如何取消授权？**
A: 发送新的 type 0x04 交易，address 设为空地址

**Q: Bundler 钱包没 ETH 了怎么办？**
A: 监控告警 + 自动充值 + 多个 Bundler 轮询

**Q: 用户同时发送多个请求怎么办？**
A: 后端用 Redis 锁，同一用户串行处理

**Q: 如何估算用户需要支付多少 USDC？**
A: 调用 EntryPoint.simulateValidation，然后乘以 USDC/ETH 汇率

**Q: 支持哪些 ERC20 代币支付？**
A: 任何 ERC20，但建议只支持主流稳定币（USDC, USDT）

---

## 核心原则（不要偏离）

1. **前端只发送一个 UserOperation**
    - callData 可以包含多个操作
    - 不要构建多个 UserOperation

2. **ERC20 支付通过 paymasterAndData**
    - 不要在 callData 里添加转账操作
    - Kernel 合约会自动处理

3. **后端自动判断是否需要授权**
    - 不需要单独的 /delegate 接口
    - 在 /execute 接口统一处理

4. **授权和执行在同一笔交易完成**
    - type 0x04 交易可以同时包含 authorizationList 和 calldata
    - 链上原子性执行，要么全成功要么全失败

5. **用户体验至上**
    - 隐藏技术细节
    - 两次签名完成所有操作
    - 清晰展示将要执行的操作和费用

---

## 最后的提醒

**不要做**：
- ❌ 让用户单独发送授权交易
- ❌ 在 callData 里添加"转 USDC 给 Bundler"
- ❌ 把 delegate 当成一个 UserOperation
- ❌ 创建多个 UserOperation

**要做**：
- ✅ 后端检查授权状态
- ✅ 首次使用时在同一交易打包授权 + 执行
- ✅ 通过 paymasterAndData 指定支付方式
- ✅ 一个 UserOperation 包含多个操作（批处理）

**记住这个公式**：
```
一笔区块链交易 = authorizationList (如果首次) + EntryPoint.handleOps([一个UserOp])
一个 UserOp = 多个操作的批处理 + 支付信息
```

现在开始开发吧！🚀
