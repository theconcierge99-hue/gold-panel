# Configuration

Copy [`.env.example`](../.env.example) to `.env.local` for local development. Set the same variables in **Vercel → Project → Environment Variables** for production.

## Required

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Google AI Studio key for Concierge. Restrict by HTTP referrer in Google Cloud (production domain + `*.vercel.app`). |

## x402 payments

| Variable | Description |
|----------|-------------|
| `X402_EVM_PAY_TO` | Merchant USDC receive address on **Base** (`0x` + 40 hex). |
| `X402_SOL_PAY_TO` | Optional merchant USDC receive address on **Solana** (base58, 32–44 chars). |
| `X402_ENABLED` | Set `false` to disable payments entirely. Default: enabled when a valid pay-to exists. |
| `X402_NETWORK_MODE` | `mainnet` (default) or `testnet` (Base Sepolia + Solana devnet). |
| `PAYAI_API_KEY_ID` | Optional PayAI JWT key id (free tier: 10k settlements/month without keys). |
| `PAYAI_API_KEY_SECRET` | Optional PayAI JWT secret. |
| `SOLANA_RPC_URL` | Helius or [publicnode](https://solana-rpc.publicnode.com) mainnet URL — **server only** (used by `/api/solana-rpc-send` for Phantom NFT mint). **Do not** use `solana.drpc.org` or Ankr free RPC — they block `getLatestBlockhash`. If unset or set to a blocked host, the server falls back to publicnode. |

**Aliases accepted:** `X402_EVM_PAY_ID`, `X402_SOL_PAY_ID` (typo compatibility).

Payments are **active** when at least one of `X402_EVM_PAY_TO` or `X402_SOL_PAY_TO` validates successfully.

## Creator signals & Concierge memory

| Variable | Description |
|----------|-------------|
| `KV_REST_API_URL` | Upstash / Vercel Redis REST URL. |
| `KV_REST_API_TOKEN` | REST token. |

Upstash may instead provide:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Without KV in production, `POST /api/signal-publish` returns **503**.

### Instant creator payout (50% of unlock)

| Variable | Description |
|----------|-------------|
| `CREATOR_PAYOUT_EVM_PRIVATE_KEY` | Treasury wallet on Base — sends 0.05 USDC to EVM creators after each unlock. `0x` + 64 hex. **Secret — Vercel only.** |
| `CREATOR_PAYOUT_SOL_SECRET` | Treasury keypair on Solana — sends 0.05 USDC to Solana creators. Base58 secret or JSON byte array (64 bytes). **Secret — Vercel only.** |
| `BASE_RPC_URL` | Optional RPC for EVM payouts (defaults to public Base RPC). |

Fund treasury wallets with USDC. Reader payment (0.1 USDC) still settles to merchant via x402; the platform wallet forwards the creator half on the creator’s registered chain.

Check readiness: `GET /api/x402-config` → `creatorInstantPayoutReady`.

## CORS

| Variable | Description |
|----------|-------------|
| `ALLOWED_ORIGINS` | Comma-separated extra origins (e.g. `https://your-domain.com,https://www.your-domain.com`). |

On Vercel, requests whose `Origin` host matches the request `Host` are allowed automatically.

## x402scan discovery

| Variable | Description |
|----------|-------------|
| `X402_SITE_ORIGIN` | Canonical public URL, e.g. `https://your-production-domain.com`. Used in discovery documents when `Host` is ambiguous. |
| `X402_OWNERSHIP_PROOFS` | Comma-separated EVM **public** addresses for ownership proofs. Defaults include `X402_EVM_PAY_TO` when set—never private keys. |

## Vercel-injected (read-only)

| Variable | Description |
|----------|-------------|
| `VERCEL_URL` | Preview deployment host. |
| `VERCEL_PROJECT_PRODUCTION_URL` | Production host. |
| `VERCEL_ENV` | `production`, `preview`, or `development`. |

## Not used

- `X402_ACCESS_SECRET` — removed; do not set.

## Verify configuration

After deploy (check flags only—avoid sharing full JSON publicly):

```bash
curl -s https://your-production-domain.com/api/x402-config | jq '{ enabled, evmPayToReady, solPayToReady, discovery: .discovery.wellKnownUrl }'
```

Expect:

- `enabled: true` when merchant addresses are valid
- `evmPayToReady` / `solPayToReady` as appropriate
- `discovery.wellKnownUrl` pointing at your `/.well-known/x402`

> **Note:** Full config responses may include merchant **receive** addresses (`evmPayTo`, `solPayTo`). That is normal for x402 but is not a secret to publish in support threads. See [security.md](security.md).
