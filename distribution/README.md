# Distribution bundles (phase 2)

External registry PR materials — **0 Vercel functions**.

| Channel | Path | Command |
|---------|------|---------|
| MCP Registry | `mcp-registry/server.json` | `npm run mcp-registry:validate` · publish: `mcp-registry/PUBLISH.md` |
| thebuyside-x402-agent | `thebuyside/seed-entries.json` | `npm run distribution:thebuyside-pr` |
| pay.sh / pay-skills | `../pay-skills/conc-exe/` | `npm run distribution:paysh-pr` |
| Agent Skill | `../skills/concierge-intel/SKILL.md` | GitHub raw URL for agents |

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

## Phase 2 checklist

| Step | Status | Action |
|------|--------|--------|
| In-repo bundles | Done | MCP manifest, thebuyside seed, pay-skills bundle, SKILL.md, CI |
| pay-skills PRs | Open | [#119 concierge-agent](https://github.com/solana-foundation/pay-skills/pull/119) · [#146 token-pay](https://github.com/solana-foundation/pay-skills/pull/146) — await maintainer merge |
| thebuyside PR | Ready | `npm run distribution:thebuyside-pr` → verify-seed → push fork → open PR |
| MCP Registry publish | Blocked on deploy | `npm run mcp-registry:generate-key` → set `MCP_REGISTRY_PRIVATE_KEY_HEX` in Vercel → redeploy → `mcp-publisher login` + `publish` ([PUBLISH.md](../mcp-registry/PUBLISH.md)) |
