# HYRE Gateway integration

Concierge Agent routes optional chat inference through [HYRE LLM Gateway](https://docs.hyreagent.fun/gateway/get-access) — OpenAI-compatible `POST /chat/completions` at `https://gw.hyreagent.fun/api/inference/v1`.

**Web guide:** [/docs/integration/hyre](https://conc-exe.xyz/docs/integration/hyre)

## Status

Live on production — Executive Lounge model picker and `POST /api/concierge` with `agentModel`.

## Models

| `agentModel` | HYRE catalog id |
|--------------|-----------------|
| `hyre-deepseek-v4-flash` | `deepseek-ai/DeepSeek-V4-Flash` |
| `hyre-glm-4.7-flash` | `zai-org/GLM-4.7-Flash` |

Chat only. Image, enhance, and trading-plan paths always use Gemini. Falls back to Gemini on error or when `HYRE_GATEWAY_KEY` is unset.

## Operator env

| Variable | Purpose |
|----------|---------|
| `HYRE_GATEWAY_KEY` | Partner key (`hyre_gw_*`) |
| `HYRE_GATEWAY_API_KEY` | Alias |
| `HYRE_GATEWAY_BASE_URL` | Optional override |

x402 consumers calling `conc-exe.xyz` do not need a HYRE key — the deployment operator holds gateway credentials.

## Code

- Adapter: `backend/concierge-api/concierge-hyre.ts`
- Registry: `backend/concierge-api/concierge-llm-models.ts`
- Router: `backend/concierge-api/concierge-gemini.ts`
