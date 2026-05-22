# Executive Lounge

**Private intelligence terminal for markets and the onchain economy.**

Production site: your deployed domain (e.g. Executive Lounge on Vercel)  
Repository: private `gold-panel` — clone from your Git remote only; do not commit secrets

Executive Lounge combines a live market wire, creator-published signals, and a paid **Concierge AI** desk. Micropayments use the [x402](https://www.x402.org/) protocol (USDC on **Base** and **Solana**) via the [PayAI facilitator](https://facilitator.payai.network). Paid APIs can be listed on [x402scan.com](https://www.x402scan.com/) when discovery endpoints are enabled.

> **Security:** Documentation uses placeholders only. Never commit API keys, RPC URLs with keys, or KV tokens. See [docs/security.md](docs/security.md).

## Documentation

| Document | Description |
|----------|-------------|
| [docs/overview.md](docs/overview.md) | Product features, pricing, and user flows |
| [docs/architecture.md](docs/architecture.md) | Stack, repo layout, and request flow |
| [docs/getting-started.md](docs/getting-started.md) | Local development setup |
| [docs/configuration.md](docs/configuration.md) | Environment variables |
| [docs/api-reference.md](docs/api-reference.md) | HTTP API endpoints |
| [docs/x402-payments.md](docs/x402-payments.md) | x402 / PayAI payment integration |
| [docs/x402scan.md](docs/x402scan.md) | Public discovery and marketplace listing |
| [docs/concierge-ai.md](docs/concierge-ai.md) | Concierge AI behavior and language rules |
| [docs/creator-signals.md](docs/creator-signals.md) | Publish / unlock signals and revenue split |
| [docs/deployment.md](docs/deployment.md) | Vercel production deployment |
| [docs/security.md](docs/security.md) | Security-first rules for docs and ops |
| [SECURITY.md](SECURITY.md) | Secrets checklist (repo root) |

## Quick start

```bash
git clone <your-repository-url>
cd gold-panel
cp .env.example .env.local   # add GEMINI_API_KEY and optional x402 addresses
npm install
npm run dev
```

Open the dev URL shown in the terminal (typically port 5173). The lounge UI is served from `public/executive-lounge.html` with API routes proxied in development.

## Pricing (USDC)

| Action | Price |
|--------|-------|
| Browse lounge headlines | Free |
| Open RSS article | 0.1 USDC |
| Concierge message | 0.1 USDC |
| Unlock creator signal | 0.1 USDC |
| Publish creator signal | 1 USDC (anti-spam) |

Reader unlock fees on creator signals split **80% creator / 20% merchant** (monthly off-chain settlement). The publish fee is **100% merchant**.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server + concierge API plugin |
| `npm run build` | Production client build + x402 browser bundle |
| `npm run build:x402` | Rebuild `public/js/x402-pay.mjs` only |
| `npm run lint` | ESLint |

## License

Private project — see repository owner for terms of use.
