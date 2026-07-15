# API reference

Base URL: `https://your-production-domain.com` (your deployment origin).

All JSON APIs use `Content-Type: application/json` unless noted. Paid routes return **402** without a valid `PAYMENT-SIGNATURE` (or `payment-signature`) header.

## CORS

Responses include:

- `Access-Control-Allow-Origin` — matching allowed origin
- `Access-Control-Expose-Headers` — `PAYMENT-REQUIRED`, `PAYMENT-RESPONSE`

Preflight: `OPTIONS` → `204`.

## Free endpoints

### `GET /api/market`

Live lounge feed: RSS headlines merged with published creator signals.

**Response (200):**

```json
{
  "headlines": [
    {
      "title": "...",
      "summary": "...",
      "source": "Reuters",
      "category": "Macro",
      "url": "https://...",
      "signalId": "sig_..."
    }
  ],
  "ticks": [{ "symbol": "BTC", "price": "...", "change": "..." }]
}
```

Creator items include `signalId`; wire items include external `url`.

### `GET /api/x402-config`

Public payment configuration. **No API keys or RPC secrets.** May include merchant **receive** addresses when payments are enabled—do not treat as confidential, but avoid posting full responses in public support threads.

**Response (200):** `enabled`, `networks`, `acceptsEvm`, `acceptsSol`, `priceUsdc`, `discovery`, `signalReaderRevenueShare`, etc.

### `GET /.well-known/x402`

x402 resource fan-out for scanners. See [x402scan.md](x402scan.md).

### `GET /openapi.json`

OpenAPI 3.1 document with `x-payment-info` per paid operation.

### `GET /api/zauth-directory`

