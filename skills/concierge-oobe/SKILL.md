---
name: concierge-oobe
description: Call Concierge Intel from OOBE Synapse agents — desk verdict and Meteora DLMM via x402 USDC. Use in Synapse Studio flows before on-chain actions. Manifest at /distribution/oobe/sap-tools-manifest.json.
---

# Concierge Intel × OOBE Protocol

**Origin:** `https://conc-exe.xyz`  
**OOBE:** [oobeprotocol.ai](https://www.oobeprotocol.ai/) · [SAP docs](https://explorer.oobeprotocol.ai/docs)  
**Manifest:** `GET /distribution/oobe/sap-tools-manifest.json`  
**Payment:** x402 v2 USDC — PayAI facilitator (`PAYMENT-SIGNATURE`). No API keys.

## When to use

- OOBE agent needs **market intel before an on-chain action** (swap, LP, stake)
- Synapse Studio flow: intel → branch on `verdict.signal` → execute tool
- Register Concierge tools in SAP discovery (`concierge:intel-verdict`, `concierge:intel-meteora`)

## Tools (phase 1)

| SAP tool id | Endpoint | USDC |
|-------------|----------|------|
| `concierge:intel-verdict` | `POST /api/concierge-intel-verdict` | $0.10 |
| `concierge:intel-meteora` | `POST /api/concierge-intel-meteora` | $0.10 |

## Example flow

1. `POST /api/concierge-intel-verdict` with `{"message":"SOL momentum","includeInsider":true}`
2. Read `verdict.signal` — `snipe` | `watch` | `avoid`
3. If LP context: `POST /api/concierge-intel-meteora` with `{"sortByApy":true,"poolHint":"SOL-USDC"}`
4. Branch to Jupiter / Meteora on-chain action in Synapse Studio

## Paid calls (pay.sh — recommended)

```bash
pay setup && pay topup

pay curl https://conc-exe.xyz/api/concierge-intel-verdict \
  -d '{"message":"Solana DeFi outlook","includeInsider":true}'

pay curl https://conc-exe.xyz/api/concierge-intel-meteora \
  -d '{"sortByApy":true,"limit":8,"poolHint":"SOL"}'
```

## SAP CLI

```bash
synapse-sap tools manifest validate https://conc-exe.xyz/distribution/oobe/sap-tools-manifest.json

synapse-sap x402 call <WALLET> concierge:intel-verdict \
  --args '{"message":"SOL desk","includeInsider":true}' \
  --endpoint https://conc-exe.xyz/api/concierge-intel-verdict
```

## Discovery

- OpenAPI: `/openapi.json`
- x402: `/.well-known/x402`
- Agent card: `/.well-known/agent-card.json`
- Free trust signal: `GET /api/concierge-intel-accuracy`

## Docs

- `/docs/integration/oobe`
- `/docs/api/intel`
- `/docs/agent-identity` — optional `agt_…` + `X-Agent-Id`
