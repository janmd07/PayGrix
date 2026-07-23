# PayGrid

PayGrid is a stablecoin payroll interface for crypto-native teams.

This project is intentionally configured for **Arc Testnet only**.

## Stack

- Next.js 15 App Router
- TypeScript
- Tailwind CSS
- shadcn/ui-style components
- Supabase
- wagmi
- viem

## Arc Testnet

- Chain name: Arc Testnet
- Chain ID: 5042002
- RPC URL: https://rpc.testnet.arc.network
- Explorer: https://testnet.arcscan.app

## Getting Started

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and add Supabase credentials before connecting data-backed features.

## Smart Contract Deployment

This project includes the `ArcPayroll` Solidity smart contract which batches employee payroll using USDC.

### 1. Configure Environment Variables
Copy `.env.example` to `.env` in the root directory (do not commit this file):
```bash
cp .env.example .env
```
Open `.env` and set your deployer's private key:
```env
PRIVATE_KEY=your_private_key_here
```

### 2. Compilation
Compile the smart contracts using Hardhat:
```bash
npx hardhat compile
```

### 3. Deploy to Arc Testnet
Run the deployment script:
```bash
npx hardhat run scripts/deploy.js --network arcTestnet
```
This will deploy the contract to the Arc Testnet and log the deployed contract address.

### 4. Verification (Optional)
If the explorer API is available, you can verify your contract on ArcScan:
```bash
npx hardhat verify --network arcTestnet <DEPLOYED_CONTRACT_ADDRESS> "0x3600000000000000000000000000000000000000"
```

### 5. Update Frontend Address
The contract is deployed and integrated with the frontend at:
```typescript
const PAYROLL_ADDRESS = "0x24e9cbc99ab4d696f7ad9ffa42d15dc84ce5a006";
```

 #   A r c - P a y  
 #   A r c - P a y  