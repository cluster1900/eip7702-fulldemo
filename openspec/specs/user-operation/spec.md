# User Operation Specification

Handles UserOperation construction, signature, and lifecycle management for account abstraction transactions.

## Purpose

Provide a complete lifecycle management system for ERC-4337 UserOperations, from construction and gas estimation to signing, submission, and status tracking, enabling seamless execution of complex batch transactions.

## Requirements

### Requirement: UserOperation Structure
The system SHALL construct valid PackedUserOperation structures per ERC-4337 standard.

The system SHALL:
- Include all required fields: sender, nonce, initCode, callData, accountGasLimits, preVerificationGas, gasFees, paymasterAndData, signature
- Use correct data types and encoding for each field
- Validate UserOperation structure before submission
- Support both simple and complex callData encoding

#### Scenario: Constructing simple UserOperation
- **WHEN** constructing a UserOperation for a single token transfer
- **THEN** all required fields are populated
- **AND** sender is the user's EOA address
- **AND** nonce is fetched from Kernel contract
- **AND** callData encodes the transfer operation
- **AND** gas parameters are estimated

#### Scenario: Constructing batch UserOperation
- **WHEN** constructing a UserOperation with multiple operations
- **THEN** callData encodes executeBatch with array of calls
- **AND** each call has target, value, and data
- **AND** gas parameters account for batch operations
- **AND** the UserOperation is valid for EntryPoint

#### Scenario: Validating UserOperation structure
- **WHEN** validating a UserOperation before submission
- **THEN** all required fields are present
- **AND** field types are correct (address, uint256, bytes)
- **AND** encoded data is valid ABI encoding
- **AND** validation passes

#### Scenario: Rejecting invalid UserOperation
- **WHEN** UserOperation has missing or malformed fields
- **THEN** validation fails
- **AND** specific error is returned (e.g., "Missing signature field")
- **AND** UserOperation is not submitted

### Requirement: CallData Encoding
The system SHALL encode batch operations into UserOperation's callData field.

The system SHALL:
- Support executeBatch function with array of Call objects
- Encode each call with target address, value, and data
- Use correct ABI encoding for the batch function
- Handle both empty and complex callData

#### Scenario: Encoding single operation callData
- **WHEN** encoding a single token transfer
- **THEN** callData = executeBatch([{target, value: 0, data: transferData}])
- **AND** target is the token contract address
- **AND** data is the encoded transfer function call
- **AND** encoding follows Kernel contract ABI

#### Scenario: Encoding multiple operations callData
- **WHEN** encoding a batch of operations (swap, transfer, mint)
- **THEN** callData = executeBatch([
      {target: DEX, value: 0, data: swapData},
      {target: TOKEN, value: 0, data: transferData},
      {target: NFT, value: 0, data: mintData}
    ])
- **AND** all operations are included in the array
- **AND** operations execute in array order
- **AND** encoding is valid for Kernel contract

#### Scenario: Encoding empty callData
- **WHEN** UserOperation has no operations to execute
- **THEN** callData = executeBatch([])
- **OR** callData = 0x (empty bytes)
- **AND** Kernel contract handles gracefully

#### Scenario: Decoding callData for verification
- **WHEN** verifying callData contents before submission
- **THEN** system decodes callData to extract operations
- **AND** validates each operation's structure
- **AND** returns detailed operation list for user review

### Requirement: Nonce Management
The system SHALL manage UserOperation nonces for replay protection.

The system SHALL:
- Fetch current nonce from Kernel.getNonce(userAddress)
- Increment nonce locally for each new UserOperation
- Ensure nonce is unique and sequential
- Handle nonce conflicts gracefully

#### Scenario: Fetching current nonce for new user
- **WHEN** fetching nonce for a new user (first UserOp)
- **THEN** Kernel.getNonce returns 0
- **AND** UserOperation nonce is set to 0
- **AND** first transaction uses nonce 0

#### Scenario: Incrementing nonce for subsequent operations
- **WHEN** user submits second UserOperation
- **THEN** current nonce is fetched (e.g., 1)
- **AND** UserOperation nonce is set to 1
- **AND** nonce increments sequentially

#### Scenario: Handling nonce conflict (concurrent requests)
- **WHEN** multiple UserOperations are submitted concurrently
- **THEN** backend uses locking mechanism (Redis)
- **AND** only one request processes at a time
- **AND** nonce conflicts are prevented

