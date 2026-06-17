---
name: concierge-intel
description: Call Concierge Agent paid market intelligence on conc-exe.xyz — macro, wire, DeFi TVL, yields, whales, wallet, verdict, alpha desks, scalp desk, and Gemini/GLM chat. Use when the user asks for live market intel, x402 micropayments, Poncho routing, or Concierge API integration. Requires pay CLI for automatic 402 settlement.
---

# Concierge Agent intel (x402)

**Origin:** `https://conc-exe.xyz`  
**Discovery:** `GET /openapi.json` · `GET /.well-known/x402`  
**Payment:** HTTP 402 + USDC (PayAI). No API keys — use [pay.sh](https://pay.sh/) CLI or wallet retry.  
**Marketplaces:** [x402scan](https://www.x402scan.com/) · [Poncho](https://tryponcho.com/) (no Concierge API key)

## Install pay CLI (handles 402)

```bash
brew install pay
# or: npm install -g @solana/pay
```

## Sandbox probes ($0.10 USDC, ephemeral wallet)

```bash
pay --sandbox curl https://conc-exe.xyz/api/concierge-intel-macro -d '{}'

pay --sandbox curl https://conc-exe.xyz/api/concierge-intel-wire \
  -d '{"category":"Geopolitics","limit":5}'

pay --sandbox curl https://conc-exe.xyz/api/concierge-intel-tvl -d '{}'

pay --sandbox curl https://conc-exe.xyz/api/concierge-intel-yields \
  -d '{"chain":"solana","project":"meteora"}'

pay --sandbox curl https://conc-exe.xyz/api/concierge-intel-scalp \
  -d '{"symbols":["BTC","ETH"],"intervals":["5m","15m"]}'

pay --sandbox curl https://conc-exe.xyz/api/concierge \
  -d '{"mode":"chat","message":"BTC outlook on 15m"}'
```

## Fifteen paid routes

| Path | Price |
|------|-------|
| `POST /api/concierge` | $0.10 |
| `POST /api/concierge-intel-*` (11 intel desks incl. macro, wire) | $0.10 each |
| `POST /api/news-open` | $0.10 |
| `POST /api/lounge-signal-open` | $0.10 |
| `POST /api/lounge-signal-publish` | $1.00 |

Full catalog: `/agent/endpoints` · Docs: `/docs/grok-build` · Poncho: `/docs/integration/poncho`

## This repo (gold-panel)

| Area | Path |
|------|------|
| API router | `api/[...path].ts` |
| Handlers | `lib/concierge-api/` |
| Research intel | `lib/concierge-api/concierge-research-intel.ts` |
| x402 | `lib/concierge-api/x402-server.ts` |
| OpenAPI | `lib/concierge-api/x402-discovery.ts` |
| Integrations UI | `public/integrations.html` |

After changing API routes, keep Vercel Hobby ≤12 functions — handlers stay outside `/api/`.

## Verify Grok loaded this skill

```bash
grok inspect
```

Invoke in session: `/concierge-intel`
