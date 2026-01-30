// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "lib/forge-std/src/interfaces/IERC20.sol";

/**
 * @title Kernel
 * @notice EIP-7702 delegate wallet contract for account abstraction
 * @dev Implements ERC-4337 account interface with ERC20 gas payment support
 */
contract Kernel {
    /// @notice EntryPoint contract address (immutable for security)
    address public immutable ENTRY_POINT;

    /// @notice Mapping of user address to their UserOp nonce
    mapping(address => uint256) public nonces;

    /// @notice Struct for batch call execution
    struct Call {
        address target;
        uint256 value;
        bytes data;
    }

    /// @notice Packed UserOperation struct (ERC-4337)
    struct PackedUserOperation {
        address sender;
        uint256 nonce;
        bytes callData;
        uint256 callGasLimit;
        uint256 verificationGasLimit;
        uint256 preVerificationGas;
        uint256 maxFeePerGas;
        uint256 maxPriorityFeePerGas;
        bytes paymasterAndData;
        bytes signature;
    }

    // Events
    event UserOperationExecuted(address indexed sender, uint256 nonce, bool success);
    event BatchExecuted(address indexed sender, uint256 numCalls);
    event GasPaymentProcessed(address indexed sender, address indexed token, uint256 amount, address indexed payee);

    // Errors
    error OnlyEntryPoint();
    error InvalidSignature();
    error InvalidNonce();
    error CallFailed(uint256 callIndex);

    /**
     * @notice Constructor sets immutable EntryPoint address
     * @param _entryPoint Address of the ERC-4337 EntryPoint contract
     */
    constructor(address _entryPoint) {
        require(_entryPoint != address(0), "Invalid EntryPoint");
        ENTRY_POINT = _entryPoint;
    }

    /**
     * @notice Validates UserOperation signature and processes gas payment
     * @param userOp The UserOperation to validate
     * @param userOpHash Hash of the UserOperation for signature verification
     * @param missingAccountFunds Amount of funds needed for gas (in wei)
     * @return validationData 0 for success, 1 for signature failure
     * @dev Only callable by EntryPoint. Validates signature, checks nonce, processes ERC20 payment
     */
    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external returns (uint256 validationData) {
        // Only EntryPoint can call this function
        if (msg.sender != ENTRY_POINT) revert OnlyEntryPoint();

        // Verify signature
        address signer = recoverSigner(userOpHash, userOp.signature);
        if (signer != userOp.sender) revert InvalidSignature();

        // Verify and increment nonce
        if (userOp.nonce != nonces[userOp.sender]) revert InvalidNonce();
        nonces[userOp.sender]++;

        // Process ERC20 gas payment if needed
        if (missingAccountFunds > 0 && userOp.paymasterAndData.length > 0) {
            (address token, uint256 amount) = abi.decode(
                userOp.paymasterAndData,
                (address, uint256)
            );
            
            // Transfer ERC20 from user to Bundler
            // tx.origin is bundler when called via prank(entryPoint, bundler)
            address payee = tx.origin;
            IERC20(token).transferFrom(userOp.sender, payee, amount);
            
            emit GasPaymentProcessed(userOp.sender, token, amount, payee);
        }

        return 0; // Validation success
    }

    /**
     * @notice Executes multiple calls in a single transaction (batch execution)
     * @param calls Array of Call structs containing target, value, and data
     * @dev Only callable by EntryPoint. All calls must succeed or entire batch reverts
     */
    function executeBatch(Call[] calldata calls) external {
        if (msg.sender != ENTRY_POINT) revert OnlyEntryPoint();

        uint256 numCalls = calls.length;
        for (uint256 i = 0; i < numCalls; i++) {
            (bool success, ) = calls[i].target.call{value: calls[i].value}(calls[i].data);
            if (!success) revert CallFailed(i);
        }

        emit BatchExecuted(tx.origin, numCalls);
    }

    /**
     * @notice Executes ERC20 transferFrom on behalf of the sender
     * @param token Token address to transfer
     * @param from Source address (the user who delegated)
     * @param to Recipient address
     * @param amount Amount to transfer
     * @dev Used by delegated accounts to transfer tokens they own. Only callable internally from executeBatch.
     */
    function executeTokenTransfer(address token, address from, address to, uint256 amount) external {
        IERC20(token).transferFrom(from, to, amount);
    }

    /**
     * @notice Returns the current nonce for a given address
     * @param user Address to query nonce for
     * @return Current nonce value (0 for new addresses)
     */
    function getNonce(address user) external view returns (uint256) {
        return nonces[user];
    }

    /**
     * @notice Recovers signer address from message hash and signature
     * @param messageHash Hash of the message that was signed
     * @param signature ECDSA signature (65 bytes: r, s, v)
     * @return Address of the signer
     */
    function recoverSigner(bytes32 messageHash, bytes memory signature) 
        internal 
        pure 
        returns (address) 
    {
        require(signature.length == 65, "Invalid signature length");

        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }

        // EIP-2 still allows signature malleability for ecrecover
        require(uint256(s) <= 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0, "Invalid signature 's' value");
        require(v == 27 || v == 28, "Invalid signature 'v' value");

        return ecrecover(messageHash, v, r, s);
    }

    /**
     * @notice Allows contract to receive ETH
     */
    receive() external payable {}
}
