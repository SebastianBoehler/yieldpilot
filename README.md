# YieldPilot

[![CI](https://github.com/SebastianBoehler/yieldpilot/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/SebastianBoehler/yieldpilot/actions/workflows/ci.yml)
[![Docker](https://github.com/SebastianBoehler/yieldpilot/actions/workflows/docker.yml/badge.svg?branch=main)](https://github.com/SebastianBoehler/yieldpilot/actions/workflows/docker.yml)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Google ADK](https://img.shields.io/badge/Google%20ADK-Agent%20Framework-4285F4?logo=google&logoColor=white)
![LI.FI](https://img.shields.io/badge/LI.FI-Capital%20Movement-111827)
![Aave](https://img.shields.io/badge/Aave-Live%20RPC%20Markets-B6509E)
![Data](https://img.shields.io/badge/Data-Live%20RPC%20%26%20Official%20APIs-0F766E)

Autonomous cross-chain treasury management for stablecoins.

YieldPilot is a production-style MVP for the LI.FI autonomous agent challenge. It continuously scans live lending opportunities across EVM chains, estimates net carry after bridge and execution costs, and either proposes or executes rebalances under explicit user policy.

The system uses Google Agent Development Kit as the agent framework, LI.FI as the capital movement layer, and official on-chain/provider data instead of mock snapshots or demo feeds.

## Why this repo matters

- Cross-chain stablecoin treasury automation with a real execution loop
- Google ADK agent orchestration with explicit strategy, risk, execution, and portfolio roles
- LI.FI integrated into the actual rebalance path, not as a standalone demo call
- Human approval and autonomous execution modes sharing the same transaction planner
- Live Aave V3 RPC reads for opportunities and positions
- Full audit trail for approvals, decisions, transactions, and agent runs
- Vercel-friendly preview flow for live portfolio and route inspection

## Current deployment posture

YieldPilot is now shaped for a Vercel preview deployment where you can:

- connect an EVM wallet such as Phantom EVM, MetaMask-compatible injected wallets, or WalletConnect
- inspect live stablecoin balances and Aave positions across supported chains
- inspect discovered yield sources from live RPC reads
- generate a live rebalance plan
- execute the full wallet-side sequence, including the destination deposit step

What is intentionally not enabled yet:

- scheduled automation via cron
- production-grade persistent infrastructure defaults

The preview deployment path is centered on live read plus direct browser-wallet execution. The persisted approval and log model still exists, but for durable multi-user persistence you should move the deployment to a managed Postgres database.

## Core stack

- Google ADK
- Next.js 16 App Router
- TypeScript
- Tailwind CSS 4
- Prisma + SQLite
- viem
- LI.FI SDK
- Aave V3 official contracts and address book
- Vitest
- Docker

## Live data sources

YieldPilot does not use demo yield data.

- Opportunity discovery: Aave V3 reserve data via official contracts over RPC
- Position discovery: Aave V3 user reserve data via official contracts over RPC
- Capital movement pricing: LI.FI SDK route discovery
- Chain execution: viem against configured RPC endpoints

Current live scope:

- Aave V3 on Arbitrum
- Aave V3 on Base
- Aave V3 on Optimism
- Stablecoin-focused assets: `USDC`, `USDT`, `DAI`

Base is currently `USDC`-first because that is the cleanest reliable Aave stablecoin surface in this MVP.

## Product architecture

### Agent system

- `Strategy Agent`: evaluates live opportunities and produces the rebalance thesis
- `Risk Agent`: validates chains, protocols, assets, caps, cooldowns, and benefit thresholds
- `Execution Agent`: prepares allowance, bridge, swap, withdrawal, and deposit steps
- `Portfolio Agent`: summarizes allocation state, effective APY, and run outcomes

The deterministic planner computes candidates and execution plans. Google ADK then reviews and structures the decision output that is persisted and surfaced in the UI.

### Execution loop

Every cycle:

1. Fetches current positions
2. Scans live Aave opportunities
3. Prices LI.FI routes
4. Scores alternatives after bridge, gas, slippage, and risk penalties
5. Validates policy
6. Queues approval or executes
7. Records the outcome

### Execution modes

#### Human approval

- Scans and scores opportunities
- Builds the exact transaction sequence
- Queues approvals before any allowance change, swap, bridge, withdrawal, or deposit
- Exposes per-step transaction data in the approval queue
- Also supports direct browser-wallet execution of a live plan from the opportunities page

#### Autonomous

- Uses a backend wallet only when `AGENT_PRIVATE_KEY` is configured
- Enforces allowlists, limits, cooldowns, and minimum benefit thresholds
- Writes the same decision and transaction audit trail as human mode

## Pages shipped

- Landing page
- Dashboard
- Opportunities
- Strategy settings
- Approval queue
- Execution logs

## Repo structure

```txt
src/
  app/
    (marketing)/
    dashboard/
    opportunities/
    settings/
    approvals/
    logs/
    api/
  components/
    approvals/
    charts/
    dashboard/
    layout/
    settings/
    ui/
  lib/
    adk/
    config/
    db/
    lifi/
    orchestration/
    portfolio/
    protocols/
    risk/
    scoring/
    utils/
    wallet/
  server/
    services/
  types/
prisma/
scripts/
tests/
```

## Local setup

Copy `.env.example` to `.env` and set the values you need:

```bash
cp .env.example .env
```

Important variables:

- `DATABASE_URL`: Prisma connection string. Local default is SQLite
- `ARBITRUM_RPC_URL`
- `BASE_RPC_URL`
- `OPTIMISM_RPC_URL`
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`: optional, enables WalletConnect in the browser
- `NEXT_PUBLIC_ARBITRUM_RPC_URL`
- `NEXT_PUBLIC_BASE_RPC_URL`
- `NEXT_PUBLIC_OPTIMISM_RPC_URL`
- `LIFI_INTEGRATOR`
- `NEXT_PUBLIC_DEFAULT_WALLET_ADDRESS`: wallet to inspect and operate against in local MVP mode
- `GOOGLE_API_KEY`: enables live Google ADK reviews
- `GOOGLE_GENAI_MODEL`: defaults to `gemini-2.5-flash`
- `AGENT_PRIVATE_KEY`: required only for autonomous execution mode
- `AGENT_LOOP_INTERVAL_MINUTES`: worker schedule

If `GOOGLE_API_KEY` is not set, the deterministic planner still runs and the ADK layer falls back to structured local summaries so the app remains runnable.

Install dependencies and bootstrap the database:

```bash
npm install
npm run db:generate
npm run db:push
```

Start the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Start the recurring agent worker in a second terminal:

```bash
npm run worker
```

## Vercel preview

Recommended env vars for a preview deployment:

- `DATABASE_URL=file:/tmp/yieldpilot.db`
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` if you want WalletConnect support
- `GOOGLE_API_KEY` if you want ADK review summaries to use Gemini instead of the deterministic fallback

The preview flow is meant for:

- viewing live opportunities and sources
- viewing supported cross-chain wallet balances
- generating a live plan
- executing that plan from a connected EVM wallet

## Quality checks

```bash
npm run lint
npm run test
npm run db:push
npm run build
```

## GitHub workflows

- `ci.yml`: installs dependencies and runs lint, tests, and production build on pushes and pull requests
- `docker.yml`: verifies the Docker image builds successfully on pushes and pull requests

## Docker

Build and run the web app plus the worker:

```bash
docker compose up --build
```

The compose setup persists the SQLite database in a named Docker volume and starts:

- `app`: Next.js server on port `3000`
- `worker`: recurring YieldPilot agent loop

## Main implementation files

- `src/lib/adk/runner.ts`: Google ADK agent orchestration
- `src/lib/orchestration/rebalance.ts`: live rebalance decision flow
- `src/lib/protocols/aave-v3.ts`: Aave RPC integration
- `src/lib/lifi/quotes.ts`: LI.FI routing and cost estimation
- `src/lib/risk/policy-engine.ts`: policy validation
- `src/lib/scoring/engine.ts`: opportunity scoring and ranking
- `src/lib/wallet/signing-service.ts`: approval prep and autonomous signing
- `src/lib/wallet/wagmi-config.ts`: browser wallet connector configuration
- `src/lib/wallet/execute-transaction-plan.ts`: sequential wallet-side transaction execution
- `src/server/services/agent-service.ts`: end-to-end agent run service
- `src/server/services/live-portfolio-service.ts`: DB-independent live portfolio snapshot

## Policy controls

- chain allowlist
- protocol allowlist
- asset allowlist
- max rebalance amount
- max per-transaction amount
- minimum projected net benefit
- maximum strategy slippage
- cooldown window
- emergency pause
- trusted protocol thresholds for auto-approval behavior

Approvals are never hidden. In human mode, allowance transactions are surfaced explicitly as their own transaction steps.

## Current MVP limits

- Opportunity coverage is intentionally narrow and stablecoin-focused
- Browser wallet support is EVM-only today; Phantom Solana is not integrated yet
- Autonomous execution assumes an EVM-compatible browser wallet or a backend execution key
- Base support is narrower than Arbitrum and Optimism because the live opportunity set is constrained to reliable Aave markets
- The first protocol abstraction is Aave-centric; Morpho and Spark are the next natural extensions

This is the right tradeoff for a serious MVP: live data, explicit controls, narrow protocol scope, and an agent loop that can actually run locally.
