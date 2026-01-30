# Change Proposal: Implement Backend API

**Type:** Implementation  
**Status:** PROPOSED  
**Created:** 2025-01-30  
**Author:** System

## Why (Motivation)

实现后端Bundler服务，作为前端和区块链之间的桥梁：
- 接收用户的UserOperation请求
- 验证签名和authorization
- 构建EIP-7702 type 0x04交易
- 管理delegation状态缓存
- 提供nonce查询服务

当前项目没有后端代码，前端无法与链上Kernel合约交互。Backend是连接Web2用户和Web3合约的关键。

## What (Changes)

### 新增目录结构
```
backend/
├── package.json
├── .env.example
├── src/
│   ├── index.js           # Express服务器
│   ├── config.js          # 环境配置
│   ├── routes/
│   │   ├── execute.js     # POST /api/execute
│   │   ├── simulate.js    # POST /api/simulate
│   │   ├── delegationStatus.js  # GET /api/delegation-status/:address
│   │   └── nonce.js       # GET /api/nonce/:address
│   └── services/
│       ├── bundler.js     # 构建和发送type 0x04交易
│       ├── validation.js  # 签名验证
│       └── cache.js       # Redis/内存缓存
└── test/
    └── api.test.js        # Jest测试
```

### 核心功能

1. **POST /api/execute** - 执行UserOperation
   - 验证userOp.signature
   - 验证authorization（如果提供）
   - 检查是否需要delegation
   - 构建type 0x04交易
   - 发送到链上
   - 返回txHash和状态

2. **GET /api/delegation-status/:address** - 查询delegation状态
   - 查询缓存
   - 检查链上code
   - 返回delegated状态和nonce

3. **GET /api/nonce/:address** - 查询UserOp nonce
   - 调用Kernel.getNonce()
   - 返回当前nonce值

4. **POST /api/simulate** - 模拟执行（可选）
   - 静态调用验证
   - gas估算
   - 不发送真实交易

## Impact (影响分析)

### 正面影响
- ✅ 实现OpenSpec规范的backend-api capability
- ✅ 提供RESTful API给前端
- ✅ 简化前端逻辑（签名验证、交易构建后端处理）
- ✅ 缓存优化减少RPC调用

### 风险
- ⚠️ Bundler私钥安全（需环境变量管理）
- ⚠️ RPC限流（需错误重试）
- ⚠️ 缓存失效问题（TTL设置）

### 依赖
- Express.js (Web框架)
- ethers.js v6 (区块链交互)
- ioredis (Redis缓存，可选用内存替代)
- dotenv (环境变量)
- jest (测试框架)

## Implementation Plan

按照tasks.md执行：
1. [2.1] 搭建Express服务器和配置
2. [2.2] 实现/execute endpoint
3. [2.3] 实现delegation-status和nonce endpoints
4. [2.4] 实现bundler服务和验证逻辑
5. [2.5] 编写API测试
6. [2.6] 运行测试和启动服务

预计完成时间：2-3小时
