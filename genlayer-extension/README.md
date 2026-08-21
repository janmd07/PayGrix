# PAYGRIX × GENLAYER — PHASE 3 ISOLATED EXTENSION MODULE
## Intelligent Escrow & Dispute Resolution System

> [!IMPORTANT]
> **ISOLATION & FREEZE STATEMENT**:
> **Existing PayGrix is not modified by this extension.**
> All contracts, scripts, adapters, tests, relayer components, and UI artifacts in this directory are 100% self-contained within `genlayer-extension/`.

---

## 1. Project Purpose

The **PayGrix × GenLayer Extension** introduces intelligent, AI-powered non-custodial escrow dispute resolution. 

- **Settlement Layer (Base Sepolia)**: Holds USDC capital in an escrow vault contract. USDC never leaves Base Sepolia.
- **Adjudication Layer (GenLayer Bradbury)**: Executes Intelligent Contracts powered by non-deterministic LLM evaluation and validator equivalence consensus.
- **Cross-Chain Abstraction**: `IAdjudicationSource` adapter interface decouples vault settlement from transport/proof mechanisms until testnet bridge verification is finalized.

---

## 2. Architecture & Flow

```
+-------------------------------------------------------------------+
|                        BASE SEPOLIA                               |
|                                                                   |
|   +-----------------------+           +-----------------------+   |
|   |  PayGrixEscrowVault   | <-------> |  BaseBridgeAdapter    |   |
|   +-----------------------+           +-----------------------+   |
|               | (USDC Remains Safe)               ^               |
+---------------+-----------------------------------+---------------+
                |                                   |
                | (Dispute Event)                   | (Authenticated Verdict)
                v                                   |
+-------------------------------------------------------------------+
|                        RELAYER SERVICE                            |
|             (Dry-Run Mode / Testnet Orchestration)                |
+-------------------------------------------------------------------+
                |                                   ^
                | (Parse Evidence)                  | (Return Consensus Verdict)
                v                                   |
+-------------------------------------------------------------------+
|                     GENLAYER BRADBURY                             |
|                                                                   |
|   +-----------------------+           +-----------------------+   |
|   | GenLayerBridgeAdapter | --------> | Intelligent Dispute   |   |
|   |                       |           | Resolver (LLM)        |   |
|   +-----------------------+           +-----------------------+   |
+-------------------------------------------------------------------+
```

---

## 3. Escrow State Machine

```
CREATED ---> FUNDED ---> DISPUTED ---> ADJUDICATION_PENDING ---> RELEASED (Verdict = 1)
   |           |                           |
   |           +---> EXPIRED_REFUNDED      +-------------------> REFUNDED (Verdict = 2)
   |           | (Timeout claim)           |
   |           +---------------------------+-------------------> UNDETERMINED_RESOLVED (Verdict = 3)
   |                                       |
   +---------------------------------------+-------------------> EMERGENCY_REFUNDED (Admin after 14 days)
```

---

## 4. Verdict Model & Fallback Mechanics

| Verdict Code | Status | Action |
| :--- | :--- | :--- |
| `1` | `APPROVED` | 100% of Escrow USDC transferred to Beneficiary |
| `2` | `REJECTED` | 100% of Escrow USDC refunded to Depositor |
| `3` | `UNDETERMINED` | **Fallback**: 100% refund to Depositor (Safest capital preservation) |

---

## 5. Security & Safety Principles

1. **USDC Safety**: Tokens are held exclusively on Base Sepolia. SafeERC20 with ReentrancyGuard is strictly enforced.
2. **Replay Protection**: Settlements check unique `keccak256(abi.encodePacked(escrowId, adjudicationId))` pairs.
3. **Prompt Engineering & Input Isolation**: Evidence text is tagged and separated from system instructions in GenLayer prompts to prevent prompt injection.
4. **Structured Consensus**: GenLayer validators reach consensus strictly on the integer verdict code (`1`, `2`, or `3`), avoiding consensus failure on free-form LLM prose.
5. **No Privileged EOA Auth**: Settlement authorization requires `IAdjudicationSource` authentication.

---

## 6. Directory Layout

```
genlayer-extension/
├── contracts/
│   ├── base-sepolia/
│   │   ├── PayGrixEscrowVault.sol
│   │   └── interfaces/
│   │       └── IAdjudicationSource.sol
│   └── genlayer/
│       └── intelligent_dispute_resolver.py
├── bridge/
│   └── adapter/
│       ├── BaseBridgeAdapter.sol
│       └── GenLayerBridgeAdapter.py
├── relayer/
│   ├── relayer_service.py
│   └── config.example.py
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── App.tsx
│       ├── index.css
│       ├── main.tsx
│       ├── components/
│       │   ├── EscrowForm.tsx
│       │   ├── EscrowCard.tsx
│       │   ├── DisputePanel.tsx
│       │   └── VerdictViewer.tsx
│       └── types/
│           └── escrow.ts
├── tests/
│   ├── unit/
│   │   ├── test_escrow_vault.ts
│   │   └── test_dispute_resolver.py
│   └── e2e/
│       └── test_escrow_lifecycle.ts
└── README.md
```

---

## 7. Local Testing & Execution

### Run GenLayer Dispute Resolver Python Tests
```bash
python -m unittest genlayer-extension/tests/unit/test_dispute_resolver.py
```

### Run Dry-Run Relayer Service
```bash
python genlayer-extension/relayer/relayer_service.py
```

---

## 8. Bridge Integration Status

> [!NOTE]
> **TESTNET INTEGRATION BOUNDARY**:
> The exact cross-chain transport mechanism (LayerZero, Teleporter, or Hyperlane) is unverified in this local build phase. `BaseBridgeAdapter` and `GenLayerBridgeAdapter` act as strict boundary contracts marked with `UNVERIFIED / TODO` markers.

---

## 9. Future Deployment Plan

1. Verify Base Sepolia LayerZero/Bridge endpoint addresses.
2. Deploy `PayGrixEscrowVault` and `BaseBridgeAdapter` to Base Sepolia testnet.
3. Deploy `IntelligentDisputeResolver` to GenLayer Bradbury testnet.
4. Update `config.py` with deployed contract addresses and start live relayer service.
