# Backend API Design

## Context
Backend API provides RESTful endpoints for the EIP-7702 account abstraction system, serving as the interface between frontend applications and blockchain infrastructure.

**Constraints**:
- Must be fast (sub-100ms response for cached queries)
- Must handle high concurrency (multiple users)
- Must be secure (authentication, rate limiting)
- Must be reliable (fallback mechanisms, error handling)

## Goals / Non-Goals

**Goals**:
- Fast, RESTful API with clear endpoints
- Comprehensive error handling and user-friendly messages
- Efficient caching to reduce RPC calls
- Security (API keys, rate limiting)
- Complete API documentation (OpenAPI/Swagger)

**Non-Goals**:
- GraphQL (REST is sufficient for MVP)
- WebSocket (future enhancement for real-time updates)
- Multi-tenant architecture (single deployment for now)
- Advanced monitoring (basic logging sufficient)

## Decisions

### Decision 1: Express.js Framework
**What**: Use Express.js as the backend framework.

**Why**:
- Widely used and battle-tested
- Large ecosystem and middleware
- Fast and lightweight
- Easy to deploy (Node.js)

**Alternatives**:
1. Fastify - Faster but smaller ecosystem
2. Koa - More modern but less mature
3. Hapi - More opinionated, more overhead

**Decision**: Express.js for balance of features, speed, and ecosystem.

### Decision 2: RESTful API Design
**What**: Use RESTful principles for API design.

**Why**:
- Simple and widely understood
- Works well with HTTP caching
- Easy to consume from any frontend
- Standard patterns available

**Alternative**: GraphQL
- Rejected: More complex, overkill for MVP, harder to cache

### Decision 3: JSON Request/Response
**What**: Use JSON for all request and response bodies.

**Why**:
- Standard for REST APIs
- Easy to parse and generate
- Human-readable for debugging
- Supported by all modern clients

### Decision 4: Redis for Caching
**What**: Use Redis for all API response caching.

**Why**:
- In-memory (extremely fast)
- Distributed (can scale)
- Rich data structures (supports TTL)
- Widely supported

**Alternative**: In-memory cache (Node.js Map)
- Rejected: Not distributed, lost on restart, can't scale

### Decision 5: API Key Authentication
**What**: Use API keys for authentication.

**Why**:
- Simple to implement
- Easy to revoke
- Can track usage per key
- Standard for public APIs

**Alternative**: OAuth 2.0
- Rejected: Overkill for MVP, more complex

## Technical Design

### API Architecture

```
Frontend → Load Balancer → API Server (Express) → Services
                                                    ↓
                                        ┌─────────────────────┐
                                        │   Business Logic    │
                                        │                     │
                                        │ - Validation        │
                                        │ - Caching          │
                                        │ - Error Handling    │
                                        └─────────────────────┘
                                                    ↓
                                        ┌─────────────────────┐
                                        │  Blockchain Layer   │
                                        │                     │
                                        │ - RPC Providers     │
                                        │ - Smart Contracts   │
                                        │ - Bundler Wallet    │
                                        └─────────────────────┘
```

### API Endpoints

#### 1. POST /api/execute
Execute a UserOperation.

**Request**:
```typescript
interface ExecuteRequest {
    userOp: PackedUserOperation;
    authorization?: Authorization;  // Optional (first-time users only)
}

interface PackedUserOperation {
    sender: string;
    nonce: string;
    initCode: string;
    callData: string;
    accountGasLimits: string;
    preVerificationGas: string;
    gasFees: string;
    paymasterAndData: string;
    signature: string;
}

interface Authorization {
    chainId: number;
    address: string;
    nonce: number;
    signature: string;
}
```

**Response**:
```typescript
interface ExecuteResponse {
    success: boolean;
    txHash?: string;
    status: 'submitted' | 'failed';
    error?: string;
    delegated?: boolean;
}
```

#### 2. POST /api/simulate
Simulate a UserOperation before submission.

**Request**:
```typescript
interface SimulateRequest {
    userOp: PackedUserOperation;
    chainId?: number;
}
```

**Response**:
```typescript
interface SimulateResponse {
    success: boolean;
    results: {
        callGasLimit: string;
        verificationGasLimit: string;
        preVerificationGas: string;
        maxFeePerGas: string;
        maxPriorityFeePerGas: string;
        estimatedGasCost: {
            eth: string;
            token?: {
                address: string;
                symbol: string;
                amount: string;
                decimals: number;
            };
        };
    };
    warnings?: string[];
    errors?: string[];
}
```

