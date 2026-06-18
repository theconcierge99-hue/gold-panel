# Launch Playbook — conc-exe.xyz

Playbook kompetitif + operasional untuk **fase sekarang (pre-launch)** dan **hari H (post-launch token)**. Setelah token live, cukup **paste env snapshot** → redeploy — tanpa ubah kode.

| Artefak | Path |
|---------|------|
| Env pre-launch | [`config/launch/pre-launch.env.snapshot`](../config/launch/pre-launch.env.snapshot) |
| Env post-launch | [`config/launch/post-launch.env.snapshot`](../config/launch/post-launch.env.snapshot) |
| Verifikasi | `npm run launch:verify -- --phase=pre` atau `--phase=post` |

---

## Positioning (jangan diubah saat launch)

> **Bukan data API murah — Intelligence OS untuk agent Solana.**

| Kalian menang | Kalian kalah jika |
|---------------|-------------------|
| Verdict + synthesis (snipe/watch/avoid) | Race harga vs x402-api ($0.001) |
| Meteora DLMM + Solana-native | Race breadth vs httpay (307 endpoint) |
| AI concierge + insider Lounge signals | Jual raw JSON tanpa interpretasi |
| A2A agent identity (`agt_`) | Jadi "CoinGecko dengan x402" |

---

## Fase 1 — Sekarang (pre-launch)

### Yang sudah jalan

| Area | Status |
|------|--------|
| 15 route x402 @ $0.10 USDC | Live |
| USDC pay (Solana + Base) | Live |
| Token Pay infra (SOON merchant) | Built — **mint belum di-set** |
| Agent identity + discovery | Live |
| Poncho / pay.sh / x402scan / Grok skill | Live |
| Creator signals (Lounge) | Live |

### Env snapshot (pre-launch)

Copy [`config/launch/pre-launch.env.snapshot`](../config/launch/pre-launch.env.snapshot) ke Vercel.

**Kunci pre-launch:**

```env
# JANGAN set sebelum launch
# SOON_TOKEN_MINT=

SOON_RESOURCE_KINDS=concierge
SOON_TOKEN_DISCOUNT_PERCENT=0
```

- Pembayaran API: **USDC only**
- Pay modal: SOON tampil **"Coming soon"**
- SOON hanya di-wire ke `concierge` (chat) — intel tetap USDC

### Strategi go-to-market (pre-launch)

1. **Discovery** — daftar/maintain di x402scan, Poncho, MPPscan, pay.sh catalog
2. **Sandbox onboarding** — promosikan `pay --sandbox curl` untuk developer probing (jawab objection "mahal untuk testing")
3. **Solana-first messaging** — semua copy: Meteora, verdict, `agt_` discovery
4. **Case study** — 1 agent flow: register `agt_` → fund → `intel-verdict` → action
5. **Jangan** tambah puluhan endpoint generik — fokus depth

### Endpoint roadmap (pre-launch, opsional)

Tambah hanya jika ada bandwidth — semua tetap $0.10 USDC:

| Endpoint | Mengapa |
|----------|---------|
| `intel-meteora` | Moat unik — DLMM deep-dive |
| `intel-desk-brief` | Bundle macro+yields+verdict ($0.25–0.50) |

### Checklist pre-launch

```bash
npm run launch:verify -- --phase=pre
# Opsional live:
API_ORIGIN=https://conc-exe.xyz npm run launch:verify -- --phase=pre --live
```

- [ ] `GEMINI_API_KEY` + x402 wallets configured
- [ ] `SOON_TOKEN_MINT` **kosong**
- [ ] Discovery valid: `npm run discovery:validate`
- [ ] Docs positioning konsisten di `/docs`, `/openapi.json`

---

## Fase 2 — Hari H (post-launch token)

### Snapshot flow (5 menit)

```
1. Token live di pump.fun → copy mint address
2. Buka config/launch/post-launch.env.snapshot
3. Paste SOON_TOKEN_MINT=<mint>
4. Copy seluruh block ke Vercel Environment Variables (Production)
5. Redeploy
6. npm run launch:verify -- --phase=post --live
```

**Tidak perlu:** deploy kode baru, branch khusus, atau migration DB.

### Env snapshot (post-launch)

Copy [`config/launch/post-launch.env.snapshot`](../config/launch/post-launch.env.snapshot), isi `SOON_TOKEN_MINT`.

**Kunci post-launch:**

```env
SOON_TOKEN_MINT=<base58_mint_dari_pump_fun>
SOON_RESOURCE_KINDS=all
SOON_TOKEN_DISCOUNT_PERCENT=30
SOON_USDC_RATE=0.00008
TOKEN_PAY_SOON_COMING_SOON=
```

