# Overview

Executive Lounge is a single-page web application for institutional-style market intelligence. Users browse a free headline wire, pay small USDC fees to unlock depth, chat with Concierge AI, and (with a connected wallet) publish or unlock **creator signals**.

## Production URLs

Replace `your-domain.com` with your deployed host (paths are stable):

| URL | Purpose |
|-----|---------|
| `https://your-domain.com/` | Main lounge (clean URL; rewrites to `executive-lounge.html`) |
| `https://your-domain.com/about` | About page |
| `https://your-domain.com/api/market` | Free headline + signal feed (JSON) |
| `https://your-domain.com/api/x402-config` | Public payment configuration (may include merchant receive addresses) |
| `https://your-domain.com/.well-known/x402` | x402 resource fan-out (discovery) |
| `https://your-domain.com/openapi.json` | OpenAPI + x-payment-info (discovery) |

## Core features

### Lounge (free browse)

- Aggregated headlines from public RSS sources (FT, BBC, Bloomberg, Reuters, etc.).
- Creator signals appear at the top of the feed when published.
- No payment required to scroll headlines or see summaries.

### Paid article open

- User selects a wire card → pays **0.1 USDC** → receives the canonical external article URL.
- Implemented as `POST /api/news-open` with x402 settlement before redirect.

### Concierge AI

- Multi-mode assistant: **chat**, **enhance** (signal copy), **image** (analysis + optional visual).
- **0.1 USDC** per chat/image request (enhance runs inside Create Signal flow).
- Uses **Google Gemini** with live market data, general-knowledge feeds, and **lounge memory** (recent headlines + creator signals).
- Replies in the **user’s language** when their message (or recent thread context for short replies) is clearly non-English; defaults to **English** when unknown.

### Creator signals

- **Publish:** **1 USDC** one-time anti-spam fee; signal stored in Redis/KV and surfaced on the market feed.
- **Unlock:** **0.1 USDC** per reader; full summary shown in-app (not an external URL).
- **Revenue:** 80% of reader unlock fees attributed to creator wallet in ledger; 20% merchant; settled monthly off-chain.

### Wallet & payments

- **Phantom** and **OKX** supported for Solana and EVM (Base).
- Checkout uses x402 v2 (`PAYMENT-SIGNATURE` / `PAYMENT-REQUIRED` / `PAYMENT-RESPONSE`).
- User chooses **Solana** or **Base** at payment modal when both are configured.

## Pricing summary

| Resource | API path | USDC |
|----------|----------|------|
| Market feed | `GET /api/market` | Free |
| Open article | `POST /api/news-open` | 0.10 |
| Concierge | `POST /api/concierge` | 0.10 |
| Unlock signal | `POST /api/signal-open` | 0.10 |
| Publish signal | `POST /api/signal-publish` | 1.00 |

## UI language

- **Application chrome** (navigation, buttons, modals, About page) is **English**.
- **Concierge** responses follow the user’s language rules described in [concierge-ai.md](concierge-ai.md).

## What is not in scope (today)

- On-chain NFT mint for signals (publish is storage + x402 payment only).
- Automated monthly payout execution (ledger is recorded; settlement is operational).
- Per-creator custom unlock pricing (flat 0.1 USDC platform standard).
