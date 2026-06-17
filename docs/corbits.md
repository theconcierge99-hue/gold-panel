# Corbits integration map (Concierge Agent)

[Corbits](https://www.corbits.dev/) is an **Agent Operations** platform (neoteams): governance (**Interchange**), service discovery (**Discovery**), API monetization (**Marketplace**), and x402 payments (**Flex** / **Faremeter**).

Concierge Agent (`https://conc-exe.xyz`) already ships what agents expect: **OpenAPI 3.1**, **x402 USDC** (PayAI), **twelve pay-per-call routes**, and **MPP/AgentCash** discovery.

## ABK Labs hosted services (June 2026)

**ABK Labs** (Faremeter) is winding down its **hosted Marketplace, Facilitator, and Discovery** services effective **26 June 2026**. Concierge **production** is unaffected:

| Layer | Concierge today | After shutdown |
|-------|-----------------|----------------|
| **Facilitator (USDC)** | [PayAI](https://payai.network) primary · Dexter fallback | ✅ No change — PayAI is ABK’s recommended replacement |
| **Token Pay (SPL)** | Self-settle on origin | ✅ No facilitator dependency |
| **Agent discovery** | Direct origin + MPPscan + x402scan | ✅ No change |

**Primary catalog path going forward:** [pay.sh](https://pay.sh/) via [solana-foundation/pay-skills](https://github.com/solana-foundation/pay-skills) — PRs submitted for `conc-exe/concierge-agent` and `conc-exe/token-pay`.

Corbits sections below remain **optional** (proxy / Interchange). Confirm current availability with [corbits.dev](https://www.corbits.dev/) as ABK shifts focus to the Corbits Platform.

## Recommended discovery order (2026)

1. **Direct origin** — `https://conc-exe.xyz` + `openapi.json` + `/.well-known/x402`
2. **[pay.sh](https://pay.sh/)** — `pay curl` / Claude / Codex MCP ([docs](paysh.md))
3. **MPPscan / AgentCash** — [mpp.md](mppscan.md)
4. **x402scan** — [x402scan.md](x402scan.md)
5. **Corbits Marketplace + Discovery** — optional second front door (see below)

## What integrates today (no Corbits account required)

| Concierge asset | Corbits use |
|-----------------|-------------|
| `GET /openapi.json` | Marketplace proxy + Discovery catalog (x-payment-info, 402) |
| `GET /.well-known/x402` | x402 fan-out (Faremeter-compatible) |
| `402` + Bazaar schemas | Agent pay-per-call negotiation |
| `POST /api/agent-identity` + `agt_…` | Complements Interchange identity on the **client** side |
| PayAI settlement | Same payment model as [Faremeter x402](https://docs.corbits.dev/) docs |

## Corbits products — fit for Concierge

### 1. Marketplace (primary — **API provider**)

**What:** Hosted proxy in front of your API; per-endpoint pricing; x402 collection without changing backend code.

**Fit:** Point Corbits backend URL at `https://conc-exe.xyz`. Proxy URL (e.g. `concierge.*.api.corbits.dev`) handles payments; requests forward to your Edge APIs after settlement.

**You configure:** Control Plane → new proxy → backend `https://conc-exe.xyz`. There is **no “import from OpenAPI”** in the New Proxy modal — only a **default price**. Set default **0.10 USDC**, scheme **exact**, then open **Endpoints** and paste per-path pricing (see table below).

| Path | USDC |
|------|------|
| `/api/news-open` | 0.10 |
| `/api/concierge` | 0.10 |
| `/api/lounge-signal-open` | 0.10 |
| `/api/lounge-signal-publish` | **1.00** |
| `/api/concierge-intel-tvl` | 0.10 |
| `/api/concierge-intel-yields` | 0.10 |
| `/api/concierge-intel-whales` | 0.10 |
| `/api/concierge-intel-wallet` | 0.10 |
| `/api/concierge-intel-verdict` | 0.10 |
| `/api/concierge-intel-airdrop` | 0.10 |
| `/api/concierge-intel-listing` | 0.10 |
| `/api/concierge-intel-momentum` | 0.10 |

**Auth header:** leave token empty unless you add a private backend secret — Concierge paid routes use **x402** (`payment-signature`), not Bearer to origin.

**Docs:** [Marketplace overview](https://docs.corbits.dev/marketplace/overview) · [Marketplace product](https://www.corbits.dev/marketplace)

**Status:** Optional — confirm with Corbits after ABK hosted Marketplace/Discovery wind-down (June 2026). Prefer **pay.sh** catalog for new listings.

---

### 2. Discovery (secondary — **findability**)

**What:** Searchable catalog for agents; OpenAPI + pricing per listed proxy.

**Fit:** After Marketplace proxy is **active**, submit it to Discovery so agents (and Corbits Skill) can search “market intelligence”, “DeFi”, “x402”.

**Docs:** [Discovery overview](https://docs.corbits.dev/discovery/overview)

**Status:** After Marketplace listing (optional; pay.sh is the primary agent catalog).

---

### 3. Faremeter / Flex (payments — **already aligned**)

**What:** Faremeter = x402 payment framework; Flex = accept agent payments quickly.

**Fit:** Concierge already settles via **PayAI** + x402 v2 on Solana/Base. No migration required — PayAI is the recommended facilitator after ABK hosted Faremeter facilitator shutdown.

**Optional:** Do not run a Faremeter facilitator on Concierge origin; PayAI + Dexter cover USDC settlement.

**Status:** Compatible today (PayAI on origin).

---

### 4. Interchange (governance — **agent consumers**)

**What:** Register agents with policies (`spend-limit-daily`, audit trails, cryptographic action logs).

**Fit:** **Not** a replacement for Concierge `agt_` registry — it governs **teams deploying agents that call** Concierge. Enterprises register `procurement-agent`-style identities in Interchange, then pay Concierge per call with policy-enforced wallets.

**Example (client-side):**

```typescript
import { Interchange } from "@corbits/interchange";

const agent = await Interchange.register({
  name: "macro-desk-agent",
  team: "trading",
  policies: ["spend-limit-daily"],
  audit: { level: "full", sign: true },
});
// Then call https://conc-exe.xyz/api/concierge-intel-verdict with x402
```

**Docs:** [Interchange](https://interchange.corbits.xyz/) · [Corbits home](https://www.corbits.dev/)

**Status:** Optional for enterprise buyers; no server change on conc-exe.xyz.

---

## Recommended rollout order

1. **Keep** direct origin `https://conc-exe.xyz` (pay.sh, MPPscan, AgentCash, browsers).
2. **List on pay.sh** — merge PR to [pay-skills](https://github.com/solana-foundation/pay-skills) (`conc-exe/concierge-agent`, `conc-exe/token-pay`).
3. **Optional:** Register [Corbits Marketplace](https://www.corbits.dev/marketplace) proxy → backend conc-exe.xyz (confirm availability post–June 2026).
4. **Optional:** List Corbits proxy on [Discovery](https://docs.corbits.dev/discovery/overview).
5. **Optional:** Document Interchange for teams that need spend caps + audit on agents calling you.

## What we do not duplicate

| Corbits | Concierge already has |
|---------|------------------------|
| Marketplace proxy URL | Direct x402 on origin (simpler for integrators) |
| Interchange policies | `agt_` + optional `X-Agent-Id` |
| Discovery index | **pay.sh** + MPPscan + x402scan + `/openapi.json` |

Running **both** direct origin and Corbits proxy is valid: direct for open agents, Corbits proxy for enterprise discovery and dashboard analytics.

## Site links

- Integrations UI: `/integrations` (Corbits section)
- Docs: `/docs/corbits`
- OpenAPI: `/openapi.json`
