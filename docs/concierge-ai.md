# Concierge AI

Concierge is the in-lounge research desk powered by **Google Gemini** (default) with optional **GLM-4.7 Flash** (Z.ai), **HYRE Gateway**, **Anthropic Claude**, and **OpenAI GPT-5.6** for standard chat. It answers market questions, drafts trading frameworks, enhances signal copy, and optionally generates chart-style visuals.

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

1. **Live market snapshot** — Binance crypto marks, SPX/NDX/VIX/DXY/gold, key stocks (e.g. NVDA, AAPL), derivatives positioning, Fear & Greed, headlines (`fetchConciergeMarketSnapshot` in `api/lib/market-data.ts`)
2. **General knowledge** — mode `full` | `lite` | `trading` (`api/lib/general-knowledge.ts`):
   - **trading** (trading-plan requests): DuckDuckGo + world-news RSS for geopolitical narrative
   - **lite**: DuckDuckGo only (fast path)
   - **full**: Wikipedia + world news + DuckDuckGo
3. **Lounge memory** — Recent wire headlines and published creator signals (`api/lib/lounge-memory.ts`)
4. **DeFi desk intelligence** (crypto/DeFi questions or keywords: TVL, whales, yields, verdict, wallet) — `api/lib/concierge-defi-intel.ts` (also exposed as separate x402 APIs — see [concierge-intel.md](concierge-intel.md)):
   - **TVL** — chain snapshot + top protocols (DeFi Llama)
   - **Yields** — screened pools on Solana/EVM (Jupiter, Meteora, DLMM, Raydium, Kamino, major lending/DEX venues via DeFi Llama yields API)
   - **Whales** — Binance top-trader long/short/taker ratios (derivatives desk proxy)
   - **Wallet** — optional Solana token snapshot when user pastes an address and `SOLANA_RPC_URL` uses a Helius `api-key` (not full historical PnL)
   - **Verdict** — desk signal (`snipe` | `watch` | `follow` | `avoid` | `rebalance`) + confidence, blended with Fear & Greed, BTC tape, positioning, and **creator signals as insider overlay**

Wire headlines are ingested asynchronously after market fetch for future Concierge context.

## Trading plan depth (crypto + stocks)

When the user asks for a trading plan, outlook with levels, or comparable intent, Concierge produces an **institutional brief**:

1. Executive summary (bias, conviction, thesis)
2. Geopolitical & macro regime
3. Fundamental analysis (crypto and/or equities lens)
4. Technical analysis (structure, levels, positioning)
5. Trading plan (entry, stop, targets, R:R)
6. Risks & catalysts (24–72h)
7. **Agent handoff** — one-line `A2A|...` metadata for future agent-to-agent workflows

Prompt logic: `api/lib/concierge-brain.ts` (`CONCIERGE_SUPER_AGENT`, `TRADING_PLAN_FRAMEWORK`, `wantsTradingPlan`).

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
  "market": [],
  "agentModel": "gemini"
}
```

Optional `agentModel`: `gemini` (default), `glm-4.7-flash`, `hyre-deepseek-v4-flash`, `hyre-glm-4.7-flash`, `claude-sonnet-4-6`, `claude-haiku-4-5`, `gpt-5.6-terra`, or `gpt-5.6-luna`. Trading-plan, image, and enhance paths always use Gemini. GLM requires `GLM_API_KEY`; HYRE models require `HYRE_GATEWAY_KEY`; Claude models require `ANTHROPIC_API_KEY`; GPT-5.6 models require `OPENAI_API_KEY`. Alternate models fall back to Gemini on error. Payment per chat remains **0.1 USDC** or TCX via x402.

## Response example (chat)

```json
{
  "reply": "<p>...</p>",
  "topics": ["macro", "crypto"],
  "marketLive": [{ "symbol": "BTC", "price": "...", "change": "..." }],
  "dataAsOf": "2026-05-21T12:00:00.000Z",
  "modelUsed": "gemini-2.5-flash"
}
```

## Models

| Model | When | Notes |
|-------|------|-------|
| **Gemini 2.5 Flash** | Default; all modes | `GEMINI_API_KEY` — fallback list in `concierge-gemini.ts` |
| **GLM-4.7 Flash** | Optional chat only | `GLM_API_KEY` (Z.ai) — `agentModel: "glm-4.7-flash"` |
| **DeepSeek V4 Flash** | Optional chat only | `HYRE_GATEWAY_KEY` — `agentModel: "hyre-deepseek-v4-flash"` |
| **GLM 4.7 Flash (HYRE)** | Optional chat only | `HYRE_GATEWAY_KEY` — `agentModel: "hyre-glm-4.7-flash"` |
| **Claude Sonnet 4.6** | Optional chat only | `ANTHROPIC_API_KEY` — `agentModel: "claude-sonnet-4-6"` |
| **Claude Haiku 4.5** | Optional chat only | `ANTHROPIC_API_KEY` — `agentModel: "claude-haiku-4-5"` |
| **GPT-5.6 Terra** | Optional chat only | `OPENAI_API_KEY` — `agentModel: "gpt-5.6-terra"` |
| **GPT-5.6 Luna** | Optional chat only | `OPENAI_API_KEY` — `agentModel: "gpt-5.6-luna"` |

Configured in `backend/concierge-api/concierge-gemini.ts` with Gemini fallback:

- `gemini-2.5-flash`
- `gemini-2.5-flash-lite`
- `gemini-2.0-flash`

GLM adapter: `backend/concierge-api/concierge-glm.ts` · HYRE adapter: `concierge-hyre.ts` · Anthropic adapter: `concierge-anthropic.ts` · OpenAI adapter: `concierge-openai.ts` · registry: `concierge-llm-models.ts` · integration guides: [/docs/integration/hyre](https://conc-exe.xyz/docs/integration/hyre), [/docs/integration/anthropic](https://conc-exe.xyz/docs/integration/anthropic), [/docs/integration/openai](https://conc-exe.xyz/docs/integration/openai)

## External integration (agents)

Other projects can call Concierge over HTTPS with **x402 payment only** — no API key, no repository access.

| Resource | URL |
|----------|-----|
| Integrator guide (web) | `https://conc-exe.xyz/docs/agents` |
| Markdown | [agents.md](agents.md) |
| OpenAPI | `/openapi.json` |

## Related files

| File | Role |
|------|------|
| `api/concierge.ts` | Edge handler |
| `api/lib/concierge-gemini.ts` | Gemini + GLM routing |
| `api/lib/concierge-glm.ts` | Z.ai OpenAI-compatible client |
| `api/lib/concierge-brain.ts` | Prompts + language |
| `public/executive-lounge.html` | Chat UI |
