// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPayGrixBridgeVault {
    function depositFrom(address from, uint256 amount) external;
    function releaseTo(address to, uint256 amount) external;
    function totalVaulted() external view returns (uint256);
}

/**
 * @title PayGrixBaseBridgeRouter
 * @dev Cryptographically Authenticated User & Validator Entrypoint for Base Sepolia <-> GenLayer Bridge.
 *
 * Key Security Controls:
 * 1. Chain ID Harmonized: GENLAYER_DESTINATION_CHAIN_ID = 4221 (Matching wagmi / GenLayer Bradbury configuration).
 * 2. EIP-712 Cryptographic Signature Verification for Reverse Releases.
 * 3. Multi-Signer Threshold: Releases require M-of-N distinct cryptographic signatures from authorized bridge validators.
 * 4. Bound Payload Verification: burnId, sourceChainId (4221), genLayerBridgeManager, recipient, amount, nonce, deadline.
 * 5. Replay Protection: Tracks both processedBridges and processedReleases on-chain.
 * 6. Base Mainnet Chain Guard: Chain ID 8453 is strictly forbidden.
 */
contract PayGrixBaseBridgeRouter {
    uint256 public constant BASE_SEPOLIA_CHAIN_ID = 84532;
    uint256 public constant FORBIDDEN_CHAIN_ID = 8453; // Base Mainnet
    uint256 public constant GENLAYER_DESTINATION_CHAIN_ID = 4221; // GenLayer Bradbury Canonical Chain ID

    bytes32 public constant EIP712_DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );

    bytes32 public constant BURN_RELEASE_TYPEHASH = keccak256(
        "BurnRelease(bytes32 burnId,uint256 sourceChainId,address genLayerBridgeManager,address recipient,uint256 amount,uint256 nonce,uint256 deadline)"
    );

    bytes32 public immutable DOMAIN_SEPARATOR_BASE;

    address public immutable usdcToken;
    address public immutable vaultAddress;
    address public authorizedBridgeManager;
    address public owner;

    uint256 private nonceCounter;

    // Multi-signer validator set
    mapping(address => bool) public isAuthorizedSigner;
    uint256 public requiredSignatures;
    uint256 public signerCount;

    // Replay protection tables
    mapping(bytes32 => bool) public processedBridges;
    mapping(bytes32 => bool) public processedReleases;
    mapping(uint256 => bool) public processedNonces;

    event TokensBridged(
        bytes32 indexed bridgeId,
        address indexed sender,
        address indexed recipient,
        uint256 amount,
        uint256 nonce,
        uint256 sourceChainId,
        uint256 destinationChainId,
        uint256 timestamp
    );

    event TokensReleased(
        bytes32 indexed burnId,
        address indexed recipient,
        uint256 amount,
        uint256 nonce,
        uint256 timestamp
    );

    event SignerAdded(address indexed signer);
    event SignerRemoved(address indexed signer);
    event RequiredSignaturesUpdated(uint256 newRequired);
    event AuthorizedBridgeManagerUpdated(address indexed newManager);

    modifier onlyOwner() {
        require(msg.sender == owner, "PayGrixBaseBridgeRouter: Caller is not owner");
        _;
    }

    constructor(
        address _usdcToken,
        address _vaultAddress,
        address _authorizedBridgeManager,
        address[] memory initialSigners,
        uint256 _requiredSignatures
    ) {
        require(_usdcToken != address(0), "PayGrixBaseBridgeRouter: Invalid USDC address");
        require(_vaultAddress != address(0), "PayGrixBaseBridgeRouter: Invalid vault address");
        require(_authorizedBridgeManager != address(0), "PayGrixBaseBridgeRouter: Invalid manager address");
        require(_requiredSignatures > 0 && _requiredSignatures <= initialSigners.length, "PayGrixBaseBridgeRouter: Invalid signature threshold");

        usdcToken = _usdcToken;
        vaultAddress = _vaultAddress;
        authorizedBridgeManager = _authorizedBridgeManager;
        requiredSignatures = _requiredSignatures;
        owner = msg.sender;

        DOMAIN_SEPARATOR_BASE = keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                keccak256(bytes("PayGrixBridge")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );

        for (uint256 i = 0; i < initialSigners.length; i++) {
            address signer = initialSigners[i];
            require(signer != address(0), "PayGrixBaseBridgeRouter: Signer cannot be zero address");
            require(!isAuthorizedSigner[signer], "PayGrixBaseBridgeRouter: Duplicate signer");
            isAuthorizedSigner[signer] = true;
            emit SignerAdded(signer);
        }
        signerCount = initialSigners.length;
    }

    /**
     * @notice Initiates a bridge transfer of variable user-specified USDC from Base Sepolia to GenLayer Bradbury.
     * @param amount The exact raw amount of USDC to bridge (using 6 decimals, e.g. 5,000,000 = 5 USDC).
     * @param genLayerRecipient The destination recipient address on GenLayer Bradbury.
     * @return bridgeId Unique deterministic identifier for this bridge transaction.
     */
    function bridgeUSDC(uint256 amount, address genLayerRecipient) external returns (bytes32 bridgeId) {
        require(block.chainid != FORBIDDEN_CHAIN_ID, "PayGrixBaseBridgeRouter: Base Mainnet forbidden");
        require(amount > 0, "PayGrixBaseBridgeRouter: Amount must be greater than zero");
        require(genLayerRecipient != address(0), "PayGrixBaseBridgeRouter: Invalid GenLayer recipient");

        nonceCounter++;
        uint256 currentNonce = nonceCounter;

        bridgeId = keccak256(
            abi.encodePacked(
                block.chainid,
                GENLAYER_DESTINATION_CHAIN_ID,
                msg.sender,
                genLayerRecipient,
                amount,
                currentNonce,
                block.number,
                block.timestamp
            )
        );

        require(!processedBridges[bridgeId], "PayGrixBaseBridgeRouter: Bridge ID collision");
        processedBridges[bridgeId] = true;

        // Transfer exact user-selected USDC into bridge vault custody
        IPayGrixBridgeVault(vaultAddress).depositFrom(msg.sender, amount);

        emit TokensBridged(
            bridgeId,
            msg.sender,
            genLayerRecipient,
            amount,
            currentNonce,
            block.chainid,
            GENLAYER_DESTINATION_CHAIN_ID,
            block.timestamp
        );
    }

    /**
     * @notice Releases USDC from vault custody to recipient upon verified GenLayer burn.
     * Cryptographically authenticates EIP-712 structured multi-signatures.
     */
    function releaseUSDC(
        bytes32 burnId,
        uint256 sourceChainId,
        address genLayerBridgeManager,
        address recipient,
        uint256 amount,
        uint256 nonce,
        uint256 deadline,
        bytes[] calldata signatures
    ) external {
        require(block.chainid != FORBIDDEN_CHAIN_ID, "PayGrixBaseBridgeRouter: Base Mainnet forbidden");
        require(block.timestamp <= deadline, "PayGrixBaseBridgeRouter: Release attestation expired");
        require(sourceChainId == GENLAYER_DESTINATION_CHAIN_ID, "PayGrixBaseBridgeRouter: Invalid source chain ID");
        require(genLayerBridgeManager == authorizedBridgeManager, "PayGrixBaseBridgeRouter: Invalid GenLayer bridge manager");
        require(recipient != address(0), "PayGrixBaseBridgeRouter: Invalid recipient");
        require(amount > 0, "PayGrixBaseBridgeRouter: Amount must be greater than zero");
        require(burnId != bytes32(0), "PayGrixBaseBridgeRouter: Invalid burn ID");
        require(!processedReleases[burnId], "PayGrixBaseBridgeRouter: Burn ID already released (replay rejected)");
        require(!processedNonces[nonce], "PayGrixBaseBridgeRouter: Nonce already used");
        require(signatures.length >= requiredSignatures, "PayGrixBaseBridgeRouter: Insufficient signatures");

        bytes32 structHash = keccak256(
            abi.encode(
                BURN_RELEASE_TYPEHASH,
                burnId,
                sourceChainId,
                genLayerBridgeManager,
                recipient,
                amount,
                nonce,
                deadline
            )
        );

        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR_BASE,
                structHash
            )
        );

        // Verify M-of-N distinct authorized signatures in strictly ascending order (prevents duplicate signer reuse)
        address lastSigner = address(0);
        for (uint256 i = 0; i < signatures.length; i++) {
            address recovered = recoverSigner(digest, signatures[i]);
            require(isAuthorizedSigner[recovered], "PayGrixBaseBridgeRouter: Unauthorized signer");
            require(recovered > lastSigner, "PayGrixBaseBridgeRouter: Duplicate or unordered signature");
            lastSigner = recovered;
        }

        processedReleases[burnId] = true;
        processedNonces[nonce] = true;

        IPayGrixBridgeVault(vaultAddress).releaseTo(recipient, amount);

        emit TokensReleased(burnId, recipient, amount, nonce, block.timestamp);
    }

    function recoverSigner(bytes32 digest, bytes memory signature) internal pure returns (address) {
        require(signature.length == 65, "PayGrixBaseBridgeRouter: Invalid signature length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }
        if (v < 27) {
            v += 27;
        }
        require(v == 27 || v == 28, "PayGrixBaseBridgeRouter: Invalid signature v value");
        return ecrecover(digest, v, r, s);
    }

    /**
     * @notice Admin Management Functions
     */
    function addSigner(address signer) external onlyOwner {
        require(signer != address(0), "PayGrixBaseBridgeRouter: Invalid signer address");
        require(!isAuthorizedSigner[signer], "PayGrixBaseBridgeRouter: Signer already added");
        isAuthorizedSigner[signer] = true;
        signerCount++;
        emit SignerAdded(signer);
    }

    function removeSigner(address signer) external onlyOwner {
        require(isAuthorizedSigner[signer], "PayGrixBaseBridgeRouter: Signer not found");
        require(signerCount - 1 >= requiredSignatures, "PayGrixBaseBridgeRouter: Cannot reduce signers below threshold");
        isAuthorizedSigner[signer] = false;
        signerCount--;
        emit SignerRemoved(signer);
    }

    function setRequiredSignatures(uint256 newRequired) external onlyOwner {
        require(newRequired > 0 && newRequired <= signerCount, "PayGrixBaseBridgeRouter: Invalid threshold");
        requiredSignatures = newRequired;
        emit RequiredSignaturesUpdated(newRequired);
    }

    function setAuthorizedBridgeManager(address newManager) external onlyOwner {
        require(newManager != address(0), "PayGrixBaseBridgeRouter: Invalid manager address");
        authorizedBridgeManager = newManager;
        emit AuthorizedBridgeManagerUpdated(newManager);
    }
}
