# Getting started

## Prerequisites

- **Node.js** 20+ and npm
- **Google AI Studio** API key for Concierge
- Optional: wallet addresses and Redis/KV for full payment + signal flows locally

## Setup

```bash
git clone <your-repository-url>
cd gold-panel
cp .env.example .env.local
```

Edit `.env.local`:

1. Set `GEMINI_API_KEY` (required for Concierge).
2. Optionally set `X402_EVM_PAY_TO` and/or `X402_SOL_PAY_TO` to enable payments in dev.
3. Optionally set `KV_REST_API_URL` and `KV_REST_API_TOKEN` for creator signals.

```bash
npm install
npm run dev
```

The Vite dev server loads environment variables from `.env.local` and registers `concierge-dev-plugin`, which implements the same `/api/*` routes as production for local testing.

## Local URLs

| Path | Behavior |
|------|----------|
| `/` or lounge HTML | Main UI |
| `/api/market` | Live feed JSON |
| `/api/concierge` | Concierge (payments skipped locally when merchant addresses are unset) |
| `/api/x402-config` | Payment config |

## Building for production

```bash
npm run build
```

This runs:

1. Vite client/SSR build → `dist/client`
2. `scripts/write-deploy-version.mjs` → `public/deploy-version.txt`
3. `scripts/build-x402-client.mjs` → `public/js/x402-pay.mjs`
4. `scripts/build-mint-signal.mjs` → `public/js/mint-signal.mjs` (Solana RWA NFT mint in browser)

Vercel uses `outputDirectory: dist/client` but rewrites `/` to `public/executive-lounge.html` per `vercel.json`.

## Testing x402 locally

1. Configure merchant addresses in `.env.local`.
2. Set `X402_ENABLED=true` if you need to force payment on (otherwise any valid address enables payments).
3. Connect Phantom (Solana + Base) in the UI.
4. Trigger article open or Concierge — approve USDC in the wallet.

Use `X402_NETWORK_MODE=testnet` only with testnet addresses and test USDC.

## Typecheck

```bash
npx tsc --noEmit
```

Matches the TypeScript step Vercel runs on deploy.
