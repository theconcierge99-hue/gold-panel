# Concierge Intel API (integrators)

Structured desk data as **separate x402 endpoints** with **tiered pricing**. Same payment flow as Concierge chat. Research routes (`intel-macro`, `intel-wire`) for agent marketplaces like [Poncho](https://conc-exe.xyz/docs/integration/poncho).

**Web:** `https://conc-exe.xyz/docs/intel`  
**OpenAPI:** `/openapi.json` · **x402:** `/.well-known/x402` · **MCP:** `POST /api/mcp` · **Accuracy:** `GET /api/concierge-intel-accuracy` (free)

## Pricing tiers

| Tier | USDC | Routes |
|------|------|--------|
| **Raw** | $0.02 | `intel-tvl`, `intel-macro`, `intel-wire`, `intel-whales` |
| **Signal** | $0.10 | yields, wallet, verdict, alpha desks, scalp, `intel-meteora`, concierge, news |
| **Bundle** | $0.25 | `intel-desk-brief` |

SOON holders (post-launch): **5 free raw-tier calls/day** with header `X-Soon-Holder-Wallet` when balance ≥ Deluxe tier (50k SOON). See [launch-playbook.md](launch-playbook.md).

## Endpoints

| Method | Path | Price | Returns |
|--------|------|-------|---------|
| POST | `/api/concierge-intel-macro` | $0.02 | SPX, VIX, DXY, Fear & Greed, Treasury yields |
| POST | `/api/concierge-intel-wire` | $0.02 | Wire headline digest (RSS + Lounge) |
| POST | `/api/concierge-intel-tvl` | $0.02 | Chain TVL + top protocols |
| POST | `/api/concierge-intel-whales` | $0.02 | Binance top-trader ratios |
| POST | `/api/concierge-intel-yields` | $0.10 | Screened yield pools |
| POST | `/api/concierge-intel-meteora` | $0.10 | Meteora DLMM deep-dive + risk flags |
| POST | `/api/concierge-intel-wallet` | $0.10 | Solana snapshot (Helius) or EVM ack |
| POST | `/api/concierge-intel-verdict` | $0.10 | Desk verdict + insider signals |
| POST | `/api/concierge-intel-desk-brief` | $0.25 | Macro + Meteora + verdict bundle |
| POST | `/api/concierge-intel-airdrop` | $0.10 | Airdrop candidates |
| POST | `/api/concierge-intel-listing` | $0.10 | Listing candidates |
| POST | `/api/concierge-intel-momentum` | $0.10 | Large-move candidates |
| POST | `/api/concierge-intel-scalp` | $0.10 | BTC/ETH/BNB/SOL scalp desk |
| GET | `/api/concierge-intel-accuracy` | free | Verdict accuracy leaderboard |

### Meteora (`intel-meteora`)

```json
{
  "sortByApy": true,
  "limit": 8,
  "poolHint": "SOL-USDC"
}
```

### Desk brief (`intel-desk-brief`)

```json
{
  "message": "morning Solana desk brief",
  "includeInsider": true
}
```

### MCP (`POST /api/mcp`)

JSON-RPC: `initialize`, `tools/list`, `tools/call`. Pass `arguments.paymentSignature` after x402 pay, or receive pay instructions in the tool result.

## Payment

1. POST without payment → **402** + `PAYMENT-REQUIRED`
2. Sign USDC (Solana or Base) or SOON (post-launch)
3. POST with `PAYMENT-SIGNATURE`

Raw-tier free (SOON holders): `X-Soon-Holder-Wallet: <solana>` without payment when eligible.

See [agents.md](agents.md) for client examples.

## Verdict accuracy

Each paid `intel-verdict` records BTC mark + signal. After 24h, public leaderboard scores alignment. `GET /api/concierge-intel-accuracy` — no payment.

## Related

- [launch-playbook.md](launch-playbook.md) — pre/post SOON launch snapshots
- [agent-identity.md](agent-identity.md) — `agt_…` + `X-Agent-Id`
- [agents.md](agents.md) — x402 integrator guide
