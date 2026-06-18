# Launch Playbook — conc-exe.xyz

Competitive and operational playbook for **pre-launch (now)** and **launch day (post-token)**. After the token is live, **paste the env snapshot** → redeploy — no code changes.

| Artifact | Path |
|----------|------|
| Pre-launch env | [`config/launch/pre-launch.env.snapshot`](../config/launch/pre-launch.env.snapshot) |
| Post-launch env | [`config/launch/post-launch.env.snapshot`](../config/launch/post-launch.env.snapshot) |
| Verify | `npm run launch:verify -- --phase=pre` or `--phase=post` |

---

## Positioning (do not change at launch)

> **Not a cheap data API — an Intelligence OS for Solana agents.**

| You win on | You lose if |
|------------|-------------|
| Verdict + synthesis (snipe/watch/avoid) | Racing price vs x402-api ($0.001) |
| Meteora DLMM + Solana-native depth | Racing breadth vs httpay (307 endpoints) |
| AI concierge + insider Lounge signals | Selling raw JSON without interpretation |
| A2A agent identity (`agt_`) | Becoming "CoinGecko with x402" |

---

## Phase 1 — Now (pre-launch)

### What is live

| Area | Status |
|------|--------|
| Tiered x402 (raw $0.02 · signal $0.10 · bundle $0.25) | Live |
| USDC pay (Solana + Base) | Live |
| Token Pay infra (SOON merchant) | Built — **mint not set** |
| Agent identity + discovery | Live |
| Poncho / pay.sh / x402scan / Grok skill | Live |
| Creator signals (Lounge) | Live |
| MCP `/api/mcp` + accuracy leaderboard | Live |

### Env snapshot (pre-launch)

Copy [`config/launch/pre-launch.env.snapshot`](../config/launch/pre-launch.env.snapshot) into Vercel.

**Pre-launch keys:**

```env
# Do NOT set before launch
# SOON_TOKEN_MINT=

SOON_RESOURCE_KINDS=concierge
SOON_TOKEN_DISCOUNT_PERCENT=0
TOKEN_PAY_DEFAULT_MERCHANT=soon
```

- API payment: **USDC only**
- Pay modal: SOON shows **"Coming soon"**
- SOON wired to `concierge` (chat) only until post-launch snapshot

### Go-to-market (pre-launch)

1. **Discovery** — maintain listings on x402scan, Poncho, MPPscan, pay.sh catalog
2. **Sandbox onboarding** — promote `pay --sandbox curl` for developer probing
3. **Solana-first messaging** — Meteora, verdict, `agt_` discovery in all copy
4. **Case study** — one agent flow: register `agt_` → fund → `intel-verdict` → action
5. **Do not** add dozens of generic endpoints — focus on depth

### Pre-launch checklist

```bash
npm run launch:verify -- --phase=pre
# Optional live check:
API_ORIGIN=https://conc-exe.xyz npm run launch:verify -- --phase=pre --live
```

- [ ] `GEMINI_API_KEY` + x402 wallets configured on Vercel
- [ ] `SOON_TOKEN_MINT` **unset**
- [ ] `TOKEN_PAY_DEFAULT_MERCHANT=soon` (no comments in the value)
- [ ] Discovery valid: `npm run discovery:validate`
- [ ] Docs consistent at `/docs`, `/openapi.json`

---

## Phase 2 — Launch day (post-token)

### Snapshot flow (~5 minutes)

```
1. Token live on pump.fun → copy mint address
2. Open config/launch/post-launch.env.snapshot
3. Set SOON_TOKEN_MINT=<mint>
4. Copy the full block to Vercel Environment Variables (Production)
5. Redeploy
6. npm run launch:verify -- --phase=post --live
```

**Not required:** new code deploy, special branch, or DB migration.

### Env snapshot (post-launch)

Copy [`config/launch/post-launch.env.snapshot`](../config/launch/post-launch.env.snapshot) and set `SOON_TOKEN_MINT`.

**Post-launch keys:**

```env
SOON_TOKEN_MINT=<base58_mint_from_pump_fun>
SOON_RESOURCE_KINDS=all
SOON_TOKEN_DISCOUNT_PERCENT=30
SOON_USDC_RATE=0.00008
TOKEN_PAY_SOON_COMING_SOON=
```

| Variable | Effect |
|----------|--------|
| `SOON_TOKEN_MINT` | SOON appears in pay modal; self-settle active |
| `SOON_RESOURCE_KINDS=all` | All x402 routes accept SOON |
| `SOON_TOKEN_DISCOUNT_PERCENT=30` | Holders pay ~30% less vs equivalent USDC |
| `SOON_USDC_RATE` | Fallback price when DexScreener is down |

### Dual-rail pricing (automatic after snapshot)

