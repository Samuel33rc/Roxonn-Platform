# 🚀 The Roxonn Developer's Flight Manual
**From Zero to Your First On-Chain Bounty in 15 Minutes.**

Welcome to the Roxonn FutureTech ecosystem. This guide is designed to get you up and running with the full-stack platform, from the TypeScript backend to the XDC smart contracts.

---

## 🏗️ 1. Architecture Overview
Before diving into the code, understand the flow:
- **Backend (Express + Drizzle ORM)**: Manages the business logic, GitHub OAuth, and database state.
- **Blockchain (XDC Network)**: Handles the `DualCurrencyRepoRewards` contract for USDC, ROXN, and XDC payouts.
- **Security (AWS KMS + Tatum)**: Ensures developer private keys are encrypted and managed securely.
- **AI Layer**: Integrated Azure OpenAI models for automated scoping and development assistance.

---

## 🛠️ 2. Local Environment Setup

### Prerequisites
- **Node.js 20+** (Recommended)
- **PostgreSQL** instance (Local or Neon.tech)
- **XDC Testnet Wallet** (Apothem Network)

### Step-by-Step Installation
1. **Clone the Repo**:
   ```bash
   git clone https://github.com/Roxonn-FutureTech/Roxonn-Platform.git
   cd Roxonn-Platform
   ```
2. **Install Dependencies**:
   ```bash
   npm install
   ```
3. **Database Initialization**:
   Roxonn uses Drizzle ORM. Push the schema to your local DB:
   ```bash
   npm run db:push
   ```
4. **Launch the Engines**:
   Run both the Vite frontend and Express backend simultaneously:
   ```bash
   npm run dev
   ```

---

## 🔑 3. Configuration (The .env Checklist)
Create a `server/.env` file. At a minimum, you need these to bypass errors:

| Variable | Purpose |
| :--- | :--- |
| `DATABASE_URL` | Your PostgreSQL connection string. |
| `GITHUB_CLIENT_ID/SECRET` | Obtain from GitHub Developer Settings (OAuth App). |
| `XDC_RPC_URL` | Use `https://erpc.apothem.network` for testing. |
| `DUAL_CURRENCY_REWARDS_CONTRACT_ADDRESS` | The main rewards proxy address. |
| `JWT_SECRET` | Any random string for session security. |
| `SESSION_SECRET` | Secret pour les sessions Express. |
| `ENCRYPTION_KEY` | Clé 32 chars pour chiffrer les wallets. |
| `GITHUB_APP_ID` | ID de votre GitHub App (pour les repos privés). || `SESSION_SECRET` | Secret pour les sessions Express. |
| `ENCRYPTION_KEY` | Clé 32 chars pour chiffrer les wallets. |
| `GITHUB_APP_ID` | ID de votre GitHub App (pour les repos privés). |
---

## 🎯 4. The "First Bounty" Workflow
To test the core loop of the platform:

1. **Login**: Use the "Login with GitHub" button on the local dashboard.
2. **Register a Repo**: Go to `/my-repos` and link a test repository.
3. **Fund a Bounty**: 
   - Ensure your wallet has test XDC/USDC.
   - Use the `POST /api/blockchain/repository/:repoId/fund` endpoint or the UI button.
4. **Verify On-Chain**: Check the `DualCurrencyRepoRewards.sol` contract state to see your funded pool.

---

## 🧪 5. Useful Commands for Devs
- **Type Checking**: `npm run check`
- **Unit Testing**: `npm test`
- **Smart Contract Compile**: `npx hardhat compile`
- **Deploy to Testnet**: `npx hardhat run scripts/deploy_dual_currency_rewards.cjs --network xdcTestnet`

---

## 🆘 Troubleshooting
- **DB Issues?** Run `npm run db:push` again to sync schema changes.
- **500 Errors?** Check if your `DATABASE_URL` is accessible.
- **Web3 Failures?** Ensure your RPC URL is active and your wallet has enough gas for transactions.

---
**Happy Coding!** Let's build the future of decentralized collaboration together.
*For more details, check `CLAUDE.md` and `/docs`.*
