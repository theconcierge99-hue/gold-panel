---
name: concierge-edge
description: Run Gemma 4 on-device with Concierge x402 intel tools — local inference via LiteRT-LM, live market data via pay.sh. Preset at /distribution/gemma/concierge-edge-preset.py.
---

# Concierge Edge × Gemma 4

**Origin:** `https://conc-exe.xyz`  
**Gemma:** [LiteRT-LM](https://ai.google.dev/edge/litert-lm) · [Gemma 4 model card](https://ai.google.dev/gemma/docs/core/model_card_4)  
**Preset:** `GET /distribution/gemma/concierge-edge-preset.py`  
**Manifest:** `GET /distribution/gemma/litert-tools-manifest.json`  
**Payment:** x402 USDC via `pay curl` — no Concierge API keys.

## When to use

- Build a **private on-device trading agent** — user questions never leave the device for LLM inference
- **Orchestrate Concierge intel** from Gemma 4 tool calling (macro, verdict, Meteora, desk brief)
- Prototype **edge-first agents** before deploying to Android AICore / WebGPU
- Developer integrates Concierge as **intel + payment layer**, not cloud compute

## Architecture

```
User → Gemma 4 (local) → tool call → pay curl → Concierge API → JSON intel → Gemma synthesizes answer
```

- **Compute:** user's device (Gemma 4 E2B/E4B)
- **Intel:** Concierge x402 routes (live market data)
- **Settlement:** pay.sh wallet per API call

## Quick start

### 1. Install LiteRT-LM + pay.sh

```bash
uv tool install litert-lm
pay setup && pay topup
```

### 2. Download preset

```bash
curl -fsSLO https://conc-exe.xyz/distribution/gemma/concierge-edge-preset.py
```

### 3. Run Gemma 4 with Concierge tools

```bash
litert-lm run \
  --from-huggingface-repo=litert-community/gemma-4-E2B-it-litert-lm \
  gemma-4-E2B-it.litertlm \
  --preset=concierge-edge-preset.py
```

Interactive example:

```
> Bagaimana outlook Solana DeFi minggu ini?
[tool_call] {"name": "intel_verdict", "arguments": {"message": "Solana DeFi outlook", "include_insider": true}}
[tool_response] {"verdict": {"signal": "watch", ...}}
...
```

### Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `CONCIERGE_ORIGIN` | `https://conc-exe.xyz` | API base (use `http://localhost:8080` for local dev) |
| `CONCIERGE_PAY_CMD` | `pay` | Pay CLI — set to `pay --sandbox` for sandbox testing |
| `CONCIERGE_DIRECT` | off | Set `1` for direct HTTP (skips pay wallet on local dev) |

## Preset tools (phase 1)

| Function | Endpoint | USDC |
|----------|----------|------|
| `intel_macro` | `POST /api/concierge-intel-macro` | $0.02 |
| `intel_wire` | `POST /api/concierge-intel-wire` | $0.02 |
| `intel_tvl` | `POST /api/concierge-intel-tvl` | $0.02 |
| `intel_verdict` | `POST /api/concierge-intel-verdict` | $0.10 |
| `intel_meteora` | `POST /api/concierge-intel-meteora` | $0.10 |
| `intel_desk_brief` | `POST /api/concierge-intel-desk-brief` | $0.25 |

## Local dev against Concierge

```bash
npm run dev
export CONCIERGE_ORIGIN=http://localhost:8080
export CONCIERGE_DIRECT=1
litert-lm run ... --preset=concierge-edge-preset.py
```

## Discovery

- OpenAPI: `/openapi.json`
- x402: `/.well-known/x402`
- Agent Playground: `/agent/playground`
- Full intel skill: `/skills/concierge-intel/SKILL.md`

## Docs

- `/docs/integration/gemma`
- `/docs/api/intel`
- `/docs/payment/paysh`
