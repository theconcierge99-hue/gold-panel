# Deployment

## Production source of truth

Production deploys **only** via **GitHub → Vercel** on the team that owns your production domain:

| Item | Value |
|------|--------|
| Vercel team | Your Concierge / organization team (not a personal Vercel account) |
| Vercel project | e.g. `lounge` — confirm in dashboard |
| Repository | Your private `gold-panel` remote |
| Branch | `main` (or your release branch) |

Push to `main` triggers deployment when Git integration is connected in that team’s dashboard.

## Do not use the wrong Vercel account

Local `vercel deploy` while logged into the **wrong** Vercel account produces preview URLs under that account. Those builds **do not** use your production environment variables (KV, x402, Gemini).

**If you must use CLI:**

```bash
vercel logout
vercel login    # Concierge account only
vercel link     # select your org team → correct project
```

Prefer **git push** and skip CLI deploy entirely.

## Build settings (Vercel)

From `vercel.json`:

| Setting | Value |
|---------|--------|
| Build command | `npm run build` |
| Install command | `npm install` |
| Output directory | `dist/client` |

Rewrites serve `public/executive-lounge.html` at `/`, map `/.well-known/x402` and `/openapi.json` to Edge APIs.

## Environment checklist

Set in Vercel **Production** (and Preview if desired):

- [ ] `GEMINI_API_KEY`
- [ ] `X402_EVM_PAY_TO` and/or `X402_SOL_PAY_TO`
- [ ] `KV_REST_API_URL` + `KV_REST_API_TOKEN` (signals + memory)
- [ ] `X402_SITE_ORIGIN=https://your-production-domain.com`
- [ ] Optional: `ALLOWED_ORIGINS`, `SOLANA_RPC_URL`, `PAYAI_API_KEY_*`

See [configuration.md](configuration.md).

## Post-deploy verification

Replace `https://your-production-domain.com` with your real domain. **Do not paste full `/api/x402-config` JSON** into public tickets—it may include merchant receive addresses.

```bash
# Site up
curl -sI https://your-production-domain.com/ | head -1

# Payments enabled (boolean only)
curl -s https://your-production-domain.com/api/x402-config | jq '.enabled'

# x402 probe (expect 402)
curl -sI https://your-production-domain.com/api/concierge | head -1

# Discovery resource count (optional)
curl -s https://your-production-domain.com/.well-known/x402 | jq '.resources | length'
```

Expected: `enabled: true`, four resources in discovery, Concierge returns `402`.

## x402scan

After deploy, register on [x402scan](x402scan.md). If batch registration fails for 3/4 endpoints, register each API URL individually.

## Repo hygiene

- `.vercel/` is gitignored — never commit.
- Do not commit `.env.local` or secrets.
- See [SECURITY.md](../SECURITY.md).

## Rollback

Revert the commit on `main` and push; Vercel redeploys the previous build automatically.
