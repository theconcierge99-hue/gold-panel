# Concierge call cookbook (Hermes)

## MCP tools/call shape

```json
{
  "name": "intel_macro",
  "arguments": {
    "body": {},
    "paymentSignature": "<base64 after x402 settle>"
  }
}
```

Prefer `pay curl` on the matching HTTP route when Hermes MCP settlement is not wired yet.

## HTTP examples

```bash
# Macro desk — $0.02
pay curl https://conc-exe.xyz/api/concierge-intel-macro -d '{}'

# Wire digest — $0.02
pay curl https://conc-exe.xyz/api/concierge-intel-wire -d '{"limit":8}'

# Verdict — $0.10
pay curl https://conc-exe.xyz/api/concierge-intel-verdict \
  -d '{"message":"Solana DeFi outlook","includeInsider":true}'

# Meteora DLMM — $0.10
pay curl https://conc-exe.xyz/api/concierge-intel-meteora \
  -d '{"sortByApy":true,"limit":8}'

# Desk brief — $0.25
pay curl https://conc-exe.xyz/api/concierge-intel-desk-brief \
  -d '{"message":"morning desk brief","includeInsider":true}'

# Free scope check
curl -s -X POST https://conc-exe.xyz/api/concierge-security-scope \
  -H "content-type: application/json" \
  -d '{"target":"https://api.example.com","allowlist":["*.example.com"]}'

# Security headers scout — $0.02 (authorized + allowlist required)
pay curl https://conc-exe.xyz/api/concierge-security-headers \
  -d '{"target":"https://api.example.com","allowlist":["*.example.com"],"authorized":true}'
```

## Tool → route map

| MCP name | HTTP path |
|----------|-----------|
| `intel_macro` | `/api/concierge-intel-macro` |
| `intel_wire` | `/api/concierge-intel-wire` |
| `intel_tvl` | `/api/concierge-intel-tvl` |
| `intel_yields` | `/api/concierge-intel-yields` |
| `intel_whales` | `/api/concierge-intel-whales` |
| `intel_verdict` | `/api/concierge-intel-verdict` |
| `intel_meteora` | `/api/concierge-intel-meteora` |
| `intel_desk_brief` | `/api/concierge-intel-desk-brief` |
| `intel_a2a_pipeline` | `/api/concierge-intel-a2a-pipeline` |
| `intel_scalp` | `/api/concierge-intel-scalp` |
| `intel_momentum` | `/api/concierge-intel-momentum` |
| `security_readiness` | `/api/concierge-security-readiness` |
| `security_headers` | `/api/concierge-security-headers` |
| `security_scan` | `/api/concierge-security-scan` |

Discovery: `GET https://conc-exe.xyz/api/mcp` · OpenAPI: `GET https://conc-exe.xyz/openapi.json`
