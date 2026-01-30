# EIP-7702 Account Abstraction Project

完整的EIP-7702账户抽象系统：让EOA用户无需ETH，用ERC-20代币支付gas，批量执行交易。

## 🎯 功能特性

- ✅ **EIP-7702 Delegation**: EOA临时获得智能合约钱包能力
- ✅ **ERC-4337兼容**: 标准UserOperation流程
- ✅ **ERC20 Gas Payment**: 用USDC等代币支付gas费
- ✅ **批量交易**: ERC-7821标准批量执行接口
- ✅ **完整签名验证**: EIP-712域分隔符 + UserOpHash签名

## 📁 项目结构

```
eip7702/
├── contracts/           # Solidity智能合约
│   ├── src/
│   │   └── Kernel.sol  # 核心钱包合约 (421行)
│   ├── test/
│   │   ├── SignatureDebugTest.t.sol    # 签名验证测试
│   │   ├── EIP7702FullFlowTest.t.sol   # EIP-7702完整流程测试
│   │   └── ValidateUserOp.t.sol        # validateUserOp测试
│   ├── script/
│   │   ├── Deploy.s.sol               # 部署脚本
│   │   └── DeployEntryPoint.s.sol     # EntryPoint部署
│   └── lib/                           # 依赖库
│       ├── account-abstraction/       # ERC-4337参考实现
│       ├── forge-std/                 # Foundry测试库
│       └── openzeppelin-contracts/    # OpenZeppelin合约库
├── backend/             # Node.js后端API
│   ├── src/
│   │   ├── index.js            # Express服务器
│   │   ├── config.js           # 配置管理
│   │   └── test/
│   │       └── exact-hash.test.js  # E2E完整流程测试
│   ├── .env                    # 环境配置
│   └── package.json
└── README.md
```

## 🚀 快速开始

### 1. 安装依赖

```bash
# Foundry (如果需要重新安装)
cd contracts
forge install

# Backend (Node.js)
cd ../backend
npm install
```

### 2. 启动本地测试链

```bash
# 启动Anvil (默认账户有10000 ETH)
anvil

# 或Fork主网测试
anvil --fork-url https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
```

### 3. 部署合约

```bash
cd contracts

# 部署到本地Anvil
forge script script/Deploy.s.sol --tc DeployScript --fork-url http://localhost:8545 --broadcast

# 输出示例:
# Kernel deployed at: 0x5FbDB2315678afecb367f032d93F642f64180aa3
# MockUSDC deployed at: 0x4559c5b2B51Fe2e18b66C1a9C5d64ef03F154340
```

### 4. 配置后端

```bash
cd backend
# 编辑 .env 文件

# 本地Anvil配置:
RPC_URL=http://localhost:8545
CHAIN_ID=31337
KERNEL_ADDRESS=0x5fbdb2315678afecb367f032d93f642f64180aa3
ENTRY_POINT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
TOKEN_ADDRESS=0x4559c5b2b51fe2e18b66c1a9c5d64ef03f154340
```

### 5. 运行测试

```bash
# 后端E2E测试
cd backend
node test/exact-hash.test.js

# Foundry合约测试
cd ../contracts
forge test -vvv
```

## 🧪 测试结果

### 后端E2E测试 (`backend/test/exact-hash.test.js`)

```
✅ Minting USDC to User B
✅ User B approving Kernel
✅ User B USDC balance: 5000
✅ hashInitCode calculation
✅ hashCallData calculation
✅ hashPaymasterAndData calculation
✅ PACKED_USEROP_TYPEHASH
✅ structHash calculation
✅ DOMAIN_SEPARATOR_TYPEHASH
✅ domainSeparator calculation
✅ userOpHash calculation (0x1901 || domainSeparator || structHash)
✅ Signature generation (v=28, r, s)
✅ ecrecover signature verification (matches User B address)
❌ EntryPoint.handleOps (expected - EIP-7702 delegation not set)

Result: Hash calculation and signature verification PASSED ✅
```

### 合约签名验证测试 (`contracts/test/SignatureDebugTest.t.sol`)

```solidity
[PASS] testDirectSignatureRecovery()
  - v: 28
  - Recovered address: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
  - Match: true

[PASS] testUserOpHashSignature()
  - v: 27
  - Recovered: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
  - Expected: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
  - Match: true
```

## 📖 签名计算流程

### Step 1: 计算 structHash

```javascript
hashInitCode = keccak256("") = 0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470
hashCallData = keccak256(callData)
hashPaymasterAndData = keccak256("") = 0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470

PACKED_USEROP_TYPEHASH = 0x29a0bca4af4be3421398da00295e58e6d7de38cb492214754cb6a47507dd6f8e

structHash = keccak256(
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
)
```

### Step 2: 计算 domainSeparator

```javascript
DOMAIN_SEPARATOR_TYPEHASH = 0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f

domainSeparator = keccak256(
  abi.encode(
    DOMAIN_SEPARATOR_TYPEHASH,
    keccak256("Kernel"),
    keccak256("1"),
    block.chainid,
    address(kernel)
  )
)
```

### Step 3: 计算 userOpHash

```javascript
// 0x1901 = bytes([0x19, 0x01])
userOpHash = keccak256(
  abi.encodePacked(
    bytes1(0x19),
    bytes1(0x01),
    domainSeparator,
    structHash
  )
)
```

### Step 4: 签名

```javascript
// 直接对userOpHash签名 (无Ethereum Signed Message前缀)
signature = sign(privateKey, userOpHash)
// v = 27 or 28
// r, s = signature components
```

### Step 5: 验证签名

