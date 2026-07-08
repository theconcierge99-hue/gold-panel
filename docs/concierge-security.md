# Concierge Security Desk (integrators)

Passive security intelligence for **authorized external targets** — agent-readiness audit and HTTP header review. No exploitation. **Concierge platform hosts are always blocked.**

**Web:** `https://conc-exe.xyz/docs/api/security`  
**OpenAPI:** `/openapi.json` · **x402:** `/.well-known/x402` · **MCP:** `security_readiness`, `security_headers`

## Platform guard (non-negotiable)

These targets are **always rejected** (403 `platform_scope_forbidden`):

- `conc-exe.xyz` and all subdomains
- Vercel production/preview hosts from deployment env (`VERCEL_URL`, `X402_SITE_ORIGIN`, …)
- `ALLOWED_ORIGINS` hosts (our own frontends)
- Private/link-local IPs and hostnames
- IP literals, punycode (`xn--`), non-default ports
- Redirect chains that land on a forbidden host

Extra denylist: `SECURITY_PLATFORM_DENY_HOSTS` (comma-separated hostnames).

## Pricing

| Route | USDC | Tier |
|-------|------|------|
| `POST /api/concierge-security-scope` | Free | Scout — validation only, no fetch |
| `POST /api/concierge-security-scan` | $0.10 | **Unified breakdown** — readiness + headers + recommendations |
| `POST /api/concierge-security-readiness` | $0.02 | Scout — passive API readiness |
| `POST /api/concierge-security-headers` | $0.02 | Scout — passive header review |

**SOON holders (Deluxe+, post-launch):** 3 free scout audits/day via `X-Soon-Holder-Wallet` (separate from raw intel allowance). Env: `SOON_SECURITY_SCOUT_FREE_PER_DAY`.

## Required request body (paid routes)

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
| `allowlist` | **Required** on paid routes (default). Hostname must match an entry |
| `authorized` | Must be `true` — caller attests legal authorization |

Disable mandatory allowlist only in dev: `SECURITY_REQUIRE_ALLOWLIST=false`.

## Flow

1. **Scope check (free):** `POST /api/concierge-security-scope` with `target` + `allowlist`
2. **Pay:** x402 USDC **or** `X-Soon-Holder-Wallet` when SOON launched
3. **Audit:** `POST /api/concierge-security-readiness` or `security-headers`

**macOS / Linux (bash):**

```bash
curl -s -X POST https://conc-exe.xyz/api/concierge-security-scope \
  -H "Content-Type: application/json" \
  -d '{"target":"https://api.example.com","allowlist":["*.example.com"]}'
```

**Windows (PowerShell)** — use `curl.exe` (not the `curl` alias). Single line:

```powershell
curl.exe -s -X POST https://conc-exe.xyz/api/concierge-security-scope -H "Content-Type: application/json" -d "{\"target\":\"https://api.example.com\",\"allowlist\":[\"*.example.com\"]}"
```

Or:

```powershell
Invoke-RestMethod -Method POST -Uri "https://conc-exe.xyz/api/concierge-security-scope" -ContentType "application/json" -Body '{"target":"https://api.example.com","allowlist":["*.example.com"]}'
```

**Paid audit:**

```bash
pay curl https://conc-exe.xyz/api/concierge-security-readiness \
  -d '{"target":"https://api.example.com","allowlist":["*.example.com"],"authorized":true}'
```

## Test platform denylist

Replace `your-preview.vercel.app` with a hostname you want to verify (e.g. a Vercel preview URL for this project):

```powershell
Invoke-RestMethod -Method POST -Uri "https://conc-exe.xyz/api/concierge-security-scope" -ContentType "application/json" -Body '{"target":"https://your-preview.vercel.app","allowlist":["*.vercel.app"]}'
```

- **403** `platform_scope_forbidden` — host is blocked (expected for Concierge infra)
- **200** with `platformGuard.passed: true` — not on denylist; add to `SECURITY_PLATFORM_DENY_HOSTS` if it is yours

**Expected:** `403` for `conc-exe.xyz` · `200` for `api.example.com` (after deploy with integrator Origin fix).

## Rate limits

Stricter than general `/api/*` limits:

- Scope validation: **20/min** per IP
- Paid audits: **8/min** per IP

Responses include `X-Security-Desk: passive-only`.

## Holder tiers (future analyst/principal routes)

| SOON tier | Security access |
|-----------|-----------------|
| Deluxe (50k+) | Scout — readiness + headers |
| Executive (250k+) | Analyst routes (phased) |
| President (1M+) | Principal / orchestration (phased) |

## MCP

`POST /api/mcp` → `tools/call` with `security_readiness` or `security_headers`. Pass `paymentSignature` after x402.

## Related

- [concierge-intel.md](concierge-intel.md) — market intel desks
- [agent-readiness.md](agent-readiness.md) — full readiness framework
- [launch-playbook.md](launch-playbook.md) — SOON holder perks
