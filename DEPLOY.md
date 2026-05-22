# Deployment (Executive Lounge)

## Production source of truth

**Production must deploy only via GitHub → Vercel**, on the team that owns **conc-exe.xyz**:

- Vercel team: **the-concierge-s-projects** (or your Concierge team — not personal `0xsha10xyzs-projects`)
- Project: **lounge**
- Repo: `theconcierge99-hue/gold-panel` → branch `main`

Push to `main` triggers the correct deployment when the Git integration is connected in that team’s Vercel dashboard.

## Do not use the wrong Vercel account

If you run `vercel deploy` locally while logged into another Vercel user/team, you will get URLs like:

`https://lounge-*-0xsha10xyzs-projects.vercel.app`

Those are **not** the Concierge production site and do not use the Concierge env vars (KV, x402, Gemini).

**Before any local `vercel` CLI use:**

```bash
vercel logout
vercel login   # Concierge account only
vercel link    # select the-concierge-s-projects → lounge
```

Or skip the CLI entirely and rely on **git push + auto-deploy**.

## This repo

- `.vercel/` is gitignored — never commit it.
- Agents should **not** run `vercel deploy` unless the project is explicitly linked to the Concierge team.

## x402scan (public on-chain visibility)

Payments already **settle on-chain** via [PayAI facilitator](https://facilitator.payai.network). This repo exposes **discovery** so [x402scan.com](https://www.x402scan.com/) can list and index your paid routes.

After deploy (with `X402_EVM_PAY_TO` and/or `X402_SOL_PAY_TO` set):

1. Set `X402_SITE_ORIGIN=https://conc-exe.xyz` in Vercel (recommended).
2. Verify:
   - `https://conc-exe.xyz/.well-known/x402`
   - `https://conc-exe.xyz/openapi.json`
   - `https://conc-exe.xyz/api/x402-config` → `discovery` block
3. Register the server at [x402scan — Add resource](https://www.x402scan.com/resources/register) using `https://conc-exe.xyz` (fan-out) or any paid endpoint URL (`POST /api/concierge`, `/api/news-open`, etc.).
4. Complete a real paid call (0.1 USDC) so settlement tx appears on x402scan.

Paid routes: `POST /api/news-open`, `/api/concierge`, `/api/signal-publish`, `/api/signal-open`.
