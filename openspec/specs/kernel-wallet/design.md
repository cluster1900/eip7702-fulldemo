# Kernel Wallet Design

## Context
The Kernel contract implements EIP-7702 delegate wallet functionality, allowing EOAs to temporarily execute smart contract code. This is the foundation of the account abstraction system.

**Constraints**:
- Must be compatible with ERC-4337 EntryPoint v0.6.0+
- Must support EIP-7702 delegation mechanism
- Gas efficiency is critical (users pay gas in ERC20)
- Security is paramount (handles user funds and signatures)

## Goals / Non-Goals

**Goals**:
- Enable EOAs to execute batch transactions without holding ETH
- Support ERC20 gas payments with minimal overhead
- Provide secure signature validation and replay protection
- Maintain simplicity (avoid unnecessary complexity)

**Non-Goals**:
- Social recovery or multi-sig features (can be added later)
- Complex gas optimization beyond basic ERC20 payment
- Support for multiple delegate contracts per EOA (single Kernel only)
- On-chain governance or upgrade mechanisms

## Decisions

### Decision 1: Single Kernel Contract for All Users
**What**: Deploy one immutable Kernel contract that all users delegate to via EIP-7702.

**Why**:
- Users don't need to deploy their own contract
- Code is auditable once for all users
- Lower gas costs (no deployment per user)
- Simpler architecture

**Alternatives considered**:
1. Deploy factory pattern (each user gets cloned contract)
   - More gas overhead per user
   - Higher deployment costs
2. User-deployed proxies
   - Too complex for MVP
   - Higher user friction

### Decision 2: Inline ERC20 Payment in validateUserOp
**What**: Handle ERC20 transfers directly in validateUserOp when missingAccountFunds > 0.

**Why**:
- Atomic with validation (no separate transaction needed)
- Gas efficient (no additional call)
- Matches EIP-4337 paymaster pattern
- User experience is seamless

**Alternatives considered**:
1. Separate paymaster contract
   - More complex architecture
   - Additional gas overhead
2. External paymaster service
   - Not decentralized
   - Adds infrastructure dependency

### Decision 3: Nonce Storage in Contract
**What**: Store nonces in contract state using mapping(address => uint256).

**Why**:
- Simple and straightforward
- No external dependencies
- Easy to query via getNonce
- Standard AA pattern

**Alternatives considered**:
1. Off-chain nonce management
   - Complexity increases significantly
   - Requires coordination between services
2. Using EOA's chain nonce
   - Doesn't work (UserOp separate from regular transactions)
   - Would break replay protection

### Decision 4: Strict EntryPoint Access Control
**What**: Only allow EntryPoint to call validateUserOp and executeBatch.

**Why**:
- Security requirement (prevent unauthorized calls)
- Standard AA pattern
- Prevents direct manipulation of user operations

**Implementation**:
```solidity
require(msg.sender == ENTRYPOINT_ADDRESS, "only entry point");
```

## Technical Design

### Contract Structure

```solidity
contract Kernel {
    // Constants
    address immutable ENTRYPOINT;

    // State
    mapping(address => uint256) public nonces;

    // Events
    event UserOperationExecuted(address indexed sender, uint256 nonce);
    event ERC20PaymentProcessed(address indexed user, address token, uint256 amount);

    // Functions
    function validateUserOp(PackedUserOperation calldata userOp, bytes32 userOpHash, uint256 missingAccountFunds)
        external returns (uint256);

    function executeBatch(Call[] calldata calls) external;

    function getNonce(address user) external view returns (uint256);
}
```

### Data Structures

**PackedUserOperation**: Standard ERC-4337 structure
```solidity
struct PackedUserOperation {
    address sender;
    uint256 nonce;
    bytes initCode;
    bytes callData;
    uint256 accountGasLimits;
    uint256 preVerificationGas;
    uint256 gasFees;
    bytes paymasterAndData;
    bytes signature;
}
```

**Call**: Batch operation structure
```solidity
struct Call {
    address target;
    uint256 value;
    bytes data;
}
```

### Gas Payment Flow

1. EntryPoint calls `validateUserOp` with `missingAccountFunds > 0`
2. Kernel decodes `paymasterAndData` to get `(address token, uint256 amount)`
3. Kernel calls `IERC20(token).transfer(msg.sender, amount)`
4. Transfer success → validation passes (return 0)
5. Transfer failure → validation fails (reverts)

### Security Considerations

**Signature Validation**:
- Use ECDSA recovery to verify sender signed the UserOp hash
- Reject invalid signatures immediately
- Must be gas-efficient (done every validation)

**Replay Protection**:
- UserOp nonce prevents replay
- Check nonce before incrementing
- Increment only after successful validation

**ERC20 Payment**:
- Decode paymasterAndData safely
- Check token approval exists
- Handle transfer failures gracefully
- Prevent token draining attacks

**Access Control**:
- Validate msg.sender == ENTRYPOINT
- Use immutable ENTRYPOINT address
- Prevent front-running attacks

## Risks / Trade-offs

### Risk 1: Kernel Contract Bug Affects All Users
**Impact**: Critical (all users' funds at risk)
**Mitigation**:
- Extensive testing before deployment
- Multiple audits
- Consider proxy upgrade mechanism for emergency fixes
- Start with limited token support (USDC, USDT)

### Risk 2: Gas Price Volatility
**Impact**: Medium (users may overpay/underpay)
**Mitigation**:
- Use gas estimation from EntryPoint.simulateValidation
- Calculate ERC20 amount with buffer
- Allow Bundler to reject underpaid transactions

### Risk 3: ERC20 Approval Attack Vector
**Impact**: High (user tokens could be drained)
**Mitigation**:
- Only transfer when missingAccountFunds > 0
- Validate token address is whitelisted (optional)
- Clear documentation for users

### Trade-off 1: Simplicity vs. Features
**Decision**: Choose simplicity for MVP
**Rationale**: Complexity introduces bugs; can add features later
**Impact**: No social recovery, no spending limits

### Trade-off 2: Gas Efficiency vs. Safety
**Decision**: Prioritize safety over gas optimization
**Rationale**: Users pay ERC20 for gas anyway; security is paramount
**Impact**: Additional validation checks cost some gas

## Migration Plan

**Initial Deployment**:
1. Deploy Kernel contract to testnet
2. Run comprehensive test suite
3. Deploy to mainnet
4. Verify on Etherscan

**Future Upgrades**:
1. If proxy pattern added later, can upgrade logic
2. Immutable contract means new deployment for breaking changes
3. Users would need to re-delegate to new Kernel

**Rollback Plan**:
- No on-chain rollback (immutable contract)
- If critical bug found, deploy new Kernel and ask users to re-delegate
- Maintain clear communication channels

## Open Questions

1. **Should we implement token whitelisting?**
   - Pros: Prevents malicious token draining
   - Cons: Limits flexibility, requires on-chain updates
   - Decision: Start without, add later if needed

2. **What ERC20 tokens to support initially?**
   - USDC (mainstream, stable)
   - USDT (mainstream, stable)
   - Others (consider DEX liquidity)

3. **Should we implement spending limits?**
   - Pros: Adds safety for users
   - Cons: More complex, gas overhead
   - Decision: Skip for MVP, consider as feature

4. **How to handle failed ERC20 transfers?**
   - Currently reverts entire UserOp
   - Consider partial failure modes in future
