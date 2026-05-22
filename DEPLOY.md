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
