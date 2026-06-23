---
name: concierge-security
description: Passive security desk on conc-exe.xyz — scope validation, agent-readiness audit, and HTTP header review for authorized external APIs. x402 $0.02 scout tier. Platform hosts (conc-exe.xyz) are always blocked. MCP tools security_readiness and security_headers.
---

# Concierge Security Desk

**Origin:** `https://conc-exe.xyz`  
**Docs:** `https://conc-exe.xyz/docs/api/security`  
**Payment:** HTTP 402 + USDC, or SOON Deluxe+ free scout allowance (`X-Soon-Holder-Wallet`)

## When to use

- Agent needs **passive API security posture** on a target the user **owns or has permission** to test
- Pre-flight **scope validation** before a paid audit
- Bug-bounty / compliance workflows that must **not** scan Concierge infrastructure

## Never probe

- `conc-exe.xyz` / any Concierge Vercel host — **hard forbidden** (403)
- Targets without `allowlist` + `authorized: true` on paid routes

## Quick scope check (free)

**bash:**

```bash
curl -s -X POST https://conc-exe.xyz/api/concierge-security-scope \
  -H "Content-Type: application/json" \
  -d '{"target":"https://api.example.com","allowlist":["*.example.com"]}'
```

**Windows PowerShell:**

```powershell
Invoke-RestMethod -Method POST -Uri "https://conc-exe.xyz/api/concierge-security-scope" -ContentType "application/json" -Body '{"target":"https://api.example.com","allowlist":["*.example.com"]}'
```

## Paid scout audit

```bash
pay curl https://conc-exe.xyz/api/concierge-security-readiness \
  -d '{"target":"https://api.example.com","allowlist":["*.example.com"],"authorized":true}'

pay curl https://conc-exe.xyz/api/concierge-security-headers \
  -d '{"target":"https://app.example.com","allowlist":["*.example.com"],"authorized":true}'
```

## SOON holder (post-launch)

```bash
curl -s -X POST https://conc-exe.xyz/api/concierge-security-readiness \
  -H "Content-Type: application/json" \
  -H "X-Soon-Holder-Wallet: <solana-wallet>" \
  -d '{"target":"https://api.example.com","allowlist":["*.example.com"],"authorized":true}'
```

3 free scout calls/day (Deluxe 50k+ SOON) — separate from raw intel free tier.

## Routes

| Tool / path | Price | Output |
|-------------|-------|--------|
| `POST /api/concierge-security-scope` | Free | Platform guard + allowlist match |
| `POST /api/concierge-security-readiness` | $0.02 | OpenAPI, discovery, headers, MCP surface scores |
| `POST /api/concierge-security-headers` | $0.02 | Security header checklist + grade |

## MCP

`POST /api/mcp` — tools `security_readiness`, `security_headers` (underscore names).