| Rail | Price | For |
|------|-------|-----|
| USDC | Tiered ($0.02 / $0.10 / $0.25) | Institutional agents, integrators |
| SOON | USDC equivalent × (1 − discount) in tokens | Holders, retail, creator ecosystem |

Example: `intel-verdict` $0.10 USDC → with 30% discount = effective $0.07 in SOON (token amount from DexScreener).

### Token flywheel (post-launch)

| Mechanism | Status | Notes |
|-----------|--------|-------|
| Pay API with SOON (discount) | **Env snapshot** | `SOON_TOKEN_DISCOUNT_PERCENT` |
| Creator signal unlock → USDC split | **Live** | 50/50 creator/merchant |
| Creator payout in SOON | Roadmap | Treasury + policy |
| SOON holder free raw-tier calls | **Live** | `SOON_HOLDER_FREE_TIER_*` + `X-Soon-Holder-Wallet` |
| Holder badge on agent card | Roadmap | |

### Post-launch checklist (H+0)

```bash
npm run launch:verify -- --phase=post
API_ORIGIN=https://conc-exe.xyz npm run launch:verify -- --phase=post --live
```

- [ ] `GET /api/x402-config` → `tokenPay.default.live: true`
- [ ] Lounge pay modal: SOON selectable, not "Coming soon"
- [ ] Test one USDC call + one SOON call (`intel-tvl` body `{}`)
- [ ] DexScreener pair exists for SOON/SOL or SOON/USDC
- [ ] Merchant wallet has SOL for ops (user pays gas on self-settle; merchant receives tokens)
- [ ] Announce holder discount %; USDC remains available

### Manual verification (Windows: use `curl.exe`)

```powershell
# Must show tokenPay.default.live true
curl.exe -s https://conc-exe.xyz/api/x402-config

# Must return 402 without payment
curl.exe -s -X POST https://conc-exe.xyz/api/concierge-intel-tvl `
  -H "Content-Type: application/json" -d "{}"
```

---

## Phase 3 — Implemented (in codebase)

| Item | Endpoint / config |
|------|-------------------|
| Tiered USDC pricing | Raw $0.02: `intel-tvl`, `intel-macro`, `intel-wire`, `intel-whales` · Signal $0.10 · Bundle $0.25: `intel-desk-brief` |
| `intel-meteora` | `POST /api/concierge-intel-meteora` — $0.10 |
| `intel-desk-brief` | `POST /api/concierge-intel-desk-brief` — $0.25 |
| MCP server | `GET/POST /api/mcp` (JSON-RPC: `tools/list`, `tools/call`) |
| Accuracy leaderboard | `GET /api/concierge-intel-accuracy` (free) |
| SOON holder free tier | Raw routes + `X-Soon-Holder-Wallet` header — `SOON_HOLDER_*` env |

---

## Competitive battle card → action map

| Objection (Poncho intel) | Response + action |
|--------------------------|-------------------|
| "10–100× more expensive" | Sell synthesis not raw JSON; post-launch SOON 30% discount |
| "Mycelia 176 endpoints + attestation" | Market Ed25519 harder; do not race on endpoint count |
| "Meridian free tier" | SOON holder free raw-tier + `pay --sandbox` |
| "Neurobro also $0.10 AI" | Solana depth + Lounge insider + A2A |
| "CoinGecko brand $0.01" | They are price checks; you are intelligence |

---

## Env reference (SOON-specific)

| Variable | Pre-launch | Post-launch |
|----------|------------|-------------|
| `SOON_TOKEN_MINT` | unset | **required** |
| `SOON_RESOURCE_KINDS` | `concierge` | `all` |
| `SOON_TOKEN_DISCOUNT_PERCENT` | `0` | `30` (recommended) |
| `SOON_X402_ENABLED` | `true` | `true` |
| `SOON_PRICE_SOURCE` | `dexscreener` | `dexscreener` |
| `SOON_USDC_RATE` | optional | **set fallback** |
| `TOKEN_PAY_SOON_COMING_SOON` | coming-soon message | empty |
| `TOKEN_PAY_DEFAULT_MERCHANT` | `soon` | `soon` |

Full list: [configuration.md](configuration.md#soon-token--token-pay).

---

## Rollback

If launch has issues:

```env
# Emergency: disable SOON pay; USDC keeps working
SOON_X402_ENABLED=false
# or unset SOON_TOKEN_MINT
```

Redeploy → SOON removed from accepts; USDC unaffected.

---

## Summary

| Question | Answer |
|----------|--------|
| New code deploy on launch day? | **No** — paste post-launch env snapshot |
| Need many new endpoints? | **No** — moat endpoints already shipped |
| Most important on launch day? | `SOON_TOKEN_MINT` + `SOON_RESOURCE_KINDS=all` + 30% discount |
| USDC still supported? | **Yes** — always dual-rail |
