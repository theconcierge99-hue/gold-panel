# OpenAI GPT-5.6 integration

Concierge Agent routes optional chat inference through the [OpenAI Chat Completions API](https://platform.openai.com/docs/api-reference/chat) — `POST /v1/chat/completions` at `https://api.openai.com/v1`.

**Web guide:** [/docs/integration/openai](https://conc-exe.xyz/docs/integration/openai)

## Status

Live on production — Executive Lounge model picker and `POST /api/concierge` with `agentModel`.

## Payment (unchanged)

Consumers pay **0.1 USDC** (or TCX via Token Pay when live) per `POST /api/concierge` turn — same x402 flow as Gemini and Claude. OpenAI billing is operator-side only (`OPENAI_API_KEY` on deploy).

## Models

| `agentModel` | OpenAI model id |
|--------------|-----------------|
| `gpt-5.6-terra` | `gpt-5.6-terra` |
| `gpt-5.6-luna` | `gpt-5.6-luna` |

Chat only. Image, enhance, and trading-plan paths always use Gemini. Falls back to Gemini on error or when `OPENAI_API_KEY` is unset.

Aliases: `openai`, `gpt`, `terra`, `luna`.

## Operator env

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | API key from [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| `OPENAI_API_BASE_URL` | Optional override (default `https://api.openai.com/v1`) |

x402 consumers calling `conc-exe.xyz` do **not** need an OpenAI key.

## Code

- Adapter: `backend/concierge-api/concierge-openai.ts`
- Registry: `backend/concierge-api/concierge-llm-models.ts`
- Router: `backend/concierge-api/concierge-gemini.ts`