Proxy to [zauth](https://zauth.inc/) x402 endpoint directory (CORS `*` for agents). See [zauth.md](zauth.md).

**Query:** `search`, `network`, `status`, `verified` (`true`/`false`), `limit` (max 100), `offset`.

**Response (200):** `endpoints[]`, `pagination`, `stats`, `source: "zauth.inc"`, `links` (hub, database, this site’s status URL).

### `GET /api/zauth-status`

Directory slice and optional Provider Hub verification for **this** deployment origin (`X402_SITE_ORIGIN` or request host).

**Response (200):** `origin`, `endpoints`, `directory` stats, `providerCheck[]` (when `ZAUTH_API_KEY` set), `providerTelemetryEnabled`, `links`.

**Response (502):** zauth directory unreachable.

`/api/x402-config` also returns `zauthTelemetryEnabled` and `discovery.zauth` link bundle.

### `GET /.well-known/agent-card.json`

Service-level agent registry metadata (register URL, docs, payment networks). See [agent-identity.md](agent-identity.md).

### `POST /api/agent-identity`

Register an autonomous agent identity (public keys only — **no private keys**).

**Body:** `name` (required), `description` (optional), `solAddress` and/or `evmAddress` (at least one).

**Response (200):** `agent` with `id` (`agt_…`), `cardUrl`, `profileUrl`, plus `card` JSON.

### `GET /api/agent-identity`

- `?id=agt_…` — profile + card  
- `?list=1&limit=24` — public directory of registered agents  

### `GET /api/agent-identity-card`

`?id=agt_…` — per-agent HTTP card (optional `erc8004` block after Base Identity Registry mint).

EIP-8004 registration file (on-chain `agentURI`): `GET /api/agent-identity-registration?id=agt_…`  
Prepare / link mint: `GET|POST /api/agent-identity-erc8004`

Paid Concierge accepts optional header **`X-Agent-Id`** when the id exists.

### Concierge Intel (paid, 0.1 USDC each)

Structured JSON for agents — see [concierge-intel.md](concierge-intel.md) · web `/docs/intel`.

| POST | Purpose |
|------|---------|
| `/api/concierge-intel-macro` | Macro snapshot — SPX, VIX, DXY, yields, calendar |
| `/api/concierge-intel-wire` | Wire headline digest (RSS + Lounge memory) |
| `/api/concierge-intel-tvl` | Chain + protocol TVL (DeFi Llama) |
| `/api/concierge-intel-yields` | Yield pools (Jupiter, Meteora, DLMM, …) |
| `/api/concierge-intel-whales` | Top-trader positioning (Binance) |
| `/api/concierge-intel-wallet` | Wallet snapshot (Solana/Helius) |
| `/api/concierge-intel-verdict` | Desk verdict + Lounge insider signals |
| `/api/concierge-intel-airdrop` | Potential airdrops (insider-first alpha) |
| `/api/concierge-intel-listing` | Potential exchange listings |
| `/api/concierge-intel-momentum` | Large-move candidates (up or down) |
| `/api/concierge-intel-scalp` | BTC/ETH/BNB/SOL scalp desk (5m/15m) |

### Security Desk

Passive posture audits for **authorized** targets — see [concierge-security.md](concierge-security.md) · web `/docs/api/security` · Lounge `/lounge#security-scan`.

| POST | Price | Purpose |
|------|-------|---------|
| `/api/concierge-security-scope` | Free | Scope validation (no fetch) |
| `/api/concierge-security-scan` | $0.10 | Unified breakdown — grade, readiness, headers, **Concierge Surface Review**, recommendations |
| `/api/concierge-security-scan` + `selfAudit: true` on `conc-exe.xyz` | Free | Canonical public self-audit |
| `/api/concierge-security-readiness` | $0.02 | Scout — API readiness |
| `/api/concierge-security-headers` | $0.02 | Scout — HTTP security headers |

**`security-scan` response (summary):** `summary.overallGrade`, `summary.surfaceGrade`, `summary.surfaceBySeverity`, `breakdown.surface.findings[]`, `deskModules[]`, `deskPhases[]`, `access.tier` / `access.liveCeiling` / `access.tcxLaunched`.

**Pre-launch:** Guest depth only (grade + surface severity counts). **Post-TCX:** Deluxe → Executive depth by holder tier; President extended modules stay **Soon** until worker rollout. Env: `SOON_TOKEN_MINT` or `SECURITY_DESK_LIVE_MAX_TIER`.

Agent marketplaces: [Poncho](https://conc-exe.xyz/docs/integration/poncho) discovers routes via x402scan — no Concierge API key. MCP: `security_scan`, `security_readiness`, `security_headers`.

## Paid endpoints

Probed by x402scan with **GET** (returns 402) and **POST** (402 without payment, 200 with payment).

### `POST /api/news-open`

Unlock one wire article URL.

**Body:**

```json
{
  "url": "https://www.example.com/article",
  "title": "Headline",
  "source": "Publisher"
}
```

**Success (200):**

```json
{
  "ok": true,
  "url": "https://www.example.com/article",
  "title": "...",
  "source": "...",
  "priceUsdc": 0.1
}
```

**Price:** 0.1 USDC.

---

### `POST /api/concierge`

Concierge AI turn.

**Body:**

```json
{
  "mode": "chat",
  "message": "What is the macro outlook for BTC?",
  "history": [{ "role": "user", "text": "..." }, { "role": "model", "text": "..." }],
  "market": [],
  "signal": { "title": "...", "summary": "..." }
}
```

| `mode` | Behavior |
|--------|----------|
| `chat` | Standard reply (HTML in `reply`) |
| `enhance` | JSON `{ title, summary, implication }` for signal editor |
| `image` | Analysis + optional `images` base64 |

**Success (200):** mode-dependent; includes `topics`, `marketLive`, `dataAsOf` for chat/image.

**Price:** 0.1 USDC (chat/image). Enhance is used from Create Signal UI.

---

### `POST /api/lounge-signal-publish`

Publish a creator signal and register an **RWA certificate**. For `creatorChain: "sol"`, response includes `mintParams` for a follow-up **Phantom NFT mint** (not part of x402).

**Body:**

```json
{
  "title": "Signal headline",
  "summary": "At least 40 characters of thesis...",
  "categories": ["Crypto", "Macro"],
  "creatorWallet": "7hum...",
  "creatorChain": "sol"
}
```

**Success (200)** (abbreviated):

```json
{
  "ok": true,
  "signal": { "id": "sig_...", "title": "...", "publishedAt": "..." },
  "publishFeeUsdc": 0.02,
  "readerUnlockUsdc": 0.1,
  "rwa": {
    "tokenId": "rwa_...",
    "contentHash": "...",
    "standard": "concierge-lounge-rwa-v1",
    "targetChain": "sol",
    "onChainMintStatus": "pending"
  },
  "solanaNft": {
    "status": "pending",
    "reason": "Confirm NFT mint in Phantom (~0.02 SOL network fee)"
  },
  "mintParams": {
    "signalId": "sig_...",
    "uri": "https://your-domain/api/rwa-metadata?signalId=sig_...",
    "name": "Short on-chain title",
    "collectionMint": "optionalCollectionMint"
  }
}
```

After Phantom mint, client calls `POST /api/lounge-rwa-record-mint`.

**Price:** $0.02 USDC (minimum settlement). Requires KV. Creator earns **25 Lounge points**.

---

### `POST /api/lounge-signal-open`

Unlock full signal summary; awards **reader badge** and **10 Lounge points** to the signal author.

**Price:** 0.1 USDC. **100% protocol** — no USDC creator split.

**Body:**

```json
{
  "signalId": "sig_..."
}
```

**Success (200):** Signal object with full `summary`, categories, RWA/badge fields, and `creatorPoints` when applicable.

---

## RWA endpoints (mostly free)

See [rwa.md](rwa.md).

### `GET /api/rwa-token`

Query: `signalId=sig_...` — RWA certificate JSON.

### `GET /api/rwa-badges`

Query: `wallet=` — reader badges for wallet.

### `GET /api/rwa-metadata`

Query: `signalId=sig_...` — NFT metadata JSON (`uri` target for Metaplex).

### `POST /api/lounge-rwa-record-mint`

Persist client mint (no x402). **Body:**

```json
{
  "signalId": "sig_...",
  "mintAddress": "...",
  "tx": "...",
  "creatorWallet": "7hum..."
}
```

### `POST /api/solana-rpc-send`

Solana JSON-RPC proxy for browser mint. **Body:** `{ "method": "getLatestBlockhash", "params": [], "id": 1 }`. Returns JSON-RPC result. Blocks `requestAirdrop`. Used only from same-origin lounge UI.

### `POST /api/lounge-rwa-mint-sol` (optional)

Server-side Metaplex mint (Node). Requires internal auth header. Prefer client mint in production.

## Payment headers (x402 v2)

| Header | Direction | Purpose |
|--------|-----------|---------|
| `PAYMENT-REQUIRED` | Response 402 | Base64 JSON payment requirements |
| `PAYMENT-SIGNATURE` | Request | Base64 JSON signed payment payload |
| `PAYMENT-RESPONSE` | Response 200 | Base64 JSON settlement result (`transaction`, `network`, `payer`) |

## Utility endpoints

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/solana-rpc` | POST | Legacy/server Solana RPC helper |
| `/api/solana-rpc-send` | POST | Browser NFT mint RPC proxy (Edge) |
| `/api/sol-usdc-balance` | GET | Solana USDC balance for payment modal |
| `/api/zauth-directory` | GET | zauth x402 directory proxy (agents) |
| `/api/zauth-status` | GET | This origin’s zauth directory + verification |
| `/deploy-version.txt` | GET | Git commit id baked at build time |

## Error codes

| Status | Meaning |
|--------|---------|
| 402 | Payment required or invalid |
| 403 | Origin not allowed (paid POST after payment) |
| 400 | Validation error |
| 503 | Missing config (Gemini, KV, x402 misconfiguration) |
| 405 | Unsupported method (non GET/POST/HEAD/OPTIONS on paid routes) |
