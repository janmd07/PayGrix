# paygrix-contracts

> **IMPORTANT**: This repository will **NEVER** contain frontend code. It is strictly dedicated to PayGrix smart contracts, unit & integration tests, deployment scripts, and contract documentation.

## Purpose of `paygrix-contracts`

`paygrix-contracts` is the dedicated smart-contract repository for PayGrix, a decentralized cross-border payout and settlement protocol built on Arc Testnet. 

### Why Contracts are Separated from Frontend

1. **Security & Access Control**: Isolating smart contracts minimizes the attack surface and prevents developer errors such as leaking private keys or bundling contract administration tools inside public web assets.
2. **Independent CI/CD**: Contract testing, compilation, static analysis, and network deployments follow a distinct lifecycle from frontend web builds.
3. **Repository Cleanliness**: Keeps frontend dependencies (Next.js, React, UI libraries, Circle App Kit) separate from EVM development frameworks (Hardhat, Ethers, Solidity compiler toolchains).

---

## Technical Stack & Configuration

- **Framework**: Hardhat (TypeScript)
- **Solidity Version**: `0.8.24`
- **Testing Framework**: Chai & Ethers.js via Hardhat Toolbox

### Arc Testnet Parameters

- **Network Name**: `arcTestnet`
- **Chain ID**: `5042002`
- **RPC URL**: `https://rpc.testnet.arc.network`
- **Block Explorer**: `https://testnet.arcscan.app`

---

## Quick Start

### Installation

```bash
npm install
```

### Environment Setup

Copy `.env.example` to `.env` and fill in your private key if performing deployments:

```bash
cp .env.example .env
```

```env
ARC_TESTNET_RPC_URL=https://rpc.testnet.arc.network
DEPLOYER_PRIVATE_KEY=your_private_key_here
```

> ⚠️ **SECURITY WARNING**: Never place real private keys or secrets into source control. `.env` is listed in `.gitignore` and must never be committed. Do not print private keys in logs or expose them in client environment variables.

### Compilation

Compile contracts and generate TypeChain artifacts:

```bash
npm run compile
```

### Testing

Run the automated test suite:

```bash
npm test
```

### Deployment Commands

Deploy to Arc Testnet (once deployment scripts are added):

```bash
npx hardhat run scripts/<script-name>.ts --network arcTestnet
```

---

## Planned Protocol Architecture

- **Uniswap V2 Core**: Custom automated market maker (AMM) core contracts adapted for stablecoin swapping.
- **Arc-Compatible ERC20 Router**: Specialized router enforcing native ERC20 token dynamics on Arc network.
- **USDC/EURC Pool**: Liquidity pool establishing deep liquidity for cross-border currency conversion (USD to EUR equivalents).
- **LP Positions**: Liquidity provider tokens and position tracking.
- **PayGrix Smart Routing**: On-chain routing logic determining optimal execution paths for payments.
- **Circle Fallback**: Seamless fallback integration mechanism when pool liquidity limits are reached.
- **Protocol Treasury**: Treasury contract for collecting protocol fee cuts and routing platform revenues.

---

## Repository Structure

```
paygrix-contracts/
├── contracts/
│   ├── core/           # AMM core factory & pair contracts
│   ├── periphery/      # Routers & auxiliary contracts
│   ├── interfaces/     # Protocol interfaces
│   ├── libraries/      # Utility libraries
│   ├── mocks/          # Test mocks & placeholders
│   └── test/           # Test-specific contract helpers
├── scripts/            # Network deployment & management scripts
├── test/               # Hardhat TypeScript unit & integration tests
├── deployments/        # Deployment logs & contract addresses
├── docs/               # Architecture & API documentation
├── .env.example
├── .gitignore
├── hardhat.config.ts
├── package.json
├── tsconfig.json
└── README.md
```
