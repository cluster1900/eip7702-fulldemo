# Project Context

## Purpose
Enable ordinary EOA (Externally Owned Account) users to have smart contract wallet capabilities without migrating addresses or holding ETH. The project implements EIP-7702 to provide batch transactions, ERC20 gas payments (USDC, etc.), and fully gasless experiences through Paymaster sponsorship.

## Tech Stack
- **Language**: JavaScript/TypeScript (Node.js environment)
- **Blockchain**: Ethereum (EIP-7702, Account Abstraction)
- **Smart Contracts**: Solidity (Kernel contract, EntryPoint integration)
- **Backend**: Node.js API server
- **Frontend**: Web3 integration (wallet connection, UserOp construction)
- **Key Standards**: ERC-4337 (Account Abstraction), EIP-7702 (EOA code delegation), ERC-20

## Project Conventions

### Code Style
- Use JavaScript/TypeScript with modern ES6+ syntax
- Follow conventional commit messages for git history
- Clear, descriptive function and variable names
- Chinese comments are acceptable for documentation (based on existing recommend.md)
- Code should be self-documenting with clear purpose

### Architecture Patterns

**Three-Layer Architecture**:
1. **Frontend Layer**: Constructs UserOperations with batch calls, handles user signatures
2. **Backend API Layer**: Validates requests, manages delegation status, relays transactions via Bundler
3. **Smart Contract Layer**: Kernel contract for EIP-7702 integration, EntryPoint for AA

**Core Principles**:
- Single UserOperation per execution (batch multiple operations within callData)
- ERC20 gas payment through `paymasterAndData` field (not separate transfers)
- Backend automatically handles delegation status (no separate /delegate endpoint)
- Atomic execution: delegation + UserOp in same type 0x04 transaction for first-time users

**Key Data Structures**:
- UserOperation: sender, nonce, callData, paymasterAndData, signature
- Authorization: chainId, address (Kernel), nonce, signature
- Batch calls: Array of { target, value, data } objects

### Testing Strategy
- **Unit Tests**: Test individual functions in isolation (smart contracts, API endpoints)
- **Integration Tests**: Test full flows from frontend → backend → blockchain
- **Contract Tests**: Verify validateUserOp, executeBatch, nonce management, ERC20 transfers
- **Test Coverage**: Focus on critical paths (signature validation, delegation handling, gas payments)
- **Test Networks**: Use testnets (Sepolia, Goerli) before mainnet deployment

### Git Workflow
- **Main Branch**: Production-ready code
- **Feature Branches**: `feature/add-xxx` or `chore/update-xxx`
- **Commit Messages**: Follow conventional commits (feat:, fix:, docs:, refactor:)
- **OpenSpec Integration**: All significant changes require OpenSpec proposals before implementation

## Domain Context

### EIP-7702 Overview
EIP-7702 allows EOAs to temporarily delegate their code to a smart contract (Kernel) during transaction execution. This enables EOAs to have smart contract capabilities while maintaining their original address.

### Key Concepts
- **Kernel Contract**: The smart contract code that EOA delegates to, implementing account abstraction logic
- **EntryPoint**: Standard ERC-4337 entry point for account abstraction
- **Bundler**: Service that pays gas upfront and gets reimbursed in ERC20
- **UserOperation**: Structured operation containing batch calls and payment info
- **Authorization**: One-time signature to delegate EOA code to Kernel
- **Two Nonces**: Chain nonce (for regular transactions) vs UserOp nonce (for AA operations)

### User Flow
1. User connects wallet (EOA address)
2. Frontend checks delegation status via API
3. If first-time: user signs authorization message
4. User builds UserOperation with batch calls
5. Frontend sends UserOp + authorization (if needed) to backend
6. Backend validates, builds type 0x04 transaction, relays via Bundler
7. Chain executes: delegation (if needed) → validation → batch calls → gas payment

## Important Constraints

### Technical Constraints
- Must support type 0x04 transactions (EIP-7702)
- Only EntryPoint can call Kernel's validateUserOp and executeBatch
- Bundler must hold ETH to pay gas initially
- ERC20 tokens must be approved for spending (auto-handled in first delegation)
- Gas estimation must account for both validation and execution phases

### Security Constraints
- Signature verification is critical (UserOp signature + authorization signature)
- Must prevent replay attacks (both chain nonce and UserOp nonce)
- Must validate paymasterAndData to prevent token draining
- Must prevent front-running of delegation transactions
- Kernel contract must be immutable after deployment

### Business Constraints
- User experience must be simple (max 2 signatures total)
- Zero ETH required for users (pay with ERC20 only)
- Support stablecoins (USDC, USDT) for gas payments
- Must be cost-effective for Bundler (fees cover ETH gas)

## External Dependencies

### Blockchain Infrastructure
- **Ethereum RPC Provider**: Infura, Alchemy, or similar
- **EntryPoint Contract**: Standard ERC-4337 EntryPoint v0.6.0+
- **EIP-7702 Support**: Requires Ethereum nodes with EIP-7702 enabled

### Smart Contracts
- **Kernel Contract**: Custom implementation of EIP-7702 delegate wallet
- **ERC-20 Tokens**: USDC, USDT (for gas payments)
- **DEX Contracts**: For token swap operations (optional use case)

### Backend Services
- **Node.js Runtime**: v16+ for async/await support
- **Database**: Redis for caching delegation status and managing locks
- **Monitoring**: Service to track Bundler balance and transaction success rate

### Development Tools
- **OpenSpec**: Spec-driven development workflow
- **Hardhat/Foundry**: For smart contract testing and deployment
- **ethers.js/viem**: For blockchain interaction
