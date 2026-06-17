# @conc-exe/token-x402

Concierge **Token Pay (Beta)** SDK for partner APIs.

## Install

```bash
npm install @conc-exe/token-x402
```

Monorepo dev: `npm run token-x402:build` from repo root.

Or copy from this monorepo: `packages/token-x402/src/index.ts`.

## Quick start (your API)

```typescript
import { createConciergeTokenPayClient } from "@conc-exe/token-x402";

const tp = createConciergeTokenPayClient({ origin: "https://conc-exe.xyz" });

// 1) Build accept (your backend)
const { accept } = await tp.buildAccept({
  merchantId: "acme",
  usdAmount: 0.1,
  resourceUrl: "https://api.acme.xyz/v1/intel",
});

// 2) Return 402 to client
const paymentRequired = tp.buildPaymentRequired(accept, "https://api.acme.xyz/v1/intel");
// res.status(402).setHeader("PAYMENT-REQUIRED", paymentRequired)

// 3) After wallet signs, verify via Concierge
const result = await tp.verifyPayment({
  merchantId: "acme",
  usdAmount: 0.1,
  resourceUrl: "https://api.acme.xyz/v1/intel",
  paymentSignature: req.headers.get("payment-signature")!,
});
```

## Merchant JSON

Add `"resourceKinds": ["external", "concierge"]` and optional `"allowedOrigins": ["https://api.acme.xyz"]` to `TOKEN_PAY_MERCHANTS_JSON`.

Docs: https://conc-exe.xyz/docs/payment/token-pay

## Publish to npm

```bash
cd packages/token-x402
npm run build
npm publish --access public
```

Requires npm login with publish rights to `@conc-exe` scope.
