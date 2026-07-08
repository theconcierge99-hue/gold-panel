# Grok Build CLI (x.ai/cli)

[Grok Build](https://x.ai/cli) is xAI’s terminal coding agent — plan mode, subagents, skills, MCP, and headless `-p` mode. Concierge Agent ships a **native skill** so Grok sessions in this repo can call paid intel routes with correct x402 flow.

**Requires:** SuperGrok or X Premium+ subscription.

## Install

```bash
# macOS / Linux
curl -fsSL https://x.ai/cli/install.sh | bash

# Windows (PowerShell)
irm https://x.ai/cli/install.ps1 | iex

# Alternative (npm)
npm install -g @xai-official/grok
```

Docs: [docs.x.ai/build/overview](https://docs.x.ai/build/overview)

## Use with this repo

1. Clone `gold-panel` and `cd` into it.
2. Run `grok` — Grok auto-loads `.grok/skills/concierge-intel/`.
3. Run `grok inspect` to confirm skills, AGENTS.md, and MCP servers.
4. In session: `/concierge-intel` or ask Grok to probe Concierge APIs.

Install **pay.sh** for automatic 402 settlement:

```bash
brew install pay
pay --sandbox curl https://conc-exe.xyz/api/concierge-intel-tvl -d '{}'
```

## Skill: `concierge-intel`

Path: `.grok/skills/concierge-intel/SKILL.md`

Covers **21 x402 routes** (intel, lounge, security desk), sandbox commands, and repo layout (`lib/concierge-api/`, Vercel function limits).

## Skill: `concierge-security`

Path: `.grok/skills/concierge-security/SKILL.md`

Passive Security Desk — `security_scan` ($0.10), scout routes ($0.02), free canonical self-audit on `conc-exe.xyz` with `selfAudit: true`. Lounge UI: `/lounge#security-scan`.

## Headless (CI / scripts)

```bash
export XAI_API_KEY="xai-..."   # non-interactive environments
grok -p "Summarize lib/concierge-api/x402-discovery.ts"
```

Pair with pay CLI in shell scripts for paid intel:

```bash
pay --sandbox curl https://conc-exe.xyz/api/concierge-intel-verdict \
  -d '{"message":"Solana DeFi outlook","includeInsider":true}'
```

## Discovery links

Well-known x402 document includes `grokBuild`, `grokBuildGuide`, and install commands when deployed.

Web guide: [/docs/grok-build](https://conc-exe.xyz/docs/grok-build) · Integrations: [/integrations](https://conc-exe.xyz/integrations) · Poncho: [/docs/integration/poncho](https://conc-exe.xyz/docs/integration/poncho)

## Related

- [pay.sh](paysh.md) — recommended payment CLI for Concierge calls
- [builders.md](builders.md) — OpenAPI + AgentCash
- [concierge-intel.md](concierge-intel.md) — intel route reference
- [concierge-security.md](concierge-security.md) — Security Desk + self-audit
