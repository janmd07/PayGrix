// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../../contracts/base-sepolia/interfaces/IAdjudicationSource.sol";

/**
 * @title BaseBridgeAdapter
 * @dev Cross-chain message adapter interface for Base Sepolia side.
 * 
 * IMPORTANT NOTE:
 * TESTNET INTEGRATION BOUNDARY — AUTHENTICATION MECHANISM TO BE FINALIZED
 * AFTER CROSS-CHAIN TRANSPORT VERIFICATION.
 *
 * UNVERIFIED / TODO:
 * - LayerZero / Teleporter / Hyperlane Endpoint address integration pending final testnet bridge verification.
 * - Peer contract verification pending deployment on GenLayer Bradbury.
 */
contract BaseBridgeAdapter is IAdjudicationSource {
    address public immutable vaultAddress;
    address public relayerAddress;
    address public owner;

    // Mapping of authorized dispute verdict proofs
    // Format: keccak256(abi.encodePacked(escrowId, adjudicationId)) => verdictCode
    mapping(bytes32 => uint8) public verifiedVerdicts;

    event AdjudicationRequested(bytes32 indexed escrowId, uint256 timestamp, string evidenceURI);
    event VerdictReceived(bytes32 indexed escrowId, uint256 indexed adjudicationId, uint8 verdictCode);

    modifier onlyOwner() {
        require(msg.sender == owner, "BaseBridgeAdapter: Caller is not owner");
        _;
    }

    constructor(address _vaultAddress, address _relayerAddress) {
        require(_vaultAddress != address(0), "BaseBridgeAdapter: Invalid vault");
        require(_relayerAddress != address(0), "BaseBridgeAdapter: Invalid relayer");
        vaultAddress = _vaultAddress;
        relayerAddress = _relayerAddress;
        owner = msg.sender;
    }

    /**
     * @notice Emits cross-chain dispute request event for relayer/bridge pickup.
     */
    function requestAdjudication(bytes32 escrowId, string calldata evidenceURI) external {
        require(msg.sender == vaultAddress, "BaseBridgeAdapter: Only vault can initiate adjudication");
        emit AdjudicationRequested(escrowId, block.timestamp, evidenceURI);
    }

    /**
     * @notice Called by authorized relayer/bridge transport to record verified verdict from GenLayer.
     * 
     * UNVERIFIED / TODO: Replace relayer authentication with cryptographic proof / cross-chain header verification.
     */
    function receiveVerdict(
        bytes32 escrowId,
        uint256 adjudicationId,
        uint8 verdictCode,
        bytes calldata proof
    ) external {
        require(msg.sender == relayerAddress, "BaseBridgeAdapter: Only authorized relayer in testnet phase");
        require(verdictCode >= 1 && verdictCode <= 3, "BaseBridgeAdapter: Invalid verdict code");

        bytes32 verdictKey = keccak256(abi.encodePacked(escrowId, adjudicationId, verdictCode));
        verifiedVerdicts[verdictKey] = verdictCode;

        emit VerdictReceived(escrowId, adjudicationId, verdictCode);
    }

    /**
     * @notice Implements IAdjudicationSource interface for PayGrixEscrowVault authentication.
     */
    function verifyVerdict(
        bytes32 escrowId,
        uint256 adjudicationId,
        uint8 verdictCode,
        bytes calldata /* proofOrData */
    ) external view override returns (bool isValid) {
        bytes32 verdictKey = keccak256(abi.encodePacked(escrowId, adjudicationId, verdictCode));
        return verifiedVerdicts[verdictKey] == verdictCode;
    }

    function setRelayerAddress(address _newRelayer) external onlyOwner {
        require(_newRelayer != address(0), "BaseBridgeAdapter: Invalid relayer");
        relayerAddress = _newRelayer;
    }
}
