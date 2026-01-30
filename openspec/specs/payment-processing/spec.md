# Payment Processing Specification

Handles ERC20 token payments for gas, allowing users to pay transaction fees with stablecoins instead of ETH.

## Purpose

Eliminate the barrier of holding ETH for gas by enabling users to pay transaction fees with ERC20 tokens (USDC, USDT), dramatically improving onboarding experience and reducing friction for new users.

## Requirements

### Requirement: Gas Estimation
The system SHALL estimate the gas cost in ETH and convert to ERC20 token amount.

The system SHALL:
- Simulate UserOperation validation to estimate gas
- Convert ETH gas cost to ERC20 token using current exchange rate
- Apply a safety buffer (e.g., 10-20%) to account for gas price fluctuations
- Return the estimated ERC20 amount needed

#### Scenario: Estimating gas for simple transfer
- **WHEN** estimating gas for a simple token transfer UserOp
- **THEN** the system returns estimated gas in wei
- **AND** converts wei to ERC20 token amount using current rate
- **AND** includes a safety buffer for gas price changes
- **AND** the token amount is sufficient to cover the gas cost

#### Scenario: Estimating gas for batch transaction
- **WHEN** estimating gas for a batch UserOp with multiple operations
- **THEN** the system estimates total gas for all operations
- **AND** converts total gas to ERC20 token amount
- **AND** accounts for higher gas usage due to batching

#### Scenario: Gas estimation with high gas price volatility
- **WHEN** gas prices are volatile (rapidly changing)
- **THEN** the system applies a higher safety buffer (e.g., 20-30%)
- **AND** returns a conservative estimate to avoid underpayment

#### Scenario: Gas estimation failure
- **WHEN** gas estimation fails (simulation reverts)
- **THEN** the system returns an error with details
- **AND** suggests checking UserOperation parameters
- **AND** provides guidance for fixing the issue

### Requirement: Exchange Rate Fetching
The system SHALL fetch current exchange rates between ETH and ERC20 tokens.

The system SHALL:
- Query external price feeds for ETH/ERC20 rates
- Cache rates with short TTL (e.g., 30-60 seconds)
- Handle API failures gracefully with fallback rates
- Support multiple ERC20 tokens (USDC, USDT, etc.)

#### Scenario: Fetching USDC/ETH exchange rate
- **WHEN** fetching USDC/ETH exchange rate
- **THEN** the system queries a reliable price feed (e.g., CoinGecko, Uniswap)
- **AND** returns the current rate (e.g., 1 ETH = 2500 USDC)
- **AND** caches the rate for 30 seconds

#### Scenario: Using cached exchange rate
- **WHEN** exchange rate was fetched within TTL
- **AND** gas estimation needs the rate
- **THEN** the system uses the cached rate
- **AND** does not make a new API call

#### Scenario: Exchange rate API failure
- **WHEN** the primary price feed API fails
- **THEN** the system falls back to a secondary price feed
- **OR** uses the last known good rate with a warning
- **AND** logs the failure for monitoring

#### Scenario: Fetching rates for multiple tokens
- **WHEN** system supports multiple ERC20 tokens
- **AND** user specifies payment token
- **THEN** the system fetches rate for the specific token
- **AND** supports USDC, USDT, and other approved tokens

### Requirement: PaymasterAndData Encoding
The system SHALL encode ERC20 payment information into the paymasterAndData field.

The system SHALL:
- Encode token address and payment amount using ABI encoding
- Place encoded data in UserOperation's paymasterAndData field
- Follow the format expected by Kernel contract
- Support variable-length encoding for different tokens

#### Scenario: Encoding USDC payment
- **WHEN** encoding payment information for USDC
- **THEN** paymasterAndData = abi.encode([USDC_ADDRESS, amount])
- **AND** the encoded data can be decoded by Kernel contract
- **AND** includes the exact USDC amount to transfer

#### Scenario: Encoding zero payment amount
- **WHEN** gas is prepaid or sponsored (zero ERC20 payment)
- **THEN** paymasterAndData = abi.encode([TOKEN_ADDRESS, 0])
- **AND** Kernel contract skips transfer for zero amounts
- **AND** validation proceeds normally

#### Scenario: Encoding multiple token payments
- **WHEN** supporting payment with multiple tokens (future feature)
- **THEN** paymasterAndData includes array of [token, amount] pairs
- **AND** Kernel contract processes each token transfer
- **AND** transfers are executed in order

#### Scenario: Invalid paymasterAndData decoding
- **WHEN** Kernel contract fails to decode paymasterAndData
- **THEN** the UserOperation validation fails
- **AND** the transaction reverts with decoding error
- **AND** user receives clear error message

### Requirement: User Balance Validation
The system SHALL validate that user has sufficient ERC20 balance to pay for gas.

The system SHALL:
- Check user's ERC20 token balance before building UserOperation
- Include allowance check (user must approve Kernel to spend)
- Reject UserOperations with insufficient balance
- Provide clear error messages with required amount

