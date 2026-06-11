# Concierge Agent (gold-panel)

Executive Lounge + pay-per-call market intelligence API at `https://conc-exe.xyz`.

## Layout

- **API entry:** `api/[...path].ts` (Edge router) · Node: `api/concierge.ts` (60s), `api/lounge-creator-payout.ts`, `api/lounge-rwa-mint-sol.ts`
- **Handlers:** `lib/concierge-api/` — keep new handlers **outside** `/api/` (Vercel Hobby ≤12 serverless functions)
- **Static UI:** `public/` — Lounge, agent hub, docs, integrations
- **x402 / OpenAPI:** `lib/concierge-api/x402-server.ts`, `x402-discovery.ts`

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
