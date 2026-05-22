# Concierge AI

Concierge is the in-lounge research desk powered by **Google Gemini**. It answers market questions, drafts trading frameworks, enhances signal copy, and optionally generates chart-style visuals.

**Endpoint:** `POST /api/concierge`  
**Price:** 0.1 USDC per request (chat and image modes; enhance is invoked from Create Signal).

## Modes

| Mode | Trigger | Output |
|------|---------|--------|
| `chat` | Default user message | HTML paragraphs in `reply` |
| `enhance` | Create Signal → AI Enhance | JSON `title`, `summary`, `implication` |
| `image` | Message matches visual keywords or explicit image flow | HTML analysis + optional `images[]` |

Detection: `api/lib/concierge-brain.ts` (`wantsImage`, `wantsTradingPlan`, topic keywords).

## Intelligence sources

Each turn combines:

1. **Live market snapshot** — Binance marks, indices, positioning proxies (`api/lib/market-data.ts`)
2. **General knowledge** — Wikipedia, DuckDuckGo, public news RSS (`api/lib/general-knowledge.ts`)
3. **Lounge memory** — Recent wire headlines and published creator signals (`api/lib/lounge-memory.ts`)

Wire headlines are ingested asynchronously after market fetch for future Concierge context.

## Topic playbooks

`api/lib/concierge-brain.ts` defines eleven Executive Lounge categories:

Technology, Macro, Micro, Geopolitics, Crypto, Stocks, Energy, Equities, Oil, Gold / Silver, Other.

The system prompt applies relevant playbooks and, when appropriate, a structured **Trading plan** block (bias, entry, stop, targets, R:R).

## Language behavior

Concierge replies follow **user language**, not fixed English:

| Situation | Reply language |
|-----------|----------------|
| Clear message in Indonesian | Indonesian |
| Clear message in another language | Same language |
| English or unknown | **English** (default) |
| Short reply (`ok`, `thanks`, …) after Indonesian thread | Indonesian (from recent **user** messages only) |

Implementation:

- `detectReplyLanguage()` / `buildReplyLanguageBlock()` in `concierge-brain.ts`
- Recent user turns passed from `concierge-gemini.ts` (`recentUserMessages`)

**UI chrome** (sidebar, buttons, About) stays **English**.

## Security limits

`api/lib/concierge-security.ts`:

- Max body 48 KB
- Max message 4,000 chars
- Max 12 history turns
- Origin allowlist in production

## Request example

```json
{
  "mode": "chat",
  "message": "Explain the Fed impact on DXY and BTC this week.",
  "history": [],
  "market": []
}
```

## Response example (chat)

```json
{
  "reply": "<p>...</p>",
  "topics": ["macro", "crypto"],
  "marketLive": [{ "symbol": "BTC", "price": "...", "change": "..." }],
  "dataAsOf": "2026-05-21T12:00:00.000Z"
}
```

## Models

Configured in `api/lib/concierge-gemini.ts` with fallback list:

- `gemini-2.5-flash`
- `gemini-2.5-flash-lite`
- `gemini-2.0-flash`

## Related files

| File | Role |
|------|------|
| `api/concierge.ts` | Edge handler |
| `api/lib/concierge-gemini.ts` | Gemini API calls |
| `api/lib/concierge-brain.ts` | Prompts + language |
| `public/executive-lounge.html` | Chat UI |
