# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *

class PayGrixBridgedUSDC(gl.Contract):
    """
    PayGrix Bridged USDC (pUSDC) on GenLayer Bradbury.

    This contract represents Base Sepolia USDC bridged through the PayGrix bridge.
    Maintains 6 decimal precision matching Base Sepolia USDC.
    Only the authorized GenLayerBridgeManager may mint tokens upon verified Base deposits.
    """

    name: str = "PayGrix Bridged USDC"
    symbol: str = "pUSDC"
    decimals: int = 6
    total_supply: int = 0
    bridge_manager: str
    owner: str

    balances: TreeMap[str, int]
    allowances: TreeMap[str, TreeMap[str, int]]

    def __init__(self, bridge_manager_address: str):
        assert bridge_manager_address != "", "Invalid bridge manager address"
        self.bridge_manager = bridge_manager_address.lower()
        self.owner = gl.message.sender.lower()

    @gl.public.view
    def balance_of(self, account: str) -> int:
        """Returns the pUSDC token balance of the specified account."""
        return self.balances.get(account.lower(), 0)

    @gl.public.view
    def get_total_supply(self) -> int:
        """Returns the total circulating supply of pUSDC on GenLayer."""
        return self.total_supply

    @gl.public.view
    def get_bridge_manager(self) -> str:
        """Returns the authorized bridge manager address."""
        return self.bridge_manager

    @gl.public.view
    def allowance(self, owner: str, spender: str) -> int:
        """Returns the remaining allowance granted by owner to spender."""
        owner_clean = owner.lower()
        spender_clean = spender.lower()
        owner_allowances = self.allowances.get(owner_clean, None)
        if owner_allowances is None:
            return 0
        return owner_allowances.get(spender_clean, 0)

    @gl.public.write
    def transfer(self, recipient: str, amount: int) -> bool:
        """Standard ERC-20 style token transfer."""
        sender = gl.message.sender.lower()
        rec_clean = recipient.lower()
        assert amount > 0, "Transfer amount must be positive"
        sender_bal = self.balances.get(sender, 0)
        assert sender_bal >= amount, "Insufficient pUSDC balance"

        self.balances[sender] = sender_bal - amount
        self.balances[rec_clean] = self.balances.get(rec_clean, 0) + amount
        return True

    @gl.public.write
    def approve(self, spender: str, amount: int) -> bool:
        """Approves spender to spend up to amount tokens on behalf of caller."""
        sender = gl.message.sender.lower()
        spender_clean = spender.lower()
        assert amount >= 0, "Invalid approval amount"

        owner_map = self.allowances.get(sender, TreeMap[str, int]())
        owner_map[spender_clean] = amount
        self.allowances[sender] = owner_map
        return True

    @gl.public.write
    def transfer_from(self, sender: str, recipient: str, amount: int) -> bool:
        """Transfers tokens from sender to recipient using allowance."""
        caller = gl.message.sender.lower()
        sender_clean = sender.lower()
        rec_clean = recipient.lower()

        assert amount > 0, "Transfer amount must be positive"
        sender_bal = self.balances.get(sender_clean, 0)
        assert sender_bal >= amount, "Insufficient balance"

        owner_map = self.allowances.get(sender_clean, None)
        assert owner_map is not None, "No allowance set"
        current_allowance = owner_map.get(caller, 0)
        assert current_allowance >= amount, "Allowance exceeded"

        owner_map[caller] = current_allowance - amount
        self.allowances[sender_clean] = owner_map

        self.balances[sender_clean] = sender_bal - amount
        self.balances[rec_clean] = self.balances.get(rec_clean, 0) + amount
        return True

    @gl.public.write
    def mint_from_bridge(self, recipient: str, amount: int) -> bool:
        """
        Mints exactly the verified bridged amount of pUSDC to the recipient on GenLayer.
        Callable ONLY by the authorized bridge manager.
        """
        caller = gl.message.sender.lower()
        assert caller == self.bridge_manager, "Unauthorized caller: only bridge manager can mint"
        assert amount > 0, "Mint amount must be positive"
        assert recipient != "", "Invalid recipient address"

        rec_clean = recipient.lower()
        self.balances[rec_clean] = self.balances.get(rec_clean, 0) + amount
        self.total_supply += amount
        return True

    @gl.public.write
    def burn_to_bridge(self, amount: int, base_recipient: str) -> str:
        """
        Burns pUSDC on GenLayer to initiate reverse bridge back to Base Sepolia.
        """
        caller = gl.message.sender.lower()
        assert amount > 0, "Burn amount must be positive"
        assert len(base_recipient) == 42 and base_recipient.startswith("0x"), "Invalid Base Sepolia address format"

        caller_bal = self.balances.get(caller, 0)
        assert caller_bal >= amount, "Insufficient pUSDC balance to burn"

        self.balances[caller] = caller_bal - amount
        self.total_supply -= amount

        return f"BURN:{caller}:{base_recipient.lower()}:{amount}"
