/**
 * EIP-7702 Account Abstraction Backend API
 * Express服务器入口
 */
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { executeUserOp } from './routes/execute.js';
import { simulateUserOp } from './routes/simulate.js';
import { getDelegationStatus } from './routes/delegationStatus.js';
import { getNonce } from './routes/nonce.js';

const app = express();

// 中间件
app.use(cors()); // 允许跨域请求
app.use(express.json()); // 解析JSON body

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    config: {
      chainId: config.chainId,
      kernelAddress: config.kernelAddress,
      entryPointAddress: config.entryPointAddress
    }
  });
});

// API路由
app.post('/api/execute', executeUserOp);
app.post('/api/simulate', simulateUserOp);
app.get('/api/delegation-status/:address', getDelegationStatus);
app.get('/api/nonce/:address', getNonce);

// 404处理
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    available: [
      'POST /api/execute',
      'POST /api/simulate',
      'GET /api/delegation-status/:address',
      'GET /api/nonce/:address',
      'GET /health'
    ]
  });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// 启动服务器
app.listen(config.port, () => {
  console.log(`🚀 EIP-7702 Backend API running on port ${config.port}`);
  console.log(`📍 Chain ID: ${config.chainId}`);
  console.log(`📍 Kernel: ${config.kernelAddress}`);
  console.log(`📍 EntryPoint: ${config.entryPointAddress}`);
  console.log(`\nAvailable endpoints:`);
  console.log(`  - POST http://localhost:${config.port}/api/execute`);
  console.log(`  - POST http://localhost:${config.port}/api/simulate`);
  console.log(`  - GET  http://localhost:${config.port}/api/delegation-status/:address`);
  console.log(`  - GET  http://localhost:${config.port}/api/nonce/:address`);
  console.log(`  - GET  http://localhost:${config.port}/health`);
});
