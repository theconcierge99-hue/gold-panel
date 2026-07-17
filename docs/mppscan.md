# MPPscan + AgentCash discovery

[MPPscan](https://www.mppscan.com/) indexes APIs that advertise the Machine Payments Protocol. Concierge Agent uses **x402 settlement via PayAI** (Solana + Base USDC) and exposes **MPP-compatible OpenAPI** so `agentcash` and MPPscan can list the same **24 paid routes** as Hyre-style MPP servers — without changing the agent site layout.

**Verified profile:** [Concierge Agent API on MPPscan](https://www.mppscan.com/server/6ded0eed8d9dd654f2021f37268ea5f782be7e0c3265640c13568a37effb53d1) — 40 discoverable operations (38 paid + 2 public).

## What we expose

| URL | Purpose |
|-----|---------|
| `/openapi.json` | OpenAPI 3.1 — `info.x-guidance`, `x-payment-info` (x402 + mpp protocols), per-route schemas, `402` responses |
| `/.well-known/x402` | x402 resource fan-out + links to mppscan / x402scan |
| `/api/x402-config` | Runtime config; `discovery.protocols`: `["x402","mpp"]` |

Implementation: `api/lib/mpp-discovery.ts`, `api/lib/x402-discovery.ts`, `api/lib/x402-service-meta.ts`.

## Validate or refresh registration

```bash
npx -y @agentcash/discovery@latest discover https://conc-exe.xyz
npx -y @agentcash/discovery@latest check https://conc-exe.xyz/api/concierge-intel-tvl
```

The production profile is already registered. After changing OpenAPI, validate first, then refresh the origin at MPPscan if needed:

1. [MPPscan — Add your Server](https://www.mppscan.com/register) — origin `https://conc-exe.xyz` (or your `X402_SITE_ORIGIN`)
2. The verified Concierge profile is the default redirect target. Set **`MPPSCAN_SERVER_URL`** in Vercel only if MPPscan assigns a replacement profile URL.
3. [x402scan profile](https://www.x402scan.com/server/b4bb359a-17db-4f54-88c5-bb47c6d2aca4) — parallel x402 listing.

## Agent integration

### pay.sh (CLI — recommended for Claude/Codex)

```bash
pay --sandbox curl https://conc-exe.xyz/api/concierge-intel-tvl -d '{}'
pay --sandbox curl https://conc-exe.xyz/api/concierge-intel-verdict \
  -d '{"message":"Solana DeFi outlook","includeInsider":true}'
pay --sandbox curl https://conc-exe.xyz/api/concierge-security-headers \
  -d '{"target":"https://api.example.com","allowlist":["*.example.com"],"authorized":true}'
pay skills search "market intelligence"
```

See [paysh.md](paysh.md) · [concierge-security.md](concierge-security.md) · web [/docs/payment/paysh](https://conc-exe.xyz/docs/payment/paysh).

### AgentCash / MPPscan

```bash
npx agentcash discover https://conc-exe.xyz
npx agentcash check https://conc-exe.xyz/api/concierge-intel-verdict
```

Paid calls: `POST` + JSON body → `402` → pay USDC → retry with `PAYMENT-SIGNATURE`. Intel routes also advertise `GET` for probes (returns `402` until paid POST).

## Env (unchanged)

- `X402_EVM_PAY_TO` / `X402_SOL_PAY_TO` — merchant addresses
- `X402_SITE_ORIGIN` — production origin for discovery URLs
- Optional `PAYAI_API_KEY_ID` / `PAYAI_API_KEY_SECRET` for facilitator auth

See also [paysh.md](./paysh.md), [x402scan.md](./x402scan.md), web docs [/docs/payment/mpp](https://conc-exe.xyz/docs/payment/mpp), [/docs/payment/paysh](https://conc-exe.xyz/docs/payment/paysh), and [docs/payment/x402](/docs/payment/x402).
