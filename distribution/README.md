# Distribution bundles

External registry PR materials — **0 Vercel functions**.

| Channel | Path | Command |
|---------|------|---------|
| MCP Registry | `mcp-registry/server.json` | `npm run mcp-registry:validate` · publish: `mcp-registry/PUBLISH.md` |
| Hermes Agent | `hermes/` | Pack for `NousResearch/hermes-agent` `optional-mcps/concierge` · `OUTREACH.md` |
| thebuyside-x402-agent | `thebuyside/seed-entries.json` | `npm run distribution:thebuyside-pr` |
| pay.sh / pay-skills | `../pay-skills/conc-exe/` | `npm run distribution:paysh-pr` |
| OOBE / SAP | `oobe/sap-tools-manifest.json` | Manifest at `/distribution/oobe/sap-tools-manifest.json` · guide `/docs/integration/oobe` |
| Agent Skill | `../skills/concierge-intel/SKILL.md` | Public URL: `https://conc-exe.xyz/skills/concierge-intel/SKILL.md` |
| Hermes skill | `../skills/concierge-hermes/SKILL.md` | Public URL: `https://conc-exe.xyz/skills/concierge-hermes/SKILL.md` |

## npm scripts

| Script | What it does |
|--------|----------------|
| `npm run mcp-registry:validate` | Validate `mcp-registry/server.json` schema and required fields locally |
| `npm run distribution:thebuyside-pr` | Clone thebuyside repo, merge seed entries, print PR steps |
| `npm run distribution:paysh-pr` | Copy `pay-skills/conc-exe/` bundle into a pay-skills fork and print PR steps |
| `npm run agent-readiness:audit` | Live production agent-readiness audit (headers, OpenAPI, discovery) |
| `npm run agent-readiness:local` | Local audit — static OpenAPI + discovery files only |
| `npm run discovery:validate` | Validate x402 / MPP discovery documents |

CI: `.github/workflows/discovery-quality.yml`

## Checklist

| Step | Status | Action |
|------|--------|--------|
| In-repo bundles | Done | MCP manifest, Hermes pack, thebuyside seed, pay-skills bundle, skills, CI |
| pay-skills PRs | Open | [#119 concierge-agent](https://github.com/solana-foundation/pay-skills/pull/119) · [#146 token-pay](https://github.com/solana-foundation/pay-skills/pull/146) — await maintainer merge · refresh Discovery for ERC-8004 in `PAY.md` |
| MCP Registry publish | **Published** | [xyz.conc-exe/concierge-intel](https://registry.modelcontextprotocol.io/?search=xyz.conc-exe%2Fconcierge-intel) · republish: [PUBLISH.md](../mcp-registry/PUBLISH.md) |
| thebuyside PR | Open | [PR #2](https://github.com/jaysperspective/thebuyside-x402-agent/pull/2) — await maintainer merge (seed stays paid-route only) |
| Hermes optional-mcps | **PR open** | [NousResearch/hermes-agent#64349](https://github.com/NousResearch/hermes-agent/pull/64349) · pack `hermes/optional-mcps/concierge/` · templates `hermes/OUTREACH.md` |
| Agent identity / ERC-8004 | **Live** | Lounge `#agent-identity` · docs `/docs/api/agent-identity` · linked from Hermes + pay-skills Discovery |
