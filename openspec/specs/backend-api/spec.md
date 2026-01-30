# Backend API Specification

RESTful API endpoints for EIP-7702 account abstraction system, handling UserOperation execution, delegation management, and system configuration.

## Purpose

Provide a fast, secure, and well-documented RESTful API that serves as the bridge between frontend applications and blockchain infrastructure, abstracting complexity while maintaining flexibility.

## Requirements

### Requirement: UserOperation Execution Endpoint
The system SHALL provide an endpoint to execute UserOperations.

The endpoint SHALL:
- Accept PackedUserOperation and optional authorization
- Validate UserOperation signature and structure
- Check delegation status and include authorization if needed
- Relay transaction via Bundler
- Return transaction hash and status
- Handle errors gracefully with clear messages

#### Scenario: Successful execution for delegated user
- **WHEN** POST /api/execute is called with valid UserOperation
- **AND** user is already delegated to Kernel
- **AND** no authorization is provided (not needed)
- **THEN** API returns success with transaction hash
- **AND** status is "submitted"
- **AND** transaction is relayed to blockchain

#### Scenario: Successful execution for first-time user
- **WHEN** POST /api/execute is called with UserOperation and authorization
- **AND** user is not yet delegated
- **AND** valid authorization is provided
- **THEN** API returns success with transaction hash
- **AND** transaction includes authorizationList
- **AND** delegation and execution complete atomically

#### Scenario: Rejecting invalid signature
- **WHEN** POST /api/execute is called with invalid UserOp signature
- **THEN** API returns 400 error
- **AND** error message: "Invalid UserOperation signature"
- **AND** transaction is not relayed

#### Scenario: Rejecting missing authorization for first-time user
- **WHEN** POST /api/execute is called for undelegated user
- **AND** no authorization is provided
- **THEN** API returns 400 error
- **AND** error message: "Authorization required for first-time users"
- **AND** suggests calling delegation-status endpoint first

### Requirement: UserOperation Simulation Endpoint
The system SHALL provide an endpoint to simulate UserOperations before submission.

The endpoint SHALL:
- Accept PackedUserOperation for simulation
- Call EntryPoint.simulateValidation
- Return gas estimates and validation results
- Catch and return any validation errors
- Provide detailed results for UI preview

#### Scenario: Successful simulation
- **WHEN** POST /api/simulate is called with valid UserOperation
- **THEN** API returns success with simulation results
- **AND** results include: gas limits, gas fees, estimated cost
- **AND** no errors are reported
- **AND** UserOperation can be safely submitted

#### Scenario: Simulation catches insufficient gas
- **WHEN** POST /api/simulate is called with low gas limit
- **THEN** API returns success with warning
- **AND** results indicate gas limit too low
- **AND** suggests higher gas limit
- **AND** estimated gas cost is provided

#### Scenario: Simulation catches contract error
- **WHEN** POST /api/simulate is called with invalid callData
- **THEN** API returns error with details
- **AND** error message includes contract revert reason
- **AND** specifies which operation failed
- **AND** UserOperation cannot be submitted as-is

#### Scenario: Simulation with ERC20 payment
- **WHEN** POST /api/simulate is called with paymasterAndData
- **THEN** API includes ERC20 payment cost in results
- **AND** provides token amount needed
- **AND** validates user has sufficient token balance

### Requirement: Delegation Status Query Endpoint
The system SHALL provide an endpoint to query delegation status for an address.

The endpoint SHALL:
- Accept user address as parameter
- Check on-chain code to determine delegation status
- Return chain nonce and UserOp nonce
- Include cache metadata (if cached)
- Support efficient responses via caching

#### Scenario: Querying undelegated user
- **WHEN** GET /api/delegation-status/:address is called for new user
- **AND** address has no code deployed
- **THEN** API returns delegated: false
- **AND** includes current chain nonce
- **AND** includes UserOp nonce (0 for new users)
- **AND** response time is fast (cached if recently checked)

#### Scenario: Querying delegated user
- **WHEN** GET /api/delegation-status/:address is called for delegated user
- **AND** address has Kernel code
- **THEN** API returns delegated: true
- **AND** includes current nonces
- **AND** includes kernel contract address
- **AND** response confirms user can execute UserOperations

#### Scenario: Querying with cached data
- **WHEN** delegation status was queried within cache TTL
- **AND** same address is queried again
- **THEN** API returns cached data
- **AND** includes metadata: { cached: true, age: 12s }
- **AND** no on-chain query is made

#### Scenario: Querying invalid address format
- **WHEN** GET /api/delegation-status/:address is called with invalid address
- **THEN** API returns 400 error
- **AND** error message: "Invalid Ethereum address format"
- **AND** no blockchain query is attempted

### Requirement: Nonce Query Endpoint
The system SHALL provide an endpoint to query UserOp nonce for an address.

The endpoint SHALL:
- Accept user address as parameter
- Fetch nonce from Kernel.getNonce contract call
- Return current nonce value
- Handle errors gracefully (e.g., if Kernel not deployed)

