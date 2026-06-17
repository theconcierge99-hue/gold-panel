# pay.sh integration (Concierge Agent)

[pay.sh](https://pay.sh/) is Solana Foundation’s **pay-as-you-go API catalog** for AI agents. The `pay` CLI wraps `curl`, Claude, and Codex — it handles HTTP **402** (x402 / MPP) automatically so agents can call paid APIs with **no sign-up, no API keys, no subscriptions**.

Concierge Agent already ships what pay.sh probes expect: **OpenAPI 3.1**, **402 + PAYMENT-REQUIRED**, **Solana USDC** via PayAI, and **MPP-compatible** metadata. Listing is a **registry PR** to [pay-skills](https://github.com/solana-foundation/pay-skills) — no backend rewrite.

## What fits today

| Concierge asset | pay.sh use |
|-----------------|------------|
| `GET /openapi.json` | Provider spec (committed snapshot in pay-skills PR) |
| `402` + `PAYMENT-REQUIRED` | `pay curl` auto-settlement |
| Solana USDC (PayAI) | Required for pay-skills CI probe |
| Fifteen POST routes | Catalog endpoints ($0.10 · $1.00 publish) |
| `GET` intel probes | Marketplace probes (402 until paid POST) |

**Not routed through pay.sh gateway** — agents call `https://conc-exe.xyz` directly (same as MPPscan / x402scan). pay.sh is **discovery + CLI payment**, not a proxy.

## Call Concierge from pay CLI

```bash
# Install (Homebrew or npm)
brew install pay
# or: npm install -g @solana/pay

# Sandbox — ephemeral wallet, no funding step
pay --sandbox curl https://conc-exe.xyz/api/concierge-intel-tvl -d '{}'

# DeFi intel
pay --sandbox curl https://conc-exe.xyz/api/concierge-intel-yields \
  -d '{"chain":"solana","project":"meteora"}'

# Alpha desk
pay --sandbox curl https://conc-exe.xyz/api/concierge-intel-momentum \
  -d '{"message":"BTC altcoin volatility","limit":5,"includeInsider":true}'

# Research (Poncho / agent marketplaces)
pay --sandbox curl https://conc-exe.xyz/api/concierge-intel-macro -d '{}'

pay --sandbox curl https://conc-exe.xyz/api/concierge-intel-wire \
  -d '{"category":"Geopolitics","limit":5}'

# Concierge AI chat
pay --sandbox curl https://conc-exe.xyz/api/concierge \
  -d '{"mode":"chat","message":"Solana DeFi outlook"}'

# Search catalog (after listing)
pay skills update
pay skills search "market intelligence"
pay skills search "defi"
```

Mainnet (real USDC):

```bash
pay setup
pay topup
pay curl https://conc-exe.xyz/api/concierge-intel-verdict \
  -d '{"message":"ETH outlook","includeInsider":true}'
```

With Claude / Codex:

```bash
pay --sandbox claude   # Pay MCP tools attached
pay codex
```

## Fifteen routes (pay-per-call)

| Path | Price | Segment |
|------|-------|---------|
| `POST /api/concierge` | $0.10 | Concierge AI |
| `POST /api/concierge-intel-tvl` | $0.10 | DeFi Intel |
| `POST /api/concierge-intel-yields` | $0.10 | DeFi Intel |
| `POST /api/concierge-intel-whales` | $0.10 | DeFi Intel |
| `POST /api/concierge-intel-wallet` | $0.10 | DeFi Intel |
| `POST /api/concierge-intel-verdict` | $0.10 | DeFi Intel |
| `POST /api/concierge-intel-airdrop` | $0.10 | Alpha Intel |
| `POST /api/concierge-intel-listing` | $0.10 | Alpha Intel |
| `POST /api/concierge-intel-momentum` | $0.10 | Alpha Intel |
| `POST /api/concierge-intel-macro` | $0.10 | Research |
| `POST /api/concierge-intel-wire` | $0.10 | Research |
| `POST /api/concierge-intel-scalp` | $0.10 | Alpha Intel |
| `POST /api/news-open` | $0.10 | Lounge |
| `POST /api/lounge-signal-open` | $0.10 | Lounge |
| `POST /api/lounge-signal-publish` | $1.00 | Lounge |

Full catalog: `/agent/endpoints` · Poncho: `/docs/integration/poncho` · OpenAPI: `/openapi.json`

## List on pay.sh (operator checklist)

Submission bundle lives in this repo: `pay-skills/conc-exe/concierge-agent/`.

1. **Refresh OpenAPI snapshot** (after API changes):

   ```bash
   npm run paysh:sync-openapi
   ```

2. **Validate locally** (requires `pay` CLI):

   ```bash
   npm run paysh:validate
   # or: pay catalog check pay-skills/conc-exe/concierge-agent/PAY.md
   ```

   Expected: **20/20 gates compatible with Solana** (15 POST paths + GET intel probes).

3. **Fork** [solana-foundation/pay-skills](https://github.com/solana-foundation/pay-skills) on GitHub, then:

   ```bash
   npm run paysh:prepare-pr
   cd ../pay-skills
   git remote add fork https://github.com/YOUR_USER/pay-skills.git   # once
   git push -u fork add-conc-exe-concierge-agent
   ```

   Open PR: `YOUR_USER/pay-skills` → `solana-foundation/pay-skills` `main`

   Or copy `pay-skills/conc-exe/concierge-agent/` manually into your fork's `providers/conc-exe/concierge-agent/`.

4. CI probes live endpoints for **402 + Solana USDC**. Ensure `X402_SOL_PAY_TO` is set in production.

5. After merge, agents find Concierge via `pay skills search` and [pay.sh/services](https://pay.sh/).

Expected FQN: **`conc-exe/concierge-agent`**

## How pay.sh relates to other registries

| Registry | Role |
|----------|------|
| **pay.sh** | Agent CLI + MCP catalog (`pay curl`, Claude/Codex) |
| **MPPscan / AgentCash** | MPP discovery (`npx agentcash add`) |
| **x402scan** | x402 ecosystem registry |
| **Corbits Marketplace** | Hosted x402 proxy for enterprise buyers |
| **zauth** | Provider trust telemetry |

All use the same origin (`https://conc-exe.xyz`) and x402 settlement — complementary discovery layers.

## Env (unchanged)

- `X402_SOL_PAY_TO` — required for pay.sh Solana probe
- `X402_EVM_PAY_TO` — optional Base (pay CLI uses Solana by default)
- `X402_SITE_ORIGIN` — canonical origin in discovery docs

See also [builders.md](builders.md), [mppscan.md](mppscan.md), web [/docs/payment/paysh](https://conc-exe.xyz/docs/payment/paysh).
