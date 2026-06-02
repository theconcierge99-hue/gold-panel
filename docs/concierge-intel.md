# Concierge Intel API (integrators)

Structured DeFi desk data as **separate x402 endpoints** — **0.1 USDC** each, same payment flow as Concierge chat.

**Web:** `https://conc-exe.xyz/docs/intel`  
**OpenAPI:** `/openapi.json` · **x402:** `/.well-known/x402`

## Endpoints

| Method | Path | Returns |
|--------|------|---------|
| POST | `/api/concierge-intel-tvl` | Chain TVL + top protocols (DeFi Llama) |
| POST | `/api/concierge-intel-yields` | Screened yield pools (Jupiter, Meteora, DLMM, …) |
| POST | `/api/concierge-intel-whales` | Binance top-trader ratios (BTC/ETH/SOL) |
| POST | `/api/concierge-intel-wallet` | Solana snapshot (Helius) or EVM ack |
| POST | `/api/concierge-intel-verdict` | Desk verdict + optional Lounge insider signals |

## Payment

1. POST without payment → **402** + `PAYMENT-REQUIRED`
2. Sign USDC (Solana or Base)
3. POST with `PAYMENT-SIGNATURE`

See [agents.md](agents.md) for client examples.

## Request bodies

### TVL

```json
{}
```

### Yields

```json
{
  "chain": "solana",
  "project": "meteora"
}
```

### Whales

```json
{
  "symbols": ["BTC", "ETH", "SOL"]
}
```

### Wallet

```json
{
  "solAddress": "…",
  "evmAddress": "0x…",
  "message": "optional context"
}
```

At least one address required (or address in `message`).

### Verdict

```json
{
  "message": "DeFi on Solana — risk?",
  "includeInsider": true
}
```

`includeInsider` (default `true`) pulls relevant **creator signals** from Lounge memory as insider overlay.

## Verdict signals

| Signal | Meaning |
|--------|---------|
| `snipe` | Tactical — insider + tape align; small size |
| `watch` | Mixed; wait for edge |
| `follow` | Constructive risk-on read |
| `avoid` | Defensive |
| `rebalance` | Rotate yields/positioning |

## vs full Concierge

| | Intel APIs | `POST /api/concierge` |
|--|------------|----------------------|
| Output | Structured JSON | HTML + Gemini narrative |
| Use case | Agents, pipelines | Human chat, trading plans |
| Price | 0.1 USDC / call | 0.1 USDC / call |

Implementation: `api/lib/concierge-defi-intel.ts`, `api/lib/concierge-intel-handler.ts`.

## Related

- [concierge-ai.md](concierge-ai.md) — Full Concierge + bundled DeFi block in chat
- [agent-identity.md](agent-identity.md) — `agt_…` + `X-Agent-Id`
- [agents.md](agents.md) — x402 integrator guide
