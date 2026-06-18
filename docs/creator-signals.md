# Creator signals

Creator signals let wallet-connected users publish short intelligence notes to the Executive Lounge feed. Each signal is an **RWA intelligence certificate**; Solana creators also mint an **on-chain NFT** to their wallet after publish.

See [rwa.md](rwa.md) for the full RWA model.

## Flows

### Publish (Mint & Publish)

1. User opens **Create Signal**, fills title, summary, categories.
2. Pays **$0.02 USDC** via x402 — `POST /api/lounge-signal-publish` (minimum settlement, same as raw intel tier).
3. Server stores signal (`sig_*`), registers **off-chain RWA** (`rwa_*`), awards **Lounge points** to creator, returns `mintParams` for Solana.
4. **Solana only:** browser loads `mint-signal.mjs`, Phantom signs Metaplex mint (~0.03 SOL gas).
5. Client calls `POST /api/lounge-rwa-record-mint` with `mintAddress` + `tx`.
6. Signal ingested into lounge memory and merged at top of `/api/market` as **Lounge Signal** (with **⬡ RWA**).

**Publish fee:** 100% protocol (minimum x402 settlement). Creator earns **25 Lounge points** per publish.

**On-chain name:** Metaplex limits the NFT **on-chain** name to **32 UTF-8 bytes**. Server sends `truncateOnChainMetaName(signal.title)` in `mintParams` — keep titles concise; emoji counts as multiple bytes.

**402 before payment:** The first `POST` without `PAYMENT-SIGNATURE` returns **402** — expected x402 behavior, not a failure.

### Read / unlock

1. User taps a creator card on the feed.
2. Pays **0.1 USDC** — `POST /api/lounge-signal-open`.
3. Modal shows full summary (no external URL).
4. **Reader badge** awarded (off-chain tier — Intel Scout → Sovereign Intel).
5. Signal author earns **10 Lounge points** per unlock (no USDC revenue share).

**Reader fee:** 100% protocol. Creators are rewarded with Lounge points only.

## Creator points

| Event | Points |
|-------|--------|
| Publish signal | 25 |
| Reader unlock | 10 (to signal author) |

Query profile: `GET /api/creator-points?wallet=…` — returns `profile`, `tier`, `nextTier`, `pointsToNextTier`

### Creator tiers (points)

| Tier | Min points |
|------|------------|
| Desk Contributor | 25 |
| Signal Analyst | 100 |
| Intel Strategist | 300 |
| Principal Author | 750 |
| Sovereign Desk | 2000 |

Separate from **reader badges** (unlock-based).

## API

Canonical x402 paths (also listed in [x402scan.md](x402scan.md)):

| Action | Path |
|--------|------|
| Publish | `POST /api/lounge-signal-publish` |
| Unlock | `POST /api/lounge-signal-open` |
| Points | `GET /api/creator-points?wallet=…` |

Request/response details: [api-reference.md](api-reference.md).

## Storage

| Component | File |
|-----------|------|
| Types | `api/lib/signals-types.ts` |
| Validation | `api/lib/signal-validation.ts` |
| KV access | `api/lib/signal-store.ts` |
| Publish | `api/lib/signal-publish-handler.ts`, `api/lounge-signal-publish.ts` |
| Open | `api/lib/signal-open-handler.ts`, `api/lounge-signal-open.ts` |
| Points | `api/lib/creator-points.ts`, `api/lib/creator-points-store.ts` |
| RWA | `api/lib/rwa-token.ts`, `api/lib/rwa-store.ts` |
| Client NFT mint | `lib/mint-signal-browser.ts`, `public/js/mint-signal.mjs` |
| Feed merge | `api/lib/lounge-market.ts` |

### Environment

Production requires:

- `KV_REST_API_URL` + `KV_REST_API_TOKEN` (or Upstash `UPSTASH_REDIS_REST_*`)
- `SOLANA_RPC_URL` (recommended) for Solana NFT mint proxy
- `X402_SITE_ORIGIN` for RWA metadata URLs

Without KV, publish returns **503**.

### Ledger

On each successful unlock, `appendUnlockLedger()` records the payment and points award (no creator USDC payout).

## Categories

Technology, Macro, Micro, Geopolitics, Crypto, Stocks, Energy, Equities, Oil, Gold / Silver, Other (1–6 required).

## Validation rules

| Field | Rule |
|-------|------|
| `title` | Required, max 240 chars (on-chain NFT name truncated to 32 bytes separately) |
| `summary` | Min 40 chars, max 2000 |
| `categories` | 1–6 from allowed set |
| `creatorWallet` | Valid Solana or EVM address |
| `creatorChain` | `sol` or `evm` |

## Feed presentation

- Cards show **◆ unlock · 0.1 USDC** for creator signals.
- Tokenized signals show **⬡ RWA**.
- RSS articles use `data-url` → `news-open`.

## x402scan

Publish and open are separate paid resources in [x402scan.md](x402scan.md).
