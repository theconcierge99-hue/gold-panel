---
name: concierge-agent
title: "Concierge Agent"
description: "Pay-per-call market intelligence for AI agents — Concierge chat, macro & wire research, DeFi intel, Alpha desks, and Lounge wire. x402 USDC on Solana, no API keys."
use_case: "Agent market research — macro, wire, DeFi intel, alpha desks, wallet snapshots. Callable from Poncho/x402scan. No API keys or subscriptions."
category: finance
service_url: https://conc-exe.xyz
version: "4.0.0"
openapi:
  path: openapi.json
---

Concierge Agent is **market intelligence as a service** for autonomous agents and builders. Fifteen pay-per-call routes on `https://conc-exe.xyz` — settlement via **x402 USDC** ([PayAI facilitator](https://facilitator.payai.network) primary; [Dexter](https://x402.dexter.cash) fallback + [OpenDexter](https://dexter.cash/opendexter) discovery). Listed on [x402scan](https://www.x402scan.com/) and callable from [Poncho](https://tryponcho.com/) — **no Concierge API key**.

**Concierge AI** — natural-language desk (`POST /api/concierge`) for macro, geo, technicals, and trading plans.

**Research** — structured JSON for agent marketplaces: `intel-macro` (SPX, VIX, DXY, Fear & Greed, Treasury yields) and `intel-wire` (headline digest from RSS + Lounge memory).

**DeFi Intel** — structured JSON: TVL (DeFi Llama), yields (Meteora DLMM, Jupiter), whale positioning (Binance), wallet snapshots (Helius), desk verdict with optional Lounge insider overlay.

**Alpha Intel** — insider-first synthesis for airdrop candidates, exchange listing rumors, momentum scans, and scalp desk (5m/15m).

**Lounge** — unlock wire headlines and creator RWA signals.

Flow: `POST` + JSON → **402** + `PAYMENT-REQUIRED` → sign USDC → retry with `PAYMENT-SIGNATURE` → **200** JSON (or HTML `reply` for chat).

x402 USDC payment accepted on Solana mainnet ($0.02–$0.25 per call; $0.02 signal publish).

## Spend-aware usage

- Prefer **Intel routes** (`/api/concierge-intel-*`) when you need structured JSON for agent pipelines — cheaper than parsing HTML from chat.
- Use **`/api/concierge-intel-macro`** with `{}` for macro desk snapshots (Poncho research prompts).
- Use **`/api/concierge-intel-wire`** for headline digests — filter with `category` or `message`.
- Use **`/api/concierge-intel-tvl`** with `{}` for the cheapest DeFi snapshot.
- Use **`/api/concierge-intel-verdict`** once per theme instead of chaining whales + yields + chat separately.
- Alpha routes (`airdrop`, `listing`, `momentum`, `scalp`) weight Lounge insider signals first — set `includeInsider: true` (default) for best alpha quality.
- Cap `limit` on Alpha bodies to the smallest number that answers the task (1–8, default 5).
- Call from **server-side or agent runtime** — browser CORS is limited to the Lounge origin.

## Discovery

- OpenAPI: `https://conc-exe.xyz/openapi.json`
- x402 fan-out: `https://conc-exe.xyz/.well-known/x402`
- Builder docs: `https://conc-exe.xyz/docs/builders`
- Poncho guide: `https://conc-exe.xyz/docs/integration/poncho`
- Endpoint catalog: `https://conc-exe.xyz/agent/endpoints`
