# Solana RWA NFT setup

Mint a **Metaplex NFT** to the creator's Solana wallet when they publish a signal.

## What you need

| Item | Purpose |
|------|---------|
| **Mint authority wallet** | Signs mint txs; pays SOL fees |
| **SOL balance** | ~0.02 SOL per mint (rent + fees; varies) |
| **RPC** | `SOLANA_RPC_URL` (Helius recommended) |
| **Site URL** | `X402_SITE_ORIGIN` — hosts metadata at `/api/rwa-metadata` |

## Step 1 — Create mint wallet

1. New Phantom wallet (or dedicated keypair) — **not** your main treasury if you can avoid it.
2. Export secret → store only in **Vercel** as `RWA_MINT_SOL_SECRET` (base58 or JSON `[64 bytes]`).
3. Send **SOL** on mainnet (or devnet if `X402_NETWORK_MODE=testnet`) to that address.

## Step 2 — Vercel environment

```env
RWA_MINT_SOL_SECRET=your_base58_secret_or_json_array
SOLANA_RPC_URL=https://your-helius-or-rpc-url
X402_SITE_ORIGIN=https://conc-exe.xyz
```

Optional collection (NFTs grouped under one collection):

```env
RWA_SIGNAL_CONTRACT_SOL=YourCollectionMintAddress
```

The mint authority (`RWA_MINT_SOL_SECRET`) must be the **update authority** of that collection to link new NFTs (unverified collection flag until you verify later in Metaplex).

## Step 3 — Collection (optional)

1. [Metaplex Studio](https://studio.metaplex.com/) or [Core](https://developers.metaplex.com/) → create a **Collection** on Solana mainnet.
2. Copy the **collection mint address** → `RWA_SIGNAL_CONTRACT_SOL`.
3. Use the same wallet as update authority for `RWA_MINT_SOL_SECRET`.

Without a collection, each signal is still minted as a **standalone NFT** to the creator.

## Step 4 — Verify

1. `GET /api/x402-config` → `solanaRwaMintReady: true`
2. Publish a signal with **Solana** wallet connected.
3. Response includes `solanaNft.mintAddress` and `rwa.onChainMintTx`.
4. Check creator wallet in [Solscan](https://solscan.io/) or Phantom collectibles.
5. Metadata URL: `https://your-domain/api/rwa-metadata?signalId=sig_...`

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `solanaNft.status: skipped` | Set `RWA_MINT_SOL_SECRET` |
| `failed` | More SOL on mint wallet; check RPC; confirm creator address is valid Solana |
| Metadata empty on explorer | Set `X402_SITE_ORIGIN` to production URL; redeploy |

## Reader badges

Reader badges remain **off-chain** in Redis for now. Solana SBT/cNFT for readers can be a follow-up.
