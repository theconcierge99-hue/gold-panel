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

### `POST /api/signal-publish`

Publish a creator signal to the lounge feed.

**Body:**

```json
{
  "title": "Signal headline",
  "summary": "At least 40 characters of thesis...",
  "categories": ["Crypto", "Macro"],
  "creatorWallet": "0x...",
  "creatorChain": "evm"
}
```

**Success (200):**

```json
{
  "ok": true,
  "signal": { "id": "sig_...", "title": "...", "publishedAt": "..." }
}
```

**Price:** 1 USDC. Requires KV. **100% merchant** revenue.

---

### `POST /api/signal-open`

Unlock full signal summary.

**Body:**

```json
{
  "signalId": "sig_..."
}
```

**Success (200):** Signal object with full `summary`, categories, metadata.

**Price:** 0.1 USDC. **50/50** reader split; creator half paid on-chain when payout wallets are configured. Response may include `creatorPayout` and `revenueShare`.

## Payment headers (x402 v2)

| Header | Direction | Purpose |
|--------|-----------|---------|
| `PAYMENT-REQUIRED` | Response 402 | Base64 JSON payment requirements |
| `PAYMENT-SIGNATURE` | Request | Base64 JSON signed payment payload |
| `PAYMENT-RESPONSE` | Response 200 | Base64 JSON settlement result (`transaction`, `network`, `payer`) |

## Utility endpoints

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/solana-rpc` | POST | Server-side Solana RPC proxy |
| `/api/sol-usdc-balance` | POST | USDC balance check for payment modal |

## Error codes

| Status | Meaning |
|--------|---------|
| 402 | Payment required or invalid |
| 403 | Origin not allowed (paid POST after payment) |
| 400 | Validation error |
| 503 | Missing config (Gemini, KV, x402 misconfiguration) |
| 405 | Unsupported method (non GET/POST/HEAD/OPTIONS on paid routes) |
