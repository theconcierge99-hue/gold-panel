"""
Concierge Edge — LiteRT-LM preset for Gemma 4 on-device agents.

Run (after `uv tool install litert-lm` and `pay setup`):
  litert-lm run \\
    --from-huggingface-repo=litert-community/gemma-4-E2B-it-litert-lm \\
    gemma-4-E2B-it.litertlm \\
    --preset=concierge-edge-preset.py

Environment:
  CONCIERGE_ORIGIN — default https://conc-exe.xyz
  CONCIERGE_PAY_CMD — default pay (use `pay --sandbox` for testing)
  CONCIERGE_DIRECT — set to 1 for direct HTTP (local dev without pay wallet)
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import urllib.error
import urllib.request
from typing import Any

ORIGIN = os.environ.get("CONCIERGE_ORIGIN", "https://conc-exe.xyz").rstrip("/")
PAY_CMD = os.environ.get("CONCIERGE_PAY_CMD", "pay").strip().split()
DIRECT = os.environ.get("CONCIERGE_DIRECT", "").strip() in {"1", "true", "yes"}
LOCAL_ORIGIN = ORIGIN.startswith("http://localhost") or ORIGIN.startswith("http://127.0.0.1")


def _concierge_post_direct(path: str, body: dict[str, Any] | None = None) -> str:
    """Direct HTTP POST — used for local dev when x402 is bypassed."""
    url = f"{ORIGIN}{path}"
    payload = json.dumps(body or {}, separators=(",", ":")).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            return res.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.read().decode("utf-8", errors="replace")
    except Exception as e:
        return json.dumps({"error": "http_failed", "detail": str(e), "endpoint": path})


def _concierge_post_pay(path: str, body: dict[str, Any] | None = None) -> str:
    """Call a Concierge x402 route via pay curl. Returns response body text."""
    url = f"{ORIGIN}{path}"
    payload = json.dumps(body or {}, separators=(",", ":"))
    pay_bin = PAY_CMD[0]
    if not shutil.which(pay_bin):
        return json.dumps(
            {
                "error": "pay_cli_missing",
                "hint": "Install pay.sh: https://docs.payai.network/ — then run: pay setup && pay topup",
                "probe": f"curl -s -X POST {url} -H Content-Type:application/json -d '{payload}'",
            }
        )
    cmd = [*PAY_CMD, "curl", url, "-H", "Content-Type: application/json", "-d", payload]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120, check=False)
    except subprocess.TimeoutExpired:
        return json.dumps({"error": "timeout", "endpoint": path})
    out = (proc.stdout or proc.stderr or "").strip()
    if not out:
        return json.dumps({"error": "empty_response", "exitCode": proc.returncode, "endpoint": path})
    return out


def _concierge_post(path: str, body: dict[str, Any] | None = None) -> str:
    if DIRECT or LOCAL_ORIGIN:
        return _concierge_post_direct(path, body)
    out = _concierge_post_pay(path, body)
    if LOCAL_ORIGIN or '"error"' not in out:
        return out
    # Production fallback when pay wallet is not configured yet.
    if any(x in out for x in ("pay_cli_missing", "setup failed", "No pay account", "Configuration error")):
        return _concierge_post_direct(path, body)
    return out


def intel_macro() -> str:
    """Fetch macro snapshot — SPX, VIX, DXY, gold, BTC/ETH, Fear & Greed, yields. $0.02 USDC."""
    return _concierge_post("/api/concierge-intel-macro")


def intel_wire(category: str = "", limit: int = 8, message: str = "") -> str:
    """Wire headline digest from live RSS + Lounge feed. $0.02 USDC.

    Args:
        category: Optional category filter (e.g. Geopolitics, Crypto).
        limit: Max headlines 1–20 (default 8).
        message: Optional keyword filter.
    """
    body: dict[str, Any] = {"limit": limit}
    if category:
        body["category"] = category
    if message:
        body["message"] = message
    return _concierge_post("/api/concierge-intel-wire", body)


def intel_tvl() -> str:
    """Chain TVL snapshot and top DeFi protocols via DeFi Llama. $0.02 USDC."""
    return _concierge_post("/api/concierge-intel-tvl")


def intel_verdict(message: str, include_insider: bool = True) -> str:
    """Desk verdict: snipe | watch | follow | avoid | rebalance + confidence. $0.10 USDC.

    Args:
        message: Question or theme for the desk (e.g. Solana DeFi outlook).
        include_insider: Include Lounge creator signals (default true).
    """
    return _concierge_post(
        "/api/concierge-intel-verdict",
        {"message": message, "includeInsider": include_insider},
    )


def intel_meteora(
    pool_hint: str = "",
    limit: int = 8,
    sort_by_apy: bool = False,
) -> str:
    """Meteora DLMM pool deep-dive — TVL, APY, bin step, IL risk flags. $0.10 USDC.

    Args:
        pool_hint: Substring filter on pool name (e.g. SOL, SOL-USDC).
        limit: Max pools 1–20 (default 8).
        sort_by_apy: Sort by APY instead of TVL (default false).
    """
    body: dict[str, Any] = {"limit": limit, "sortByApy": sort_by_apy}
    if pool_hint:
        body["poolHint"] = pool_hint
    return _concierge_post("/api/concierge-intel-meteora", body)


def intel_desk_brief(message: str, include_insider: bool = True) -> str:
    """Composite desk brief — macro + yields + verdict + optional insider. $0.25 USDC.

    Args:
        message: Brief theme (e.g. morning Solana desk).
        include_insider: Include Lounge creator signals (default true).
    """
    return _concierge_post(
        "/api/concierge-intel-desk-brief",
        {"message": message, "includeInsider": include_insider},
    )


system_instruction = """You are Concierge Edge — a private on-device trading desk agent.

Your local inference runs on Gemma 4 (no cloud LLM). Live market intelligence comes from Concierge APIs on conc-exe.xyz, settled via x402 USDC using pay.sh.

Workflow:
1. Understand the user's market question (crypto, macro, DeFi, Solana).
2. Call the smallest set of intel tools needed — prefer cheap raw routes ($0.02) before bundles.
3. Synthesize a clear answer in the user's language (Indonesian if they write in Indonesian).
4. Cite verdict signals and key levels when relevant. Never invent live prices.

Tool guide:
- intel_macro / intel_wire / intel_tvl — fast context ($0.02)
- intel_verdict — desk bias snipe/watch/avoid ($0.10)
- intel_meteora — Solana LP pools ($0.10)
- intel_desk_brief — full morning brief ($0.25)

If a tool returns payment or setup errors, explain pay.sh setup briefly."""

tools = [
    intel_macro,
    intel_wire,
    intel_tvl,
    intel_verdict,
    intel_meteora,
    intel_desk_brief,
]