#### Scenario: Resetting nonce after revocation
- **WHEN** user revokes delegation and re-delegates
- **THEN** nonce may reset to 0 (new Kernel instance)
- **AND** system detects nonce change
- **AND** fetches fresh nonce from new Kernel contract

### Requirement: Gas Parameter Estimation
The system SHALL estimate all gas parameters for UserOperation.

The system SHALL:
- Estimate callGasLimit for callData execution
- Estimate verificationGasLimit for validation phase
- Estimate preVerificationGas for overhead
- Set maxFeePerGas and maxPriorityFeePerGas based on network conditions
- Include buffer for gas price volatility

#### Scenario: Estimating gas for simple transfer
- **WHEN** estimating gas for token transfer
- **THEN** callGasLimit ~ 50,000 units
- **AND** verificationGasLimit ~ 150,000 units
- **AND** preVerificationGas ~ 50,000 units
- **AND** maxFeePerGas reflects current network gas price

#### Scenario: Estimating gas for batch transaction
- **WHEN** estimating gas for 5 operations
- **THEN** callGasLimit ~ 250,000 units (5x single op)
- **AND** verificationGasLimit remains ~150,000 (same as single)
- **AND** preVerificationGas increases slightly (~60,000)
- **AND** estimation accounts for batch overhead

#### Scenario: Estimating gas with high network congestion
- **WHEN** network is congested (gas prices spike)
- **THEN** maxFeePerGas uses higher priority fee
- **AND** maxPriorityFeePerGas includes premium for faster inclusion
- **AND** estimation may use EIP-1559 base fee * 1.5

#### Scenario: Estimating gas for ERC20 payment
- **WHEN** UserOperation includes ERC20 gas payment
- **THEN** verificationGasLimit includes ERC20 transfer cost
- **AND** callGasLimit is not affected (payment in validation phase)
- **AND** total gas reflects both validation and execution

### Requirement: UserOperation Signing
The system SHALL generate and verify UserOperation signatures.

The system SHALL:
- Generate UserOp hash per ERC-4337 standard
- Request user to sign the hash with their EOA
- Verify signature correctness before submission
- Support multiple wallet signing methods (metamask, walletconnect, etc.)

#### Scenario: Generating UserOp hash
- **WHEN** generating hash for signature
- **THEN** hash = keccak256(encodePacked(userOp fields))
- **AND** follows ERC-4337 UserOp hash specification
- **AND** includes all UserOperation fields
- **AND** hash is deterministic

#### Scenario: User signing UserOp with wallet
- **WHEN** user signs UserOp hash with MetaMask
- **THEN** wallet prompts user for signature
- **AND** user sees clear message: "Sign UserOperation for batch transaction"
- **AND** signature is returned (65 bytes: r, s, v)
- **AND** signature is added to userOp.signature field

#### Scenario: Verifying UserOp signature
- **WHEN** verifying signature before submission
- **THEN** system recovers signer address from hash and signature
- **AND** compares recovered address with userOp.sender
- **AND** passes if addresses match
- **AND** fails if addresses differ (signature invalid)

#### Scenario: Rejecting invalid signature
- **WHEN** UserOperation signature is invalid
- **THEN** verification fails immediately
- **AND** UserOperation is not submitted
- **AND** user is prompted to sign again
- **AND** clear error message is displayed

### Requirement: UserOperation Lifecycle
The system SHALL manage the complete lifecycle from construction to confirmation.

The system SHALL:
- Construct UserOperation with all parameters
- Submit UserOperation to backend API
- Track UserOperation status (pending, submitted, confirmed, failed)
- Provide updates to frontend for UI feedback
- Handle retries and failures appropriately

#### Scenario: Successful UserOperation lifecycle
- **WHEN** UserOperation is submitted successfully
- **THEN** backend accepts and validates UserOp
- **AND** Bundler sends transaction to blockchain
- **AND** status updates: pending → submitted → confirmed
- **AND** transaction hash is returned to frontend
- **AND** frontend shows success message

#### Scenario: UserOperation fails during submission
- **WHEN** UserOperation validation fails on backend
- **THEN** status updates: pending → failed
- **AND** specific error is returned (e.g., "Insufficient gas")
- **AND** frontend displays error to user
- **AND** user can fix and retry

#### Scenario: UserOperation fails on-chain
- **WHEN** UserOperation is submitted but reverts on-chain
- **THEN** status updates: pending → submitted → failed
- **AND** error reason is captured (if available)
- **AND** frontend displays failure to user
- **AND** nonce is NOT incremented (can retry)

