# Concierge Agent (gold-panel)

Executive Lounge + pay-per-call market intelligence API at `https://conc-exe.xyz`.

## Layout

- **Frontend** (`frontend/`) — static Lounge UI (`public/`), TanStack app (`src/`), browser bundles (`lib/`)
- **Backend** (`backend/`) — Concierge API handlers (`concierge-api/`), Vercel entries (`api/`), dev middleware (`concierge-dev-plugin.ts`)
- **API entry (Vercel):** root `api/*.ts` shims → `backend/api/` · Edge router `[...path].ts` · Node: `lounge-rwa-mint-sol`
- **Handlers:** `backend/concierge-api/` — keep new handlers **outside** root `/api/` (Vercel Hobby ≤12 serverless functions)
- **x402 / Token Pay:** `backend/concierge-api/token-pay/` · partner APIs `/api/token-pay-build-accept`, `/api/token-pay-verify` · SDK `packages/token-x402` (`@conc-exe/token-x402`)
- **Agent client SDK:** `packages/agent` (`@conc-exe/agent`) — discover → pay → call intel/security · docs `/docs/sdk/agent`
- **x402 / OpenAPI:** `backend/concierge-api/x402-server.ts`, `x402-discovery.ts`
- **MCP:** `backend/concierge-api/routes/mcp.ts` · `https://conc-exe.xyz/api/mcp` (v1.1) · registry `mcp-registry/`
- **Research intel (Poncho / x402scan):** `concierge-research-intel.ts` — `intel-macro`, `intel-wire` (15 pay-per-call routes total)

## Integrations

- **Poncho** — `/docs/integration/poncho` · discoverable via x402scan; no Concierge API key for consumers
- **Hermes Agent** — `/docs/integration/hermes` · Nous personal agent; remote MCP `https://conc-exe.xyz/api/mcp` + skill `/skills/concierge-hermes`; catalog PR pack `distribution/hermes/`
- **HYRE Gateway** — `/docs/integration/hyre` · optional chat LLMs (`hyre-deepseek-v4-flash`, `hyre-glm-4.7-flash`) via `concierge-hyre.ts`; `HYRE_GATEWAY_KEY` on deploy
- **Anthropic Claude** — `/docs/integration/anthropic` · optional chat LLMs (`claude-sonnet-4-6`, `claude-haiku-4-5`) via `concierge-anthropic.ts`; `ANTHROPIC_API_KEY` on deploy
- **OpenAI GPT-5.6** — `/docs/integration/openai` · optional chat LLMs (`gpt-5.6-terra`, `gpt-5.6-luna`) via `concierge-openai.ts`; `OPENAI_API_KEY` on deploy
- **Gemma 4 Edge** — `/docs/integration/gemma` · on-device LiteRT-LM preset + tool manifest (`distribution/gemma/concierge-edge-preset.py`); intel via pay.sh x402
- **OOBE Protocol** — `/docs/integration/oobe` · SAP tool manifest for Synapse agents (`concierge:intel-verdict`, `concierge:intel-meteora`)
- **x402scan / MPPscan / pay.sh** — discovery + AgentCash settlement

## Grok Build

Skill: `.grok/skills/concierge-intel/` — invoke `/concierge-intel` in `grok` sessions.  
Docs: `/docs/grok-build` · Pay intel calls via `pay --sandbox curl https://conc-exe.xyz/api/...`

## Commands

```bash
npm run dev          # Vite + local API middleware
npm run build        # production build
npm run discovery:validate
npm run edge:setup   # Gemma 4 Edge toolchain (Python, uv, litert-lm)
npm run edge:verify:local  # verify Gemma Edge assets + preset against localhost:8080
```

Do not add top-level `api/*.ts` files without checking the 12-function Hobby limit.

## Git & deploy identity

**Concierge repo only — no other identities.**

- Remote: `theconcierge99-hue/gold-panel` on GitHub only.
- Commits must use **repo-local** author & committer:
  - `theconcierge99-hue <285804041+theconcierge99-hue@users.noreply.github.com>`
- Do **not** commit as `0xsha10`, personal emails, or add `Co-authored-by: Cursor` / other co-authors.
- Before push: `git log -1 --format="%an <%ae>"` must show `theconcierge99-hue`.
- If a wrong-author commit lands on `main`, rewrite with Concierge identity and `git push --force-with-lease` (user-requested only).
