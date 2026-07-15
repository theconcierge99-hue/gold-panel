# MCP Registry — Concierge Intel

Publish `xyz.conc-exe/concierge-intel` to the [official MCP Registry](https://registry.modelcontextprotocol.io/).

**Live endpoint:** `https://conc-exe.xyz/api/mcp`  
**Domain auth file:** `https://conc-exe.xyz/.well-known/mcp-registry-auth`

## Prerequisites

- Domain control of **conc-exe.xyz** (HTTP namespace `xyz.conc-exe/*`)
- **Official** MCP Registry publisher CLI (see step 3 — **not** `npm install -g mcp-publisher`)
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

Verify (Windows PowerShell — use `curl.exe`, not `curl`):

```powershell
curl.exe -s https://conc-exe.xyz/.well-known/mcp-registry-auth
# v=MCPv1; k=ed25519; p=...
```

### 3. Install publisher CLI

**Do not use** `npm install -g mcp-publisher` — that npm package is unrelated and starts an MCP server on stdio.

Download the official binary from [modelcontextprotocol/registry releases](https://github.com/modelcontextprotocol/registry/releases) (`mcp-publisher_windows_amd64.tar.gz`), extract `mcp-publisher.exe`, and run it from repo root or add to PATH.

PowerShell example:

```powershell
# from repo root
New-Item -ItemType Directory -Force tools | Out-Null
curl.exe -L -o tools/mcp-publisher.tar.gz `
  https://github.com/modelcontextprotocol/registry/releases/download/v1.7.9/mcp-publisher_windows_amd64.tar.gz
tar -xzf tools/mcp-publisher.tar.gz -C tools
.\tools\mcp-publisher.exe --help
```

If you already installed the wrong npm package: `npm uninstall -g mcp-publisher`

### 4. Login (HTTP domain verification)

Paste the **actual** 64-char hex from `.secrets/mcp-registry-key.hex` — not the placeholder text `<hex>`.

PowerShell:

```powershell
$key = (Get-Content .secrets/mcp-registry-key.hex -Raw).Trim()
.\tools\mcp-publisher.exe login http --domain=conc-exe.xyz --private-key=$key
```

Unix:

```bash
mcp-publisher login http --domain=conc-exe.xyz --private-key="$(cat .secrets/mcp-registry-key.hex | tr -d '\n')"
```

### 5. Publish

From repo root:

```powershell
.\tools\mcp-publisher.exe publish mcp-registry/server.json
```

Bump `version` in `server.json` when tools or URLs change.

**Private source repo:** omit `repository` from `server.json` — discovery links use `conc-exe.xyz` only (OpenAPI, skill, docs). Republish after manifest changes.

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

Paid tools proxy x402 — unpaid `tools/call` returns live `PAYMENT-REQUIRED` in `_meta`. Retry with `paymentSignature`, pass `creditsWallet`, or use [pay.sh](https://pay.sh/) / `@conc-exe/agent`. Free: `concierge_catalog`, `concierge_prepare_payment`.
