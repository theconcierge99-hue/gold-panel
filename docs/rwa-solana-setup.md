# Solana RWA NFT setup

Mint a **Metaplex NFT** to the **creator’s Solana wallet** when they publish a signal. This is the on-chain layer of Executive Lounge **RWA** certificates.

## How minting works (production)

| Step | Who pays | What happens |
|------|----------|----------------|
| Publish signal | Creator — **1 USDC** (x402) | Signal + off-chain RWA in KV; response includes `mintParams` |
| Mint NFT | Creator — **SOL** (~0.02–0.05) | Phantom signs; RPC via `/api/solana-rpc-send` |
| Record mint | Free POST | `POST /api/lounge-rwa-record-mint` saves mint address on the certificate |

The **NFT appears in the creator’s Phantom**, not in the optional `RWA_MINT_SOL_SECRET` wallet (that key is only for legacy **server-side** mint if enabled).

## What you need

| Item | Purpose |
|------|---------|
| **Creator Phantom** | Signs mint; receives NFT; holds SOL for gas |
| **`SOLANA_RPC_URL`** | Helius (recommended) or publicnode — powers `/api/solana-rpc-send` |
| **`X402_SITE_ORIGIN`** | Canonical URL for metadata (`/api/rwa-metadata?signalId=…`) |
| **`KV_REST_*`** | Signal + RWA storage |
| **Optional `RWA_SIGNAL_CONTRACT_SOL`** | Metaplex collection mint (group NFTs) |
| **Optional `RWA_MINT_SOL_SECRET`** | Server mint authority — only if using `/api/lounge-rwa-mint-sol` |

## Step 1 — Vercel environment (required)

```env
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
X402_SITE_ORIGIN=https://your-production-domain.com
KV_REST_API_URL=...
KV_REST_API_TOKEN=...
```

**Do not** set `SOLANA_RPC_URL` to:

- `https://solana.drpc.org` (free tier blocks `getLatestBlockhash`)
- `https://rpc.ankr.com/solana` (often 403)

If unset or blocked, the server falls back to `https://solana-rpc.publicnode.com` (see `api/lib/x402-config.ts`).

## Step 2 — Optional collection

```env
RWA_SIGNAL_CONTRACT_SOL=YourCollectionMintAddress
```

- Collection is **optional** — without it, each signal is a standalone NFT.
- Mint address must be a valid base58 Solana pubkey; invalid values are omitted server-side.
- Client mint **retries without collection** if simulation fails.
- **Do not** use dead links (e.g. old `truffle.wtf` collections).
- Collection **update authority** must match your minter if you use server mint; client mint links collection **unverified**.

Create a collection via [Metaplex docs](https://www.metaplex.com/docs) or [Core explorer](https://core.metaplex.com/explorer).

## Step 3 — Optional server mint wallet

Only needed for ops/scripts calling `POST /api/lounge-rwa-mint-sol` — **not** the default publish path.

```env
RWA_MINT_SOL_SECRET=base58_secret_or_json_64_bytes
LOUNGE_INTERNAL_KEY=shared_secret_for_internal_routes
```

Fund this wallet with SOL if you use server mint. Normal **Mint & Publish** does **not** require `RWA_MINT_SOL_SECRET`.

## Step 4 — Deploy & verify

1. Push `main` → Vercel Production (see [deployment.md](deployment.md), [vercel-deploy.md](vercel-deploy.md)).
2. Open `https://your-domain/deploy-version.txt` — confirm expected commit.
3. `GET /api/x402-config` — check Solana / discovery flags.
4. Connect **Solana** in Phantom on the lounge.
5. **Mint & Publish** a test signal:
   - Approve **1 USDC**
   - Approve **NFT mint** (keep ~**0.03 SOL** in wallet)
6. Check creator wallet on [Solscan](https://solscan.io/) or Phantom **Collectibles**.
7. Metadata: `https://your-domain/api/rwa-metadata?signalId=sig_...`

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|----------------|-----|
| `freetier` / RPC code 35 | dRPC free tier | Set Helius `SOLANA_RPC_URL`; redeploy |
| WebSocket failed to `wss://…/solana-rpc-send` | web3.js WS to HTTP-only proxy | Usually harmless if mint completes; use latest `24f8f9f+` mint bundle |
| `block height exceeded` | Slow Phantom approval | Publish again; approve NFT prompt quickly |
| `custom program error: 0xb` | On-chain name > 32 bytes | Shorten signal title; ensure deploy includes `lib/on-chain-meta.ts` |
| `Simulation failed` + collection | Bad `RWA_SIGNAL_CONTRACT_SOL` | Remove env var or fix collection; client retries without collection |
| Signal in feed, no NFT | Mint step failed after publish | Republish or call record-mint after manual mint |
| `402` on publish in Network tab | x402 challenge before payment | Normal — complete USDC approval |
| `solanaNft.status: pending` | Client mint not finished | Complete Phantom mint step |
| Metadata 404 on explorer | Wrong origin | Set `X402_SITE_ORIGIN`; redeploy |

## Build artifacts

Production `npm run build` also runs:

- `scripts/build-mint-signal.mjs` → `public/js/mint-signal.mjs`
- `scripts/write-deploy-version.mjs` → `public/deploy-version.txt`

After changing `lib/mint-signal-browser.ts`, rebuild before deploy.

## Reader badges

Reader badges remain **off-chain** in Redis. On-chain SBT/cNFT for readers is future work.

See also [rwa.md](rwa.md) and [creator-signals.md](creator-signals.md).
