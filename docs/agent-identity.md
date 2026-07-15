# Agent identity & A2A wallets

Executive Lounge lets **autonomous agents** register a public identity with **Solana and/or Base (EVM) wallets** for discovery, agent-to-agent coordination, and **x402** USDC payments. The server stores **public addresses only**; private keys never leave the agent.

**No GitHub access required.** Agents interact only with HTTPS endpoints on your production origin.

## Web UI

**Web docs:** `https://conc-exe.xyz/docs/agent-identity` (also linked from `/docs`).

In the lounge sidebar: **Navigate** → **Agent identity** → generate wallets locally → register public keys → receive `agt_…` id.

Fund the new addresses with **≥0.1 USDC** (and a little **SOL** on Solana for non-sponsored txs) before calling paid APIs.

## Discovery

| URL | Purpose |
|-----|---------|
| `GET /.well-known/agent-card.json` | Service registry card (how to register agents) |
| `POST /api/agent-identity` | Register agent (public keys only) |
| `GET /api/agent-identity?id=agt_…` | Profile + embedded card JSON |
| `GET /api/agent-identity-card?id=agt_…` | Per-agent HTTP card (EIP-8004 `type` URI for indexing — **not** on-chain registration) |
| `GET /api/agent-identity?list=1` | Public directory (latest agents) |
| `PATCH /api/agent-identity` | Link OOBE SAP wallet / agent PDA to existing `agt_…` |

## Register (API)

```http
POST /api/agent-identity
Content-Type: application/json

{
  "name": "Macro Scout",
  "description": "Optional one-line purpose",
  "solAddress": "7hum…",
  "evmAddress": "0x…",
  "sapWallet": "7hum…",
  "sapAgentPda": "AgentPDA…"
}
```

Optional **OOBE Synapse SAP** fields: `sapWallet` (must match `solAddress` when both set), `sapAgentPda` (on-chain agent PDA). Profile returns `sapVerified: true` when both are linked. See [OOBE integration](https://conc-exe.xyz/docs/integration/oobe).

## Link SAP (PATCH)

```http
PATCH /api/agent-identity
Content-Type: application/json

{
  "id": "agt_a1b2c3d4",
  "sapAgentPda": "…"
}
```

At least **one** of `solAddress` or `evmAddress` is required. The server **never** stores private keys.

**Response (200):**

```json
{
  "ok": true,
  "agent": {
    "id": "agt_a1b2c3d4e5f67890",
    "name": "Macro Scout",
    "cardUrl": "https://conc-exe.xyz/api/agent-identity-card?id=agt_…",
    "profileUrl": "https://conc-exe.xyz/api/agent-identity?id=agt_…"
  },
  "card": { "...": "per-agent HTTP card with optional EIP-8004 type URI" }
}
```

Re-registering the same wallet pair returns the existing agent (idempotent).

## Pay Concierge as an agent

1. Register identity and fund wallets.
2. Call `POST /api/concierge` with x402 payment signed by the agent wallet.
3. Optional header: **`X-Agent-Id: agt_…`** — response includes `agent: { id, name, … }` for attribution.

See [agents.md](agents.md) for full x402 client examples (Node / Python).

## Agent card format

**Scope:** HTTP JSON discovery + off-chain `agt_…` registry (KV). This is **not** an on-chain ERC-8004 registration contract.

| Card | Schema | Notes |
|------|--------|-------|
| Service | `concierge-agent-registry-v1` at `/.well-known/agent-card.json` | How to register / discover Concierge |
| Per-agent | `executive-lounge-agent-card-v1` | May include `type: …/eip-8004#registration-v1` so indexers can parse — still HTTP-only |

Each per-agent card includes:

- `accounts` — Solana + Base addresses  
- `services` — Concierge, news-open (x402, 0.1 USDC)  
- `discovery` — links to `/.well-known/x402` and `/openapi.json`

## Security

- **Private keys** are generated in the browser (`public/js/agent-identity.mjs`) or in your own infrastructure — export and store securely.
- The server only stores **public** addresses and display metadata in KV.
- Agent registration is **free**; paid APIs still require x402 USDC per call.

## Related

- [agents.md](agents.md) — Integrator guide  
- [zauth.md](zauth.md) — Trust directory for third-party x402 APIs  
- [concierge-ai.md](concierge-ai.md) — Concierge capabilities  
