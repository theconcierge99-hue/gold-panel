# Concierge Agent (gold-panel)

Executive Lounge + pay-per-call market intelligence API at `https://conc-exe.xyz`.

## Layout

- **Frontend** (`frontend/`) — static Lounge UI (`public/`), TanStack app (`src/`), browser bundles (`lib/`)
- **Backend** (`backend/`) — Concierge API handlers (`concierge-api/`), Vercel entries (`api/`), dev middleware (`concierge-dev-plugin.ts`)
- **API entry (Vercel):** root `api/*.ts` shims → `backend/api/` · Edge router `[...path].ts` · Node: `lounge-creator-payout`, `lounge-rwa-mint-sol`
- **Handlers:** `backend/concierge-api/` — keep new handlers **outside** root `/api/` (Vercel Hobby ≤12 serverless functions)
- **x402 / Token Pay:** `backend/concierge-api/token-pay/` · partner APIs `/api/token-pay-build-accept`, `/api/token-pay-verify` · SDK `packages/token-x402`
- **x402 / OpenAPI:** `backend/concierge-api/x402-server.ts`, `x402-discovery.ts`
- **Research intel (Poncho / x402scan):** `concierge-research-intel.ts` — `intel-macro`, `intel-wire` (15 pay-per-call routes total)

## Integrations

- **Poncho** — `/docs/integration/poncho` · discoverable via x402scan; no Concierge API key for consumers
- **x402scan / MPPscan / pay.sh** — discovery + AgentCash settlement

## Grok Build

Skill: `.grok/skills/concierge-intel/` — invoke `/concierge-intel` in `grok` sessions.  
Docs: `/docs/grok-build` · Pay intel calls via `pay --sandbox curl https://conc-exe.xyz/api/...`

## Commands

```bash
npm run dev          # Vite + local API middleware
npm run build        # production build
npm run discovery:validate
```

Do not add top-level `api/*.ts` files without checking the 12-function Hobby limit.