#### 3. GET /api/delegation-status/:address
Query delegation status for an address.

**Response**:
```typescript
interface DelegationStatusResponse {
    delegated: boolean;
    eoaNonce: number;
    userOpNonce: number;
    kernelAddress: string;
    chainId: number;
    metadata?: {
        cached: boolean;
        age?: number;
    };
}
```

#### 4. GET /api/nonce/:address
Query UserOp nonce for an address.

**Response**:
```typescript
interface NonceResponse {
    nonce: number;
    kernelAddress: string;
}
```

#### 5. GET /api/kernel/address
Retrieve system contract addresses.

**Query Parameters**:
- `chainId` (optional): Specific chain ID

**Response**:
```typescript
interface KernelAddressResponse {
    kernelAddress: string;
    entryPointAddress: string;
    chainId: number;
    version: string;
    deployedAt: string;
}
```

#### 6. GET /api/status/:txHash
Query transaction status.

**Response**:
```typescript
interface TransactionStatusResponse {
    status: 'pending' | 'confirmed' | 'failed';
    txHash: string;
    blockNumber?: number;
    confirmations?: number;
    gasUsed?: string;
    receipt?: any;
    error?: string;
    revertReason?: string;
}
```

#### 7. POST /api/estimate-gas
Estimate gas cost for a UserOperation.

**Request**:
```typescript
interface EstimateGasRequest {
    userOp: PackedUserOperation;
    tokenAddress?: string;  // Optional (estimate in ERC20 if provided)
    chainId?: number;
}
```

**Response**:
```typescript
interface EstimateGasResponse {
    success: boolean;
    estimate: {
        eth: string;
        token?: {
            address: string;
            symbol: string;
            amount: string;
            decimals: number;
        };
        breakdown: {
            callGasLimit: string;
            verificationGasLimit: string;
            preVerificationGas: string;
            totalGasLimit: string;
            baseFee: string;
            priorityFee: string;
            maxFeePerGas: string;
        };
        exchangeRate?: {
            ethPerToken: string;
            source: string;
            timestamp: number;
        };
        buffer: {
            percentage: number;
            amount: string;
        };
    };
}
```

### Middleware Stack

```javascript
const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');

const app = express();

// Security middleware
app.use(helmet());  // Security headers
app.use(cors());    // CORS support

// Rate limiting
const limiter = rateLimit({
    windowMs: 60 * 1000,  // 1 minute
    max: 100,  // 100 requests per minute
    message: 'Too many requests from this IP',
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// API key authentication
app.use('/api/', authenticateApiKey);

// Request logging
app.use(requestLogger);

// Error handling
app.use(errorHandler);

// API routes
app.use('/api', apiRoutes);

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});
```

### Authentication Middleware

```javascript
const API_KEYS = new Map();

// Load API keys from database or environment
function loadApiKeys() {
    const keys = process.env.API_KEYS?.split(',') || [];
    keys.forEach(key => {
        const [keyValue, tier] = key.split(':');
        API_KEYS.set(keyValue, { tier: tier || 'standard', usage: 0 });
    });
}

function authenticateApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
        return res.status(401).json({
            error: {
                type: 'authentication_error',
                message: 'API key is required'
            }
        });
    }

    const keyData = API_KEYS.get(apiKey);

    if (!keyData) {
        return res.status(401).json({
            error: {
                type: 'authentication_error',
                message: 'Invalid API key'
            }
        });
    }

    req.apiKey = apiKey;
    req.apiKeyTier = keyData.tier;
    next();
}
```

### Caching Layer

