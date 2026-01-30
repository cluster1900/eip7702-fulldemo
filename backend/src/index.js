/**
 * EIP-7702 Account Abstraction Backend API
 * 后端API入口 - 提供UserOperation构造和执行接口
 *
 * 功能:
 * 1. 构造UserOp calldata
 * 2. 发送EIP-7702 type 0x04交易
 * 3. 查询账户delegation状态
 *
 * @see docs/API.md 查看API调用文档
 */
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { executeUserOp } from './routes/execute.js';
import { simulateUserOp } from './routes/simulate.js';
import { getDelegationStatus } from './routes/delegationStatus.js';
import { getNonce } from './routes/nonce.js';
import { constructCalldata } from './routes/constructCalldata.js';
import { sendRawTransaction } from './routes/sendRaw.js';
import { validateSignature, validateSignatureBatch } from './routes/validateSignature.js';

const app = express();

// 日志级别控制
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

function log(level, ...args) {
  if (LOG_LEVEL === 'debug' || (level !== 'debug')) {
    console[level](...args);
  }
}

// 请求ID中间件
app.use((req, res, next) => {
  req.id = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  res.setHeader('X-Request-ID', req.id);
  next();
});

// 统一错误处理中间件
app.use((err, req, res, next) => {
  log('error', `[${req.id}] Unhandled error:`, err.message);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      requestId: req.id
    }
  });
});

// 中间件
app.use(cors());
app.use(express.json());

// 请求日志中间件
app.use((req, res, next) => {
  log('info', `[${req.id}] ${req.method} ${req.path}`);
  next();
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: Date.now(),
      chainId: config.chainId,
      kernelAddress: config.kernelAddress,
      entryPointAddress: config.entryPointAddress
    }
  });
});

// API路由
app.post('/api/execute', executeUserOp);
app.post('/api/simulate', simulateUserOp);
app.post('/api/construct-calldata', constructCalldata);
app.post('/api/send-raw', sendRawTransaction);
app.get('/api/delegation-status/:address', getDelegationStatus);
app.get('/api/nonce/:address', getNonce);
app.post('/api/validate-signature', validateSignature);
app.post('/api/validate-signature/batch', validateSignatureBatch);

// 404处理 - 统一错误格式
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Endpoint ${req.method} ${req.path} not found`,
      available: [
        'POST /api/execute',
        'POST /api/simulate',
        'POST /api/construct-calldata',
        'POST /api/send-raw',
        'POST /api/validate-signature',
        'POST /api/validate-signature/batch',
        'GET /api/delegation-status/:address',
        'GET /api/nonce/:address',
        'GET /health'
      ]
    }
  });
});

// 启动服务器
app.listen(config.port, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║          EIP-7702 Backend API Server                        ║
╠══════════════════════════════════════════════════════════════╣
║  Port:     ${config.port}
║  Chain:    ${config.chainId}
║  Kernel:   ${config.kernelAddress}
║  EntryPoint: ${config.entryPointAddress}
╠══════════════════════════════════════════════════════════════╣
║  ERC-1271 / ERC-7821 Standards                              ║
╠══════════════════════════════════════════════════════════════╣
║  API Endpoints:                                             ║
║  - POST /api/execute           (ERC-7821 执行)             ║
║  - POST /api/simulate          (模拟执行)                   ║
║  - POST /api/construct-calldata(构造 calldata)              ║
║  - POST /api/send-raw          (发送原始交易)                ║
║  - POST /api/validate-signature(ERC-1271 验证)              ║
║  - POST /api/validate-signature/batch (批量验证)            ║
║  - GET  /api/delegation-status/:address (查询 delegation)  ║
║  - GET  /api/nonce/:address    (查询 UserOp nonce)          ║
║  - GET  /health                (健康检查)                   ║
╠══════════════════════════════════════════════════════════════╣
║  ERC-7821 执行模式:                                          ║
║  - mode=1: 普通批量 (Call[])                                 ║
║  - mode=3: 递归批量 (batch of batches)                       ║
╚══════════════════════════════════════════════════════════════╝
  `);
});
