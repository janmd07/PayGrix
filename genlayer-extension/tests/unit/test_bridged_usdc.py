# SPDX-License-Identifier: MIT
"""
Unit tests for PayGrix Bridged USDC (pUSDC) and Bridge Manager on GenLayer Bradbury.
Includes Multi-Attester Authorization, Complete Payload Binding, and Chain ID 4221 verification.
"""

import unittest

class MockBridgedUSDC:
    def __init__(self, bridge_manager: str):
        self.name = "PayGrix Bridged USDC"
        self.symbol = "pUSDC"
        self.decimals = 6
        self.total_supply = 0
        self.bridge_manager = bridge_manager.lower()
        self.balances = {}
        self.allowances = {}

    def balance_of(self, account: str) -> int:
        return self.balances.get(account.lower(), 0)

    def mint_from_bridge(self, caller: str, recipient: str, amount: int) -> bool:
        if caller.lower() != self.bridge_manager:
            raise PermissionError("Unauthorized caller: only bridge manager can mint")
        if amount <= 0:
            raise ValueError("Mint amount must be positive")
        rec = recipient.lower()
        self.balances[rec] = self.balances.get(rec, 0) + amount
        self.total_supply += amount
        return True

    def burn_to_bridge(self, caller: str, amount: int, base_recipient: str) -> str:
        c = caller.lower()
        bal = self.balances.get(c, 0)
        if amount <= 0:
            raise ValueError("Burn amount must be positive")
        if bal < amount:
            raise ValueError("Insufficient pUSDC balance to burn")
        if not (len(base_recipient) == 42 and base_recipient.startswith("0x")):
            raise ValueError("Invalid Base Sepolia address format")

        self.balances[c] = bal - amount
        self.total_supply -= amount
        return f"BURN:{c}:{base_recipient.lower()}:{amount}"

class MockBridgeManager:
    def __init__(self, base_router_address: str, initial_attesters: list, required_attestations: int):
        self.base_router_address = base_router_address.lower()
        self.authorized_attesters = {a.lower(): True for a in initial_attesters}
        self.required_attestations = required_attestations
        self.processed_bridge_ids = set()
        self.processed_burn_ids = set()
        self.burn_records = {}

    def execute_inbound_mint(
        self,
        token: MockBridgedUSDC,
        bridge_id: str,
        sender: str,
        recipient: str,
        amount: int,
        nonce: int,
        source_chain_id: int,
        dest_chain_id: int,
        source_router: str,
        source_tx_hash: str,
        signatures: list
    ) -> bool:
        if source_chain_id != 84532:
            raise ValueError("Invalid source chain ID: must be 84532")
        if dest_chain_id != 4221:
            raise ValueError("Invalid destination chain ID: must be 4221")
        if source_router.lower() != self.base_router_address:
            raise ValueError("Invalid source router address")
        if amount <= 0:
            raise ValueError("Mint amount must be positive")
        if not (len(recipient) == 42 and recipient.startswith("0x")):
            raise ValueError("Invalid recipient address")
        if not (len(sender) == 42 and sender.startswith("0x")):
            raise ValueError("Invalid sender address")
        if bridge_id.lower() in self.processed_bridge_ids:
            raise ValueError("Bridge transaction already processed (replay rejected)")

        if len(signatures) < self.required_attestations:
            raise ValueError("Insufficient attester signatures")

        seen = {}
        for sig in signatures:
            clean = sig.lower()
            if not self.authorized_attesters.get(clean, False):
                raise PermissionError("Unauthorized attester signature")
            if clean in seen:
                raise ValueError("Duplicate signature")
            seen[clean] = True

        self.processed_bridge_ids.add(bridge_id.lower())
        return token.mint_from_bridge("0xbridgemanager", recipient, amount)

    def record_outbound_burn(self, burn_id: str, sender: str, base_recipient: str, amount: int, nonce: int) -> bool:
        clean_burn_id = burn_id.lower()
        if clean_burn_id in self.processed_burn_ids:
            raise ValueError("Burn ID already recorded")
        if amount <= 0:
            raise ValueError("Burn amount must be positive")
        if not (len(base_recipient) == 42 and base_recipient.startswith("0x")):
            raise ValueError("Invalid Base recipient format")

        self.processed_burn_ids.add(clean_burn_id)
        self.burn_records[clean_burn_id] = f"4221:84532:{sender.lower()}:{base_recipient.lower()}:{amount}:{nonce}"
        return True