#### Scenario: User has sufficient balance and allowance
- **WHEN** user's USDC balance >= required amount
- **AND** user has approved Kernel to spend USDC
- **THEN** the UserOperation can proceed
- **AND** payment will be processed successfully

#### Scenario: User has insufficient balance
- **WHEN** user's USDC balance < required amount
- **THEN** the system rejects the UserOperation
- **AND** returns error: "Insufficient USDC balance"
- **AND** specifies the required amount and current balance

#### Scenario: User has insufficient allowance
- **WHEN** user has sufficient USDC balance
- **AND** user has not approved Kernel to spend USDC
- **THEN** the system prompts user to approve allowance
- **OR** includes approval in the UserOp batch (if supported)
- **AND** UserOperation cannot proceed until approved

#### Scenario: Validating balance for batch transaction
- **WHEN** batch transaction includes token transfers
- **AND** gas payment also requires tokens
- **THEN** the system checks balance for gas + transfer amounts
- **AND** ensures total is within user's balance

### Requirement: Bundler Reimbursement
The system SHALL ensure the Bundler receives ERC20 payment after transaction execution.

The system SHALL:
- Execute ERC20 transfer from user to Bundler during validation
- Transfer the exact amount needed to cover gas cost
- Handle transfer failures gracefully (revert transaction)
- Track Bundler's token balance for monitoring

#### Scenario: Successful Bundler reimbursement
- **WHEN** UserOperation executes successfully
- **AND** gas was paid with USDC
- **THEN** 10 USDC (or estimated amount) is transferred to Bundler
- **AND** Bundler's USDC balance increases
- **AND** transaction is marked as paid

#### Scenario: Bundler reimbursement transfer failure
- **WHEN** ERC20 transfer to Bundler fails
- **AND** UserOperation validation was called with missingAccountFunds > 0
- **THEN** the transaction reverts
- **AND** Bundler does not receive payment
- **AND** user is not charged (atomic execution)

#### Scenario: Bundler receives exact gas cost
- **WHEN** actual gas cost differs slightly from estimate
- **THEN** Bundler receives exact amount calculated by EntryPoint
- **AND** surplus tokens remain with user (if overpaid)
- **AND** Bundler is fully compensated (if underpaid estimate covers it)

#### Scenario: Monitoring Bundler token balance
- **WHEN** Bundler receives multiple ERC20 payments
- **THEN** system tracks cumulative token balance
- **AND** alerts when balance reaches threshold
- **AND** can trigger automatic token-to-ETH swaps

### Requirement: Token Approval Management
The system SHALL handle ERC20 token approvals for the Kernel contract.

The system SHALL:
- Check if user has approved Kernel to spend tokens
- Request user approval if allowance is insufficient
- Use infinite approval (or large amount) for better UX
- Support approval as part of batch transaction (first-time)

#### Scenario: Checking existing approval
- **WHEN** user attempts to pay with USDC
- **THEN** the system checks allowance(address, Kernel)
- **AND** determines if approval is needed
- **AND** proceeds or requests approval based on result

#### Scenario: Requesting user approval for first time
- **WHEN** user has not approved Kernel to spend USDC
- **THEN** the system prompts user to sign approval transaction
- **AND** user approves unlimited amount (type(uint256).max)
- **AND** approval is completed before UserOperation

#### Scenario: Including approval in batch transaction
- **WHEN** user needs both approval and gas payment
- **THEN** approval can be included in UserOp batch calls
- **AND** executes approval before the actual operation
- **AND** single transaction for both approval and execution

#### Scenario: Revoked approval handling
- **WHEN** user has previously approved but now revoked
- **THEN** the system detects allowance = 0
- **AND** requests new approval before proceeding
- **AND** user experience is seamless (prompt to re-approve)

### Requirement: Payment Error Handling
The system SHALL handle payment-related errors gracefully and provide clear feedback.

The system SHALL:
- Return descriptive error messages for payment failures
- Distinguish between balance, approval, and transfer errors
- Provide actionable guidance for resolving issues
- Log errors for monitoring and debugging

#### Scenario: Clear error for insufficient balance
- **WHEN** payment fails due to insufficient balance
- **THEN** error message: "Insufficient USDC balance. Required: 10 USDC, Current: 5 USDC"
- **AND** suggests adding funds or reducing gas usage

#### Scenario: Clear error for missing approval
- **WHEN** payment fails due to missing approval
- **THEN** error message: "Please approve USDC spending for Kernel contract"
- **AND** provides button or link to approve
- **AND** explains why approval is needed

#### Scenario: Clear error for transfer failure
- **WHEN** ERC20 transfer fails during validation
- **THEN** error message: "Token transfer failed. Please check token contract and try again"
- **AND** logs technical details for debugging

#### Scenario: Retry guidance after payment error
- **WHEN** payment fails with recoverable error
- **THEN** error message includes retry instructions
- **AND** suggests fixing the issue and resubmitting
- **AND** may automatically retry if appropriate