```javascript
const redis = require('redis');
const { promisify } = require('util');

const client = redis.createClient({
    url: process.env.REDIS_URL
});

const getAsync = promisify(client.get).bind(client);
const setAsync = promisify(client.set).bind(client);
const delAsync = promisify(client.del).bind(client);

// Cache middleware
async function cacheResponse(ttl) {
    return async (req, res, next) => {
        const cacheKey = `api:${req.method}:${req.originalUrl}:${JSON.stringify(req.body)}`;

        // Try cache
        try {
            const cached = await getAsync(cacheKey);
            if (cached) {
                const data = JSON.parse(cached);
                res.set('X-Cache', 'HIT');
                res.set('X-Cache-Age', `${Math.floor((Date.now() - data.timestamp) / 1000)}s`);
                return res.json(data.response);
            }
        } catch (e) {
            console.error('Cache error:', e);
        }

        // Store original json method
        const originalJson = res.json.bind(res);

        // Override json method to cache response
        res.json = function(response) {
            try {
                const data = {
                    response,
                    timestamp: Date.now()
                };
                setAsync(cacheKey, JSON.stringify(data), 'EX', ttl);
            } catch (e) {
                console.error('Cache set error:', e);
            }

            res.set('X-Cache', 'MISS');
            return originalJson(response);
        };

        next();
    };
}

// Usage
app.get('/api/delegation-status/:address',
    cacheResponse(300),  // 5 minutes TTL
    delegationStatusController
);

app.get('/api/nonce/:address',
    cacheResponse(30),  // 30 seconds TTL
    nonceController
);
```

### Error Handling

```javascript
class APIError extends Error {
    constructor(statusCode, type, message, details = {}) {
        super(message);
        this.statusCode = statusCode;
        this.type = type;
        this.details = details;
    }
}

// Error handler middleware
function errorHandler(err, req, res, next) {
    console.error('Error:', err);

    // Known API errors
    if (err instanceof APIError) {
        return res.status(err.statusCode).json({
            error: {
                type: err.type,
                message: err.message,
                details: err.details
            }
        });
    }

    // Validation errors
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            error: {
                type: 'validation_error',
                message: 'Invalid request data',
                details: {
                    fields: err.details
                }
            }
        });
    }

    // Rate limit errors
    if (err.status === 429) {
        return res.status(429).json({
            error: {
                type: 'rate_limit_exceeded',
                message: 'Too many requests',
                details: {
                    retryAfter: err.resetTime
                }
            }
        });
    }

    // Default 500 error
    res.status(500).json({
        error: {
            type: 'internal_error',
            message: 'An unexpected error occurred'
        }
    });
}

// Example usage in controller
async function executeUserOperation(req, res, next) {
    try {
        const { userOp, authorization } = req.body;

        // Validate request
        if (!userOp || !userOp.signature) {
            throw new APIError(
                400,
                'validation_error',
                'Missing required fields: userOp or signature'
            );
        }

        // Execute UserOperation
        const result = await executeUserOp(userOp, authorization);

        res.json({
            success: true,
            txHash: result.txHash,
            status: 'submitted'
        });

    } catch (error) {
        next(error);
    }
}
```

### Service Layer

```javascript
// Blockchain service
const BlockchainService = {
    async getProvider(chainId) {
        // Get provider for specific chain
        const rpcUrl = getRpcUrl(chainId);
        return new ethers.JsonRpcProvider(rpcUrl);
    },

    async getCode(address, provider) {
        return await provider.getCode(address);
    },

    async getTransactionCount(address, provider) {
        return await provider.getTransactionCount(address);
    },

    async getNonce(userAddress, kernelAddress, provider) {
        const kernel = new ethers.Contract(
            kernelAddress,
            KERNEL_ABI,
            provider
        );
        return await kernel.getNonce(userAddress);
    }
};

// Delegation service
const DelegationService = {
    async checkStatus(address, chainId) {
        const provider = await BlockchainService.getProvider(chainId);
        const code = await BlockchainService.getCode(address, provider);

        const delegated = code !== '0x';
        const eoaNonce = await BlockchainService.getTransactionCount(address, provider);

        let userOpNonce = 0;
        if (delegated) {
            const kernelAddress = await this.getKernelAddress(chainId);
            userOpNonce = await BlockchainService.getNonce(address, kernelAddress, provider);
        }

        return {
            delegated,
            eoaNonce,
            userOpNonce,
            kernelAddress: await this.getKernelAddress(chainId),
            chainId
        };
    },

    async getKernelAddress(chainId) {
        const config = await ConfigService.getConfig(chainId);
        return config.kernelAddress;
    }
};

// UserOperation service
const UserOperationService = {
    async simulate(userOp, chainId) {
        const entryPoint = await this.getEntryPoint(chainId);

        try {
            const result = await entryPoint.simulateValidation(userOp);
            return {
                success: true,
                results: {
                    callGasLimit: result.returnInfo.preOpGas.toString(),
                    verificationGasLimit: result.returnInfo.prefund.toString(),
                    // ... other fields
                }
            };
        } catch (error) {
            return {
                success: false,
                errors: [error.message]
            };
        }
    },

    async execute(userOp, authorization, chainId) {
        const provider = await BlockchainService.getProvider(chainId);
        const bundlerWallet = await this.getBundlerWallet(chainId);
        const entryPoint = await this.getEntryPoint(chainId);

        // Check delegation status
        const code = await BlockchainService.getCode(userOp.sender, provider);
        const needsAuth = code === '0x';

        // Build transaction
        const tx = {
            type: 0x04,
            authorizationList: needsAuth ? [authorization] : [],
            to: ENTRYPOINT_ADDRESS,
            data: entryPoint.interface.encodeFunctionData('handleOps', [
                [userOp],
                bundlerWallet.address
            ])
        };

        // Send transaction
        const txResponse = await bundlerWallet.sendTransaction(tx);
        await txResponse.wait();

        return {
            success: true,
            txHash: txResponse.hash
        };
    }
};
```

