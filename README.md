# YieldPilot

YieldPilot is now an **ACP-first Virtuals provider** for:

- crypto research services
- non-custodial trade-planning services
- LI.FI-backed routing and transaction bundle planning

The repo still contains the existing YieldPilot execution and approval flow, but it now serves mainly as the handoff layer behind the ACP agents rather than as a standalone “general autonomous app”.

## Provider Agents

### `yieldpilot-research`

Paid ACP research offerings:

- `analyze_token_launch`
- `detect_whale_movements`
- `generate_trade_signal`

Primary inputs:

- DexScreener
- CoinGecko
- DefiLlama
- RSS feeds
- watchlist-based explorer transfer lookups on Base, Arbitrum, and Optimism

Resources:

- `latest_signals`
- `tracked_whales`
- `recent_launches`
- `supported_chains`
- `methodology`
- `signal_history`

### `yieldpilot-trade-planner`

Paid ACP planning offerings:

- `build_spot_swap_plan`
- `build_rebalance_plan`

Supported planning surface:

- spot swap
- bridge + swap
- Aave deposit / withdraw rebalance plans

Explicitly out of scope in v1:

- direct ACP fund-transfer jobs
- custody of user principal
- perps
- NFTs
- non-Aave vault/staking flows
- autonomous on-chain execution from ACP jobs

## Architecture

`ACP job -> payload normalization -> research pipeline or trade planner -> persistence/audit -> structured JSON deliverable`

Relevant modules:

- `src/lib/virtuals/`: ACP runtime, request parsing, manifest definitions
- `src/server/services/research-service.ts`: research inputs, synthesis, resource payloads
- `src/server/services/trade-planner-service.ts`: LI.FI planning and rebalance-plan generation
- `src/storage/virtuals-store.ts`: research history, whale alerts, launch analyses, trade plans, ACP audits
- `scripts/acp-worker.ts`: dedicated ACP worker entrypoint

## Environment

Copy `.env.example` to `.env`.

Required for the ACP runtime:

- `DATABASE_URL`
- `ACP_BASE_URL`
- `ACP_ENVIRONMENT`
- `ACP_DEVELOPER_PRIVATE_KEY`
- `ACP_RESEARCH_AGENT_ENTITY_ID`
- `ACP_RESEARCH_AGENT_WALLET_ADDRESS`
- `ACP_TRADE_PLANNER_AGENT_ENTITY_ID`
- `ACP_TRADE_PLANNER_AGENT_WALLET_ADDRESS`
- `ARBITRUM_RPC_URL`
- `BASE_RPC_URL`
- `OPTIMISM_RPC_URL`

Recommended:

- `GOOGLE_API_KEY`
- `GOOGLE_GENAI_MODEL`
- `ACP_TRACKED_WHALES`
- `ACP_ARBISCAN_API_KEY`
- `ACP_BASESCAN_API_KEY`
- `ACP_OPTIMISM_EXPLORER_API_KEY`

Optional pricing overrides:

- `ACP_ANALYZE_TOKEN_LAUNCH_PRICE_USDC`
- `ACP_DETECT_WHALE_MOVEMENTS_PRICE_USDC`
- `ACP_GENERATE_TRADE_SIGNAL_PRICE_USDC`
- `ACP_BUILD_SPOT_SWAP_PLAN_PRICE_USDC`
- `ACP_BUILD_REBALANCE_PLAN_PRICE_USDC`

## Local Development

Start Postgres:

```bash
docker compose up postgres -d
```

Install dependencies and generate Prisma:

```bash
bun install
bun run db:generate
bun run db:push
```

Run the web app:

```bash
bun run dev
```

Run the ACP worker:

```bash
bun run worker:acp
```

Legacy YieldPilot worker remains available:

```bash
bun run worker
```

## Manifest and Resources

ACP-facing JSON endpoints:

- `GET /api/virtuals/manifest`
- `GET /api/virtuals/resources/[resource]?agent=yieldpilot-research`
- `GET /api/virtuals/resources/[resource]?agent=yieldpilot-trade-planner`
- `GET /api/virtuals/trade-plans/[id]`

The manifest is intended to make Virtuals agent setup and resource registration repeatable and explicit.

## Execution Handoff

Trade-planner jobs never directly execute user funds from ACP.

Instead, YieldPilot returns:

- route summary
- estimated fees/gas
- policy verdict
- dry-run transaction steps
- `executionUrl` pointing to the existing YieldPilot approval-gated flow

LI.FI remains the routing layer for spot and bridge planning.

## Verification

Checks used for this implementation:

```bash
bun run lint
bun run test
bun run build
```
