# thebuyside-x402-agent — seed.json PR

Curated entries for [jaysperspective/thebuyside-x402-agent](https://github.com/jaysperspective/thebuyside-x402-agent) `pay.discover` federated search.

## Prepare PR

```bash
npm run distribution:thebuyside-pr
```

Or manually:

1. Fork/clone `thebuyside-x402-agent`
2. Merge `seed-entries.json` → `entries` array in `src/registry/seed.json`
3. `pnpm verify-seed` — all entries must return 402 with advertised price
4. `git commit -s -m "Add Concierge Agent x402 intel routes (conc-exe.xyz)"`
5. Open PR

## Verify before PR

```bash
curl -s -o NUL -w "%{http_code}" -X POST https://conc-exe.xyz/api/concierge-intel-macro -H "Content-Type: application/json" -d "{}"
# expect 402
```

See [adding-an-api.md](https://github.com/jaysperspective/thebuyside-x402-agent/blob/main/docs/adding-an-api.md).