### OpenAPI Documentation

```javascript
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'EIP-7702 Account Abstraction API',
            version: '1.0.0',
            description: 'RESTful API for EIP-7702 account abstraction system',
        },
        servers: [
            {
                url: 'https://api.example.com/v1',
                description: 'Production server',
            },
            {
                url: 'https://staging-api.example.com/v1',
                description: 'Staging server',
            },
        ],
        components: {
            securitySchemes: {
                apiKey: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'x-api-key',
                },
            },
            schemas: {
                UserOperation: {
                    type: 'object',
                    required: ['sender', 'nonce', 'callData', 'signature'],
                    properties: {
                        sender: { type: 'string' },
                        nonce: { type: 'string' },
                        initCode: { type: 'string' },
                        callData: { type: 'string' },
                        accountGasLimits: { type: 'string' },
                        preVerificationGas: { type: 'string' },
                        gasFees: { type: 'string' },
                        paymasterAndData: { type: 'string' },
                        signature: { type: 'string' },
                    },
                },
                Error: {
                    type: 'object',
                    properties: {
                        type: { type: 'string' },
                        message: { type: 'string' },
                        details: { type: 'object' },
                    },
                },
            },
        },
        security: [{ apiKey: [] }],
    },
    apis: ['./routes/*.js'], // Path to API docs
};

const specs = swaggerJsdoc(options);

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(specs));
```

## Security Considerations

### API Security

**Authentication**:
- API key required for all endpoints
- Revocable API keys
- Usage tracking per key
- Tier-based rate limits

**Rate Limiting**:
- Per-IP rate limits (100 req/min)
- Per-API-key limits (higher for partners)
- Burst protection
- Retry-after headers

**Input Validation**:
- Schema validation for all requests
- Sanitization of user input
- Length limits on strings
- Type checking

**Headers**:
- Security headers (Helmet.js)
- CORS configuration
- Content-Security-Policy
- X-Content-Type-Options

### Data Security

**Sensitive Data**:
- Never log API keys
- Never log private keys
- Mask transaction hashes in logs
- Secure environment variables

**Cache Security**:
- Separate Redis instance for sensitive data
- Encrypt sensitive cache entries
- Separate cache keys for different tenants

### RPC Security

**RPC Provider Failover**:
- Multiple RPC providers
- Automatic failover
- Load balancing
- Health checks

**RPC Rate Limits**:
- Respect provider rate limits
- Implement backoff on failures
- Cache responses aggressively
- Use paid tiers for production

## Performance Optimization

### Caching Strategy

**What to Cache**:
- Delegation status (5 min TTL)
- Nonce values (30 sec TTL)
- Configuration data (1 hour TTL)
- Gas prices (30 sec TTL)

**Cache Invalidation**:
- Manual (after delegation)
- Time-based (TTL)
- Event-based (contract events)

**Cache Warming**:
- Pre-load common addresses
- Warm configuration on startup
- Periodic refresh of hot data

### Database Optimization

**Connection Pooling**:
- Use connection pools for PostgreSQL (if used)
- Configure pool size based on load
- Monitor connection usage

**Query Optimization**:
- Index frequently queried fields
- Use prepared statements
- Avoid N+1 queries

