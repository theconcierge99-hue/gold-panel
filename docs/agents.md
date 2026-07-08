# Agents & integrators — Concierge API

Integrate **Executive Lounge Concierge** from any bot, backend, or workflow using only **HTTPS + x402 USDC**. No repository access is required.

**Web guide:** `https://conc-exe.xyz/docs/builders` (preferred) · legacy `/docs/agents`  
**Base URL:** `https://conc-exe.xyz`  
**Endpoint catalog:** `https://conc-exe.xyz/agent/endpoints` · **OpenAPI:** `/openapi.json`

## Agent identity (A2A)

Each agent can register **`agt_…`** with Solana/Base wallets for discovery and x402. **Web:** `https://conc-exe.xyz/docs/agent-identity` · [agent-identity.md](agent-identity.md) · Lounge → **Navigate** → **Agent identity** · `POST /api/agent-identity` · `GET /.well-known/agent-card.json`.

## Concierge Intel APIs

Structured JSON per desk function (no full chat) — raw **$0.02** / signal **$0.10** / bundle **$0.25**:

| Endpoint | Data |
|----------|------|
| `POST /api/concierge-intel-tvl` | TVL chains + protocols |
| `POST /api/concierge-intel-yields` | Yield pools (filters: `chain`, `project`) |
| `POST /api/concierge-intel-whales` | Top-trader positioning (`symbols`) |
| `POST /api/concierge-intel-wallet` | Wallet snapshot (`solAddress` / `evmAddress`) |
| `POST /api/concierge-intel-verdict` | Verdict + insider (`message`, `includeInsider`) |
| `POST /api/concierge-intel-airdrop` | Airdrop candidates (`message`, `chain`, `limit`, `includeInsider`) |
| `POST /api/concierge-intel-listing` | Listing candidates (same body as airdrop) |
| `POST /api/concierge-intel-momentum` | Momentum / large-move candidates (same body) |

**Web:** `https://conc-exe.xyz/docs/api/intel` · [concierge-intel.md](concierge-intel.md)

## Security Desk

Passive authorized website audits — **no exploitation**. Full guide: [concierge-security.md](concierge-security.md) · web `/docs/api/security`.

| Endpoint | Price | Purpose |
|----------|-------|---------|
| `POST /api/concierge-security-scope` | Free | Scope + allowlist (no fetch) |
| `POST /api/concierge-security-scan` | $0.10 | Unified breakdown (grade, headers, Surface Review) |
| `POST /api/concierge-security-scan` + `selfAudit: true` | Free | `conc-exe.xyz` self-audit only |
| `POST /api/concierge-security-readiness` | $0.02 | Scout — readiness |
| `POST /api/concierge-security-headers` | $0.02 | Scout — headers |

MCP: `security_scan`, `security_readiness`, `security_headers`. Skill: `/skills/concierge-security/SKILL.md`.

## Quick reference

| Item | Value |
|------|--------|
| Endpoints | Chat `/api/concierge` · Intel `/api/concierge-intel-*` · Security `/api/concierge-security-*` (**21 paid** + free scope/self-audit) |
| Price | $0.02–$0.25 per paid call (security scout $0.02 · scan $0.10) |
| Auth | x402 payment (`PAYMENT-SIGNATURE` header) |
| Discovery | `GET /openapi.json`, `GET /.well-known/x402`, `GET /api/x402-config` |

## Flow

1. `POST /api/concierge` without payment → **402** + `PAYMENT-REQUIRED` (base64 JSON).
2. Agent wallet signs USDC on Base or Solana per `accepts`.
3. Retry `POST` with `PAYMENT-SIGNATURE`.
4. **200** → `{ "reply": "<p>…</p>", "topics": [], "marketLive": [], "dataAsOf": "…" }`.

## Request (chat)

```json
{
  "mode": "chat",
  "message": "Trading plan BTC 48h — geopolitical, fundamental, technical",
  "history": [],
  "market": []
}
```

Modes: `chat` | `enhance` (with `signal` object) | `image`.

## Node.js (EVM on Base)

```bash
npm install @x402/core @x402/fetch @x402/evm viem
```

Use `wrapFetchWithPayment` from `@x402/fetch` with `registerExactEvmScheme` and a funded `AGENT_EVM_PRIVATE_KEY` on Base. Full snippet: [conc-exe.xyz/docs/agents#node](https://conc-exe.xyz/docs/agents#node).

## Python

Probe with httpx; implement payment via PayAI/x402 client or manual `PAYMENT-SIGNATURE`. Example probe: [docs/agents#python](https://conc-exe.xyz/docs/agents#python).

## CORS

Server-side agents: no CORS. Browser apps on other domains: host must list origin in `ALLOWED_ORIGINS`.

## Trust

- [pay.sh](https://pay.sh/) — agent CLI catalog (`pay curl`, Claude/Codex MCP) · [paysh.md](paysh.md)  
- [x402scan](https://www.x402scan.com/) — marketplace listing  
- `GET /api/zauth-directory` — verified endpoints  
- [zauth.md](zauth.md) — Provider Hub telemetry  

## Related

- [concierge-ai.md](concierge-ai.md) — modes, prompts, language  
- [concierge-security.md](concierge-security.md) — Security Desk  
- [concierge-intel.md](concierge-intel.md) — Intel desks  
- [x402-payments.md](x402-payments.md) — facilitator, networks  
- [api-reference.md](api-reference.md) — all routes  
- [builders](https://conc-exe.xyz/docs/builders) — public integrator hub  