| Variable | Efek |
|----------|------|
| `SOON_TOKEN_MINT` | SOON muncul di pay modal, self-settle aktif |
| `SOON_RESOURCE_KINDS=all` | Semua 15 route terima SOON |
| `SOON_TOKEN_DISCOUNT_PERCENT=30` | Holder bayar ~30% lebih murah vs USDC setara |
| `SOON_USDC_RATE` | Fallback harga jika DexScreener down |

### Dual-rail pricing (otomatis setelah snapshot)

| Rail | Harga | Untuk siapa |
|------|-------|-------------|
| USDC | $0.10/call (flat) | Agent institusional, integrator |
| SOON | $0.10 × (1 − diskon) dalam token | Holder, retail, creator ecosystem |

Contoh: `intel-verdict` $0.10 USDC → dengan diskon 30% = efektif $0.07 dalam SOON (jumlah token dihitung dari DexScreener).

### Token flywheel (post-launch, non-code)

| Mekanisme | Status | Catatan |
|-----------|--------|---------|
| Bayar API pakai SOON (diskon) | **Env snapshot** | `SOON_TOKEN_DISCOUNT_PERCENT` |
| Creator signal unlock → split USDC | **Sudah ada** | 50/50 creator/merchant |
| Creator payout dalam SOON | Roadmap | Butuh treasury + policy |
| Stake SOON → free tier | **Live** | `SOON_HOLDER_FREE_TIER_*` env + wallet header |
| Holder badge di agent card | Roadmap Fase 3 | |

### Checklist post-launch (H+0)

```bash
npm run launch:verify -- --phase=post
API_ORIGIN=https://conc-exe.xyz npm run launch:verify -- --phase=post --live
```

- [ ] `GET /api/x402-config` → `tokenPay.default.live: true`
- [ ] Pay modal Lounge: SOON selectable, bukan "Coming soon"
- [ ] Test 1 call USDC + 1 call SOON (`intel-tvl` body `{}`)
- [ ] DexScreener pair exists untuk SOON/SOL atau SOON/USDC
- [ ] Merchant wallet punya SOL untuk gas (self-settle user pays gas, merchant receives token)
- [ ] Announce: holder discount %, USDC tetap available

### Verifikasi manual (curl)

```bash
# Harus return tokenPay.default.live true
curl -s https://conc-exe.xyz/api/x402-config | jq '.tokenPay.default'

# 402 harus list SOON accept di accepts[]
curl -s -X POST https://conc-exe.xyz/api/concierge-intel-tvl \
  -H 'Content-Type: application/json' -d '{}' -D - | head
```

---

## Fase 3 — Implemented (live in codebase)

| Item | Endpoint / config |
|------|-------------------|
| Tiered USDC pricing | Raw $0.02: `intel-tvl`, `intel-macro`, `intel-wire`, `intel-whales` · Signal $0.10 · Bundle $0.25: `intel-desk-brief` |
| `intel-meteora` | `POST /api/concierge-intel-meteora` — $0.10 |
| `intel-desk-brief` | `POST /api/concierge-intel-desk-brief` — $0.25 |
| MCP server | `GET/POST /api/mcp` (JSON-RPC: `tools/list`, `tools/call`) |
| Accuracy leaderboard | `GET /api/concierge-intel-accuracy` (free) |
| SOON holder free tier | Raw routes + `X-Soon-Holder-Wallet` header — env `SOON_HOLDER_*` |

---

## Competitive battle card → action map

| Objection (dari Poncho intel) | Jawaban + aksi |
|-------------------------------|----------------|
| "10–100× lebih mahal" | Jual synthesis bukan raw JSON; post-launch SOON diskon 30% |
| "Mycelia 176 endpoint + attestation" | Ed25519 sudah ada — market lebih keras; jangan race count |
| "Meridian free tier" | Fase 3: stake SOON / sandbox `pay --sandbox` |
| "Neurobro juga $0.10 AI" | Solana depth + Lounge insider + A2A |
| "CoinGecko brand $0.01" | Price check mereka; intelligence kalian |

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
| `TOKEN_PAY_SOON_COMING_SOON` | pesan coming soon | kosong |

Full list: [configuration.md](configuration.md#soon-token--token-pay).

---

## Rollback

Jika launch bermasalah:

```env
# Emergency: matikan SOON pay, USDC tetap jalan
SOON_X402_ENABLED=false
# atau unset SOON_TOKEN_MINT
```

Redeploy → SOON hilang dari accepts, USDC tidak terpengaruh.

---

## Ringkasan

| Pertanyaan | Jawaban |
|------------|---------|
| Perlu deploy kode baru saat launch? | **Tidak** — paste post-launch env snapshot |
| Perlu banyak endpoint baru? | **Tidak sekarang** — 3–5 moat endpoint di Fase 3 |
| Apa yang paling penting hari H? | `SOON_TOKEN_MINT` + `SOON_RESOURCE_KINDS=all` + diskon 30% |
| USDC masih bisa? | **Ya** — selalu dual-rail |
