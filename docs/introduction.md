# Welcome to Concierge

> AI-powered market and DeFi intelligence. Pay per query via x402 — no API keys, no subscriptions.

Concierge is the research desk of **Executive Lounge** — live wire, creator signals, and institutional-style analysis for humans and agents.

## Web documentation

Production docs (HYRE-style layout, Concierge-only branding):

| Page | URL |
|------|-----|
| Introduction | `/docs` |
| Quickstart | `/docs/quickstart` |
| Pricing | `/docs/pricing` |
| x402 Protocol | `/docs/payment/x402` |
| API Overview | `/docs/api/overview` |
| Concierge Chat | `/docs/api/concierge` |
| DeFi Intel | `/docs/api/intel` |
| Agent Identity | `/docs/api/agent-identity` |
| Lounge & Signals | `/docs/api/lounge` |
| Security Desk | `/docs/api/security` |
| Executive Lounge | `/docs/playground` |
| Architecture | `/docs/architecture` |

LLM index: `/llms.txt`

## How it works

1. **POST** to a paid endpoint (no API key).
2. **402** + `PAYMENT-REQUIRED` → sign USDC on Base or Solana.
3. Retry with **PAYMENT-SIGNATURE** → JSON or HTML intelligence.

## Standard response (chat)

```json
{
  "reply": "<p>…</p>",
  "topics": ["crypto", "defi"],
  "marketLive": [{ "symbol": "BTC", "price": "…", "change": "…" }],
  "dataAsOf": "2026-05-21T12:00:00.000Z"
}
```

## Operator markdown

Repository `docs/` folder: deployment, security, zauth, RWA, configuration.
