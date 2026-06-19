---
name: concierge-intel
description: Pay-per-call market intelligence on conc-exe.xyz — macro, wire, DeFi TVL, yields, Meteora DLMM, whales, wallet, desk verdict, alpha desks, and Concierge chat. Use when building agents that need x402-settled research JSON without API keys. MCP at /api/mcp.
---

# Concierge Intel (x402)

**Origin:** `https://conc-exe.xyz`  
**Discovery:** `GET /.well-known/api-catalog` · `GET /openapi.json` · `GET /api/mcp`  
**Payment:** HTTP 402 + USDC on Solana or Base (PayAI primary, Dexter fallback). No API keys.

## When to use

- Agent needs **structured JSON** (not HTML) for pipelines — prefer `/api/concierge-intel-*`
- User asks for macro, DeFi TVL, Meteora pools, desk verdict, or alpha scans
- Integrating via MCP, pay.sh, AgentCash, or Poncho — same routes, same settlement

## Quick probes (pay.sh)

```bash
pay --sandbox curl https://conc-exe.xyz/api/concierge-intel-macro -d '{}'
pay --sandbox curl https://conc-exe.xyz/api/concierge-intel-tvl -d '{}'
pay --sandbox curl https://conc-exe.xyz/api/concierge-intel-verdict \
  -d '{"message":"Solana DeFi outlook","includeInsider":true}'
```

## Pricing tiers

| Tier | USDC | Examples |
|------|------|----------|
| Raw | $0.02 | macro, wire, tvl, whales |
| Signal | $0.10 | verdict, meteora, yields, concierge chat |
| Bundle | $0.25 | desk-brief |

## MCP

- **URL:** `https://conc-exe.xyz/api/mcp`
- **Methods:** `initialize`, `tools/list`, `tools/call`
- Pass `arguments.paymentSignature` after x402 pay, or use `pay curl` first

## Agent identity (optional)

Register `agt_…` and send `X-Agent-Id` header — see `/docs/api/agent-identity`.

## Docs

- Agent readiness audit: `/docs/api/agent-readiness`
- Builders: `/docs/builders`
- OpenAPI: `/openapi.json`
