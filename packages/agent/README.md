# @conc-exe/agent

Discover and call Concierge **pay-per-call** market intel from any agent runtime.

No API keys. Settle with **x402** (`PAYMENT-SIGNATURE`) or **TCX** credits (`x-tcx-credits-wallet`).

## Install

```bash
npm install @conc-exe/agent
```

Monorepo: `npm run agent:build` from repo root.

## Quick start

```typescript
import { createConciergeAgent, PaymentRequiredError } from "@conc-exe/agent";

const agent = createConciergeAgent({
  origin: "https://conc-exe.xyz",
  // paymentSignature: "<base64 x402 payload>",
  // creditsWallet: "<solana pubkey>",
});

// 1) Discover live catalog + meshes
const snap = await agent.discover();
console.log(snap.catalog.length, snap.mcpUrl);

// 2) Call intel (throws PaymentRequiredError if unpaid)
try {
  const { body } = await agent.intel.verdict({ message: "DeFi outlook on Solana" });
  console.log(body);
} catch (e) {
  if (e instanceof PaymentRequiredError) {
    // Settle with wallet / pay.sh, then:
    // agent.paymentSignature = signature; await agent.intel.verdict(...)
    console.log(agent.payCurl("intel-verdict", { message: "DeFi outlook on Solana" }));
  }
}
```

## Auto-settle hook

Wire your wallet / facilitator once; the client retries after 402:

```typescript
const agent = createConciergeAgent({
  async settlePayment({ accepts, paymentRequiredHeader }) {
    // Sign/settle against accepts[0] (Solana USDC or Base), return PAYMENT-SIGNATURE
    return await yourWallet.signX402(paymentRequiredHeader, accepts);
  },
});

const { body } = await agent.call("intel-macro", {});
```

## Without a wallet in-process

Use [pay.sh](https://pay.sh) / AgentCash:

```bash
pay curl https://conc-exe.xyz/api/concierge-intel-macro \
  -H "Content-Type: application/json" -d '{}'
```

Or `agent.payCurl("intel-macro")`.

## Surfaces

| Method | Role |
|--------|------|
| `discover()` | `/.well-known/x402` + OpenAPI + agent card + A2A mesh |
| `catalog()` | Offline kind → path → price map (24 routes) |
| `call(kind, body)` | Paid POST |
| `intel.*` / `security.*` | Typed shortcuts |
| `a2aMesh()` / `agentCard()` | Free discovery |
| `agentRegistration()` / `prepareErc8004()` / `linkErc8004()` | ERC-8004 Identity on Base |
| `payCurl(kind)` | Shell hint for agents |

Remote MCP (same intel surface): `https://conc-exe.xyz/api/mcp`

Docs: https://conc-exe.xyz/docs/sdk/agent

## Publish

```bash
cd packages/agent
npm run build
npm publish --access public
```