#### Scenario: UserOperation confirmed after delay
- **WHEN** UserOperation is submitted to mempool
- **AND** confirmation takes longer than usual (network congestion)
- **THEN** status remains "submitted" with progress indicator
- **AND** frontend shows "Waiting for confirmation..."
- **AND** system polls for confirmation status
- **AND** eventually updates to "confirmed" when mined

### Requirement: UserOperation Simulation
The system SHALL simulate UserOperation execution before submission.

The system SHALL:
- Call EntryPoint.simulateValidation to check UserOp validity
- Verify gas estimates are accurate
- Catch errors before actual submission
- Return simulation results to frontend for preview

#### Scenario: Successful UserOperation simulation
- **WHEN** simulating UserOperation with valid parameters
- **THEN** EntryPoint.simulateValidation returns success
- **AND** returnInfo contains gas estimates
- **AND** no errors are returned
- **AND** UserOperation can be safely submitted

#### Scenario: Simulation catches insufficient gas
- **WHEN** simulating UserOperation with low gas limit
- **THEN** simulateValidation returns out-of-gas error
- **AND** system suggests higher gas limit
- **AND** frontend prompts user to increase gas
- **AND** UserOperation is not submitted yet

#### Scenario: Simulation catches contract call failure
- **WHEN** simulating UserOperation with invalid callData
- **THEN** simulateValidation reverts with contract error
- **AND** system catches and returns specific error message
- **AND** frontend displays error (e.g., "Token transfer would fail")
- **AND** user can fix callData before submitting

#### Scenario: Simulation gas estimate differs from initial
- **WHEN** simulated gas estimate is higher than initial
- **THEN** system updates UserOperation with accurate estimate
- **AND** user is informed of the change
- **AND** UserOperation proceeds with correct gas
- **AND** cost estimate is updated in UI

### Requirement: Batch Operation Validation
The system SHALL validate each operation in the batch before submission.

The system SHALL:
- Validate each operation's target address exists
- Validate operation data is correctly encoded
- Check user has sufficient balance for token transfers
- Verify NFT ownership for mint/transfer operations
- Reject UserOperation if any operation is invalid

#### Scenario: Validating batch with all valid operations
- **WHEN** batch contains 5 valid operations
- **THEN** each operation is checked individually
- **AND** all operations pass validation
- **AND** UserOperation is submitted
- **AND** all operations execute atomically

#### Scenario: Batch contains one invalid operation
- **WHEN** batch has 4 valid operations + 1 invalid (insufficient balance)
- **THEN** validation catches the invalid operation
- **AND** UserOperation is rejected
- **AND** user is informed which operation is invalid
- **AND** user can fix or remove invalid operation

#### Scenario: Validating NFT mint operation
- **WHEN** batch includes NFT mint
- **THEN** system checks if user meets mint requirements
- **AND** verifies contract is not paused
- **AND** checks if user has already minted (if limited)
- **AND** passes validation if all conditions met

#### Scenario: Validating token swap operation
- **WHEN** batch includes DEX swap
- **THEN** system checks user has input tokens
- **AND** verifies swap amount is reasonable
- **AND** checks if DEX has sufficient liquidity
- **AND** passes validation if swap is possible

### Requirement: UserOperation Error Recovery
The system SHALL handle and recover from UserOperation errors.

The system SHALL:
- Categorize errors (retriable vs. non-retriable)
- Implement retry logic for retriable errors
- Provide clear error messages for user
- Suggest specific fixes based on error type

#### Scenario: Retrying after nonce conflict
- **WHEN** UserOperation fails due to nonce conflict (race condition)
- **THEN** system fetches fresh nonce
- **AND** rebuilds UserOperation with correct nonce
- **AND** resubmits automatically (with user permission)
- **AND** retry succeeds

#### Scenario: Non-retriable error (insufficient balance)
- **WHEN** UserOperation fails due to insufficient token balance
- **THEN** system categorizes as non-retriable
- **AND** displays clear error: "Insufficient USDC balance"
- **AND** suggests adding funds
- **AND** does not auto-retry

#### Scenario: Retrying after network congestion
- **WHEN** UserOperation fails due to network congestion (gas too low)
- **THEN** system increases maxFeePerGas by 10%
- **AND** resubmits with higher gas price
- **AND** user is informed of increased cost
- **AND** retry may succeed

#### Scenario: Clear error for contract revert
- **WHEN** UserOperation reverts on-chain
- **THEN** system decodes revert reason (if available)
- **AND** displays user-friendly error message
- **AND** provides context (which operation failed)
- **AND** suggests how to fix (e.g., "Approve token spending")
