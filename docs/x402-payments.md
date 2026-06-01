# x402 payments

Executive Lounge uses the [x402](https://www.x402.org/) payment protocol (HTTP **402 Payment Required**) with USDC on **Base (EVM)** and optionally **Solana**.

## Facilitator

| Setting | Value |
|---------|--------|
| Provider | [PayAI](https://docs.payai.network/x402/facilitators/pricing) |
| URL | `https://facilitator.payai.network` |
| Server module | `api/lib/x402-server.ts` (Edge-safe HTTP client, no Node-only SDK on Vercel) |

Flow per paid request:

1. Client receives **402** + `PAYMENT-REQUIRED` (base64 JSON, x402 version 2).
2. Wallet signs USDC transfer matching one of the `accepts` entries.
3. Client retries with `PAYMENT-SIGNATURE`.
4. Server calls PayAI `/verify` then `/settle`.
5. On success, server returns **200** + `PAYMENT-RESPONSE` (includes on-chain `transaction`).

Settlements are **on-chain**; transaction hashes are visible to explorers and indexers such as [x402scan](x402scan.md).

**Note:** Solana **NFT mint** after signal publish is separate from x402 — creators pay **SOL** gas in Phantom. See [rwa.md](rwa.md).

## Pricing (atomic units)

USDC uses 6 decimals. Defined in `api/lib/x402-pricing.ts`:

| Resource | USDC | Atomic `amount` |
|----------|------|-----------------|
| news-open, concierge, signal-open | 0.10 | `100000` |
| signal-publish (`/api/lounge-signal-publish`) | 1.00 | `1000000` |

## Networks

Controlled by `X402_NETWORK_MODE`:

| Mode | EVM (CAIP-2) | Solana (CAIP-2) |
|------|----------------|-----------------|
| `mainnet` (default) | `eip155:8453` (Base) | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` |
| `testnet` | `eip155:84532` (Base Sepolia) | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` |

## Merchant addresses

Set in environment:

- `X402_EVM_PAY_TO` — receives USDC on Base
- `X402_SOL_PAY_TO` — receives USDC on Solana (optional)

Validation and helpful error messages live in `api/lib/x402-config.ts` and are surfaced in `/api/x402-config` when misconfigured.

## Browser client

Built artifact: `public/js/x402-pay.mjs`  
Source: `lib/x402-browser-client.ts`  
Build: `npm run build:x402`

The lounge page loads this module to:

- Read `/api/x402-config`
- Show chain selection (Solana / Base) and USDC balances
- Wrap `fetch` with x402 payment retry logic

## Solana notes

- PayAI **fee payer** for exact scheme is configured in `api/lib/x402-config.ts` (`SOLANA_FEE_PAYER`).
- Transactions use a 3-instruction pattern compatible with PayAI verification (no memo instruction).
- Optional `SOLANA_RPC_URL` (e.g. Helius) improves reliability; proxied only on the server.

## Local development without payments

When no valid merchant address is configured, the payment gate allows requests through so Concierge and APIs work locally **without** wallet payment. Do not rely on this behavior in production—set valid pay-to addresses on Vercel.

## Response shape (402)

Example `PAYMENT-REQUIRED` payload (decoded):

```json
{
  "x402Version": 2,
  "resource": {
    "url": "https://your-production-domain.com/api/concierge",
    "name": "Executive Lounge — Concierge AI",
    "description": "...",
    "mimeType": "application/json",
    "tags": ["executive-lounge", "ai", "concierge"]
  },
  "accepts": [
    {
      "scheme": "exact",
      "network": "eip155:8453",
      "amount": "100000",
      "asset": "<Base mainnet USDC contract>",
      "payTo": "<your merchant receive address>",
      "maxTimeoutSeconds": 120
    }
  ],
  "extensions": {
    "bazaar": { "...": "discovery input schema for agents" }
  }
}
```

## Related code

| File | Role |
|------|------|
| `api/lib/x402-server.ts` | 402 builder, verify/settle, `guardPaidX402Api` |
| `api/lib/x402-config.ts` | Networks, addresses, public config |
| `api/lib/x402-discovery.ts` | Bazaar extension + OpenAPI |
| `api/x402-config.ts` | HTTP handler |
