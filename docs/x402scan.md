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

Canonical discovery lists **21 paid routes** (intel desks, Concierge chat, Lounge signals, **Security Desk**). Primary examples:

| Name | URL | Price |
|------|-----|-------|
| Open news article | `POST /api/news-open` | $0.10 |
| Concierge AI message | `POST /api/concierge` | $0.10 |
| Publish creator signal | `POST /api/lounge-signal-publish` | $1.00 |
| Unlock creator signal | `POST /api/lounge-signal-open` | $0.10 |
| Security scan (unified) | `POST /api/concierge-security-scan` | $0.10 |
| Security scout (headers) | `POST /api/concierge-security-headers` | $0.02 |

Full catalog: `/openapi.json` · `/agent/endpoints` · [concierge-security.md](concierge-security.md).

Each 402 response includes:

- Non-empty `accepts` (Base and/or Solana USDC)
- `PAYMENT-REQUIRED` header (x402 v2)
- `extensions.bazaar` with HTTP POST JSON input schema (for agent invocation)
- Bazaar **service metadata** on `resource`: `serviceName`, `tags`, `iconUrl` (see `api/lib/x402-service-meta.ts`)

### Listing tags (x402scan sidebar vs our OpenAPI)

**Executive Lounge already sends `RWA` in production metadata** (`x-discovery.tags`, `info.x-marketplace-tags`, operation `tags`, and `Payment-Required` → `resource.tags`). Verify:

```bash
curl.exe -s https://conc-exe.xyz/openapi.json | findstr RWA
```

**Why the x402scan profile may still show only AI, Trading, Search, Crypto**

x402scan does **not** copy OpenAPI / Bazaar tags into the **Tags** row on re-register. In [Merit-Systems/x402scan](https://github.com/Merit-Systems/x402scan), server pills come from **database tags** on each resource, usually assigned by an internal **GPT labeling** step against a fixed main-category list:

`Search`, `AI`, `Crypto`, `Trading`, `Utility`, `Random`

**`RWA` is not in that list today**, so the marketplace will not show an RWA pill until x402scan adds it or an admin assigns a custom tag.

| Where | Shows RWA? |
|-------|------------|
| Our site, `/openapi.json`, 402 headers | Yes (after deploy `1a7c738+`) |
| x402scan **description** (scraped / OpenAPI `info`) | Often yes (“RWA creator signals”) |
| x402scan **Tags** pills | No — not controlled by our repo alone |

**What you can do**

1. **Ask x402scan to add the tag** (fastest path for the sidebar):
   - [Discord](https://discord.gg/JuKt7tPnNc) (Merit Systems / x402scan)
   - [GitHub issue](https://github.com/Merit-Systems/x402scan/issues/new) — request adding **`RWA`** to main tags and applying it to origin `https://conc-exe.xyz`
2. **Re-register** only refreshes resources and title/description — not Tags:
   ```bash
   npx -y @agentcash/discovery conc-exe.xyz -v
   ```
3. Optional upstream: contribute `RWA` to `apps/scan/src/services/labeling/main-tags.ts` in the x402scan repo.

**Tags we publish for agents / facilitators** (for when indexers read 402 or OpenAPI):

| Tag | Meaning |
|-----|---------|
| **AI** | Concierge AI desk |
| **Trading** | Trading plans, market categories |
| **Search** | Wire unlock, knowledge retrieval |
| **Crypto** | Onchain economy, Solana/Base USDC |
| **RWA** | Tokenized intelligence signals + optional Solana NFT |

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
https://your-production-domain.com/api/lounge-signal-publish
https://your-production-domain.com/api/lounge-signal-open
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
