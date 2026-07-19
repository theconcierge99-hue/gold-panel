# Concierge Deep Scan worker

Authorized template probes for Concierge Security Desk (httpx + nuclei).

## Run locally

```bash
# Optional: install https://github.com/projectdiscovery/nuclei and httpx
export WORKER_SECRET=dev-secret
export PORT=8787
node server.mjs
```

## Concierge env

```env
SECURITY_DEEP_SCAN_WORKER_URL=http://127.0.0.1:8787
SECURITY_DEEP_SCAN_WORKER_SECRET=dev-secret
# SECURITY_DEEP_SCAN_ALLOW_STUB=true   # non-prod default stub if worker unset
```

Worker receives `POST /scan` from Concierge and callbacks `POST /api/concierge-security-deep-scan/complete`.
