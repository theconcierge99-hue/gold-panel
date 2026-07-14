---
name: concierge-intel
description: "Pay-per-call market intelligence on conc-exe.xyz for Hermes — macro, wire, DeFi, verdict, Security Desk via MCP + x402. Mirrors official Concierge skill packaging for optional-skills PRs."
version: 1.0.0
author: Concierge Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [Research, Finance, x402, MCP]
---

# Concierge Intel (Hermes optional-skill draft)

This folder is a **upstream PR candidate** for `optional-skills/research/concierge-intel` in [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent).

**Canonical user-facing skill on conc-exe.xyz:**  
https://conc-exe.xyz/skills/concierge-hermes/SKILL.md

Prefer installing that URL (always current). Use this mirror only when contributing an official optional skill into the Hermes repo.

## Setup

```bash
hermes mcp add concierge --url https://conc-exe.xyz/api/mcp
hermes skills install https://conc-exe.xyz/skills/concierge-hermes/SKILL.md
```

## Docs

- https://conc-exe.xyz/docs/integration/hermes
- https://conc-exe.xyz/docs/integration/mcp-registry
- MCP catalog manifest: `../../optional-mcps/concierge/manifest.yaml`
