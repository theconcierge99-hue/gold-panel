# RWA signals & reader badges

Executive Lounge treats each **creator signal** as a tokenized intelligence asset (RWA certificate) and awards **reader badges** when a wallet unlocks a signal.

## Signal token (creator)

On successful `POST /api/signal-publish`:

1. Signal is stored in Redis/KV.
2. An **RWA certificate** is minted (registered) with:
   - `tokenId` — e.g. `rwa_abc123…`
   - `contentHash` — SHA-256 of canonical title/summary/categories/creator/publishedAt
   - Metadata (name, image SVG, attributes) ready for ERC-1155 or SPL mint
3. `rwaTokenId` is saved on the signal record.

**Solana on-chain mint (live):** see [rwa-solana-setup.md](rwa-solana-setup.md) — `RWA_MINT_SOL_SECRET`, optional `RWA_SIGNAL_CONTRACT_SOL`.

**Base (future):** `RWA_SIGNAL_CONTRACT_EVM` — ERC-1155 on Base (not implemented yet).

## Reader badge (unlock)

On successful `POST /api/signal-open` (paid unlock):

1. One badge per **wallet + signal** (re-unlock does not duplicate).
2. Badge tier follows **total unlock count** for that wallet:

| Unlocks | Tier |
|---------|------|
| 1+ | Intel Scout |
| 5+ | Intel Analyst |
| 15+ | Intel Strategist |
| 40+ | Principal Reader |
| 100+ | Sovereign Intel |

## Public API

| Endpoint | Method | Query |
|----------|--------|-------|
| `/api/rwa-token` | GET | `signalId` |
| `/api/rwa-badges` | GET | `wallet` |

## UI

- Feed cards show **⬡ RWA** on tokenized creator signals.
- Wallet view lists reader badges.
- Signal reader modal shows RWA id + badge after unlock.

## Storage keys (Redis)

- `lounge:rwa:token:{signalId}`
- `lounge:rwa:badge:{badgeId}`
- `lounge:rwa:wallet-badges:{wallet}`
- `lounge:rwa:wallet-unlocks:{wallet}`
