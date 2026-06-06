# pay-skills submission — Concierge Agent

PR-ready bundle for [solana-foundation/pay-skills](https://github.com/solana-foundation/pay-skills).

**Target path in pay-skills repo:** `providers/conc-exe/concierge-agent/`  
**Catalog FQN:** `conc-exe/concierge-agent`

## Refresh before PR

```bash
npm run paysh:sync-openapi    # generate openapi.json from local api/lib/x402-discovery.ts
npm run paysh:validate        # pay catalog check (402 probe + Solana USDC)
```

## Open PR

1. Fork `solana-foundation/pay-skills`
2. Copy this directory to `providers/conc-exe/concierge-agent/`
3. `pay catalog check providers/conc-exe/concierge-agent/PAY.md`
4. Open PR — CI validates frontmatter, OpenAPI, and live 402 probes

After merge, Concierge appears on [pay.sh](https://pay.sh/) within minutes.

Site docs: [conc-exe.xyz/docs/payment/paysh](https://conc-exe.xyz/docs/payment/paysh)
