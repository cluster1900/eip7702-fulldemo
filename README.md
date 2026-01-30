# EIP-7702 Account Abstraction Project

完整的EIP-7702账户抽象系统：让EOA用户无需ETH，用USDC支付gas，批量执行交易。

## 🎯 功能特性

- ✅ **EIP-7702 Delegation**: EOA临时获得智能合约能力
- ✅ **ERC20 Gas Payment**: 用USDC等代币支付gas费
- ✅ **批量交易**: executeBatch一次执行多个call
- ✅ **ERC-4337兼容**: 标准UserOperation流程
- ✅ **完整测试**: Foundry测试套件 (10/10通过)

## 📁 项目结构

```
eip7702/
├── contracts/           # Solidity智能合约
│   ├── src/
│   │   └── Kernel.sol  # 核心钱包合约
│   └── test/
│       └── Kernel.t.sol # 完整测试 (10个测试用例)
├── backend/             # Node.js后端API
│   ├── src/
│   │   ├── index.js     # Express服务器
│   │   ├── routes/      # API endpoints
│   │   └── services/    # Bundler, 验证, 缓存
│   └── .env.example     # 环境变量示例
├── openspec/            # OpenSpec规范和proposals
│   ├── specs/           # 5个capability规范
│   └── changes/         # 3个implementation proposals
└── README.md
```

## 🚀 快速开始

### 1. 安装依赖

```bash
# Foundry (Solidity)
cd contracts
forge install

# Backend (Node.js)
cd ../backend
npm install
```

### 2. 配置环境变量

```bash
cd backend
cp .env.example .env
# 编辑.env: 设置RPC_URL, BUNDLER_PRIVATE_KEY, 合约地址
```

### 3. 运行测试

```bash
# 合约测试
cd contracts
forge test -vvv --gas-report

# 输出: 10/10 tests passed ✅
```

### 4. 启动后端

```bash
cd backend
npm start

# Backend API running on port 3000 🚀
```

## 📖 API文档

### POST /api/execute
执行UserOperation，支持首次delegation

**请求:**
```json
{
  "userOp": {
    "sender": "0x...",
    "nonce": 0,
    "callData": "0x...",
    "paymasterAndData": "0x...", // USDC地址 + 金额
    "signature": "0x..."
  },
  "authorization": {  // 首次使用时必需
    "chainId": 31337,
    "address": "0x...",  // Kernel地址
    "nonce": 0,
    "signature": "0x..."
  }
}
```

**响应:**
```json
{
  "success": true,
  "txHash": "0x...",
  "delegated": false,
  "executed": true,
  "gasUsed": "150000"
}
```

### GET /api/delegation-status/:address
查询地址的delegation状态

**响应:**
```json
{
  "address": "0x...",
  "delegated": false,
  "eoaNonce": 0,
  "userOpNonce": "0",
  "timestamp": 1706600000000
}
```

### GET /api/nonce/:address
查询UserOp nonce

**响应:**
```json
{
  "address": "0x...",
  "nonce": "0"
}
```

### POST /api/simulate
模拟执行UserOperation (不发送真实交易)

**响应:**
```json
{
  "success": true,
  "needsAuth": false,
  "estimatedGas": "120000",
  "willRevert": false
}
```

## 🏗️ 架构设计

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   前端      │       │  Backend    │       │   链上      │
│  (MetaMask) │──────>│  Bundler    │──────>│  Kernel     │
│             │       │  Express    │       │  Contract   │
└─────────────┘       └─────────────┘       └─────────────┘
      │                      │                      │
      │ 1. 构建UserOp       │                      │
      │ 2. 签名             │                      │
      │ 3. POST /execute   │                      │
      │                    │ 4. 构建type 0x04 tx  │
      │                    │ 5. 发送到链上        │
      │                    │                      │ 6. validateUserOp
      │                    │                      │ 7. executeBatch
      │                    │<─────────────────────│ 8. USDC支付
      │<───────────────────│ 9. 返回txHash       │
```

## 📝 核心合约: Kernel.sol

### 主要函数

#### validateUserOp
```solidity
function validateUserOp(
    PackedUserOperation calldata userOp,
    bytes32 userOpHash,
    uint256 missingAccountFunds
) external returns (uint256);
```
- 验证msg.sender == ENTRY_POINT
- ECDSA签名验证
- Nonce检查与递增
- ERC20 gas支付处理

#### executeBatch
```solidity
function executeBatch(Call[] calldata calls) external;
```
- 批量执行多个call
- 任意失败全部revert
- 仅EntryPoint可调用

#### getNonce
```solidity
function getNonce(address user) external view returns (uint256);
```
- 查询用户的UserOp nonce

## 🧪 测试覆盖

```bash
cd contracts && forge test -vvv
```

**10个测试用例 (全部通过):**

1. ✅ testValidateUserOp_Success
2. ✅ testValidateUserOp_WithGasPayment (USDC转账)
3. ✅ testValidateUserOp_InvalidSignature
4. ✅ testValidateUserOp_WrongNonce
5. ✅ testValidateUserOp_OnlyEntryPoint
6. ✅ testExecuteBatch_Success (多个call)
7. ✅ testExecuteBatch_FailedCall (原子性)
8. ✅ testExecuteBatch_OnlyEntryPoint
9. ✅ testGetNonce_NewAddress
10. ✅ testGetNonce_AfterExecution

**Gas报告:**
- validateUserOp: ~49k gas
- executeBatch: ~44k gas (avg)

## 🔐 安全考虑

- **签名验证**: ECDSA + nonce防重放
- **权限控制**: OnlyEntryPoint modifier
- **原子性**: executeBatch任意失败全revert
- **ERC20转账**: 使用标准transferFrom

## 📚 技术栈

### 智能合约
- Solidity ^0.8.20
- Foundry (forge, cast, anvil)
- OpenZeppelin Contracts
- ERC-4337 EntryPoint

### 后端
- Node.js v25+
- Express.js 4.x
- ethers.js v6
- dotenv (环境变量)

### 前端 (可选)
- HTML + ethers.js CDN
- MetaMask连接

## 🛠️ 开发工具

```bash
# 编译合约
forge build

# 运行测试
forge test -vvv

# 部署合约
forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast

# 启动本地节点
anvil

# Backend开发模式
npm run dev
```

## 📦 部署

### 1. 部署Kernel合约
```bash
cd contracts
forge script script/Deploy.s.sol --rpc-url <YOUR_RPC> --broadcast --verify
```

### 2. 更新Backend配置
```bash
cd backend
# 更新.env中的KERNEL_ADDRESS和ENTRY_POINT_ADDRESS
```

### 3. 启动Backend服务
```bash
npm start
# 或使用PM2: pm2 start src/index.js --name eip7702-backend
```

## 🤝 贡献指南

遵循OpenSpec流程:
1. 在`openspec/changes/`创建proposal
2. 编写tasks.md清单
3. 实现代码 + 测试
4. 提交PR
5. 归档到`openspec/changes/archive/`

## 📄 许可证

MIT License

## 🔗 相关链接

- [EIP-7702规范](https://eips.ethereum.org/EIPS/eip-7702)
- [ERC-4337文档](https://eips.ethereum.org/EIPS/eip-4337)
- [Foundry文档](https://book.getfoundry.sh/)
- [ethers.js v6](https://docs.ethers.org/v6/)

## 📞 联系方式

问题和建议请提交Issue或PR。

---

**项目状态**: MVP完成 ✅ (Kernel合约 + Backend API + 完整测试)

**下一步**: 
- 前端界面开发 (可选)
- Testnet部署测试
- 集成测试自动化
- 文档完善
