# OOBE Protocol — SAP tool manifests

Distribution bundle for [OOBE Protocol](https://www.oobeprotocol.ai/) / [Synapse SAP](https://explorer.oobeprotocol.ai/docs). **0 Vercel functions**.

| File | Purpose |
|------|---------|
| `sap-tools-manifest.json` | `concierge:intel-verdict` + `concierge:intel-meteora` |
| Public URL | `https://conc-exe.xyz/distribution/oobe/sap-tools-manifest.json` |
| Verify | `npm run oobe:verify` |

## Implemented phases

| Phase | Status |
|-------|--------|
| 1 — Docs + SAP manifest + skill | Done |
| 2 — `agt_` ↔ SAP link (`POST`/`PATCH /api/agent-identity`) | Done |
| 3 — OOBE settlement adapter (`X-OOBE-SETTLEMENT-TX`) | Done |
| 4 — On-chain SAP publish | Manual (merchant wallet) |

## Verify integration

```bash
npm run oobe:verify
# After local dev:
npm run oobe:verify:local
```

## Payment paths

### A — PayAI x402 (recommended)

```bash
pay curl https://conc-exe.xyz/api/concierge-intel-verdict \
  -d '{"message":"Solana DeFi outlook","includeInsider":true}'
```

Header: `PAYMENT-SIGNATURE` (x402 v2).

### B — OOBE SAP settlement tx

After SAP escrow settles USDC to merchant, retry with:

```http
X-OOBE-SETTLEMENT-TX: <confirmed-solana-tx-signature>
```

Requires `SOLANA_RPC_URL` on Vercel. Toggle: `OOBE_SAP_X402_ENABLED=1` (default).

## Link agent identity

```http
POST /api/agent-identity
{ "name": "…", "solAddress": "…", "sapWallet": "…", "sapAgentPda": "…" }

PATCH /api/agent-identity
{ "id": "agt_…", "sapAgentPda": "…" }
```

## Publish to SAP (one-off, off Vercel)

```bash
synapse-sap tools manifest validate distribution/oobe/sap-tools-manifest.json
synapse-sap agent register --manifest distribution/oobe/sap-tools-manifest.json
synapse-sap tools publish distribution/oobe/sap-tools-manifest.json
```

## Docs

- `https://conc-exe.xyz/docs/integration/oobe`
- `https://conc-exe.xyz/skills/concierge-oobe/SKILL.md`
