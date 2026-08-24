# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *

class PayGrixBridgedUSDC(gl.Contract):
    """
    PayGrix Bridged USDC (pUSDC) V2 on GenLayer Bradbury.
    Represents 1:1 bridged USDC from Base Sepolia.
    """
    name: str
    symbol: str
    decimals: u8
    total_supply: u256
    bridge_manager: Address
    owner: Address

    balances: TreeMap[Address, u256]

    def __init__(self):
        self.name = "PayGrix Bridged USDC"
        self.symbol = "pUSDC"
        self.decimals = u8(6)
        self.total_supply = u256(0)
        self.owner = gl.message.sender_address
        self.bridge_manager = gl.message.sender_address
        self.balances = TreeMap()

    @gl.public.write
    def set_bridge_manager(self, manager: str) -> bool:
        assert gl.message.sender_address == self.owner, "Caller is not owner"
        self.bridge_manager = Address(manager)
        return True

    @gl.public.view
    def balance_of(self, account: str) -> u256:
        return self.balances.get(Address(account), u256(0))

    @gl.public.view
    def get_total_supply(self) -> u256:
        return self.total_supply

    @gl.public.view
    def get_bridge_manager(self) -> str:
        return self.bridge_manager.as_hex

    @gl.public.write
    def mint_from_bridge(self, recipient: str, amount: int) -> bool:
        assert gl.message.sender_address == self.bridge_manager or gl.message.sender_address == self.owner, "Unauthorized"
        rec_addr = Address(recipient)
        amt_u256 = u256(amount)
        assert amt_u256 > u256(0), "Amount must be positive"
        current_bal = self.balances.get(rec_addr, u256(0))
        self.balances[rec_addr] = current_bal + amt_u256
        self.total_supply = self.total_supply + amt_u256
        return True

    @gl.public.write
    def burn(self, base_recipient: str, amount: int) -> bool:
        sender = gl.message.sender_address
        amt_u256 = u256(amount)
        assert amt_u256 > u256(0), "Amount must be positive"
        sender_bal = self.balances.get(sender, u256(0))
        assert sender_bal >= amt_u256, "Insufficient balance"
        self.balances[sender] = sender_bal - amt_u256
        self.total_supply = self.total_supply - amt_u256
        return True

    @gl.public.write
    def transfer(self, recipient: str, amount: int) -> bool:
        sender = gl.message.sender_address
        amt_u256 = u256(amount)
        sender_bal = self.balances.get(sender, u256(0))
        assert sender_bal >= amt_u256, "Insufficient balance"
        self.balances[sender] = sender_bal - amt_u256
        rec_addr = Address(recipient)
        rec_bal = self.balances.get(rec_addr, u256(0))
        self.balances[rec_addr] = rec_bal + amt_u256
        return True
