# Configuration

Copy [`.env.example`](../.env.example) to `.env.local` for local development. Set the same variables in **Vercel → Project → Environment Variables** for production.

## Required

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Google AI Studio key for Concierge (required). Restrict by HTTP referrer in Google Cloud (production domain + `*.vercel.app`). |

## Optional — Concierge agent models

| Variable | Description |
|----------|-------------|
| `GLM_API_KEY` | Z.ai API key for optional `agentModel: "glm-4.7-flash"` on `POST /api/concierge` chat. Alias: `ZAI_API_KEY`. Falls back to Gemini if unset. |
| `GLM_API_BASE_URL` | Default `https://api.z.ai/api/paas/v4` — override only if Z.ai changes endpoint. |

## x402 payments

| Variable | Description |
|----------|-------------|
| `X402_EVM_PAY_TO` | Merchant USDC receive address on **Base** (`0x` + 40 hex). |
| `X402_SOL_PAY_TO` | Optional merchant USDC receive address on **Solana** (base58, 32–44 chars). |
| `X402_ENABLED` | Set `false` to disable payments entirely. Default: enabled when a valid pay-to exists. |
| `X402_FACILITATOR` | `payai` (default) or `dexter`. PayAI primary; Dexter listed as fallback in 402 accepts and EVM retry. |
| `X402_NETWORK_MODE` | `mainnet` (default) or `testnet` (Base Sepolia + Solana devnet). |
| `PAYAI_API_KEY_ID` | Optional PayAI JWT key id — only when `X402_FACILITATOR=payai`. |
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

Without KV in production, `POST /api/lounge-signal-publish` returns **503**.

## RWA (Real World Assets)

Executive Lounge registers each published signal as an **RWA intelligence certificate** and supports **Solana Metaplex NFT** mint to the creator wallet. See [rwa.md](rwa.md) and [rwa-solana-setup.md](rwa-solana-setup.md).

| Variable | Description |
|----------|-------------|
| `X402_SITE_ORIGIN` | Public site URL for RWA metadata (`/api/rwa-metadata?signalId=…`) and x402 discovery. |
| `SOLANA_RPC_URL` | Server RPC for x402 Solana checks and **`/api/solana-rpc-send`** (browser NFT mint). Helius recommended; avoid dRPC/Ankr free tiers. |
| `RWA_SIGNAL_CONTRACT_SOL` | Optional Metaplex **collection** mint (base58). Invalid values ignored; client retries mint without collection on failure. |
| `RWA_MINT_SOL_SECRET` | Optional **server** mint authority keypair — not required for default Phantom client mint. |
| `LOUNGE_INTERNAL_KEY` | Bearer secret for internal routes (`lounge-rwa-mint-sol`, creator payout). Alias: `RWA_MINT_INTERNAL_KEY`. |
| `RWA_SIGNAL_CONTRACT_EVM` | Reserved for future Base ERC-1155 RWA mint (not live). |

**Client mint path (default):** no `RWA_MINT_SOL_SECRET` needed — creator pays SOL in Phantom; platform only proxies RPC.

### Instant creator payout (50% of unlock)

| Variable | Description |
|----------|-------------|
| `CREATOR_PAYOUT_EVM_PRIVATE_KEY` | Treasury wallet on Base — sends 0.05 USDC to EVM creators after each unlock. `0x` + 64 hex. **Secret — Vercel only.** |
| `CREATOR_PAYOUT_SOL_SECRET` | Treasury keypair on Solana — sends 0.05 USDC to Solana creators. Base58 secret or JSON byte array (64 bytes). **Secret — Vercel only.** |
| `BASE_RPC_URL` | Optional RPC for EVM payouts (defaults to public Base RPC). |

Fund treasury wallets with USDC. Reader payment (0.1 USDC) still settles to merchant via x402; the platform wallet forwards the creator half on the creator’s registered chain.

Check readiness: `GET /api/x402-config` → `creatorInstantPayoutReady`.

## SOON token & Token Pay

SOON is the default **Token Pay** merchant (native-token x402). Set `SOON_TOKEN_MINT` after launch; until then the UI shows “Coming soon”.

| Variable | Description |
|----------|-------------|
| `SOON_TOKEN_MINT` | SPL mint address (base58) after SOON launches. **Unset** = token not live. |
| `SOON_MINT` | Alias for `SOON_TOKEN_MINT`. |
| `SOON_TOKEN_DECIMALS` | Token decimals (default `6`). |
| `SOON_PRICE_SOURCE` | `dexscreener` (default) or `env` (static rate only). |
| `SOON_PRICE_MAX_AGE_SEC` | In-memory DexScreener cache TTL per Edge isolate (default `60`, max `300`). |
| `SOON_USDC_RATE` | Fallback USD price per 1 SOON when DexScreener fails or `SOON_PRICE_SOURCE=env`. |
| `SOON_X402_ENABLED` | Set `false` to disable token pay even when mint is set. |
| `SOON_RESOURCE_KINDS` | Comma-separated x402 resource kinds, or `all` for every route. Pre-launch default: `concierge`. Post-launch snapshot: `all`. |
| `SOON_TOKEN_DISCOUNT_PERCENT` | Holder discount when paying in SOON (0–90). Post-launch snapshot: `30` (= pay 70% of USDC equivalent in token). |
| `SOON_HOLDER_FREE_TIER_ENABLED` | `false` to disable SOON holder free raw-tier calls (default enabled when mint live). |
| `SOON_HOLDER_FREE_RAW_PER_DAY` | Free raw-tier calls per wallet per UTC day (default `5`). |
| `SOON_HOLDER_MIN_TOKENS` | Min SOON balance (UI units) for free tier (default `50000` = Deluxe tier). |