#### Scenario: Querying nonce for existing user
- **WHEN** GET /api/nonce/:address is called for active user
- **THEN** API returns current nonce (e.g., 5)
- **AND** response is fast (contract call)
- **AND** nonce can be used for next UserOperation

#### Scenario: Querying nonce for new user
- **WHEN** GET /api/nonce/:address is called for new user
- **AND** user has never executed UserOperation
- **THEN** API returns nonce: 0
- **AND** indicates first UserOperation will use nonce 0

#### Scenario: Querying nonce with concurrency
- **WHEN** multiple requests query nonce for same address
- **AND** requests are nearly simultaneous
- **THEN** API returns consistent nonce values
- **AND** handles race conditions via caching

#### Scenario: Querying nonce for undelegated user
- **WHEN** GET /api/nonce/:address is called for undelegated user
- **THEN** API returns error or default nonce
- **AND** suggests delegating first
- **OR** returns 0 (nonce after delegation will start at 0)

### Requirement: Contract Configuration Endpoint
The system SHALL provide an endpoint to retrieve system contract addresses.

The endpoint SHALL:
- Return Kernel contract address
- Return EntryPoint contract address
- Return chain ID
- Include configuration metadata (version, deployed at)
- Support multiple chains (if configured)

#### Scenario: Querying contract configuration
- **WHEN** GET /api/kernel/address is called
- **THEN** API returns contract addresses
- **AND** includes kernelAddress, entryPointAddress, chainId
- **AND** response format is JSON
- **AND** frontend can use these addresses for building UserOps

#### Scenario: Querying for specific chain
- **WHEN** GET /api/kernel/address?chainId=1 is called
- **THEN** API returns addresses for Ethereum mainnet
- **AND** chain-specific contracts are returned
- **AND** if chain not supported, returns 404

#### Scenario: Configuration includes version info
- **WHEN** GET /api/kernel/address is called
- **THEN** API includes version field (e.g., "1.0.0")
- **AND** includes deployment timestamp
- **AND** frontend can check compatibility

#### Scenario: Configuration cache invalidation
- **WHEN** contracts are upgraded to new addresses
- **THEN** API immediately returns new addresses
- **AND** no cache delay (configuration rarely changes)

### Requirement: Transaction Status Query Endpoint
The system SHALL provide an endpoint to query transaction status.

The endpoint SHALL:
- Accept transaction hash as parameter
- Query blockchain for transaction status
- Return current status (pending, confirmed, failed)
- Include transaction receipt details when confirmed
- Support polling for long-running transactions

#### Scenario: Querying pending transaction
- **WHEN** GET /api/status/:txHash is called for pending transaction
- **THEN** API returns status: "pending"
- **AND** includes block number (null until mined)
- **AND** includes confirmations: 0
- **AND** frontend can continue polling

#### Scenario: Querying confirmed transaction
- **WHEN** GET /api/status/:txHash is called for confirmed transaction
- **THEN** API returns status: "confirmed"
- **AND** includes block number (e.g., 18500000)
- **AND** includes confirmations count
- **AND** includes gas used
- **AND** includes transaction receipt

#### Scenario: Querying failed transaction
- **WHEN** GET /api/status/:txHash is called for failed transaction
- **THEN** API returns status: "failed"
- **AND** includes error reason (if available)
- **AND** includes revert message
- **AND** frontend can display specific error to user

#### Scenario: Querying non-existent transaction
- **WHEN** GET /api/status/:txHash is called with invalid hash
- **THEN** API returns 404 error
- **AND** error message: "Transaction not found"
- **AND** suggests checking transaction hash

### Requirement: Gas Estimation Endpoint
The system SHALL provide an endpoint to estimate gas costs for UserOperations.

The endpoint SHALL:
- Accept UserOperation and optional ERC20 token address
- Return gas cost in ETH and specified ERC20 token
- Include exchange rate information
- Apply safety buffer for gas price volatility
- Provide detailed breakdown by gas phase

#### Scenario: Estimating gas for simple transfer
- **WHEN** POST /api/estimate-gas is called with simple UserOp
- **AND** token address is USDC
- **THEN** API returns estimated gas cost
- **AND** includes ETH cost (e.g., 0.001 ETH)
- **AND** includes USDC cost (e.g., 2.5 USDC)
- **AND** includes exchange rate used

#### Scenario: Estimating gas for batch transaction
- **WHEN** POST /api/estimate-gas is called with batch UserOp (5 operations)
- **THEN** API returns estimated cost for all operations
- **AND** cost reflects batch efficiency (single validation)
- **AND** provides comparison vs. separate transactions
- **AND** shows savings from batching

#### Scenario: Estimating gas with different tokens
- **WHEN** POST /api/estimate-gas is called with USDT token
- **THEN** API returns cost in USDT
- **AND** uses current USDT/ETH exchange rate
- **AND** includes token-specific details (decimals)

#### Scenario: Estimation with safety buffer
- **WHEN** POST /api/estimate-gas is called during high gas volatility
- **THEN** API applies higher safety buffer (e.g., 20%)
- **AND** indicates buffer percentage used
- **AND** shows base estimate vs. buffered estimate

