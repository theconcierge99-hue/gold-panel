import { assertAllowedOrigin, corsHeadersFor, sanitizePublicError } from "../concierge-security";
import { normalizeSolPayTo } from "../x402-address";
import { getSignalRwaToken, saveSignalRwaToken } from "../rwa-store";
import { getSignalById } from "../signal-store";

/** Edge — persist on-chain mint after creator signs in Phantom */
export default async function handler(request: Request): Promise<Response> {
  const cors = corsHeadersFor(request);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    assertAllowedOrigin(request);
    const body = (await request.json()) as {
      signalId?: string;
      mintAddress?: string;
      tx?: string;
      creatorWallet?: string;
    };
    const signalId = String(body.signalId ?? "").trim();
    const mintAddress = String(body.mintAddress ?? "").trim();
    const tx = String(body.tx ?? "").trim();
    const creatorWallet = String(body.creatorWallet ?? "").trim();

    if (!signalId || !mintAddress || !creatorWallet) {
      return new Response(JSON.stringify({ error: "signalId, mintAddress, creatorWallet required" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const signal = await getSignalById(signalId);
    if (!signal) {
      return new Response(JSON.stringify({ error: "Signal not found" }), {
        status: 404,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const want = normalizeSolPayTo(creatorWallet);
    const have = normalizeSolPayTo(signal.creatorWallet);
    if (!want || want !== have) {
      return new Response(JSON.stringify({ error: "Creator wallet mismatch" }), {
        status: 403,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const token = await getSignalRwaToken(signalId);
    if (!token) {
      return new Response(JSON.stringify({ error: "RWA token not found" }), {
        status: 404,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    await saveSignalRwaToken({
      ...token,
      onChainMintAddress: mintAddress,
      onChainMintTx: tx || undefined,
      onChainMintStatus: "sent",
    });

    return new Response(JSON.stringify({ ok: true, mintAddress, tx: tx || null }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (e) {
    const msg = sanitizePublicError(e);
    const status = msg.includes("not allowed") ? 403 : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
}
