# MCP Registry — Concierge Intel

Publish `xyz.conc-exe/concierge-intel` to the [official MCP Registry](https://registry.modelcontextprotocol.io/).

**Live endpoint:** `https://conc-exe.xyz/api/mcp` (GET discovery · POST JSON-RPC `initialize` | `tools/list` | `tools/call`)

## Prerequisites

- Domain control of **conc-exe.xyz** (HTTP namespace `xyz.conc-exe/*`)
- [mcp-publisher](https://www.npmjs.com/package/mcp-publisher) CLI

## Validate locally

```bash
npm run mcp-registry:validate
```

## Publish (one-time setup + each release)

### 1. Install CLI

```bash
npm install -g mcp-publisher
```

### 2. Authenticate domain

Generate an Ed25519 keypair (save the hex private key securely):

```bash
# Example — use openssl or mcp-publisher docs for keygen
mcp-publisher login http --domain=conc-exe.xyz --private-key=YOUR_64_CHAR_HEX_PRIVATE_KEY
```

Follow CLI instructions to serve the verification token at the URL it specifies on `conc-exe.xyz`.

### 3. Publish

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