**Launch snapshots:** [launch-playbook.md](launch-playbook.md) · `config/launch/pre-launch.env.snapshot` · `config/launch/post-launch.env.snapshot` · `npm run launch:verify -- --phase=pre|post`

### Partner merchants (Token Pay)

Register partner projects on the same Concierge deployment. **Public guide:** [conc-exe.xyz/docs/payment/token-pay](https://conc-exe.xyz/docs/payment/token-pay).

| Variable | Description |
|----------|-------------|
| `TOKEN_PAY_MERCHANTS_JSON` | JSON array of merchant rows (max 16). Each row **must** include `id`, `symbol`, `mint`, `decimals`, `payTo` (partner wallet — no fallback to `X402_SOL_PAY_TO`). |
| `TOKEN_PAY_DEFAULT_MERCHANT` | Default merchant slug (default `soon`). |

Example row:

```json
{
  "id": "acme",
  "symbol": "ACME",
  "name": "ACME Protocol",
  "mint": "MintBase58…",
  "decimals": 6,
  "payTo": "PartnerSolanaWallet…",
  "priceSource": "dexscreener",
  "fallbackUsd": 0.001,
  "resourceKinds": ["external", "concierge"],
  "allowedOrigins": ["https://api.acme.xyz"],
  "x402Enabled": true
}
```

Reserved merchant id: `soon` (cannot be registered via JSON). Merchant is **live** when mint + payTo + resolvable price + `x402Enabled`.

**APIs:** `GET /api/token-pay` · `GET/POST /api/token-pay-build-accept` · `POST /api/token-pay-verify` · `GET /api/x402-config` → `tokenPay.merchants[]`

**SDK:** `packages/token-x402` (`@conc-exe/token-x402`)

**Operator docs:** [token-pay-platform.md](token-pay-platform.md) (repository). Beta review: Telegram [@Theconcierge33](https://t.me/Theconcierge33).

Concierge token x402 for SOON is enabled when `SOON_TOKEN_MINT` is set. Partner tokens are enabled per JSON row when live.

**DLMM yields:** Concierge AI and `/api/concierge-intel-yields` use the Meteora DLMM API for live pool intel. Users deploy liquidity on [Meteora](https://app.meteora.ag/dlmm) — no in-app LP UI in the Lounge.

## CORS

| Variable | Description |
|----------|-------------|
| `ALLOWED_ORIGINS` | Comma-separated extra origins (e.g. `https://your-domain.com,https://www.your-domain.com`). |

On Vercel, requests whose `Origin` host matches the request `Host` are allowed automatically.

## x402scan discovery

| Variable | Description |
|----------|-------------|
| `X402_SITE_ORIGIN` | Canonical public URL, e.g. `https://your-production-domain.com`. Used in discovery documents when `Host` is ambiguous. Also used by zauth status to filter directory endpoints for this site. |
| `X402_OWNERSHIP_PROOFS` | Comma-separated EVM **public** addresses for ownership proofs. Defaults include `X402_EVM_PAY_TO` when set—never private keys. |

## zauth (x402 trust layer)

Optional integration with [zauth.inc](https://zauth.inc/) — directory proxy, Provider Hub telemetry, verification checks. Full guide: [zauth.md](zauth.md).

| Variable | Description |
|----------|-------------|
| `ZAUTH_API_KEY` | Provider Hub API key from [Provider Hub](https://zauth.inc/provider-hub). Enables post-payment telemetry and live checks in `/api/zauth-status`. |
| `ZAUTH_API_ENDPOINT` | Backend URL (default `https://back.zauthx402.com`). Override only if zauth instructs. |

Check: `GET /api/x402-config` → `zauthTelemetryEnabled: true` after deploy.

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
curl -s https://your-production-domain.com/api/x402-config | jq '{ enabled, evmPayToReady, solPayToReady, creatorInstantPayoutReady, discovery: .discovery.wellKnownUrl }'
curl -s https://your-production-domain.com/deploy-version.txt
```

Expect:

- `enabled: true` when merchant addresses are valid
- `evmPayToReady` / `solPayToReady` as appropriate
- `discovery.wellKnownUrl` pointing at your `/.well-known/x402`

> **Note:** Full config responses may include merchant **receive** addresses (`evmPayTo`, `solPayTo`). That is normal for x402 but is not a secret to publish in support threads. See [security.md](security.md).
