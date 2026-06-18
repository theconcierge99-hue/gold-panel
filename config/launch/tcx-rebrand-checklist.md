# TCX rebrand checklist (SOON → TCX at launch)

**When the user says “ganti ticker ke TCX”:** this is a **display + env + public copy** rebrand.  
**Do not** rename backend modules (`soon-token.ts`, merchant id `soon`, `SOON_*` env keys) unless explicitly requested — they are internal identifiers.

Ticker on pump.fun / DexScreener / wallet UI = **TCX**.  
Product name in copy can stay **“The Concierge”** or **“TCX”** — confirm with user if unclear.

---

## Launch day — env (Vercel, ~2 min)

Update [`post-launch.env.snapshot`](post-launch.env.snapshot) and Production env:

```env
TOKEN_PAY_SOON_SYMBOL=TCX
TOKEN_PAY_SOON_NAME=TCX
# Optional full name:
# TOKEN_PAY_SOON_NAME=The Concierge

TOKEN_PAY_SOON_COMING_SOON=
SOON_TOKEN_MINT=<mint_from_pump_fun>
# … rest of post-launch snapshot unchanged (SOON_RESOURCE_KINDS=all, etc.)
```

**Unchanged env keys (still named SOON_*):** `SOON_TOKEN_MINT`, `SOON_TOKEN_DISCOUNT_PERCENT`, `SOON_HOLDER_*`, `SOON_RESOURCE_KINDS`.  
Only **symbol/name** shown in pay modal come from `TOKEN_PAY_SOON_SYMBOL` / `TOKEN_PAY_SOON_NAME`.

Redeploy → verify:

```bash
npm run launch:verify -- --phase=post --live
```

`GET /api/x402-config` → `tokenPay.default.symbol` should be `TCX`.

---

## Public UI — search & replace user-facing “SOON”

Run ripgrep first: `rg "SOON" frontend/public docs config/launch`

### High priority (user-facing)

| File | What to change |
|------|----------------|
| `frontend/public/token.html` | Title, H1, symbol pill, all body copy “SOON” → TCX; keep “utility token” framing |
| `frontend/public/token-transparency.html` | Stats, labels, report copy |
| `frontend/public/executive-lounge.html` | Token view section, pay modal strings, pills, error messages mentioning SOON |
| `frontend/public/about.html` | Token utility mentions |
| `frontend/public/docs-launch.html` | Playbook copy, env examples (add TCX symbol lines) |
| `frontend/public/docs-pricing.html` | Holder / SOON checkout notes |
| `frontend/public/docs-payment-token-pay.html` | Token Pay guide |
| `frontend/public/docs.html` | Token card blurb |
| `frontend/public/agent-endpoints.html` | Launch / pay footnotes |
| `frontend/public/llms.txt` | Agent discovery summary |

### Docs (repo)

| File | What to change |
|------|----------------|
| `docs/launch-playbook.md` | User-facing references; note internal `SOON_*` keys |
| `docs/configuration.md` | Describe `TOKEN_PAY_SOON_SYMBOL=TCX` |
| `docs/concierge-intel.md` | Holder free-tier copy |
| `docs/token-pay-platform.md` | Examples |

### Launch config

| File | What to change |
|------|----------------|
| `config/launch/post-launch.env.snapshot` | `TOKEN_PAY_SOON_SYMBOL=TCX`, `TOKEN_PAY_SOON_NAME=TCX` |
| `config/launch/pre-launch.env.snapshot` | Comment that public ticker will be TCX at launch |

---

## Backend — user-visible strings only (optional same PR)

Most backend uses env-driven symbol. Grep for hardcoded `"SOON"` in user-facing errors/responses:

| File | Notes |
|------|--------|
| `backend/concierge-api/token-pay/merchants/soon.ts` | Default fallback `symbol/name` `"SOON"` → change default to `TCX` **or** rely on env only |
| `backend/concierge-api/token-pay/merchants/soon.ts` | `comingSoonMessage` default text |
| `backend/concierge-api/soon-token.ts` | Comments + benefit copy mentioning “SOON checkout” → “TCX checkout” |
| `backend/concierge-api/x402-config.ts` | `soonHolderFreeTier.note` if it says SOON |
| `backend/concierge-api/soon-holder-free-tier.ts` | Comments only |
| `backend/concierge-api/mpp-discovery.ts` | Discovery description if it says SOON |
| `scripts/verify-launch-readiness.mjs` | Success messages / docs hints |

### Do NOT rename (unless user asks for deep refactor)

- `backend/concierge-api/soon-token.ts` filename
- `backend/concierge-api/soon-*.ts` filenames
- Merchant id `soon` / `SOON_MERCHANT_ID`
- Env prefix `SOON_*`
- Header `X-Soon-Holder-Wallet` (breaking for integrators)
- API field `soonHolderTiers`, `soonHolderFreeTier`, `soonX402` (client compatibility)
- Holder tier names **Deluxe / Executive / President** (unchanged)

---

## pump.fun / on-chain

- Token metadata **symbol = TCX** (set at create — cannot change after mint)
- Publish CA on `/token` when live
- DexScreener pair will show TCX — `SOON_PRICE_SOURCE=dexscreener` still works

---

## Copy patterns

| Before | After |
|--------|--------|
| SOON token | TCX token / The Concierge (TCX) |
| Pay in SOON | Pay in TCX |
| SOON checkout | TCX checkout |
| Hold SOON | Hold TCX |
| ~30% SOON vs USDC | ~30% TCX vs USDC (discount logic unchanged) |
| Pre-launch badge | Keep “Pre-launch” until mint set |

---

## Verification checklist

- [ ] `GET /api/x402-config` → `tokenPay.default.symbol` = `TCX`, `live: true` after mint
- [ ] Lounge pay modal shows **TCX**, not SOON
- [ ] `/token` page title and H1 show **TCX**
- [ ] `rg "SOON" frontend/public` — only intentional leftovers (e.g. env key names in `<code>` docs)
- [ ] `npm run launch:verify -- --phase=post --live`
- [ ] `npm run discovery:validate` (if discovery text updated)

---

## Pre-launch policy (now)

**Keep SOON in public UI** until user says rebrand.  
When they say **“ganti ke TCX”** → execute this checklist in one PR + env update, same deploy window as mint.
