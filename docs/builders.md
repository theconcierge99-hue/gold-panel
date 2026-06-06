# For builders & developers

Integrate **Concierge Agent** into apps, agents, trading bots, or backends.

**Web:** `https://conc-exe.xyz/docs/builders`  
**Catalog:** `/agent/endpoints` · **Playground:** `/agent/playground`

## Basics

| | |
|--|--|
| Base URL | `https://conc-exe.xyz` |
| Auth | None — x402 USDC per call |
| Optional | `X-Agent-Id: agt_…` after [agent identity](agent-identity.md) |
| Price | $0.10 USDC/call · $1.00 signal publish |

## Integration paths

1. **Playground** — `/agent/playground` — try routes, see 402, copy bodies  
2. **OpenAPI** — `GET /openapi.json` — schemas + x402/MPP metadata  
3. **AgentCash** — `npx agentcash add https://conc-exe.xyz`  
4. **x402 client** — PayAI / ecosystem SDK handles 402 → pay → retry  

## x402 flow

1. `POST` + JSON → **402** + `PAYMENT-REQUIRED`  
2. Sign USDC (Solana or Base)  
3. Retry with `PAYMENT-SIGNATURE` → **200** JSON  

See [agents.md](agents.md) and [Quickstart](https://conc-exe.xyz/docs/quickstart).

## Route picker

| Need | Endpoint |
|------|----------|
| Natural language / trading plans | `POST /api/concierge` |
| Structured DeFi data | `POST /api/concierge-intel-*` |
| Airdrop / listing / momentum alpha | `POST /api/concierge-intel-airdrop` · `-listing` · `-momentum` |
| Wire + RWA signals | `POST /api/news-open` · `/api/lounge-signal-*` |

Full Intel reference: [concierge-intel.md](concierge-intel.md)

## Alpha intel (builders)

```json
POST /api/concierge-intel-momentum
{
  "message": "BTC altcoin volatility catalysts",
  "chain": "solana",
  "limit": 5,
  "includeInsider": true
}
```

Response: `summary`, `candidates[]` with `insiderSignals`, `institutional`, `onchain`, `narrative`, `kol`, `actionable`.

Evidence priority: **insider → institutional → onchain → narrative → KOL**.

## Discovery

```bash
curl -s https://conc-exe.xyz/openapi.json
npx -y @agentcash/discovery@latest discover https://conc-exe.xyz
```

## CORS

Call from **server-side** or your agent runtime — browser CORS is limited to Lounge origin unless `ALLOWED_ORIGINS` is configured.

## Optional distribution

- [MPPscan / AgentCash](mppscan.md)  
- [Corbits Marketplace](corbits.md) proxy  

Implementation: `api/lib/concierge-intel-handler.ts`, `api/lib/concierge-alpha-intel.ts`, `api/lib/x402-server.ts`.
