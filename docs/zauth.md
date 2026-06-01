# zauth integration

[zauth](https://zauth.inc/) is the security and trust layer for the **agentic internet** — x402 endpoint verification, uptime monitoring, and optional auto-refunds when paid APIs return bad responses.

Executive Lounge integrates zauth alongside [x402scan](x402scan.md) discovery.

## What we expose

| URL | Purpose |
|-----|---------|
| `GET /api/zauth-status` | Health of **this** origin’s endpoints in the [zauth Database](https://zauth.inc/database) |
| `GET /api/zauth-directory` | Proxy to `https://api.zauth.inc/api/directory` — agents query before paying third-party x402 APIs |
| `discovery.zauth` in `GET /api/x402-config` | Links to Provider Hub, docs, directory API |

Implementation: `api/lib/zauth.ts`, `api/lib/zauth-paid-response.ts`.

## Provider Hub (recommended)

1. Open [Provider Hub](https://zauth.inc/provider-hub) and connect your wallet (or email).
2. Generate an **API key**.
3. In Vercel → Environment Variables:

```bash
ZAUTH_API_KEY=your_provider_hub_api_key
# Optional override (default https://back.zauthx402.com)
# ZAUTH_API_ENDPOINT=https://back.zauthx402.com
```

4. Redeploy.

With `ZAUTH_API_KEY` set, every successful paid route (`/api/concierge`, `/api/news-open`, `/api/lounge-signal-publish`, `/api/lounge-signal-open`) reports telemetry to zauth (request / response / payment events). Endpoints appear in Provider Hub within minutes and can earn the **verified** badge.

This uses a **lightweight Edge-safe reporter** (no Express middleware). Payment logic and PayAI facilitator flow are unchanged.

### Optional: full SDK + auto-refunds

For Express/Node hosts, zauth’s [`@zauthx402/sdk`](https://www.npmjs.com/package/@zauthx402/sdk) middleware adds richer validation and optional on-chain refunds. Executive Lounge on Vercel Edge uses the built-in reporter above; add the SDK only if you run a separate Node gateway.

## Agent-to-agent

Before calling external x402 services, agents can:

```bash
curl "https://conc-exe.xyz/api/zauth-directory?search=example.com&verified=true&limit=20"
```

Or query zauth directly: [Database API](https://zauth.inc/docs/database) — `GET https://api.zauth.inc/api/directory`.

Concierge is instructed to prefer **verified** endpoints with high `successRate` when recommending third-party paid APIs.

## Check our status

```bash
curl -s https://conc-exe.xyz/api/zauth-status | jq
```

Returns endpoints matching your `X402_SITE_ORIGIN`, plus `providerTelemetryEnabled` when `ZAUTH_API_KEY` is set.

## Related

- [zauth docs](https://zauth.inc/docs)
- [Provider Hub](https://zauth.inc/provider-hub)
- [x402 payments](x402-payments.md)
- [x402scan](x402scan.md)
