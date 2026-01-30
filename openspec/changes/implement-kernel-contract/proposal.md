# Change Proposal: Implement Kernel Contract

**Type:** Implementation  
**Status:** PROPOSED  
**Created:** 2025-01-30  
**Author:** System

## Why (Motivation)

实现EIP-7702账户抽象核心合约，使EOA用户能够：
- 无需部署自己的智能合约就能获得账户抽象能力
- 使用ERC20代币（如USDC）支付gas费用
- 批量执行多个交易，提高效率
- 通过ERC-4337 UserOperation标准与EntryPoint交互

当前项目只有Counter.sol示例合约，缺少核心Kernel钱包实现。这是整个系统的基础。

## What (Changes)

### 新增文件
- `contracts/src/Kernel.sol` - 核心钱包合约
- `contracts/src/interfaces/IEntryPoint.sol` - EntryPoint接口
- `contracts/src/interfaces/IKernel.sol` - Kernel接口
- `contracts/test/Kernel.t.sol` - 完整测试套件

### 核心功能实现

1. **validateUserOp** - UserOperation验证
   - 验证调用者为EntryPoint
   - ECDSA签名验证
   - Nonce检查与递增
   - ERC20 gas支付处理

2. **executeBatch** - 批量执行
   - 顺序执行多个call
   - 任意失败全部revert
   - 仅EntryPoint可调用

3. **getNonce** - Nonce查询
   - 返回用户当前nonce
   - 用于构建UserOperation

4. **ERC20支付** - Gas代币支付
   - 解析paymasterAndData字段
   - 从用户转账到Bundler
   - 支持任意ERC20代币

## Impact (影响分析)

### 正面影响
- ✅ 实现OpenSpec规范的kernel-wallet capability
- ✅ 为后续backend和frontend提供链上基础
- ✅ 符合ERC-4337标准，兼容现有生态
- ✅ 完整测试覆盖（10个测试用例）

### 风险
- ⚠️ 签名验证安全性（需严格测试）
- ⚠️ ERC20转账失败处理（需捕获revert）
- ⚠️ Nonce竞争条件（需原子性操作）

### 依赖
- Foundry (forge build/test)
- OpenZeppelin Contracts (ECDSA, IERC20)
- ERC-4337 EntryPoint接口定义

## Implementation Plan

按照tasks.md执行：
1. [1.1] 实现Kernel.sol核心逻辑
2. [1.2] 测试validateUserOp各场景
3. [1.3] 测试executeBatch各场景
4. [1.4] 测试ERC20 gas支付流程

预计完成时间：1-2小时
