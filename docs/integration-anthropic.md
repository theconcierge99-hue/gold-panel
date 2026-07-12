# Anthropic Claude integration

Concierge Agent routes optional chat inference through the [Anthropic Messages API](https://platform.claude.com/docs/en/api/messages) — `POST /v1/messages` at `https://api.anthropic.com/v1`.

**Web guide:** [/docs/integration/anthropic](https://conc-exe.xyz/docs/integration/anthropic)

## Status

Live on production — Executive Lounge model picker and `POST /api/concierge` with `agentModel`.

## Models

| `agentModel` | Anthropic model id |
|--------------|-------------------|
| `claude-sonnet-4-6` | `claude-sonnet-4-6` |
| `claude-haiku-4-5` | `claude-haiku-4-5-20251001` |

Chat only. Image, enhance, and trading-plan paths always use Gemini. Falls back to Gemini on error or when `ANTHROPIC_API_KEY` is unset.

Aliases: `claude`, `sonnet`, `haiku`.

## Operator env

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | API key (`sk-ant-*`) from [platform.claude.com/settings/keys](https://platform.claude.com/settings/keys) |
| `ANTHROPIC_API_BASE_URL` | Optional override (default `https://api.anthropic.com/v1`) |

x402 consumers calling `conc-exe.xyz` do **not** need an Anthropic key — the deployment operator holds credentials. End users never see the account owner name; only `modelUsed` in API responses.

## Code

- Adapter: `backend/concierge-api/concierge-anthropic.ts`
- Registry: `backend/concierge-api/concierge-llm-models.ts`
- Router: `backend/concierge-api/concierge-gemini.ts`
