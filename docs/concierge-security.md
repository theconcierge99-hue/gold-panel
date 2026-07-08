# Concierge Security Desk (integrators)

Passive security intelligence for **authorized targets** — unified website scan, agent-readiness audit, and HTTP header review. No exploitation.

**Web:** `https://conc-exe.xyz/docs/api/security`  
**Lounge UI (end users):** `https://conc-exe.xyz/lounge#security-scan` — URL input, scope check, and scan results. No API paths or MCP names in the Lounge chrome.

**Integrators / agents:** `POST /api/concierge-security-scan` · MCP `security_scan` · skill `/skills/concierge-security/SKILL.md` · OpenAPI `/openapi.json`  
**OpenAPI:** `/openapi.json` · **x402:** `/.well-known/x402` · **MCP:** `security_scan`, `security_readiness`, `security_headers`

## Pricing

| Route | USDC | Purpose |
|-------|------|---------|
| `POST /api/concierge-security-scope` | Free | Validate target + allowlist (no fetch) |
| `POST /api/concierge-security-scan` | $0.10 | **Unified breakdown** — grade, readiness, headers, **Concierge Surface Review**, recommendations |
| `POST /api/concierge-security-scan` + `selfAudit: true` on `conc-exe.xyz` | **Free** | Canonical public self-audit (see below) |
| `POST /api/concierge-security-readiness` | $0.02 | Scout — passive API readiness |
| `POST /api/concierge-security-headers` | $0.02 | Scout — passive header review |

**SOON holders (Deluxe+, post-launch):** 3 free scout audits/day on `security-readiness` / `security-headers` via `X-Soon-Holder-Wallet` (separate from raw intel allowance). Env: `SOON_SECURITY_SCOUT_FREE_PER_DAY`.

## Request body (paid routes)

```json
{
  "target": "https://api.example.com",
  "allowlist": ["*.example.com"],
  "authorized": true
}
```

| Field | Rule |
|-------|------|
| `target` | Required. `https` origin you own or have written permission to test |
| `allowlist` | Required on paid external routes (default). Hostname must match an entry |
| `authorized` | Must be `true` — caller attests legal authorization |
| `selfAudit` | Optional. When `true` with `https://conc-exe.xyz` (or `www`), enables **free** canonical self-audit on `security-scan` only |

Disable mandatory allowlist only in dev: `SECURITY_REQUIRE_ALLOWLIST=false`.

## Flow

### External website (integrators / Lounge)

1. **Scope check (free):** `POST /api/concierge-security-scope` with `target` + `allowlist`
2. **Pay:** x402 USDC ($0.10 for unified scan, $0.02 for scout routes) **or** `X-Soon-Holder-Wallet` on scout routes when SOON launched
3. **Audit:** `POST /api/concierge-security-scan` (recommended) or individual scout routes

### Concierge self-audit (free)

Passive audit of the **canonical public site** only (`conc-exe.xyz` / `www.conc-exe.xyz`):

```bash
curl -s -X POST https://conc-exe.xyz/api/concierge-security-scan \
  -H "Content-Type: application/json" \
  -d '{"target":"https://conc-exe.xyz","allowlist":["*.conc-exe.xyz"],"authorized":true,"selfAudit":true}'
```

**Lounge:** Executive Lounge → **Security Scan** → **Scan Concierge (free)**. Consumer UI only — integrator wiring is documented above and in [docs/api/security](https://conc-exe.xyz/docs/api/security).

**Local CLI (repo):**

```bash
npx tsx scripts/run-self-security-scan.mjs
```

## Examples

**Scope validation:**

```bash
curl -s -X POST https://conc-exe.xyz/api/concierge-security-scope \
  -H "Content-Type: application/json" \
  -d '{"target":"https://api.example.com","allowlist":["*.example.com"]}'
```

**Paid unified scan:**

```bash
pay curl https://conc-exe.xyz/api/concierge-security-scan \
  -d '{"target":"https://api.example.com","allowlist":["*.example.com"],"authorized":true}'
```

**Scout routes ($0.02 each):**

```bash
pay curl https://conc-exe.xyz/api/concierge-security-readiness \
  -d '{"target":"https://api.example.com","allowlist":["*.example.com"],"authorized":true}'
```

**Windows PowerShell:**

```powershell
Invoke-RestMethod -Method POST -Uri "https://conc-exe.xyz/api/concierge-security-scope" -ContentType "application/json" -Body '{"target":"https://api.example.com","allowlist":["*.example.com"]}'
```

## Platform guard

These targets are **rejected** (403 `platform_scope_forbidden`) unless noted:

| Target | Policy |
|--------|--------|
| `conc-exe.xyz` / `www.conc-exe.xyz` | Allowed only with `selfAudit: true` on `security-scan` |
| Vercel preview / deployment hosts | Always blocked |
| Private networks, IP literals, punycode | Always blocked |

Extra denylist: `SECURITY_PLATFORM_DENY_HOSTS` (comma-separated hostnames).

## Unified scan (`security-scan`)

Returns **grade**, **readiness**, **headers**, and **Concierge Surface Review** — passive exposure breakdown (transport, cookies, CORS, disclosure headers, common sensitive paths). No exploit payloads; suitable for authorized recon before manual bug bounty validation.

| Field | Meaning |
|-------|---------|
| `summary.surfaceGrade` | `minimal` · `clear` · `moderate` · `watch` · `elevated` |
| `summary.surfaceFindings` | Total passive findings |
| `breakdown.surface.findings[]` | `severity` (info/low/medium/high), `title`, `detail`, `remediation` |

Surface probes (parallel, Hobby-safe): `/.env`, `/.git/HEAD`, `security.txt`, `robots.txt`, swagger/docs paths, plus homepage header analysis.

## Unified scan response (`security-scan`)

```json
{
  "ok": true,
  "kind": "security-scan",
  "summary": {
    "overallGrade": "B",
    "readinessScore": 2.1,
    "headersGrade": "moderate",
    "headersPresent": 4,
    "headersTotal": 6,
    "surfaceGrade": "watch",
    "surfaceFindings": 3,
    "surfaceBySeverity": { "high": 0, "medium": 1, "low": 1, "info": 1 },
    "discoveryFiles": 2,
    "mcpReachable": true
  },
  "breakdown": { "readiness": {}, "headers": {}, "surface": { "findings": [], "summary": {} } },
  "recommendations": ["Add strict-transport-security — …"]
}
```

## Rate limits

Stricter than general `/api/*` limits:

- Scope validation: **20/min** per IP
- Paid audits: **8/min** per IP

## MCP

`POST /api/mcp` → `tools/call` with `security_scan`, `security_readiness`, or `security_headers`. Pass `paymentSignature` after x402 (not required for free self-audit body above when called via HTTP directly).

## Related

- [concierge-intel.md](concierge-intel.md) — market intel desks
- [agent-readiness.md](agent-readiness.md) — full readiness framework
- [launch-playbook.md](launch-playbook.md) — SOON holder perks
