# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *

class GenLayerBridgeManager(gl.Contract):
    """
    GenLayer Bridge Manager V2 for PayGrix Cross-Chain Bridge.
    Authenticates cross-chain deposit attestations from Base Sepolia and authorizes exact pUSDC minting.
    """
    BASE_SEPOLIA_CHAIN_ID: u256
    GENLAYER_BRADBURY_CHAIN_ID: u256

    owner: Address
    base_router_address: Address
    token_address: Address

    authorized_attesters: TreeMap[Address, bool]
    processed_bridge_ids: TreeMap[Address, bool]

    def __init__(self):
        self.BASE_SEPOLIA_CHAIN_ID = u256(84532)
        self.GENLAYER_BRADBURY_CHAIN_ID = u256(4221)
        self.owner = gl.message.sender_address
        self.base_router_address = Address("0x05c69956564c556fc303cb74c5505d0e1e8edf2d")
        self.token_address = Address("0x0000000000000000000000000000000000000000")

        self.authorized_attesters = TreeMap()
        self.processed_bridge_ids = TreeMap()

        self.authorized_attesters[gl.message.sender_address] = True

    @gl.public.write
    def set_token_address(self, token_address: str) -> bool:
        assert gl.message.sender_address == self.owner, "Caller is not owner"
        self.token_address = Address(token_address)
        return True

    @gl.public.write
    def add_attester(self, attester_address: str) -> bool:
        assert gl.message.sender_address == self.owner, "Caller is not owner"
        self.authorized_attesters[Address(attester_address)] = True
        return True

    @gl.public.view
    def is_bridge_processed(self, bridge_id: str) -> bool:
        id_addr = Address(bridge_id[:42])
        return self.processed_bridge_ids.get(id_addr, False)

    @gl.public.view
    def get_token_address(self) -> str:
        return self.token_address.as_hex

    @gl.public.view
    def get_base_router(self) -> str:
        return self.base_router_address.as_hex

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
        attester: str
    ) -> bool:
        assert u256(source_chain_id) == self.BASE_SEPOLIA_CHAIN_ID, "Invalid source chain"
        assert u256(dest_chain_id) == self.GENLAYER_BRADBURY_CHAIN_ID, "Invalid dest chain"
        assert Address(source_router) == self.base_router_address, "Invalid source router"
        amt_u256 = u256(amount)
        assert amt_u256 > u256(0), "Amount must be positive"
        assert self.authorized_attesters.get(Address(attester), False), "Unauthorized attester"

        id_addr = Address(bridge_id[:42])
        assert not self.processed_bridge_ids.get(id_addr, False), "Bridge transaction already processed"
        self.processed_bridge_ids[id_addr] = True

        token = gl.get_contract_at(self.token_address)
        token.emit(on='accepted').mint_from_bridge(recipient, amount)
        return True
