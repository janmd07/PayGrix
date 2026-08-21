// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IAdjudicationSource
 * @dev Interface for cross-chain dispute resolution authentication.
 *
 * IMPORTANT NOTE:
 * TESTNET INTEGRATION BOUNDARY — AUTHENTICATION MECHANISM TO BE FINALIZED
 * AFTER CROSS-CHAIN TRANSPORT VERIFICATION.
 *
 * This abstraction boundary ensures PayGrixEscrowVault does not rely on arbitrary EOAs,
 * while allowing the verified cross-chain proof/transport mechanism to be plugged in seamlessly.
 */
interface IAdjudicationSource {
    /**
     * @notice Verifies whether a given verdict for an escrow and adjudication ID is authenticated.
     * @param escrowId The unique identifier of the escrow.
     * @param adjudicationId The unique nonce/id of the dispute adjudication.
     * @param verdictCode Structured verdict code (1 = APPROVED, 2 = REJECTED, 3 = UNDETERMINED).
     * @param proofOrData Transport/bridge payload, signature, or state proof.
     * @return isValid True if authenticated, false otherwise.
     */
    function verifyVerdict(
        bytes32 escrowId,
        uint256 adjudicationId,
        uint8 verdictCode,
        bytes calldata proofOrData
    ) external view returns (bool isValid);
}
