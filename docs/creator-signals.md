# Creator signals

Creator signals let wallet-connected users publish short intelligence notes to the Executive Lounge feed. Readers pay to unlock the full summary in-app.

## Flows

### Publish

1. User opens **Create Signal**, fills title, summary, categories.
2. Pays **1 USDC** via x402 (`POST /api/signal-publish`).
3. Signal stored in Redis/KV with id `sig_*`.
4. Ingested into lounge memory and merged at top of `/api/market` as **Lounge Signal**.

**Publish fee:** 100% merchant (anti-spam; no creator split).

### Read / unlock

1. User taps a creator card on the feed.
2. Pays **0.1 USDC** (`POST /api/signal-open`).
3. Modal shows full summary (no external URL).

**Reader fee split:** 50% creator / 50% merchant (`api/lib/signal-revenue.ts`). After each unlock, the creator’s half (0.05 USDC) is sent on-chain to their registered wallet via `api/lib/creator-instant-payout.ts` when `CREATOR_PAYOUT_*` env keys are configured.

## API

See [api-reference.md](api-reference.md#post-apisignal-publish) for request/response bodies.

## Storage

| Component | File |
|-----------|------|
| Types | `api/lib/signals-types.ts` |
| Validation | `api/lib/signal-validation.ts` |
| KV access | `api/lib/signal-store.ts` |
| Handlers | `api/lib/signal-publish-handler.ts`, `api/lib/signal-open-handler.ts` |
| Feed merge | `api/lib/lounge-market.ts` |

### Environment

Production requires:

- `KV_REST_API_URL` + `KV_REST_API_TOKEN`  
  (or Upstash `UPSTASH_REDIS_REST_*`)

Without KV, publish returns **503** with setup instructions.

### Ledger

On each successful unlock, `appendUnlockLedger()` records atomic amounts split via `splitReaderUnlockAtomic()`:

- Creator share: 5000 bps (50%)
- Merchant share: 5000 bps (50%)
- `creatorPayoutTx` / `creatorPayoutStatus` when instant payout runs

Configure `CREATOR_PAYOUT_EVM_PRIVATE_KEY` and/or `CREATOR_PAYOUT_SOL_SECRET` in Vercel (treasury wallets with USDC balance). Without them, unlocks still succeed; ledger records the split but on-chain creator transfer is skipped.

## Categories

Allowed labels (select at least one):

Technology, Macro, Micro, Geopolitics, Crypto, Stocks, Energy, Equities, Oil, Gold / Silver, Other.

## Validation rules

| Field | Rule |
|-------|------|
| `title` | Required, max 240 chars |
| `summary` | Min 40 chars, max 2000 |
| `categories` | 1–6 from allowed set |
| `creatorWallet` | Valid Solana or EVM address |
| `creatorChain` | `sol` or `evm` |

## Feed presentation

- Cards show **◆ unlock · 0.1 USDC** instead of external link.
- `data-signal-id` drives unlock modal in `executive-lounge.html`.
- RSS articles still use `data-url` → `news-open`.

## On-chain mint

The UI label **Mint & Publish** reflects product language; current backend is **payment + KV storage** only (Option A). On-chain NFT mint (Option C) is not implemented.

## x402scan

Publish and open endpoints are listed in [x402scan.md](x402scan.md) as separate paid resources.