### Requirement: API Error Handling
The system SHALL provide consistent error responses across all endpoints.

The system SHALL:
- Use standard HTTP status codes (400, 404, 500)
- Include error type in response
- Provide user-friendly error messages
- Include technical details for debugging
- Support error codes for programmatic handling

#### Scenario: Validation error (400)
- **WHEN** request fails validation
- **THEN** API returns 400 status
- **AND** error response includes type: "validation_error"
- **AND** message describes the issue
- **AND** details field shows specific validation failure

#### Scenario: Not found error (404)
- **WHEN** requested resource doesn't exist
- **THEN** API returns 404 status
- **AND** error response includes type: "not_found"
- **AND** message describes missing resource

#### Scenario: Internal server error (500)
- **WHEN** unexpected error occurs
- **THEN** API returns 500 status
- **AND** error response includes type: "internal_error"
- **AND** message is generic (don't expose internals)
- **AND** error is logged for monitoring

#### Scenario: Rate limit error (429)
- **WHEN** client exceeds rate limits
- **THEN** API returns 429 status
- **AND** error response includes type: "rate_limit_exceeded"
- **AND** includes retry-after header
- **AND** message suggests waiting before retrying

### Requirement: API Authentication and Rate Limiting
The system SHALL implement authentication and rate limiting for API security.

The system SHALL:
- Support API key authentication for public endpoints
- Implement rate limiting per API key or IP address
- Track usage metrics for monitoring
- Allow elevated limits for trusted partners

#### Scenario: Valid API key authentication
- **WHEN** request includes valid API key
- **THEN** API processes request normally
- **AND** rate limit is applied based on API key tier
- **AND** usage is tracked against API key

#### Scenario: Invalid API key authentication
- **WHEN** request includes invalid API key
- **THEN** API returns 401 status
- **AND** error message: "Invalid API key"
- **AND** request is not processed

#### Scenario: Rate limit exceeded
- **WHEN** client exceeds rate limit (e.g., 100 req/min)
- **THEN** API returns 429 status
- **AND** includes retry-after header (e.g., 60 seconds)
- **AND** error message includes current usage and limit

#### Scenario: Trusted partner with elevated limits
- **WHEN** trusted partner makes requests
- **AND** their API key has elevated rate limit
- **THEN** API allows higher request rate (e.g., 1000 req/min)
- **AND** usage is tracked separately

### Requirement: API Response Caching
The system SHALL cache frequently requested data to improve performance.

The system SHALL:
- Cache delegation status responses (TTL: 5 minutes)
- Cache nonce responses (TTL: 30 seconds)
- Cache configuration responses (TTL: 1 hour)
- Include cache metadata in responses
- Invalidate cache on relevant changes

#### Scenario: Cached delegation status response
- **WHEN** delegation status is queried
- **AND** response was cached within TTL
- **THEN** API returns cached data
- **AND** includes header: X-Cache: HIT
- **AND** includes metadata: { cached: true, age: 45s }
- **AND** response time is significantly faster

#### Scenario: Cache miss (fresh query)
- **WHEN** delegation status is queried
- **AND** cache is expired or empty
- **THEN** API fetches fresh data from blockchain
- **AND** stores in cache with TTL
- **AND** returns with header: X-Cache: MISS
- **AND** includes metadata: { cached: false }

#### Scenario: Cache invalidation after delegation
- **WHEN** user successfully delegates (UserOp executes)
- **THEN** backend invalidates delegation cache
- **AND** next query returns fresh data
- **AND** cache shows delegated: true

#### Scenario: Configuration cache (long TTL)
- **WHEN** contract addresses are queried
- **THEN** API returns cached data (if recently cached)
- **AND** cache TTL is 1 hour (addresses rarely change)
- **AND** reduces RPC calls significantly

### Requirement: API Documentation and Schema
The system SHALL provide comprehensive API documentation and schema definitions.

The system SHALL:
- Include OpenAPI/Swagger documentation
- Provide JSON schema for all request/response bodies
- Document all error codes and responses
- Include example requests and responses
- Keep documentation in sync with implementation

#### Scenario: Accessing API documentation
- **WHEN** GET /api/docs is called
- **THEN** API returns OpenAPI documentation
- **AND** includes all endpoints with descriptions
- **AND** includes request/response schemas
- **AND** includes example calls

#### Scenario: Validating request against schema
- **WHEN** POST /api/execute is called
- **AND** request body matches schema
- **THEN** API accepts and processes request
- **AND** validation passes

#### Scenario: Schema validation failure
- **WHEN** POST /api/execute is called
- **AND** request body doesn't match schema
- **THEN** API returns 400 error
- **AND** error message: "Invalid request schema"
- **AND** details show which fields are invalid

#### Scenario: Example in documentation
- **WHEN** API documentation is reviewed
- **THEN** each endpoint has example request
- **AND** each endpoint has example response
- **AND** examples cover success and error cases
