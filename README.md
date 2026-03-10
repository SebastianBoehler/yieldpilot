# YieldPilot

YieldPilot is now a production-oriented autonomous onchain agent runtime.

The original cross-chain yield optimizer remains live as the first built-in strategy pack. Underneath it, the project now uses a generic cycle runner, protocol adapters, gas-sponsorship-aware execution plumbing, hardcoded risk controls, and Railway/Postgres deployment defaults.

## What is live in phase 1

- EVM-first runtime on `Arbitrum`, `Base`, and `Optimism`
- Generic action loop with persistent cycle, action, protocol, and trace records
- Yield strategy pack backed by live Aave + LI.FI data
- DEX / bridge adapter via LI.FI
- Lending / yield adapter via Aave
- Human approval mode and autonomous mode on the same runtime
- Hardcoded limits for action count, notional, slippage, approvals, leverage, and emergency pause
- Railway-ready web + worker deployment posture

## What is scaffolded in phase 1

- ERC-4337 smart-account provider interface
- Pimlico-compatible gas sponsor interface
- EIP-7702 delegated execution interface
- Perps adapter
- NFT adapter
- Vault / staking adapter beyond Aave

These scaffolded paths fail closed with explicit unsupported results and logs. They do not silently fall through.

## Architecture

`scheduler -> cycle runner -> strategy module -> protocol adapter -> wallet provider -> gas sponsor -> persistence/logging`

Key modules:

- `src/agent/`: generic cycle runner, strategy modules, shared runtime types
- `src/protocols/`: protocol adapter registry and adapters
- `src/execution/`: execution facade
- `src/wallet/`: EOA, smart-account, and delegated execution providers
- `src/gas/`: sponsor provider abstraction
- `src/risk/`: hardcoded risk engine
- `src/storage/`: cycle/action persistence helpers

## Current strategy pack

### `yield-agent`

The preserved yield feature now runs as a strategy module:

1. discover positions and yield opportunities
2. select the best rebalance candidate
3. normalize the plan into generic actions
4. quote, validate, simulate, and optionally execute those actions

## Environment

Copy `.env.example` to `.env`.

Required baseline:

- `DATABASE_URL`
- `ARBITRUM_RPC_URL`
- `BASE_RPC_URL`
- `OPTIMISM_RPC_URL`
- `NEXT_PUBLIC_DEFAULT_WALLET_ADDRESS`

Optional but recommended:

- `GOOGLE_API_KEY`
- `GOOGLE_GENAI_MODEL`
- `AGENT_PRIVATE_KEY`
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
- `LIVE_EXECUTION_ENABLED`
- `ENABLE_SMART_ACCOUNTS`
- `ENABLE_GAS_SPONSORSHIP`
- `ERC4337_BUNDLER_RPC_URL`
- `ERC4337_PAYMASTER_RPC_URL`
- `SMART_ACCOUNT_FACTORY_ADDRESS`
- `AGENT_HEALTHCHECK_TOKEN`

Important: gas sponsorship only covers gas where the selected wallet path and protocol adapter support it. It does not cover swap fees, bridge fees, collateral, borrow exposure, asset cost, NFT purchase price, slippage, or marketplace fees.

## Local development

Start Postgres:

```bash
docker compose up postgres -d
```

Install and prepare Prisma:

```bash
bun install
bun run db:generate
bun run db:push
```

Run the app:

```bash
bun run dev
```

Run the worker:

```bash
bun run worker
```

Run checks:

```bash
bun run lint
bun run test
bun run build
```

## Railway deployment

Recommended services:

- `yieldpilot-web`
- `yieldpilot-worker`
- `Postgres`

### Web service

- Use the repo `Dockerfile`
- Start command: `bun run db:push && bun run start:web`
- Health check path: `/api/health`

### Worker service

- Use the same repo `Dockerfile`
- Start command: `bun run db:push && bun run worker`

Recommended Railway variables:

- `DATABASE_URL` from Railway Postgres
- `NEXT_PUBLIC_DEFAULT_WALLET_ADDRESS`
- `ARBITRUM_RPC_URL`
- `BASE_RPC_URL`
- `OPTIMISM_RPC_URL`
- `GOOGLE_API_KEY` if you want ADK summaries
- `AGENT_PRIVATE_KEY` for backend autonomous execution
- `LIVE_EXECUTION_ENABLED=false` by default
- `ENABLE_SMART_ACCOUNTS=false` by default
- `ENABLE_GAS_SPONSORSHIP=false` by default

Turn `LIVE_EXECUTION_ENABLED` on only after confirming RPC, wallet, limits, and protocol support.

## Health endpoints

- `GET /api/health`
- `GET /api/ready`

If `AGENT_HEALTHCHECK_TOKEN` is set, pass it as `?token=...` to `/api/health`.

## Example triggers

### Gas-aware yield / Aave cycle

```bash
curl -X POST http://localhost:3000/api/agent/run \
  -H "Content-Type: application/json" \
  -d '{"walletAddress":"0xYOUR_WALLET"}'
```

### Browser-wallet live plan

```bash
curl -X POST http://localhost:3000/api/agent/plan \
  -H "Content-Type: application/json" \
  -d '{"walletAddress":"0xYOUR_WALLET"}'
```

### Scaffolded examples

These are architecture examples in phase 1, not live end-to-end protocol coverage yet:

- gasless swap: LI.FI adapter + sponsorship-aware execution facade
- gasless perp open: perps adapter returns structured unsupported result
- gasless NFT mint or buy: NFT adapter returns structured unsupported result
- gasless vault deposit: vault adapter returns structured unsupported result unless mapped to Aave lending/yield actions

## Known limitations

- ERC-4337 provider plumbing is in place, but the local phase-1 wallet provider still falls back to EOA execution unless the smart-account route is fully supported
- EIP-7702 is interface-only in phase 1
- Perps, NFTs, and non-Aave vault/staking flows are scaffolded, not live
- Solana remains portfolio-visibility-first; the main execution runtime is EVM-first

## Highest leverage next steps

- enable a real ERC-4337 submission path for single-step Aave and LI.FI bundles
- add protocol-specific perps support behind a dedicated adapter
- add one live NFT adapter with strict marketplace and price allowlists
- move approval and cycle views to dedicated action-level dashboards
- replace the simple worker lease with stronger transactional locking if multi-worker scale becomes necessary
