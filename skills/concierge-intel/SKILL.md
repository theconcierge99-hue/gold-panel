---
name: concierge-intel
description: Pay-per-call market intelligence on conc-exe.xyz — macro, wire, DeFi TVL, yields, Meteora DLMM, whales, wallet, desk verdict, alpha desks, A2A orchestration, and Concierge chat. Use when building agents that need x402-settled research JSON without API keys. MCP at /api/mcp.
---

# Concierge Intel (x402)

**Origin:** `https://conc-exe.xyz`  
**Discovery:** `GET /.well-known/api-catalog` · `GET /openapi.json` · `GET /api/mcp` · `GET /api/agent-a2a-mesh`  
**Payment:** HTTP 402 + USDC on Solana or Base (PayAI primary, Dexter fallback). No API keys.

## When to use

- Agent needs **structured JSON** (not HTML) for pipelines — prefer `/api/concierge-intel-*`
- User asks for macro, DeFi TVL, Meteora pools, desk verdict, or alpha scans
- **A2A orchestration** — paid pipeline with handoff line + `delegate[]` routing for downstream agents
- Integrating via MCP, pay.sh, AgentCash, or Poncho — same routes, same settlement

## Quick probes (402 without wallet)

```bash
curl -s -X POST https://conc-exe.xyz/api/concierge-intel-tvl \
  -H "Content-Type: application/json" -d '{}'

curl -s https://conc-exe.xyz/api/agent-a2a-mesh
```

## Paid calls (mainnet USDC via pay.sh)

Production uses **mainnet** — do not use `--sandbox` against `conc-exe.xyz`.

```bash
pay setup
pay topup
pay curl https://conc-exe.xyz/api/concierge-intel-macro -d '{}'
pay curl https://conc-exe.xyz/api/concierge-intel-a2a-pipeline \
  -d '{"message":"Solana desk orchestration","includeInsider":true}'
```

## Pricing tiers

| Tier | USDC | Examples |
|------|------|----------|
| Raw | $0.02 | macro, wire, tvl, whales |
| Signal | $0.10 | verdict, meteora, yields, concierge chat, **intel-momentum** |
| Bundle | $0.25 | desk-brief, **a2a-pipeline** |

## Robinhood Chain momentum desk

When Robinhood Chain meme meta is hot (CASHCAT, Pump.fun cross-chain in SOL), use **`intel-momentum`** with `theme: "robinhood"`. Auto-detects from message keywords (`robinhood`, `cashcat`, `pump.fun robinhood`, etc.).

```bash
pay curl https://conc-exe.xyz/api/concierge-intel-momentum \
  -d '{"theme":"robinhood","message":"RH L2 meme rotation","limit":5,"includeInsider":true}'
```

**TCX checkout:** holders pay ~30% less in TCX; 80% of each TCX payment burns. See `/token` and `GET /api/x402-config`.

## A2A orchestration

| Route | Price | Purpose |
|-------|-------|---------|
| `GET /api/agent-a2a-mesh` | Free | Pipeline templates + registered peer agents |
| `POST /api/concierge-intel-a2a-pipeline` | $0.25 | Desk brief + `a2a.handoff` + `delegate[]` for downstream agents |

After payment, the pipeline response includes:

- `a2a.handoff` — machine-readable line (`A2A|asset=…|bias=…|…`)
- `a2a.delegate[]` — suggested next steps (Concierge routes or peer agent cards)
- `a2a.mesh` — link back to free mesh discovery

Playground: `/agent/playground?ep=intel-a2a-pipeline`

## MCP

- **URL:** `https://conc-exe.xyz/api/mcp`
- **Methods:** `initialize`, `tools/list`, `tools/call`
- Pass `arguments.paymentSignature` after x402 pay, or use `pay curl` first

## Agent identity (optional)

Register `agt_…` and send `X-Agent-Id` header — see `/docs/api/agent-identity`.

## Docs

- Intel APIs (A2A): `/docs/api/intel#a2a`
- Security Desk (passive scan): `/docs/api/security` · skill `/skills/concierge-security/SKILL.md`
- Agent card (A2A): `/docs/integration/agent-card`
- Agent readiness audit: `/docs/api/agent-readiness`
- Builders: `/docs/builders`
- OpenAPI: `/openapi.json`
