# Delegation Management Specification

Manages EIP-7702 delegation status and authorization for EOAs to use Kernel wallet.

## Purpose

Enable seamless onboarding of EOA users by managing EIP-7702 delegation flow, from checking authorization status to building authorization transactions, ensuring users can start using the wallet with minimal friction.

## Requirements

### Requirement: Delegation Status Query
The system SHALL provide an API to query whether an EOA has delegated to the Kernel contract.

The system SHALL:
- Check the on-chain code of the user's address
- Return delegated status based on whether code exists (code != "0x")
- Provide both chain nonce and UserOp nonce
- Support efficient caching to avoid unnecessary RPC calls

#### Scenario: Querying undelegated user
- **WHEN** querying delegation status for a new EOA
- **AND** the address has no code deployed
- **THEN** the API returns delegated: false
- **AND** the response includes current chain nonce
- **AND** the response includes current UserOp nonce (0 for new users)

#### Scenario: Querying delegated user
- **WHEN** querying delegation status for an EOA that has delegated
- **AND** the address has code deployed (pointing to Kernel)
- **THEN** the API returns delegated: true
- **AND** the response includes current chain nonce
- **AND** the response includes current UserOp nonce

#### Scenario: Querying delegation with cached data
- **WHEN** delegation status was queried within the cache TTL period
- **THEN** the API returns cached data
- **AND** no on-chain query is made
- **AND** the response time is significantly faster

### Requirement: Authorization Message Construction
The system SHALL construct valid EIP-7702 authorization messages for first-time delegation.

The system SHALL:
- Use the user's current on-chain nonce
- Include the Kernel contract address
- Use the correct chain ID
- Generate the correct message hash for signing
- Return the structured authorization object

#### Scenario: Constructing authorization for new user
- **WHEN** constructing authorization for an undelegated user
- **THEN** the authorization includes: chainId, Kernel address, nonce (user's chain nonce)
- **AND** the authorization hash is correctly formatted per EIP-7702
- **AND** the user can sign this authorization with their EOA

#### Scenario: Constructing authorization after previous transactions
- **WHEN** constructing authorization for a user who has made regular transactions
- **THEN** the authorization uses the latest chain nonce (not 0)
- **AND** the nonce accounts for all previous non-delegation transactions

#### Scenario: Constructing authorization for specific chain
- **WHEN** the system operates on a specific chain (e.g., Ethereum mainnet)
- **THEN** the authorization includes the correct chain ID (1 for mainnet)
- **AND** the Kernel address corresponds to that chain

### Requirement: Authorization Signature Verification
The system SHALL verify that authorization signatures are valid and match the user's EOA.

The system SHALL:
- Recover the signer address from the authorization signature
- Verify that signer matches the user's EOA address
- Reject authorizations with invalid signatures
- Ensure authorization nonce matches the user's current chain nonce

#### Scenario: Verifying valid authorization signature
- **WHEN** an authorization signature is provided
- **AND** the signature is correctly signed by the user's EOA
- **AND** the nonce matches the user's current chain nonce
- **THEN** the verification passes
- **AND** the authorization can be included in the transaction

#### Scenario: Rejecting invalid authorization signature
- **WHEN** an authorization signature is provided
- **AND** the signature was not signed by the user's EOA
- **THEN** the verification fails
- **AND** the request is rejected with an error

#### Scenario: Rejecting stale authorization nonce
- **WHEN** an authorization is provided with an outdated nonce
- **AND** the user has since made other transactions
- **THEN** the verification fails
- **AND** the system requests a fresh authorization with updated nonce

#### Scenario: Rejecting authorization for already delegated user
- **WHEN** an authorization is provided for a user already delegated
- **THEN** the system ignores the authorization
- **AND** the transaction proceeds without authorizationList

### Requirement: Delegation State Caching
The system SHALL cache delegation status to improve performance and reduce RPC calls.

The system SHALL:
- Store delegation status with a TTL (Time To Live)
- Invalidate cache when delegation status changes on-chain
- Use Redis or similar caching mechanism
- Provide fallback to on-chain query if cache is unavailable

#### Scenario: Caching successful delegation query
- **WHEN** delegation status is queried on-chain
- **THEN** the result is cached with TTL
- **AND** subsequent queries use cached data
- **AND** no RPC call is made within TTL

#### Scenario: Cache invalidation after delegation
- **WHEN** a user successfully delegates (UserOp executes)
- **THEN** the cached status is invalidated
- **AND** the next query fetches fresh on-chain data
- **AND** the cache is updated with delegated: true

#### Scenario: Cache miss (TTL expired)
- **WHEN** a cached entry expires (TTL reached)
- **AND** delegation status is queried again
- **THEN** the system fetches fresh on-chain data
- **AND** the cache is updated with new data
- **AND** new TTL is set

#### Scenario: Cache fallback on error
- **WHEN** the caching service is unavailable
- **THEN** the system falls back to direct on-chain query
- **AND** the request still succeeds (with higher latency)
- **AND** an error is logged for monitoring

### Requirement: Authorization Transaction Building
The system SHALL build type 0x04 transactions that include authorizationList when needed.

The system SHALL:
- Check if user needs authorization (delegated: false)
- Include authorizationList in type 0x04 transaction only for first-time delegation
- Build standard transaction (without authorizationList) for delegated users
- Ensure transaction can be sent by Bundler wallet

#### Scenario: Building transaction for first-time user
- **WHEN** building transaction for undelegated user
- **AND** valid authorization is provided
- **THEN** the transaction type is 0x04
- **AND** the transaction includes authorizationList with the authorization
- **AND** the transaction data calls EntryPoint.handleOps

#### Scenario: Building transaction for delegated user
- **WHEN** building transaction for already delegated user
- **THEN** the transaction type is 0x04
- **AND** the transaction does NOT include authorizationList
- **AND** the transaction data calls EntryPoint.handleOps
- **AND** execution proceeds normally

#### Scenario: Building transaction without authorization (first-time user)
- **WHEN** building transaction for undelegated user
- **AND** no authorization is provided
- **THEN** the system returns an error
- **AND** the transaction is not built
- **AND** the user is prompted to provide authorization

### Requirement: Delegation Expiry and Revocation
The system SHALL support delegation revocation when users want to stop using the wallet.

The system SHALL:
- Allow users to revoke delegation by sending transaction to set code to empty
- Detect when delegation has been revoked on-chain
- Update cache to reflect revoked status
- Require fresh authorization for future use after revocation

#### Scenario: Revoking delegation
- **WHEN** a user sends a type 0x04 transaction with empty address
- **AND** the transaction is confirmed on-chain
- **THEN** the user's EOA code is cleared
- **AND** the delegation status returns to undelegated
- **AND** the user can no longer execute UserOperations

#### Scenario: Detecting revoked delegation on-chain
- **WHEN** querying delegation status after user revoked
- **AND** the address code is "0x" (empty)
- **THEN** the system returns delegated: false
- **AND** the cache is updated
- **AND** future UserOperations will require new authorization

#### Scenario: Attempting UserOperation after revocation
- **WHEN** a revoked user tries to execute a UserOperation
- **THEN** the system checks delegation status
- **AND** finds delegated: false
- **AND** requests new authorization before proceeding
