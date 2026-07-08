---
name: concierge-security
description: Passive security desk on conc-exe.xyz — scope validation, unified website scan breakdown, agent-readiness audit, and HTTP header review. x402 scout $0.02, full scan $0.10, free conc-exe.xyz self-audit with selfAudit. MCP tools security_scan, security_readiness, security_headers.
---

# Concierge Security Desk

**Origin:** `https://conc-exe.xyz`  
**Docs:** `https://conc-exe.xyz/docs/api/security`  
**Lounge:** `https://conc-exe.xyz/lounge#security-scan`  
**Payment:** HTTP 402 + USDC, SOON Deluxe+ scout allowance, or free self-audit on `conc-exe.xyz`

## When to use

- Agent needs **passive API security posture** on a target the user **owns or has permission** to test
- End user wants a **website breakdown** (grade, headers, readiness, recommendations)
- Pre-flight **scope validation** before a paid audit
- **Concierge self-audit** on the canonical public site

## Never probe (without authorization)

- Vercel preview / internal deployment hosts
- Targets without `allowlist` + `authorized: true` on paid external routes
- Private or third-party hosts via `selfAudit` (only `conc-exe.xyz` / `www`)

## Quick scope check (free)

```bash
curl -s -X POST https://conc-exe.xyz/api/concierge-security-scope \
  -H "Content-Type: application/json" \
  -d '{"target":"https://api.example.com","allowlist":["*.example.com"]}'
```

## Concierge self-audit (free)

```bash
curl -s -X POST https://conc-exe.xyz/api/concierge-security-scan \
  -H "Content-Type: application/json" \
  -d '{"target":"https://conc-exe.xyz","allowlist":["*.conc-exe.xyz"],"authorized":true,"selfAudit":true}'
```

Lounge: **Security Scan → Scan Concierge (free)**.

## Paid scans

```bash
pay curl https://conc-exe.xyz/api/concierge-security-scan \
  -d '{"target":"https://api.example.com","allowlist":["*.example.com"],"authorized":true}'

pay curl https://conc-exe.xyz/api/concierge-security-readiness \
  -d '{"target":"https://api.example.com","allowlist":["*.example.com"],"authorized":true}'

pay curl https://conc-exe.xyz/api/concierge-security-headers \
  -d '{"target":"https://app.example.com","allowlist":["*.example.com"],"authorized":true}'
```

## SOON holder (post-launch)

Scout routes only — 3 free/day on `security-readiness` / `security-headers` with `X-Soon-Holder-Wallet` (Deluxe 50k+ SOON).

## Routes

| Tool / path | Price | Output |
|-------------|-------|--------|
| `POST /api/concierge-security-scope` | Free | Platform guard + allowlist match |
| `POST /api/concierge-security-scan` | $0.10 | **Unified breakdown** — grade, readiness, headers, recommendations |
| `POST /api/concierge-security-scan` + `selfAudit: true` | Free | `conc-exe.xyz` self-audit only |
| `POST /api/concierge-security-readiness` | $0.02 | OpenAPI, discovery, headers, MCP scores |
| `POST /api/concierge-security-headers` | $0.02 | Security header checklist + grade |

## MCP

`POST /api/mcp` — tools `security_scan`, `security_readiness`, `security_headers` (underscore names).
