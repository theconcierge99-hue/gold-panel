# Concierge LP worker

Session-based autonomous Meteora DLMM LP agent for Executive Lounge.

**Attribution:** Agent loop and tool patterns inspired by / forked from
[yunus-0x/meridian](https://github.com/yunus-0x/meridian) (Agent Meridian).
Commercial use permitted by Meridian author (public Telegram statement).
Concierge branding, session Start/Stop, and intel bridge are Concierge-specific.

## Run locally

```bash
cd workers/concierge-lp
npm install
export WORKER_SECRET=dev-secret
export PORT=8790
export DRY_RUN=true
# Optional: Concierge origin for intel enrichment
export CONCIERGE_API_ORIGIN=http://127.0.0.1:8080
export SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
npm start
```

## Concierge env

```env
CONCIERGE_LP_WORKER_URL=http://127.0.0.1:8790
CONCIERGE_LP_WORKER_SECRET=dev-secret
# CONCIERGE_LP_ALLOW_STUB=true   # local Lounge without worker
```

## Control plane

| Method | Path | Auth |
|--------|------|------|
| POST | `/session/start` | Bearer worker secret |
| POST | `/session/stop` | Bearer worker secret |
| GET | `/session/status?sessionId=` | Bearer worker secret |
| GET | `/health` | none |

Worker creates an ephemeral session keypair on start. User funds that address;
agent signs LP txs only while the session is `active`. On stop, optionally
closes positions and returns remaining SOL to the owner wallet.
