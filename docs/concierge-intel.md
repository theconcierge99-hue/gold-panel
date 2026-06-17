# Concierge Intel API (integrators)

Structured desk data as **separate x402 endpoints** — **0.1 USDC** each, same payment flow as Concierge chat. Includes **research** routes (`intel-macro`, `intel-wire`) for agent marketplaces like [Poncho](https://conc-exe.xyz/docs/integration/poncho).

**Web:** `https://conc-exe.xyz/docs/intel`  
**OpenAPI:** `/openapi.json` · **x402:** `/.well-known/x402`

## Endpoints

| Method | Path | Returns |
|--------|------|---------|
| POST | `/api/concierge-intel-macro` | SPX, VIX, DXY, Fear & Greed, Treasury yields, calendar |
| POST | `/api/concierge-intel-wire` | Wire headline digest (RSS + Lounge memory) |
| POST | `/api/concierge-intel-tvl` | Chain TVL + top protocols (DeFi Llama) |
| POST | `/api/concierge-intel-yields` | Screened yield pools (Jupiter, Meteora, DLMM, …) |
| POST | `/api/concierge-intel-whales` | Binance top-trader ratios (BTC/ETH/SOL) |
| POST | `/api/concierge-intel-wallet` | Solana snapshot (Helius) or EVM ack |
| POST | `/api/concierge-intel-verdict` | Desk verdict + optional Lounge insider signals |
| POST | `/api/concierge-intel-airdrop` | Potential airdrops — insider-first alpha desk |
| POST | `/api/concierge-intel-listing` | Potential exchange listings — insider-first |
| POST | `/api/concierge-intel-momentum` | Large-move candidates (up or down) |
| POST | `/api/concierge-intel-scalp` | BTC/ETH/BNB/SOL scalp desk (5m/15m) |

### Research (macro / wire)

- **`intel-macro`** — body `{}` ok; returns `marks[]`, `sentiment`, `macro` (yields, events, headlines).
- **`intel-wire`** — optional `category`, `message`, `limit` (1–20); returns `headlines[]` with `origin`: `live` | `lounge`.

## Alpha desk methodology

All three alpha endpoints synthesize evidence in this order:

1. **Insider** — Lounge creator signals (highest weight)
2. **Institutional** — Binance positioning, Fear & Greed
3. **Onchain** — DeFi yields / TVL proxies
4. **Narrative** — wire headlines, general news
5. **KOL** — creator publisher context from insider block

Gemini synthesis when `GEMINI_API_KEY` is set; rule-based fallback otherwise.

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

### Alpha desks (airdrop, listing, momentum)

```json
{
  "message": "Solana airdrop farming themes",
  "chain": "solana",
  "limit": 5,
  "includeInsider": true
}
```

- `limit` — max candidates (1–8, default 5)
- `chain` — optional filter for yield/onchain context
- Response: `summary`, `candidates[]` with `insiderSignals`, `institutional`, `onchain`, `narrative`, `kol`, `riskFlags`, `actionable`

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

Implementation: `api/lib/concierge-defi-intel.ts`, `api/lib/concierge-intel-handler.ts`, `api/lib/concierge-alpha-intel.ts`.

## Related

- [concierge-ai.md](concierge-ai.md) — Full Concierge + bundled DeFi block in chat
- [agent-identity.md](agent-identity.md) — `agt_…` + `X-Agent-Id`
- [agents.md](agents.md) — x402 integrator guide
