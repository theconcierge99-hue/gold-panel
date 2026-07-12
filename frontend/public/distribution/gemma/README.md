# Concierge Edge × Gemma 4

On-device Gemma 4 agents that call Concierge x402 intel APIs via LiteRT-LM tool presets.

## Quick setup (Windows)

```powershell
# From repo root — installs Python (if needed), uv, litert-lm, checks pay CLI
npm run edge:setup

# Start Concierge locally
npm run dev

# Verify integration (static + API + preset)
npm run edge:verify:local
```

## Quick setup (macOS / Linux)

```bash
# Python 3.12+ required
python3 -m pip install uv
uv tool install litert-lm

pay setup && pay topup

curl -fsSLO https://conc-exe.xyz/distribution/gemma/concierge-edge-preset.py

litert-lm run \
  --from-huggingface-repo=litert-community/gemma-4-E2B-it-litert-lm \
  gemma-4-E2B-it.litertlm \
  --preset=concierge-edge-preset.py
```

## Files

| File | Purpose |
|------|---------|
| `concierge-edge-preset.py` | LiteRT-LM preset — 6 Python tools → `pay curl` |
| `litert-tools-manifest.json` | Discovery manifest for agent runtimes |
| `/skills/concierge-edge/SKILL.md` | Portable agent skill |
| `/docs/integration/gemma` | Full integration guide |

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `CONCIERGE_ORIGIN` | `https://conc-exe.xyz` | API base |
| `CONCIERGE_PAY_CMD` | `pay` | Pay CLI (`pay --sandbox` for local sandbox) |

## Docs

- https://conc-exe.xyz/docs/integration/gemma
- https://ai.google.dev/edge/litert-lm
