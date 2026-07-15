# Hermes Agent — Concierge distribution pack

Ready-to-submit artifacts so Concierge can be installed from Hermes without custom wiring.

| Path | Purpose |
|------|---------|
| `optional-mcps/concierge/manifest.yaml` | PR into `NousResearch/hermes-agent` → `optional-mcps/concierge/` for `hermes mcp catalog` |
| `optional-skills/research/concierge-intel/SKILL.md` | Optional PR mirror for `optional-skills/research/concierge-intel/` |
| `OUTREACH.md` | Soft partner / Discord + PR message templates |

## User path (no upstream merge required)

```bash
hermes mcp add concierge --url https://conc-exe.xyz/api/mcp
hermes skills install https://conc-exe.xyz/skills/concierge-hermes/SKILL.md
```

Docs: https://conc-exe.xyz/docs/integration/hermes

## Upstream PR path

1. Fork https://github.com/NousResearch/hermes-agent
2. Copy `optional-mcps/concierge/` → repo `optional-mcps/concierge/`
3. (Optional) Copy `optional-skills/research/concierge-intel/` → `optional-skills/research/concierge-intel/`
4. Open PR describing remote HTTP MCP + x402 settlement + link to docs
5. Do **not** claim official partnership until the PR is merged / staff acks

## Related live URLs

- MCP: https://conc-exe.xyz/api/mcp
- Skill: https://conc-exe.xyz/skills/concierge-hermes/SKILL.md
- Registry: https://registry.modelcontextprotocol.io/?search=xyz.conc-exe%2Fconcierge-intel
- Agent identity / ERC-8004 (Base): https://conc-exe.xyz/docs/api/agent-identity
- Lounge mint UI: https://conc-exe.xyz/lounge#agent-identity
- Agent SDK: https://conc-exe.xyz/docs/sdk/agent
