# Tasks: Implement Backend API

## 2.1 搭建Express服务器
- [ ] 创建backend/目录
- [ ] 初始化package.json (express, ethers, ioredis, dotenv, jest)
- [ ] 创建src/index.js (Express app)
- [ ] 创建src/config.js (环境变量配置)
- [ ] 创建.env.example (RPC_URL, BUNDLER_PRIVATE_KEY, KERNEL_ADDRESS, ENTRY_POINT)
- [ ] 添加CORS和JSON中间件
- [ ] 设置端口3000

## 2.2 实现/execute endpoint
- [ ] 创建src/routes/execute.js
- [ ] 接收{ userOp, authorization? }
- [ ] 验证userOp.signature (调用validation.js)
- [ ] 如有authorization，验证其signature
- [ ] 检查链上code (provider.getCode)
- [ ] 判断needsAuth = (code === '0x')
- [ ] 调用bundler.js构建type 0x04交易
- [ ] 发送交易到链上
- [ ] 返回{ txHash, delegated: boolean, executed: true }
- [ ] 错误处理（signature invalid, tx failed等）

## 2.3 实现delegation-status和nonce endpoints
- [ ] 创建src/routes/delegationStatus.js
  - [ ] GET /api/delegation-status/:address
  - [ ] 查缓存 (Redis: delegation:<address>)
  - [ ] 如未缓存，provider.getCode(address)
  - [ ] delegated = (code !== '0x')
  - [ ] 查询eoaNonce (provider.getTransactionCount)
  - [ ] 查询userOpNonce (Kernel.getNonce)
  - [ ] 缓存结果 (TTL 5min)
  - [ ] 返回{ delegated, eoaNonce, userOpNonce }
- [ ] 创建src/routes/nonce.js
  - [ ] GET /api/nonce/:address
  - [ ] 调用Kernel.getNonce(address)
  - [ ] 返回{ nonce: number }

## 2.4 实现bundler服务和验证逻辑
- [ ] 创建src/services/bundler.js
  - [ ] 函数：buildType04Transaction(userOp, authorization)
  - [ ] 构建authorizationList
  - [ ] 编码EntryPoint.handleOps([userOp], bundlerAddress)
  - [ ] 返回{ type: 0x04, to, data, authorizationList }
  - [ ] 函数：sendTransaction(tx)
  - [ ] bundlerWallet.sendTransaction(tx)
  - [ ] 等待receipt
  - [ ] 返回txHash
- [ ] 创建src/services/validation.js
  - [ ] 函数：verifyUserOpSignature(userOp)
  - [ ] 计算userOpHash (EIP-712或简化版keccak256)
  - [ ] ethers.verifyMessage验证
  - [ ] 返回true/false
  - [ ] 函数：verifyAuthorizationSignature(authorization)
  - [ ] 计算authHash
  - [ ] 验证signature
  - [ ] 返回true/false
- [ ] 创建src/services/cache.js
  - [ ] 简化版：内存Map (不依赖Redis)
  - [ ] 函数：get(key), set(key, value, ttl)
  - [ ] TTL自动过期逻辑

## 2.5 编写API测试
- [ ] 创建test/api.test.js
- [ ] Mock ethers provider和wallet
- [ ] 测试POST /api/execute (成功和失败场景)
- [ ] 测试GET /api/delegation-status/:address
- [ ] 测试GET /api/nonce/:address
- [ ] 运行：npm test

## 2.6 运行和验证
- [ ] 启动服务：npm start
- [ ] 测试端点可访问 (curl localhost:3000/api/...)
- [ ] 确认所有测试通过

## 完成标准
- ✅ Express服务器正常运行
- ✅ 所有API端点响应正确
- ✅ 测试覆盖核心逻辑
- ✅ 代码有中文注释
- ✅ 符合OpenSpec规范