```solidity
// Kernel.sol _recoverSigner function
function _recoverSigner(bytes32 messageHash, bytes memory signature) internal pure returns (address) {
  bytes32 r;
  bytes32 s;
  uint8 v;
  assembly {
    r := mload(add(signature, 32))
    s := mload(add(signature, 64))
    v := byte(0, mload(add(signature, 96)))
  }
  return ecrecover(messageHash, v, r, s);
}
```

## 📝 核心合约: Kernel.sol

### 主要函数

#### validateUserOp (第175-243行)
```solidity
function validateUserOp(
    PackedUserOperation calldata userOp,
    bytes32 userOpHash,
    uint256 missingAccountFunds
) external returns (uint256 validationData);
```
- 验证 `msg.sender == ENTRY_POINT`
- ECDSA签名验证 (直接对userOpHash签名)
- Nonce检查与递增
- 支付prefund到EntryPoint
- ERC20 gas支付处理

#### execute (第239行)
```solidity
function execute(uint256 mode, bytes calldata data) external;
```
- ERC-7821标准批量执行接口
- mode=1: 普通批量 (Call[])
- mode=3: 递归批量 (batch of batches)

#### isValidSignature (第290行)
```solidity
function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4 magicValue);
```
- ERC-1271链上签名验证
- 返回 `0x1626ba7e` 表示有效

## 🏗️ 架构设计

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   Client    │       │  Backend    │       │   链上      │
│  (dApp/API) │──────>│  Bundler    │──────>│  EntryPoint │
│             │       │  (Node.js)  │       │  Contract   │
└─────────────┘       └─────────────┘       └─────────────┘
      │                      │                      │
      │ 1. 构建UserOp        │                      │
      │ 2. EIP-712签名       │                      │
      │ 3. POST /execute    │                      │
      │                    │ 4. handleOps()       │
      │                    │ 5. 发送到链上        │
      │                    │                      │ 6. validateUserOp
      │                    │                      │ 7. execute(mode, data)
      │                    │                      │ 8. ERC20 transferFrom
      │                    │<─────────────────────│
      │<───────────────────│ 9. 返回结果         │
```

## 🔐 重要发现

### Foundry vs Hardhat 私钥差异

```javascript
// Anvil账户2 (Foundry默认)
// 地址: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
// 私钥: 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a

// 注意: vm.sign(2, hash) 使用的是 Foundry 账户索引2的私钥
// 而不是 Hardhat 账户索引2的私钥
// 两者不同!
```

### EIP-7702 委托代码格式

```solidity
// 委托代码 = EIP7702_PREFIX (0xef01) + 20字节Kernel地址
bytes memory delegationCode = abi.encodePacked(
  bytes1(0xef),
  bytes1(0x01),
  bytes20(kernelAddress)
);

// 使用 vm.etch() 设置委托
vm.etch(userAddress, delegationCode);
```

### ERC-4337 签名注意事项

- **不要**添加 `"\x19Ethereum Signed Message:\n32"` 前缀
- 直接对 `userOpHash` 签名
- EntryPoint 会处理域分隔符

## 📚 技术栈

### 智能合约
- Solidity ^0.8.20
- Foundry (forge, cast, anvil)
- OpenZeppelin Contracts
- ERC-4337 EntryPoint Reference Implementation

### 后端
- Node.js v18+
- ethers.js v6
- Express.js 4.x
- dotenv

## 🛠️ 开发工具

```bash
# 编译合约
forge build

# 运行测试
forge test -vvv

# 部署合约
forge script script/Deploy.s.sol --tc DeployScript --fork-url $RPC_URL --broadcast

# 启动本地节点
anvil

# 检查账户余额
cast balance <address>

# 发送交易
cast send --private-key <key> --to <contract> --data <data>
```

## 📦 已知问题

### 1. EntryPoint nonReentrant 检查

EntryPoint 的 `nonReentrant` modifier 限制:
```solidity
require(tx.origin == msg.sender && msg.sender.code.length == 0, Reentrancy());
```

这意味着:
- 调用者必须是 EOA (`tx.origin == msg.sender`)
- 调用者不能是合约 (`msg.sender.code.length == 0`)

**解决方案**: 使用 `vm.broadcast()` 直接发送交易，而不是通过 `vm.prank()`

### 2. 依赖库编译问题

某些依赖的测试文件会导致编译失败:

```bash
# 解决方法: 删除测试文件
rm -rf lib/openzeppelin-contracts/fv
rm -rf lib/openzeppelin-contracts/test
rm -rf lib/account-abstraction/contracts/test
```

## 🤝 贡献指南

遵循OpenSpec流程:
1. 在 `openspec/changes/` 创建proposal
2. 编写tasks.md清单
3. 实现代码 + 测试
4. 提交PR
5. 归档到 `openspec/changes/archive/`

## 📄 许可证

MIT License

## 🔗 相关链接

- [EIP-7702规范](https://eips.ethereum.org/EIPS/eip-7702)
- [ERC-4337文档](https://eips.ethereum.org/EIPS/eip-4337)
- [ERC-1271标准](https://eips.ethereum.org/EIPS/eip-1271)
- [ERC-7821批量执行](https://eips.ethereum.org/EIPS/eip-7821)
- [Foundry文档](https://book.getfoundry.sh/)
- [ethers.js v6](https://docs.ethers.org/v6/)

---

**项目状态**: 核心功能已完成 ✅

**已完成**:
- ✅ Kernel合约实现 (421行完整代码)
- ✅ EIP-712签名验证
- ✅ ERC-4337 validateUserOp
- ✅ ERC-7821批量执行
- ✅ ERC-20 gas支付
- ✅ 后端签名计算测试 (通过)
- ✅ 合约签名验证测试 (通过)

**待完成**:
- 🔄 EIP-7702完整委托流程E2E测试
- 🔄 handleOps完整集成测试
