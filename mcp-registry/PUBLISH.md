# MCP Registry — Concierge Intel

Publish `xyz.conc-exe/concierge-intel` to the [official MCP Registry](https://registry.modelcontextprotocol.io/).

**Live endpoint:** `https://conc-exe.xyz/api/mcp`  
**Domain auth file:** `https://conc-exe.xyz/.well-known/mcp-registry-auth`

## Prerequisites

- Domain control of **conc-exe.xyz** (HTTP namespace `xyz.conc-exe/*`)
- [mcp-publisher](https://www.npmjs.com/package/mcp-publisher) CLI
- Ed25519 private key in Vercel env `MCP_REGISTRY_PRIVATE_KEY_HEX` (64 hex chars)

## Validate locally

```bash
npm run mcp-registry:validate
```

## One-time domain setup (~15 min)

### 1. Generate keypair (local only — never commit `.secrets/`)

```bash
npm run mcp-registry:generate-key
```

This writes:

- `.secrets/mcp-registry-key.pem` — local backup
- `.secrets/mcp-registry-key.hex` — copy value into Vercel

### 2. Deploy with env var

In Vercel → **Settings → Environment Variables**:

| Name | Value |
|------|--------|
| `MCP_REGISTRY_PRIVATE_KEY_HEX` | 64-char hex from `.secrets/mcp-registry-key.hex` |

Redeploy. Build runs `scripts/generate-mcp-registry-auth.mjs` and emits `/.well-known/mcp-registry-auth`.

Verify:

```bash
curl -s https://conc-exe.xyz/.well-known/mcp-registry-auth
# v=MCPv1; k=ed25519; p=...
```

### 3. Install publisher CLI

```bash
npm install -g mcp-publisher
```

### 4. Login (HTTP domain verification)

```bash
mcp-publisher login http --domain=conc-exe.xyz --private-key=YOUR_64_CHAR_HEX_PRIVATE_KEY
```

### 5. Publish

From repo root:

```bash
mcp-publisher publish mcp-registry/server.json
```

Bump `version` in `server.json` when tools or URLs change.

## Cursor / Claude Desktop (manual until indexed)

```json
{
  "mcpServers": {
    "concierge-intel": {
      "url": "https://conc-exe.xyz/api/mcp"
    }
  }
}
```

Paid tools require x402 settlement — pass `paymentSignature` in `tools/call` arguments after `pay curl`, or use [pay.sh](https://pay.sh/) MCP.
