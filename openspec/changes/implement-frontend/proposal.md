# Change Proposal: Implement Frontend

**Type:** Implementation  
**Status:** PROPOSED  
**Created:** 2025-01-30  
**Author:** System

## Why (Motivation)

实现简化版前端界面，让用户能够：
- 连接MetaMask钱包
- 构建UserOperation
- 签名authorization（首次使用）
- 提交交易到后端API
- 查看执行结果

当前项目没有前端，用户无法方便地与系统交互。一个简洁的Web界面是MVP的重要组成部分。

## What (Changes)

### 新增文件
```
frontend/
├── index.html         # 主页面
├── app.js            # 核心逻辑 (ethers.js)
├── style.css         # 样式
└── package.json      # 依赖 (可选Vite)
```

### 核心功能

1. **连接钱包**
   - 检测MetaMask
   - 连接用户账户
   - 显示地址和余额

2. **构建UserOperation**
   - 输入target地址和calldata
   - 查询nonce (/api/nonce)
   - 编码executeBatch calldata
   - 设置paymasterAndData (USDC地址+金额)
   - 签名UserOp hash

3. **签名Authorization（首次）**
   - 查询delegation状态 (/api/delegation-status)
   - 如未delegated，生成authorization
   - 签名authHash (chainId, Kernel地址, eoaNonce)

4. **提交执行**
   - POST到/api/execute
   - 显示txHash和状态
   - 链接到区块浏览器

### 设计原则
- 简洁优先：单页应用，无复杂框架
- 直接使用ethers.js（CDN引入，无需构建）
- 清晰的状态提示（Loading, Success, Error）
- 支持基础场景（单个或多个call）

## Impact (影响分析)

### 正面影响
- ✅ 提供用户友好的交互界面
- ✅ 展示完整的端到端流程
- ✅ 方便演示和测试
- ✅ 降低使用门槛（无需curl命令）

### 风险
- ⚠️ 浏览器兼容性（需测试Chrome/Firefox）
- ⚠️ MetaMask签名体验（需清晰提示）
- ⚠️ 错误处理（网络失败、余额不足等）

### 依赖
- ethers.js v6 (CDN)
- MetaMask浏览器扩展
- Backend API运行在localhost:3000

## Implementation Plan

按照tasks.md执行：
1. [3.1] 创建HTML页面和基础结构
2. [3.2] 实现Web3连接逻辑
3. [3.3] 实现UserOp构建和签名
4. [3.4] 实现Authorization签名
5. [3.5] 实现API提交和结果显示
6. [3.6] 测试完整流程

预计完成时间：1-2小时
