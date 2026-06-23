# Security

Security is the top priority for Executive Lounge documentation and operations. **Documentation must never contain secrets or copy-pasteable credentials.**

## Never put in docs, commits, or issues

| Category | Examples (do not document real values) |
|----------|----------------------------------------|
| API keys | `GEMINI_API_KEY`, PayAI `PAYAI_API_KEY_*` |
| RPC URLs with keys | Helius / Alchemy URLs containing `api-key=` |
| Private keys / seeds | Wallet mnemonics, JSON keyfiles, ~88-char Solana secrets |
| KV / Redis tokens | `KV_REST_API_TOKEN`, `UPSTASH_REDIS_REST_TOKEN` |
| Session or access secrets | Removed `X402_ACCESS_SECRET` — do not reintroduce |
| Full `.env` dumps | Paste only **boolean** flags when asking for support |

## Safe to reference in docs

| Item | Why |
|------|-----|
| Public site URL | Already visible in the browser (e.g. production domain). |
| USDC **contract** addresses on Base/Solana | Public chain constants, not merchant wallets. |
| Environment **variable names** | Operators need names; not values. |
| x402 protocol headers | Public specification (`PAYMENT-REQUIRED`, etc.). |
| File paths in this repo | No credentials by themselves. |

## Public runtime data

When payments are enabled, `GET /api/x402-config` may include **merchant receive addresses** (`evmPayTo`, `solPayTo`). That is required for x402 clients but means:

- Treat pay-to addresses as **business-public**, not secret.
- Do **not** publish screenshots of full config responses in tickets if you want to limit address visibility.
- Never add private keys or RPC secrets to that endpoint (they are not included by design).

## Security desk (platform guard)

`POST /api/concierge-security-*` routes probe **external** targets only. `conc-exe.xyz`, Vercel project hosts, and private networks are **hard-blocked** in code — not configurable off in production. See [concierge-security.md](concierge-security.md).

## Language in APIs and docs

API errors, OpenAPI examples, skills, and integrator docs use **English only**. Multilingual output applies to **Concierge LLM chat** (`POST /api/concierge`), not to machine-facing routes or code samples.

## Documentation rules

1. Use placeholders: `your-domain.com`, `0xYourMerchantAddress`, `your_gemini_api_key`.
2. Do not list internal Vercel team slugs, personal account names, or private Git orgs unless the repo is intentionally public.
3. Do not document Redis key prefixes or bypass tokens that aid abuse on misconfigured staging.
4. Prefer `curl` checks that inspect **status codes** or single fields (`enabled`) instead of dumping full JSON in guides.

## Local and production

- Copy [`.env.example`](../.env.example) → `.env.local`; keep `.env.local` gitignored.
- Set production secrets only in **Vercel Environment Variables** (or your host’s secret store).
- Restrict `GEMINI_API_KEY` by HTTP referrer in Google AI Studio.
- Rotate any key that was ever committed or pasted into chat.

## Before every push

```bash
git status
git diff --cached
```

Confirm no `.env.local`, `.dev.vars`, or key-like strings in staged files.

See also [SECURITY.md](../SECURITY.md) at the repo root for the full checklist and reporting process.
