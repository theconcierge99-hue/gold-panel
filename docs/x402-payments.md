# x402 payments

Executive Lounge uses the [x402](https://www.x402.org/) payment protocol (HTTP **402 Payment Required**) with:

- **USDC** on **Base**, **Arbitrum**, and optionally **Solana**
- **USDG** (Paxos Global Dollar) on **Robinhood Chain** (`eip155:4663`)
- **USDT** and **USDC** (Binance-Peg) on **BNB Smart Chain** (`eip155:56`) via **Permit2** — opt-in (`X402_BNB_ENABLED=true`)

## Facilitators

| Role | Provider | URL |
|------|----------|-----|
| **Primary (default)** | [PayAI](https://docs.payai.network/x402/facilitators/pricing) | `https://facilitator.payai.network` |
| **Fallback** | [Dexter](https://docs.dexter.cash/docs/facilitator-and-chains/) | `https://x402.dexter.cash` |
| **Robinhood USDG** | [Primer](https://docs.primer.systems/facilitator.html) (default) or [Naven](https://naven.network/docs/demo/robinhood-x402) | `https://x402.primer.systems` |
| **BNB USDT / USDC** | [Dexter](https://dexter.cash/facilitator/bsc) (pinned) | `https://x402.dexter.cash` |

Server module: `backend/concierge-api/x402-server.ts` (Edge-safe HTTP client).

- **Base / Arbitrum (EVM USDC):** verify/settle via PayAI first; on facilitator outage, retry Dexter automatically.
- **Robinhood (USDG):** verify/settle **only** via the Robinhood facilitator (`X402_ROBINHOOD_FACILITATOR_URL`, default Primer). PayAI/CDP do not settle `eip155:4663`.
- **BNB (USDT + USDC):** verify/settle **only** via Dexter with `extra.assetTransferMethod: "permit2"`. Both Binance-Peg tokens are plain ERC-20 — verified on-chain to expose neither `transferWithAuthorization` (EIP-3009) nor `permit` (EIP-2612) — so Permit2 is the only settlement path, and amounts use **18 decimals**. The `402` lists one accept per asset so a buyer pays with whichever it holds. Fail-closed until `X402_BNB_ENABLED=true` on mainnet. No testnet rail.
- **Solana:** `402` accepts list **both** PayAI and Dexter fee payers — clients sign with the primary (PayAI) unless retrying via Dexter accept.
- **OpenDexter:** Dexter settlements auto-list on [OpenDexter marketplace](https://dexter.cash/opendexter). Claim seller profile at [dexter.cash/sellers](https://dexter.cash/sellers).

Set `X402_FACILITATOR=dexter` only if you want Dexter as primary (unusual).

Disable / enable rails:

- `X402_ARBITRUM_ENABLED=false`
- `X402_ROBINHOOD_ENABLED=false`
- `X402_BNB_ENABLED=true` (required to advertise BNB — default off)

Flow per paid request:

1. Client receives **402** + `PAYMENT-REQUIRED` (base64 JSON, x402 version 2).
2. Wallet signs USDC/USDG/USDT transfer matching one of the `accepts` entries (BNB may need a one-time Permit2 ERC-20 approval first).
3. Client retries with `PAYMENT-SIGNATURE`.
4. Server calls facilitator `/verify` then `/settle` (PayAI primary, Dexter fallback where configured; Primer for Robinhood; Dexter-only for BNB).
5. On success, server returns **200** + `PAYMENT-RESPONSE` (includes on-chain `transaction`).

Settlements are **on-chain**; transaction hashes are visible to explorers and indexers such as [x402scan](x402scan.md). Robinhood receipts: [robinhoodchain.blockscout.com](https://robinhoodchain.blockscout.com). BNB receipts: [bscscan.com](https://bscscan.com).

**Note:** Solana **NFT mint** after signal publish is separate from x402 — creators pay **SOL** gas in Phantom. See [rwa.md](rwa.md).

## Pricing (atomic units)

USDC and USDG use **6 decimals**. Both BNB assets use **18 decimals** (same USD list price scaled ×10¹²). Defined in `backend/concierge-api/x402-pricing.ts`:

| Resource | USD | USDC/USDG atomic | BNB USDT+USDC atomic (18d) |
|----------|-----|------------------|----------------------------|
| news-open, concierge, signal-open | 0.10 | `100000` | `100000000000000000` |
| raw intel / signal-publish | 0.02 | `20000` | `20000000000000000` |

## Networks

Controlled by `X402_NETWORK_MODE`:

| Mode | Base | Arbitrum | Robinhood | BNB | Solana |
|------|------|----------|-----------|-----|--------|
| `mainnet` (default) | `eip155:8453` | `eip155:42161` | `eip155:4663` (USDG) | `eip155:56` (USDT + USDC, opt-in) | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` |
| `testnet` | `eip155:84532` | `eip155:421614` | `eip155:46630` (needs `X402_ROBINHOOD_USDG`) | — (not advertised) | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` |

- Robinhood mainnet USDG: `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` (EIP-712 name `Global Dollar`, version `1`).
- BNB mainnet USDT: `0x55d398326f99059fF775485246999027B3197955` (override with `X402_BNB_USDT`).
- BNB mainnet USDC: `0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d` (override with `X402_BNB_USDC`, or drop it with `X402_BNB_USDC_ENABLED=false`).

## Merchant addresses

Set in environment:

- `X402_EVM_PAY_TO` — receives USDC on **Base** (fallback for other EVM rails if no override)
- `X402_EVM_ALT_PAY_TO` — optional shared receive wallet for **Arbitrum / Robinhood / BNB** (e.g. MetaMask when Phantom is Base-only)
- `X402_ARBITRUM_PAY_TO` / `X402_ROBINHOOD_PAY_TO` / `X402_BNB_PAY_TO` — optional per-rail overrides
- `X402_SOL_PAY_TO` — receives USDC on Solana (optional)

Resolution for a non-Base EVM rail: network-specific → `X402_EVM_ALT_PAY_TO` → `X402_EVM_PAY_TO`.

Validation and helpful error messages live in `backend/concierge-api/x402-config.ts` and are surfaced in `/api/x402-config` when misconfigured.

## Browser client

Built artifact: `frontend/public/js/x402-pay.mjs`  
Source: `frontend/lib/x402-browser-client.ts`  
Build: `npm run build:x402`

The lounge page loads this module to:

- Read `/api/x402-config`
- Show chain selection (Solana / Base / Arbitrum / Robinhood / BNB) and balances
- Wrap `fetch` with x402 payment retry logic (Permit2 for BNB when `acceptsBnb` is true)
- On BNB, probe the wallet's USDT then USDC balance and settle with whichever covers the price

## Solana notes

- PayAI fee payer: `2wKupLR9…` · Dexter fee payer: `DeXterR2k…` (both listed in Solana `accepts`).
- Transactions use a 3-instruction pattern compatible with facilitator verification (no memo instruction).
- Optional `SOLANA_RPC_URL` (e.g. Helius) improves reliability; proxied only on the server.

## Local development without payments

When no valid merchant address is configured, the payment gate allows requests through so Concierge and APIs work locally **without** wallet payment. Do not rely on this behavior in production—set valid pay-to addresses on Vercel.

## Response shape (402)

Example `PAYMENT-REQUIRED` payload (decoded):

```json
{
  "x402Version": 2,
  "resource": { "url": "https://conc-exe.xyz/api/concierge", "name": "..." },
  "accepts": [
    {
      "scheme": "exact",
      "network": "eip155:8453",
      "amount": "100000",
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "payTo": "0xYourMerchantAddress"
    },
    {
      "scheme": "exact",
      "network": "eip155:4663",
      "amount": "100000",
      "asset": "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
      "payTo": "0xYourMerchantAddress",
      "extra": { "name": "Global Dollar", "version": "1" }
    },
    {
      "scheme": "exact",
      "network": "eip155:56",
      "amount": "100000000000000000",
      "asset": "0x55d398326f99059fF775485246999027B3197955",
      "payTo": "0xYourMerchantAddress",
      "extra": { "assetTransferMethod": "permit2", "name": "Tether USD", "version": "1" }
    },
    {
      "scheme": "exact",
      "network": "eip155:56",
      "amount": "100000000000000000",
      "asset": "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
      "payTo": "0xYourMerchantAddress",
      "extra": { "assetTransferMethod": "permit2", "name": "USD Coin", "version": "1" }
    }
  ]
}
```

## Discovery

- `GET /.well-known/x402` — resource URLs + Dexter/OpenDexter links
- `GET /openapi.json` — full catalog with x-payment-info
- `GET /api/x402-config` — runtime facilitator primary + fallback (+ `acceptsRobinhood`, `acceptsBnb`)

See [x402scan.md](x402scan.md) for registry listing. Robinhood marketplace index: [agent402.tools/robinhood](https://agent402.tools/robinhood). BNB facilitator: [dexter.cash/facilitator/bsc](https://dexter.cash/facilitator/bsc).

## zauth (optional)

Optional [zauth](https://zauth.inc/) integration records successful paid responses to Provider Hub, exposes `/api/zauth-directory` and `/api/zauth-status`, and adds `discovery.zauth` links. Set `ZAUTH_API_KEY` in Vercel — see **[zauth.md](zauth.md)**. PayAI/Dexter settlement and browser wallets are unchanged.