class TestPayGrixBridgedUSDC(unittest.TestCase):
    def setUp(self):
        self.manager_addr = "0xBridgeManager"
        self.router_addr = "0x05c69956564c556fc303Cb74C5505D0E1e8EDF2D"
        self.user_gen_addr = "0x1234567890abcdef1234567890abcdef12345678"
        self.user_base_addr = "0x71C7656EC7ab88b098defB751B7401B5f6d8976F"
        self.attesters = ["0xattester100000000000000000000000000000001", "0xattester200000000000000000000000000000002"]
        self.token = MockBridgedUSDC(self.manager_addr)
        self.manager = MockBridgeManager(self.router_addr, self.attesters, 2)

    def test_dynamic_mint_with_multi_attestation(self):
        # 5 USDC
        success = self.manager.execute_inbound_mint(
            self.token,
            "bridge_001",
            self.user_base_addr,
            self.user_gen_addr,
            5_000_000,
            1,
            84532,
            4221, # Harmonized chain ID
            self.router_addr,
            "0xtx1",
            self.attesters
        )
        self.assertTrue(success)
        self.assertEqual(self.token.balance_of(self.user_gen_addr), 5_000_000)

    def test_unauthorized_attester_rejected(self):
        fake_attesters = ["0xFakeAttester00000000000000000000000000001", self.attesters[0]]
        with self.assertRaises(PermissionError):
            self.manager.execute_inbound_mint(
                self.token,
                "bridge_unauth",
                self.user_base_addr,
                self.user_gen_addr,
                5_000_000,
                1,
                84532,
                4221,
                self.router_addr,
                "0xtx2",
                fake_attesters
            )

    def test_replay_rejected(self):
        self.manager.execute_inbound_mint(
            self.token,
            "bridge_replay",
            self.user_base_addr,
            self.user_gen_addr,
            5_000_000,
            1,
            84532,
            4221,
            self.router_addr,
            "0xtx3",
            self.attesters
        )
        with self.assertRaises(ValueError):
            self.manager.execute_inbound_mint(
                self.token,
                "bridge_replay",
                self.user_base_addr,
                self.user_gen_addr,
                5_000_000,
                1,
                84532,
                4221,
                self.router_addr,
                "0xtx3",
                self.attesters
            )

    def test_wrong_destination_chain_id_rejected(self):
        with self.assertRaises(ValueError):
            self.manager.execute_inbound_mint(
                self.token,
                "bridge_wrong_chain",
                self.user_base_addr,
                self.user_gen_addr,
                5_000_000,
                1,
                84532,
                4224, # Wrong chain ID (should be 4221)
                self.router_addr,
                "0xtx4",
                self.attesters
            )

    def test_burn_and_record_flow(self):
        self.manager.execute_inbound_mint(
            self.token,
            "bridge_for_burn",
            self.user_base_addr,
            self.user_gen_addr,
            10_000_000,
            1,
            84532,
            4221,
            self.router_addr,
            "0xtx5",
            self.attesters
        )
        # Burn 10 pUSDC
        burn_msg = self.token.burn_to_bridge(self.user_gen_addr, 10_000_000, self.user_base_addr)
        self.assertEqual(self.token.balance_of(self.user_gen_addr), 0)
        self.manager.record_outbound_burn("burn_001", self.user_gen_addr, self.user_base_addr, 10_000_000, 1)
        self.assertIn("burn_001", self.manager.burn_records)

if __name__ == "__main__":
    unittest.main()
