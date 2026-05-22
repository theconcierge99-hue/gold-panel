# x402scan integration

[ x402scan ](https://www.x402scan.com/) is the public explorer for the x402 ecosystem. It lists payable APIs, probes payment challenges, and indexes **on-chain settlement volume** from facilitator activity.

Executive Lounge is branded in discovery as **Executive Lounge x402 API** on your production origin (set via `X402_SITE_ORIGIN`).

## What we expose

| URL | Format | Purpose |
|-----|--------|---------|
| `/.well-known/x402` | JSON fan-out | Lists four paid resource URLs ([spec](https://github.com/Merit-Systems/x402scan/blob/main/docs/DISCOVERY.md)) |
| `/openapi.json` | OpenAPI 3.1 | Recommended discovery; includes `x-payment-info` and 402 responses |
| `/api/x402-config` | JSON | Runtime config + `discovery` metadata block |

Implementation: `api/lib/x402-discovery.ts`, handlers `api/well-known-x402.ts`, `api/openapi.ts`, rewrites in `vercel.json`.

## Registered resources

| Name | URL | Price |
|------|-----|-------|
| Open news article | `POST /api/news-open` | $0.10 |
| Concierge AI message | `POST /api/concierge` | $0.10 |
| Publish creator signal | `POST /api/signal-publish` | $1.00 |
| Unlock creator signal | `POST /api/signal-open` | $0.10 |

Each 402 response includes:

- Non-empty `accepts` (Base and/or Solana USDC)
- `PAYMENT-REQUIRED` header (x402 v2)
- `extensions.bazaar` with HTTP POST JSON input schema (for agent invocation)

## Probe behavior (why GET returns 402)

x402scan probes endpoints with **GET** and **POST**. Paid routes use `guardPaidX402Api()` so:

- **GET** without payment → **402** (not 405)
- **POST** without payment → **402**
- Origin checks run **after** the payment gate so server-side probes without `Origin` still receive a valid challenge

## Register on x402scan

1. Deploy production with valid `X402_EVM_PAY_TO` and/or `X402_SOL_PAY_TO`.
2. Set `X402_SITE_ORIGIN=https://your-production-domain.com` in Vercel.
3. Verify discovery:
   ```bash
   curl -s https://your-production-domain.com/.well-known/x402 | jq '.version, (.resources | length)'
   curl -sI https://your-production-domain.com/api/concierge | head -1
   ```
   Expect HTTP **402** and `PAYMENT-REQUIRED` header.
4. Open [Add your API](https://www.x402scan.com/resources/register).

### Recommended registration URLs

**Option A — Full server (fan-out)**

```
https://your-production-domain.com
```

Discovers all four endpoints via OpenAPI / `.well-known/x402`.

**Option B — Single endpoint** (if batch registration fails)

Register each URL separately:

```
https://your-production-domain.com/api/news-open
https://your-production-domain.com/api/concierge
https://your-production-domain.com/api/signal-publish
https://your-production-domain.com/api/signal-open
```

### Known x402scan batch issue

When registering the root domain, x402scan may report:

`Successfully registered 1 of 4 resources` with Prisma error `Unique constraint failed on the fields: ('origin')` for the remaining three.

This is a **marketplace-side** constraint when upserting the same `origin` multiple times in one batch. **Workaround:** register failed endpoints individually (Option B).

## Ownership proofs

Optional `X402_OWNERSHIP_PROOFS` env (comma-separated `0x` addresses) appears in:

- OpenAPI `x-discovery.ownershipProofs`
- `.well-known/x402` `ownershipProofs`

If unset, `X402_EVM_PAY_TO` is included automatically when valid.

## After registration

1. Complete at least one real **0.1 USDC** payment on production.
2. Check the resource or server page on x402scan for transaction activity.
3. Settlements are performed by PayAI; hashes are returned in `PAYMENT-RESPONSE`.

## Audit locally

```bash
npx -y @agentcash/discovery your-production-domain.com -v
```

See [x402scan DISCOVERY.md](https://github.com/Merit-Systems/x402scan/blob/main/docs/DISCOVERY.md) for full validation rules.
