# Overview

**Executive Lounge** is a single-page web application for institutional-style market intelligence. It combines a free headline wire, **x402 micropayments**, **Concierge AI**, and **creator signals** tokenized as **Real World Assets (RWA)** — each signal is an intelligence certificate with optional **on-chain Solana NFT** mint to the creator’s wallet.

## Production URLs

Replace `your-domain.com` with your deployed host (paths are stable):

| URL | Purpose |
|-----|---------|
| `https://your-domain.com/` | Main lounge (rewrites to `executive-lounge.html`) |
| `https://your-domain.com/about` | About page |
| `https://your-domain.com/docs` | Documentation (web) |
| `https://your-domain.com/docs/agents` | Concierge API for agents & integrators (x402) |
| `https://your-domain.com/docs/agent-identity` | Agent identity (`agt_…`), wallets, agent cards |
| `https://your-domain.com/docs/intel` | Concierge Intel APIs (macro, wire, TVL, yields, whales, wallet, verdict, alpha) |
| `https://your-domain.com/docs/api/security` | Security Desk — passive website scan, scout routes, self-audit |
| `https://your-domain.com/lounge#security-scan` | Executive Lounge Security Scan UI |
| `https://your-domain.com/deploy-version.txt` | Deployed git commit (verify production build) |
| `https://your-domain.com/api/market` | Free headline + signal feed (JSON) |
| `https://your-domain.com/api/x402-config` | Public payment + RWA readiness flags |
| `https://your-domain.com/.well-known/x402` | x402 resource fan-out (discovery) |
| `https://your-domain.com/openapi.json` | OpenAPI + x-payment-info (x402 + MPP discovery) |
| `https://your-domain.com/docs/builders` | Builder integration guide — x402, OpenAPI, code examples |
| `https://your-domain.com/docs/payment/mpp` | MPPscan listing, AgentCash install, 24-route structure |
| `https://your-domain.com/docs/payment/paysh` | pay.sh CLI catalog — `pay curl`, Claude/Codex MCP, pay-skills listing |
| `https://your-domain.com/docs/integration/poncho` | Poncho marketplace — macro, wire, intel, Security Desk via x402 (no API key) |

## Core features

### Lounge (free browse)

- Aggregated headlines from public RSS sources (FT, BBC, Bloomberg, Reuters, etc.).
- Creator signals appear at the top of the feed when published (with **⬡ RWA** when tokenized).
- No payment required to scroll headlines or see signal titles/teasers.

### Paid article open

- User selects a wire card → pays **0.1 USDC** → receives the canonical external article URL.
- `POST /api/news-open` with x402 settlement before redirect.

### Concierge AI

- Multi-mode assistant: **chat**, **enhance** (signal copy), **image** (analysis + optional visual).
- **0.1 USDC** per chat/image request (enhance runs inside Create Signal flow).
- Google **Gemini** (default) with optional **GLM-4.7 Flash** (Z.ai), **HYRE Gateway**, **Anthropic Claude**, and **OpenAI GPT-5.6** for chat; live market data, general-knowledge feeds, and **lounge memory** (recent headlines + creator signals).

### Creator signals & RWA

Each published signal is an **RWA intelligence certificate**:

| Layer | What it is |
|-------|------------|
| **Off-chain certificate** | `tokenId`, SHA-256 `contentHash`, JSON metadata in Redis/KV — always created on publish |
| **On-chain NFT (Solana)** | Metaplex NFT minted to the **creator’s Phantom wallet** after publish (creator pays ~0.02–0.05 SOL gas) |
| **Reader badge** | Off-chain tier badge when a wallet pays to unlock a signal |

**Publish:** **1 USDC** anti-spam fee (100% merchant) → `POST /api/lounge-signal-publish`  
**Unlock:** **0.1 USDC** per reader → `POST /api/lounge-signal-open` — full summary in-app  
**Revenue:** 50% of unlock fees to creator on-chain when payout treasuries are configured; 50% merchant via x402

See [rwa.md](rwa.md) and [creator-signals.md](creator-signals.md) for full flows.

### Wallet & payments

- **Phantom** and **OKX** for Solana and EVM (Base).
- x402 v2 (`PAYMENT-SIGNATURE` / `PAYMENT-REQUIRED` / `PAYMENT-RESPONSE`).
- User chooses **Solana** or **Base** in the payment modal when both are configured.

## Pricing summary

| Resource | API path | USDC |
|----------|----------|------|
| Market feed | `GET /api/market` | Free |
| Open article | `POST /api/news-open` | 0.10 |
| Concierge | `POST /api/concierge` | 0.10 |
| Unlock signal | `POST /api/lounge-signal-open` | 0.10 |
| Publish signal | `POST /api/lounge-signal-publish` | 1.00 |

## UI language

- Application chrome (navigation, buttons, modals) is **English**.
- Concierge responses follow language rules in [concierge-ai.md](concierge-ai.md).

## What is not in scope (today)

- **Base / EVM on-chain** RWA mint (ERC-1155) — certificates and UI only on EVM creators for now.
- On-chain **reader badges** (SBT/cNFT) — badges are off-chain in Redis.
- On-chain **creator points** redemption (SOON / perks) — points are off-chain in KV for now.
- Per-creator custom unlock pricing (flat 0.1 USDC platform standard).
