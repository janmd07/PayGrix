// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IAdjudicationSource.sol";

interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

library SafeERC20 {
    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        require(token.transfer(to, value), "SafeERC20: transfer failed");
    }

    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        require(token.transferFrom(from, to, value), "SafeERC20: transferFrom failed");
    }
}

abstract contract ReentrancyGuard {
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status;

    constructor() {
        _status = _NOT_ENTERED;
    }

    modifier nonReentrant() {
        require(_status != _ENTERED, "ReentrancyGuard: reentrant call");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }
}

/**
 * @title PayGrixEscrowVault
 * @dev Isolated Base Sepolia Escrow Vault for PayGrix x GenLayer Dispute Resolution.
 * 
 * USDC remains strictly on Base Sepolia.
 * Adjudication is performed off-chain / cross-chain by GenLayer Bradbury.
 * Finalized structured verdicts are authenticated via IAdjudicationSource.
 */
contract PayGrixEscrowVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum EscrowState {
        CREATED,
        FUNDED,
        DISPUTED,
        ADJUDICATION_PENDING,
        RELEASED,
        REFUNDED,
        UNDETERMINED_RESOLVED,
        EXPIRED_REFUNDED,
        EMERGENCY_REFUNDED
    }

    struct Escrow {
        bytes32 escrowId;
        address depositor;
        address beneficiary;
        uint256 amount;
        uint256 createdAt;
        uint256 expirationTimestamp;
        bytes32 evidenceHash;
        string evidenceURI;
        EscrowState state;
        uint256 adjudicationNonce;
    }

    // Verdict Codes
    uint8 public constant VERDICT_APPROVED = 1;     // 100% to beneficiary
    uint8 public constant VERDICT_REJECTED = 2;     // 100% refund to depositor
    uint8 public constant VERDICT_UNDETERMINED = 3; // Inconclusive / missing evidence / hash mismatch -> safest fallback refund to depositor

    IERC20 public immutable usdcToken;
    address public immutable adjudicationSource;
    address public immutable emergencyAdmin;

    uint256 private nonceCounter;
    mapping(bytes32 => Escrow) public escrows;
    mapping(bytes32 => bool) public executedAdjudications;

    // Events
    event EscrowCreated(bytes32 indexed escrowId, address indexed depositor, address indexed beneficiary, uint256 amount, uint256 expirationTimestamp);
    event EscrowFunded(bytes32 indexed escrowId, uint256 amount);
    event EvidenceSubmitted(bytes32 indexed escrowId, bytes32 evidenceHash, string evidenceURI);
    event DisputeRaised(bytes32 indexed escrowId, address indexed raisedBy);
    event AdjudicationPending(bytes32 indexed escrowId, uint256 adjudicationNonce);
    event VerdictSettled(bytes32 indexed escrowId, uint256 adjudicationId, uint8 verdictCode, address recipient, uint256 amount);
    event ExpirationRefundClaimed(bytes32 indexed escrowId, address indexed depositor, uint256 amount);
    event EmergencyRefundExecuted(bytes32 indexed escrowId, address indexed depositor, uint256 amount);

    modifier onlyDepositor(bytes32 escrowId) {
        require(msg.sender == escrows[escrowId].depositor, "PayGrixEscrowVault: Caller is not depositor");
        _;
    }

    modifier onlyParty(bytes32 escrowId) {
        Escrow memory e = escrows[escrowId];
        require(msg.sender == e.depositor || msg.sender == e.beneficiary, "PayGrixEscrowVault: Caller is not escrow party");
        _;
    }

    modifier inState(bytes32 escrowId, EscrowState expectedState) {
        require(escrows[escrowId].state == expectedState, "PayGrixEscrowVault: Invalid escrow state");
        _;
    }

    /**
     * @notice Constructor sets immutable tokens and adjudication source to minimize privileged admin surface.
     */
    constructor(address _usdcToken, address _adjudicationSource) {
        require(_usdcToken != address(0), "PayGrixEscrowVault: Invalid USDC address");
        require(_adjudicationSource != address(0), "PayGrixEscrowVault: Invalid adjudication source address");
        usdcToken = IERC20(_usdcToken);
        adjudicationSource = _adjudicationSource;
        emergencyAdmin = msg.sender;
    }

    /**
     * @notice Creates a new escrow agreement.
     */
    function createEscrow(
        address beneficiary,
        uint256 amount,
        uint256 durationSeconds
    ) external returns (bytes32 escrowId) {
        require(beneficiary != address(0), "PayGrixEscrowVault: Invalid beneficiary");
        require(beneficiary != msg.sender, "PayGrixEscrowVault: Beneficiary cannot be depositor");
        require(amount > 0, "PayGrixEscrowVault: Amount must be greater than zero");
        require(durationSeconds >= 300, "PayGrixEscrowVault: Duration must be at least 5 minutes");

        nonceCounter++;
        escrowId = keccak256(
            abi.encodePacked(
                msg.sender,
                beneficiary,
                amount,
                block.timestamp,
                block.chainid,
                nonceCounter
            )
        );

        require(escrows[escrowId].createdAt == 0, "PayGrixEscrowVault: Escrow ID collision");

        uint256 expTime = block.timestamp + durationSeconds;

        escrows[escrowId] = Escrow({
            escrowId: escrowId,
            depositor: msg.sender,
            beneficiary: beneficiary,
            amount: amount,
            createdAt: block.timestamp,
            expirationTimestamp: expTime,
            evidenceHash: bytes32(0),
            evidenceURI: "",
            state: EscrowState.CREATED,
            adjudicationNonce: 0
        });

        emit EscrowCreated(escrowId, msg.sender, beneficiary, amount, expTime);
    }

    /**
     * @notice Funds an existing escrow with USDC tokens.
     */
    function fundEscrow(bytes32 escrowId) 
        external 
        nonReentrant 
        inState(escrowId, EscrowState.CREATED) 
        onlyDepositor(escrowId) 
    {
        Escrow storage e = escrows[escrowId];
        e.state = EscrowState.FUNDED;

        usdcToken.safeTransferFrom(msg.sender, address(this), e.amount);

        emit EscrowFunded(escrowId, e.amount);
    }

    /**
     * @notice Submits an off-chain evidence reference/hash for an escrow.
     * 
     * FIX 2 ENFORCEMENT:
     * Evidence may ONLY be submitted while the escrow is in FUNDED state.
     * Once an escrow enters DISPUTED or ADJUDICATION_PENDING state, evidenceHash and evidenceURI are IMMUTABLE.
     */
    function submitEvidence(
        bytes32 escrowId,
        bytes32 evidenceHash,
        string calldata evidenceURI
    ) external onlyParty(escrowId) inState(escrowId, EscrowState.FUNDED) {
        Escrow storage e = escrows[escrowId];
        require(evidenceHash != bytes32(0), "PayGrixEscrowVault: Invalid evidence hash");

        e.evidenceHash = evidenceHash;
        e.evidenceURI = evidenceURI;

        emit EvidenceSubmitted(escrowId, evidenceHash, evidenceURI);
    }

    /**
     * @notice Raises a dispute on a funded escrow before expiration.
     */
    function raiseDispute(bytes32 escrowId) external onlyParty(escrowId) inState(escrowId, EscrowState.FUNDED) {
        Escrow storage e = escrows[escrowId];
        require(block.timestamp < e.expirationTimestamp, "PayGrixEscrowVault: Escrow expired");

        e.state = EscrowState.DISPUTED;

        emit DisputeRaised(escrowId, msg.sender);
    }

    /**
     * @notice Marks adjudication as pending once relaying to GenLayer starts.
     * 
     * FIX 7 ENFORCEMENT:
     * Restrict callers to escrow parties (depositor/beneficiary) or the authorized adjudication source adapter.
     */
    function markAdjudicationPending(bytes32 escrowId) external inState(escrowId, EscrowState.DISPUTED) {
        Escrow storage e = escrows[escrowId];
        require(
            msg.sender == e.depositor || msg.sender == e.beneficiary || msg.sender == adjudicationSource,
            "PayGrixEscrowVault: Unauthorized caller for markAdjudicationPending"
        );

        e.adjudicationNonce++;
        e.state = EscrowState.ADJUDICATION_PENDING;

        emit AdjudicationPending(escrowId, e.adjudicationNonce);
    }

    /**
     * @notice Settles a verdict received from the authenticated GenLayer adjudication source.
     * @param escrowId Escrow identifier.
     * @param adjudicationId Unique nonce for adjudication execution.
     * @param verdictCode Structured verdict code (1 = APPROVED, 2 = REJECTED, 3 = UNDETERMINED).
     * @param proofOrData Transport verification data.
     */
    function settleVerdict(
        bytes32 escrowId,
        uint256 adjudicationId,
        uint8 verdictCode,
        bytes calldata proofOrData
    ) external nonReentrant {
        Escrow storage e = escrows[escrowId];
        require(
            e.state == EscrowState.DISPUTED || e.state == EscrowState.ADJUDICATION_PENDING,
            "PayGrixEscrowVault: Escrow not in adjudicable state"
        );

        // Replay protection: Check unique (escrowId, adjudicationId) pair
        bytes32 adjKey = keccak256(abi.encodePacked(escrowId, adjudicationId));
        require(!executedAdjudications[adjKey], "PayGrixEscrowVault: Duplicate adjudication execution");
        executedAdjudications[adjKey] = true;

        // Verify authentication boundary via IAdjudicationSource
        require(
            IAdjudicationSource(adjudicationSource).verifyVerdict(escrowId, adjudicationId, verdictCode, proofOrData),
            "PayGrixEscrowVault: Invalid verdict authentication proof"
        );

        address recipient;
        uint256 transferAmount = e.amount;

        if (verdictCode == VERDICT_APPROVED) {
            // 100% to beneficiary
            e.state = EscrowState.RELEASED;
            recipient = e.beneficiary;
        } else if (verdictCode == VERDICT_REJECTED) {
            // 100% refund to depositor
            e.state = EscrowState.REFUNDED;
            recipient = e.depositor;
        } else if (verdictCode == VERDICT_UNDETERMINED) {
            // UNDETERMINED -> safest fallback is 100% refund to depositor
            e.state = EscrowState.UNDETERMINED_RESOLVED;
            recipient = e.depositor;
        } else {
            revert("PayGrixEscrowVault: Invalid verdict code");
        }

        usdcToken.safeTransfer(recipient, transferAmount);

        emit VerdictSettled(escrowId, adjudicationId, verdictCode, recipient, transferAmount);
    }

    /**
     * @notice Allows depositor to claim a refund if the escrow expired without active dispute or adjudication.
     */
    function claimExpirationRefund(bytes32 escrowId) 
        external 
        nonReentrant 
        onlyDepositor(escrowId) 
    {
        Escrow storage e = escrows[escrowId];
        require(
            e.state == EscrowState.FUNDED,
            "PayGrixEscrowVault: Can only claim expiration refund on funded state"
        );
        require(block.timestamp >= e.expirationTimestamp, "PayGrixEscrowVault: Escrow not yet expired");

        e.state = EscrowState.EXPIRED_REFUNDED;
        usdcToken.safeTransfer(e.depositor, e.amount);

        emit ExpirationRefundClaimed(escrowId, e.depositor, e.amount);
    }

    /**
     * @notice Emergency refund triggered by admin ONLY if an active adjudication is stuck past 14 days post-expiration.
     */
    function claimEmergencyRefund(bytes32 escrowId) external nonReentrant {
        require(msg.sender == emergencyAdmin, "PayGrixEscrowVault: Only emergency admin");
        Escrow storage e = escrows[escrowId];
        require(
            e.state == EscrowState.DISPUTED || e.state == EscrowState.ADJUDICATION_PENDING,
            "PayGrixEscrowVault: Escrow state ineligible for emergency refund"
        );
        require(block.timestamp > e.expirationTimestamp + 14 days, "PayGrixEscrowVault: Emergency timelock active");

        e.state = EscrowState.EMERGENCY_REFUNDED;
        usdcToken.safeTransfer(e.depositor, e.amount);

        emit EmergencyRefundExecuted(escrowId, e.depositor, e.amount);
    }
}
