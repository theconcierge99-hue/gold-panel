# Security

Executive Lounge handles API keys, wallet payments, and user data. Follow these rules in every environment.

## Secrets

- **Never commit** `.env`, `.env.local`, `.dev.vars`, or any file containing API keys, RPC URLs with embedded keys, or private keys.
- Use [`.env.example`](.env.example) as the only env template in git. Copy to `.env.local` locally; set variables in **Vercel → Environment Variables** for production.
- Required secrets (server-only):
  - `GEMINI_API_KEY` — Google AI Studio
  - `X402_EVM_PAY_TO` / `X402_SOL_PAY_TO` — public **receive** addresses only (not private keys)
  - `SOLANA_RPC_URL` — optional; **never exposed** in `/api/x402-config` (server proxy only)
  - `PAYAI_API_KEY_ID` / `PAYAI_API_KEY_SECRET` — optional PayAI facilitator auth
  - `KV_REST_API_URL` / `KV_REST_API_TOKEN` (or Upstash `UPSTASH_REDIS_*`) — creator signal storage in production

## What stays on the server

- Solana RPC (Helius, etc.) is used only in Edge routes: `/api/solana-rpc`, `/api/sol-usdc-balance`, x402 payment verification.
- Gemini and PayAI keys are read from `process.env` in API handlers only — never bundled into `public/` client assets.

## Before pushing

```bash
git status
# Confirm no .env.local, no keys in staged files
git diff --cached | findstr /i "api-key AIza payai_sk PRIVATE"
```

If a secret was committed, rotate it immediately and purge history (do not only delete the file in a new commit).

## Reporting

Report vulnerabilities to the repository owner privately. Do not open public issues with live keys or wallet seeds.