### Response Optimization

**Compression**:
- Enable gzip compression
- Use HTTP/2
- Minimize response size

**Pagination**:
- Paginate list endpoints
- Limit page size (e.g., 100 items)
- Include pagination metadata

## Monitoring and Logging

### Logging

**Structured Logging**:
```javascript
const logger = require('pino')();

logger.info({
    method: req.method,
    path: req.path,
    statusCode: res.statusCode,
    responseTime: Date.now() - req.startTime,
    apiKey: req.apiKey,
    ip: req.ip
});
```

**Log Levels**:
- ERROR: Critical errors
- WARN: Recoverable errors
- INFO: Important events
- DEBUG: Detailed debugging

### Metrics

**Key Metrics**:
- Request rate (per endpoint)
- Response time (p50, p95, p99)
- Error rate
- Cache hit/miss ratio
- RPC call duration

**Monitoring Tools**:
- Prometheus + Grafana
- Datadog (if budget allows)
- CloudWatch (AWS)

### Alerting

**Alert Conditions**:
- Error rate > 5%
- Response time p95 > 1s
- Cache hit rate < 50%
- RPC provider failure rate > 10%

**Alert Channels**:
- Slack/Teams
- Email (critical only)
- PagerDuty (for on-call)

## Deployment

### Environment Variables

```bash
# Server
NODE_ENV=production
PORT=3000

# Blockchain
RPC_URL_MAINNET=https://mainnet.infura.io/v3/YOUR_KEY
RPC_URL_SEPOLIA=https://sepolia.infura.io/v3/YOUR_KEY

# Bundler
BUNDLER_PRIVATE_KEY=your_private_key_here
BUNDLER_ADDRESS=0x...

# Contracts
KERNEL_ADDRESS_MAINNET=0x...
ENTRYPOINT_ADDRESS=0x...

# Redis
REDIS_URL=redis://localhost:6379

# API Keys
API_KEYS=key1:standard,key2:premium

# Rate Limits
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

### Deployment Strategy

**CI/CD Pipeline**:
1. Run tests
2. Build Docker image
3. Push to registry
4. Deploy to staging
5. Run integration tests
6. Deploy to production (blue-green)

**Scaling**:
- Horizontal scaling (multiple instances)
- Load balancer (AWS ALB, Nginx)
- Auto-scaling based on CPU/memory

**Health Checks**:
```javascript
app.get('/health', async (req, res) => {
    const checks = {
        server: 'ok',
        database: await checkDatabase(),
        redis: await checkRedis(),
        blockchain: await checkBlockchain()
    };

    const allHealthy = Object.values(checks).every(status => status === 'ok');

    res.status(allHealthy ? 200 : 503).json({
        status: allHealthy ? 'healthy' : 'unhealthy',
        checks
    });
});
```

## Migration Plan

**Phase 1: Core Endpoints** (Week 1-2)
- POST /api/execute
- POST /api/simulate
- GET /api/delegation-status/:address
- GET /api/nonce/:address

**Phase 2: Supporting Endpoints** (Week 3)
- GET /api/kernel/address
- GET /api/status/:txHash
- POST /api/estimate-gas

**Phase 3: Security and Performance** (Week 4)
- API authentication
- Rate limiting
- Caching layer
- Error handling

**Phase 4: Documentation and Monitoring** (Week 5)
- OpenAPI documentation
- Logging and metrics
- Monitoring setup
- Alert configuration

## Open Questions

1. **What authentication method for production?**
   - Currently: API keys
   - Consider: OAuth 2.0 for enterprise clients
   - Decision: Start with API keys, add OAuth if needed

2. **Should we implement WebSocket for real-time updates?**
   - Currently: No (REST with polling)
   - Consider: WebSocket for transaction status
   - Decision: Not in MVP, consider for better UX

3. **What rate limits for different tiers?**
   - Currently: Single tier (100 req/min)
   - Consider: Standard, Premium, Enterprise tiers
   - Decision: Implement multiple tiers from start

4. **Should we implement request signing?**
   - Currently: API key only
   - Consider: HMAC signing for security
   - Decision: Not in MVP, consider for high-security applications

5. **How to handle blockchain RPC failures?**
   - Currently: Failover to secondary provider
   - Consider: Circuit breaker pattern
   - Decision: Failover + circuit breaker for production
