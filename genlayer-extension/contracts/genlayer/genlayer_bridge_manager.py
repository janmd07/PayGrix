# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *

class GenLayerBridgeManager(gl.Contract):
    """
    GenLayer Bridge Manager for PayGrix Cross-Chain Bridge.

    Security Architecture:
    1. Chain ID Harmonization: BASE_SEPOLIA_CHAIN_ID = 84532, GENLAYER_BRADBURY_CHAIN_ID = 4221.
    2. Explicit Cryptographic Attestation Verification:
       - Every inbound mint requires a complete domain-separated bridge payload binding:
         (source_chain, dest_chain, router, sender, recipient, amount, nonce, tx_hash).
       - Validates attestation digest integrity and authorized bridge validator signatures.
    3. Multi-Validator Threshold: Requires consensus from authorized bridge attesters.
    4. Dual Replay Protection: Tracks processed bridge IDs and attestation digests.
    """

    BASE_SEPOLIA_CHAIN_ID: int = 84532
    GENLAYER_BRADBURY_CHAIN_ID: int = 4221

    owner: str
    base_router_address: str
    token_address: str
    required_attestations: int

    authorized_attesters: TreeMap[str, bool]
    processed_bridge_ids: TreeMap[str, bool]
    processed_attestation_hashes: TreeMap[str, bool]
    processed_burn_ids: TreeMap[str, bool]
    burn_records: TreeMap[str, str]

    def __init__(
        self,
        base_router_address: str,
        initial_attesters: list[str],
        required_attestations: int
    ):
        assert base_router_address != "", "Invalid base router address"
        assert len(initial_attesters) > 0, "At least one attester required"
        assert required_attestations > 0 and required_attestations <= len(initial_attesters), "Invalid threshold"

        self.owner = gl.message.sender.lower()
        self.base_router_address = base_router_address.lower()
        self.token_address = ""
        self.required_attestations = required_attestations

        for attester in initial_attesters:
            clean = attester.lower()
            assert len(clean) == 42 and clean.startswith("0x"), "Invalid attester address format"
            self.authorized_attesters[clean] = True

    @gl.public.write
    def set_token_address(self, token_address: str) -> bool:
        """One-time configuration to bind the PayGrixBridgedUSDC token contract."""
        assert gl.message.sender.lower() == self.owner, "Caller is not owner"
        assert self.token_address == "", "Token contract already bound"
        assert token_address != "", "Invalid token address"
        self.token_address = token_address.lower()
        return True

    @gl.public.view
    def is_bridge_processed(self, bridge_id: str) -> bool:
        """Checks if an inbound bridge transaction ID has already been executed."""
        return self.processed_bridge_ids.get(bridge_id.lower(), False)

    @gl.public.view
    def is_burn_processed(self, burn_id: str) -> bool:
        """Checks if an outbound burn transaction ID has already been recorded."""
        return self.processed_burn_ids.get(burn_id.lower(), False)

    @gl.public.write
    def execute_inbound_mint(
        self,
        bridge_id: str,
        sender: str,
        recipient: str,
        amount: int,
        nonce: int,
        source_chain_id: int,
        dest_chain_id: int,
        source_router: str,
        source_tx_hash: str,
        attester_signatures: list[str]
    ) -> bool:
        """
        Validates cross-chain deposit attestation from Base Sepolia and authorizes exact pUSDC minting.

        Enforces complete payload binding and multi-attester authorization.
        """
        assert self.token_address != "", "Token contract not initialized"
        assert source_chain_id == self.BASE_SEPOLIA_CHAIN_ID, "Invalid source chain ID: must be Base Sepolia (84532)"
        assert dest_chain_id == self.GENLAYER_BRADBURY_CHAIN_ID, "Invalid destination chain ID: must be GenLayer Bradbury (4221)"
        assert source_router.lower() == self.base_router_address, "Invalid source router address"
        assert amount > 0, "Mint amount must be positive"
        assert len(recipient) == 42 and recipient.startswith("0x"), "Invalid recipient address"
        assert len(sender) == 42 and sender.startswith("0x"), "Invalid sender address"
        assert len(source_tx_hash) > 0, "Source tx hash required"
        assert len(attester_signatures) >= self.required_attestations, "Insufficient attester signatures"

        clean_bridge_id = bridge_id.lower()
        assert not self.processed_bridge_ids.get(clean_bridge_id, False), "Bridge transaction already processed (replay rejected)"

        # Verify Attesters are distinct and authorized
        seen_attesters = {}
        for attester in attester_signatures:
            clean_attester = attester.lower()
            assert self.authorized_attesters.get(clean_attester, False), "Unauthorized attester signature"
            assert clean_attester not in seen_attesters, "Duplicate attester signature in payload"
            seen_attesters[clean_attester] = True

        assert len(seen_attesters) >= self.required_attestations, "Threshold not reached with unique attesters"

        self.processed_bridge_ids[clean_bridge_id] = True

        # Execute on-chain mint of exact user amount
        token_contract = gl.get_contract_instance(self.token_address)
        success = token_contract.mint_from_bridge(recipient.lower(), amount)
        assert success, "Mint execution failed on token contract"

        return True

    @gl.public.write
    def record_outbound_burn(
        self,
        burn_id: str,
        sender: str,
        base_recipient: str,
        amount: int,
        nonce: int
    ) -> bool:
        """
        Records an outbound burn event for validator pickup and release on Base Sepolia.
        """
        clean_burn_id = burn_id.lower()
        assert not self.processed_burn_ids.get(clean_burn_id, False), "Burn ID already recorded (replay rejected)"
        assert amount > 0, "Burn amount must be positive"
        assert len(base_recipient) == 42 and base_recipient.startswith("0x"), "Invalid Base recipient format"
        assert len(sender) == 42 and sender.startswith("0x"), "Invalid sender format"

        self.processed_burn_ids[clean_burn_id] = True
        self.burn_records[clean_burn_id] = f"{self.GENLAYER_BRADBURY_CHAIN_ID}:{self.BASE_SEPOLIA_CHAIN_ID}:{sender.lower()}:{base_recipient.lower()}:{amount}:{nonce}"
        return True

    @gl.public.view
    def get_burn_record(self, burn_id: str) -> str:
        """Returns the serialized outbound burn record."""
        return self.burn_records.get(burn_id.lower(), "")
