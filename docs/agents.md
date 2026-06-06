# Agents & integrators — Concierge API

Integrate **Executive Lounge Concierge** from any bot, backend, or workflow using only **HTTPS + x402 USDC**. No repository access is required.

**Web guide:** `https://conc-exe.xyz/docs/agents`  
**Base URL:** `https://conc-exe.xyz`

## Agent identity (A2A)

Each agent can register **`agt_…`** with Solana/Base wallets for discovery and x402. **Web:** `https://conc-exe.xyz/docs/agent-identity` · [agent-identity.md](agent-identity.md) · Lounge → **Navigate** → **Agent identity** · `POST /api/agent-identity` · `GET /.well-known/agent-card.json`.

## Concierge Intel APIs

Structured JSON per desk function (no full chat) — **0.1 USDC** each:

| Endpoint | Data |
|----------|------|
| `POST /api/concierge-intel-tvl` | TVL chains + protocols |
| `POST /api/concierge-intel-yields` | Yield pools (filters: `chain`, `project`) |
| `POST /api/concierge-intel-whales` | Top-trader positioning (`symbols`) |
| `POST /api/concierge-intel-wallet` | Wallet snapshot (`solAddress` / `evmAddress`) |
| `POST /api/concierge-intel-verdict` | Verdict + insider (`message`, `includeInsider`) |
| `POST /api/concierge-intel-airdrop` | Airdrop candidates (`message`, `chain`, `limit`, `includeInsider`) |
| `POST /api/concierge-intel-listing` | Listing candidates (same body as airdrop) |
| `POST /api/concierge-intel-momentum` | Momentum / large-move candidates (same body) |

**Web:** `https://conc-exe.xyz/docs/intel` · [concierge-intel.md](concierge-intel.md)

## Quick reference

| Item | Value |
|------|--------|
| Endpoint | `POST /api/concierge` (or Intel routes above) |
| Price | 0.1 USDC per request |
| Auth | x402 payment (`PAYMENT-SIGNATURE` header) |
| Discovery | `GET /openapi.json`, `GET /.well-known/x402`, `GET /api/x402-config` |

## Flow

1. `POST /api/concierge` without payment → **402** + `PAYMENT-REQUIRED` (base64 JSON).
2. Agent wallet signs USDC on Base or Solana per `accepts`.
3. Retry `POST` with `PAYMENT-SIGNATURE`.
4. **200** → `{ "reply": "<p>…</p>", "topics": [], "marketLive": [], "dataAsOf": "…" }`.

## Request (chat)

```json
{
  "mode": "chat",
  "message": "Trading plan BTC 48h — geopolitical, fundamental, technical",
  "history": [],
  "market": []
}
```

Modes: `chat` | `enhance` (with `signal` object) | `image`.

## Node.js (EVM on Base)

```bash
npm install @x402/core @x402/fetch @x402/evm viem
```

Use `wrapFetchWithPayment` from `@x402/fetch` with `registerExactEvmScheme` and a funded `AGENT_EVM_PRIVATE_KEY` on Base. Full snippet: [conc-exe.xyz/docs/agents#node](https://conc-exe.xyz/docs/agents#node).

## Python

Probe with httpx; implement payment via PayAI/x402 client or manual `PAYMENT-SIGNATURE`. Example probe: [docs/agents#python](https://conc-exe.xyz/docs/agents#python).

## CORS

Server-side agents: no CORS. Browser apps on other domains: host must list origin in `ALLOWED_ORIGINS`.

## Trust

- [x402scan](https://www.x402scan.com/) — marketplace listing  
- `GET /api/zauth-directory` — verified endpoints  
- [zauth.md](zauth.md) — Provider Hub telemetry  

## Related

- [concierge-ai.md](concierge-ai.md) — modes, prompts, language  
- [x402-payments.md](x402-payments.md) — facilitator, networks  
- [api-reference.md](api-reference.md) — all routes  
