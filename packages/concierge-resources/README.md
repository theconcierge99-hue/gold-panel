# @conc-exe/concierge-resources

MVP SDK for Concierge Resources — discover pay-per-use endpoints and execute with x402 or TCX credits.

## Local smoke test

Dev server: `npm run dev` → **http://localhost:8080**

```bash
# Catalog (free)
curl http://localhost:8080/api/resources

# x402 probe (expect 402 when X402_SOL_PAY_TO / X402_EVM_PAY_TO are set)
curl -s -X POST http://localhost:8080/api/resource-chat \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"BTC outlook\"}"

# TCX credits balance
curl "http://localhost:8080/api/tcx-credits?wallet=YOUR_SOLANA_WALLET"
```

On Windows PowerShell, pass JSON from a file:

```powershell
'{"message":"BTC outlook"}' | Set-Content -NoNewline .tmp-body.json
curl.exe -s -X POST http://localhost:8080/api/resource-chat `
  -H "Content-Type: application/json" `
  --data-binary "@.tmp-body.json"
```

Production sandbox agent:

```bash
pay --sandbox curl https://conc-exe.xyz/api/resource-chat \
  -d '{"message":"Summarize Solana DeFi in 3 bullets"}'
```

## SDK usage

```typescript
import { ConciergeResourcesClient } from "@conc-exe/concierge-resources";

const client = new ConciergeResourcesClient({
  origin: "https://conc-exe.xyz",
  creditsWallet: "YourSolanaWallet…",
});

const catalog = await client.discoverResources();
const detail = await client.resourceDetail("resource-chat");

// First call may return 402 — attach PAYMENT-SIGNATURE and retry
const result = await client.executeResource("resource-chat", {
  message: "BTC outlook in 3 bullets",
});
```

Free discovery: `GET /api/resources`  
Credits balance: `GET /api/tcx-credits?wallet=…`
