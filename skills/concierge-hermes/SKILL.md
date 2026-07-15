---
name: concierge-hermes
description: "Wire Hermes Agent to Concierge pay-per-call market intel + Security Desk via remote MCP and pay.sh/x402. Use for macro, wire, DeFi desks, cron briefs, and authorized security scans without Concierge API keys."
version: 1.0.0
author: Concierge Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [Research, Finance, Market Intelligence, x402, MCP, Security]
    related_skills: [native-mcp]
    blueprint:
      schedule: "0 8 * * 1-5"
      deliver: origin
      prompt: "Call Concierge intel_macro and intel_wire (limit 8). Summarize SPX, VIX, Fear & Greed, and top headlines in ≤8 bullets. Fail soft if payment fails."
---

# Concierge × Hermes Agent

**Origin:** `https://conc-exe.xyz`  
**MCP:** `https://conc-exe.xyz/api/mcp`  
**Docs:** `https://conc-exe.xyz/docs/integration/hermes`  
**Payment:** x402 USDC (Solana / Base / Arbitrum) via [pay.sh](https://conc-exe.xyz/docs/payment/paysh) or Hermes x402 skill — **no Concierge API key**.

Hermes is the always-on agent (CLI / Telegram / Discord / cron). Concierge is the paid desk JSON layer.

## When to Use

- User wants morning macro / wire briefs on a messaging surface
- Agent needs structured market intel (TVL, Meteora, verdict) without API keys
- Authorized passive security scan of an external host the user owns
- Cron or subagent pipelines that should settle per call

## Quick setup

```bash
hermes mcp add concierge --url https://conc-exe.xyz/api/mcp
hermes skills install https://conc-exe.xyz/skills/concierge-hermes/SKILL.md
pay setup && pay topup
hermes mcp test concierge
```

`~/.hermes/config.yaml` (optional tool filter):

```yaml
mcp_servers:
  concierge:
    url: "https://conc-exe.xyz/api/mcp"
    tools:
      include:
        - concierge_catalog
        - intel_macro
        - intel_wire
        - intel_tvl
        - intel_verdict
        - intel_meteora
        - intel_desk_brief
        - security_headers
        - security_scan
```

## Procedure

1. Prefer **MCP tools** when Concierge MCP is connected (`concierge_catalog`, `intel_*`, `security_*`).
2. Unpaid MCP calls return a **live** `PAYMENT-REQUIRED` challenge — settle then retry with `paymentSignature`, or pass `creditsWallet` / `soonHolderWallet`.
3. For HTTP one-shots, use **pay.sh**:

```bash
pay curl https://conc-exe.xyz/api/concierge-intel-macro -d '{}'
pay curl https://conc-exe.xyz/api/concierge-intel-wire -d '{"limit":8}'
```

4. Production Concierge is **mainnet** — do not use `pay --sandbox` against `conc-exe.xyz`.
5. Security tools require `authorized: true` + hostname **allowlist** matching the target. Never scan hosts the user does not own/operate.
6. Free scope check: `POST /api/concierge-security-scope` (no payment).
7. Free MCP: `concierge_catalog`, `concierge_prepare_payment`.

## Optional agent identity (ERC-8004)

Register a public `agt_…` (Solana/Base wallets, public keys only), then optionally mint an ERC-8004 Identity NFT on Base:

1. Lounge UI: https://conc-exe.xyz/lounge#agent-identity  
2. Docs: https://conc-exe.xyz/docs/api/agent-identity  
3. Registration file (`agentURI`): `GET /api/agent-identity-registration?id=agt_…`  
4. Prepare / link: `GET|POST /api/agent-identity-erc8004`  

Fund the **agent** EVM address with ETH on Base for gas (not the Hermes host wallet). Pass `X-Agent-Id: agt_…` on paid Concierge calls for attribution.

## Pricing (USDC)

| Tier | Amount | Examples |
|------|--------|----------|
| Raw / scout | $0.02 | macro, wire, tvl, whales, security_headers |
| Signal | $0.10 | verdict, meteora, yields, security_scan |
| Bundle | $0.25 | desk_brief, a2a_pipeline |

See Sub-Topics → `references/calls.md` for bodies and MCP argument shape.

## Cron example

Natural-language schedule Hermes can adopt:

> Every weekday 08:00 — Concierge `intel_macro` + `intel_wire` (limit 8). Summarize in ≤8 bullets. Post to origin. If 402/payment fails, say so and stop (do not retry-spam).

## Pitfalls

- **Sandbox vs mainnet** — sandbox pay against production Concierge fails settlement.
- **MCP payment** — unpaid `tools/call` returns `_meta.paymentRequiredHeader`; retry with `paymentSignature`, or use `pay curl` / TCX credits.
- **Security scope** — platform hosts (`conc-exe.xyz`, project Vercel) are always forbidden for probe targets.
- **Do not invent partnership** — Concierge is compatible with Hermes; official catalog listing requires a merged Nous `optional-mcps/` PR.

## Verification

```bash
hermes mcp list
hermes mcp test concierge
curl -s https://conc-exe.xyz/api/mcp | head
pay curl https://conc-exe.xyz/api/concierge-intel-macro -d '{}'
```

## Further reading

- Integration guide: https://conc-exe.xyz/docs/integration/hermes
- MCP Registry: https://conc-exe.xyz/docs/integration/mcp-registry
- Hermes MCP docs: https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp
- Call cookbook: `references/calls.md`
- Catalog PR pack: https://conc-exe.xyz/distribution/hermes/
- Agent identity / ERC-8004: https://conc-exe.xyz/docs/api/agent-identity
- Agent SDK: https://conc-exe.xyz/docs/sdk/agent
