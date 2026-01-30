# Kernel Wallet Specification

EIP-7702 delegate wallet smart contract that enables EOAs to have smart contract capabilities.

## Purpose

Enable EOAs (Externally Owned Accounts) to temporarily execute smart contract code via EIP-7702 delegation, providing account abstraction capabilities without requiring users to deploy their own contracts.

## Requirements

### Requirement: User Operation Validation
The Kernel contract SHALL validate UserOperations from the EntryPoint contract.

The system SHALL:
- Verify that only EntryPoint can call validateUserOp
- Validate the user's signature on the UserOperation hash
- Check and increment the UserOp nonce for replay protection
- Process ERC20 gas payments via paymasterAndData field
- Return 0 on successful validation

#### Scenario: Valid UserOperation validation
- **WHEN** EntryPoint calls validateUserOp with a valid UserOperation
- **AND** the signature is correctly signed by the sender
- **AND** the nonce matches the expected value
- **THEN** the function returns 0
- **AND** the user's nonce is incremented
- **AND** the paymaster receives ERC20 payment if specified

#### Scenario: Invalid signature rejection
- **WHEN** EntryPoint calls validateUserOp with an invalid signature
- **THEN** the function reverts with signature validation error
- **AND** the user's nonce is NOT incremented

#### Scenario: Wrong nonce rejection
- **WHEN** EntryPoint calls validateUserOp with an incorrect nonce
- **THEN** the function reverts with invalid nonce error
- **AND** the user's nonce is NOT incremented

#### Scenario: Unauthorized caller rejection
- **WHEN** a non-EntryPoint address calls validateUserOp
- **THEN** the function reverts with unauthorized caller error

### Requirement: Batch Execution
The Kernel contract SHALL execute multiple contract calls in a single transaction.

The system SHALL:
- Accept an array of Call objects (target, value, data)
- Execute calls sequentially in the order provided
- Require each call to succeed (revert entire batch if any fails)
- Only allow EntryPoint to call executeBatch

#### Scenario: Successful batch execution
- **WHEN** EntryPoint calls executeBatch with multiple valid calls
- **THEN** all calls are executed sequentially
- **AND** the function completes successfully

#### Scenario: Batch execution with failing call
- **WHEN** any call in the batch fails
- **THEN** the entire batch execution reverts
- **AND** no calls from the batch are executed on-chain

#### Scenario: Unauthorized batch execution attempt
- **WHEN** a non-EntryPoint address calls executeBatch
- **THEN** the function reverts with unauthorized caller error

### Requirement: Nonce Management
The Kernel contract SHALL manage UserOperation nonces for replay protection.

The system SHALL:
- Maintain a mapping of address → nonce
- Increment nonce only after successful UserOperation validation
- Provide a public getNonce function to query current nonce
- Start nonce at 0 for new addresses

#### Scenario: Querying nonce for new address
- **WHEN** getNonce is called for an address that has never used the wallet
- **THEN** the function returns 0

#### Scenario: Querying nonce after successful execution
- **WHEN** a UserOperation is successfully executed
- **AND** getNonce is called for the same address
- **THEN** the function returns the incremented nonce value

#### Scenario: Nonce increment on validation success
- **WHEN** validateUserOp completes successfully
- **THEN** the user's nonce is incremented by 1

### Requirement: ERC20 Gas Payment Processing
The Kernel contract SHALL process ERC20 token payments for gas from the user to the Bundler.

The system SHALL:
- Decode paymasterAndData field to extract token address and amount
- Transfer specified amount of ERC20 from user to Bundler address
- Only execute transfer when missingAccountFunds > 0
- Support any standard ERC20 token

#### Scenario: Successful USDC gas payment
- **WHEN** validateUserOp is called with missingAccountFunds > 0
- **AND** paymasterAndData contains [USDC_ADDRESS, 10 USDC]
- **THEN** 10 USDC is transferred from user to Bundler
- **AND** the function returns 0 (validation success)

#### Scenario: Payment when missingAccountFunds is zero
- **WHEN** validateUserOp is called with missingAccountFunds = 0
- **THEN** no ERC20 transfer is executed
- **AND** validation proceeds normally

#### Scenario: Insufficient token balance rejection
- **WHEN** user has insufficient ERC20 balance for the payment
- **THEN** the transfer fails and reverts
- **AND** the UserOperation validation fails

#### Scenario: Payment to Bundler address
- **WHEN** ERC20 payment is processed
- **THEN** tokens are transferred to msg.sender (which is the Bundler/EntryPoint)
