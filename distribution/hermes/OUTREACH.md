# Soft partner outreach — Hermes / Nous

There is **no public partnership form**. Paths that work:

1. User-side install (already shipped on conc-exe.xyz)
2. GitHub PR to `optional-mcps/concierge` (± optional skill)
3. Discord short pitch after the PR exists (or with working install links)

## Discord (Nous Research)

Link: https://discord.gg/NousResearch

Tone: builder contributing a catalog entry — not “please partner / list us.”

### Short message

```
Hey — shipping Concierge Agent (https://conc-exe.xyz), pay-per-call market intel + Security Desk over x402.
Already on Official MCP Registry as xyz.conc-exe/concierge-intel.

Hermes users can wire it today:
  hermes mcp add concierge --url https://conc-exe.xyz/api/mcp
  hermes skills install https://conc-exe.xyz/skills/concierge-hermes/SKILL.md

I have a draft optional-mcps/concierge manifest ready for a PR to hermes-agent — happy to open it if remote HTTP + x402 payment via pay.sh is in scope for the catalog.
Docs: https://conc-exe.xyz/docs/integration/hermes
```

## GitHub PR title / body

**Title:** `feat(mcp): add Concierge remote MCP (x402 market intel)`

```markdown
## What

Adds `optional-mcps/concierge` — remote HTTP MCP at `https://conc-exe.xyz/api/mcp`.

Pay-per-call market intelligence + Security Desk. Settlement via x402 USDC (pay.sh / Hermes x402 skills). No Concierge API key. Auth: none.

## Why

Hermes already supports remote HTTP MCP + x402 skills. Concierge is listed on the Official MCP Registry (`xyz.conc-exe/concierge-intel`) and fits cron/messaging desk briefs.

## Test plan

- [ ] `hermes mcp install concierge` (after merge) / or manual `hermes mcp add concierge --url https://conc-exe.xyz/api/mcp`
- [ ] `hermes mcp test concierge`
- [ ] `curl -s https://conc-exe.xyz/api/mcp`
- [ ] Optional: `pay curl https://conc-exe.xyz/api/concierge-intel-macro -d '{}'`

## Links

- Docs: https://conc-exe.xyz/docs/integration/hermes
- Skill: https://conc-exe.xyz/skills/concierge-hermes/SKILL.md
- Registry: https://registry.modelcontextprotocol.io/?search=xyz.conc-exe%2Fconcierge-intel
```

## Claim policy

Until a Nous maintainer merges the catalog entry or explicitly acks:

- Say **compatible / ready for Hermes**
- Do **not** say **official Hermes partner / in Hermes ecosystem**
