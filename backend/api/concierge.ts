import type { VercelRequest, VercelResponse } from "@vercel/node";
import handleConcierge from "../concierge-api/routes/concierge";

/** Node runtime — trading-plan intel + Gemini exceed Edge ~30s wall clock. */
export const config = {
  maxDuration: 60,
};

function vercelToWebRequest(req: VercelRequest): Request {
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "conc-exe.xyz");
  const proto = String(req.headers["x-forwarded-proto"] ?? "https");
  const path = req.url?.startsWith("/") ? req.url : `/api/concierge${req.url ?? ""}`;
  const url = `${proto}://${host}${path}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : String(value));
  }
  let body: string | undefined;
  const method = req.method ?? "POST";
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    if (typeof req.body === "string") {
      body = req.body;
    } else if (req.body != null) {
      body = JSON.stringify(req.body);
      if (!headers.has("content-type")) headers.set("content-type", "application/json");
    }
  }
  return new Request(url, { method, headers, body });
}

async function writeWebResponse(res: VercelResponse, webRes: Response): Promise<void> {
  res.status(webRes.status);
  webRes.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  res.send(Buffer.from(await webRes.arrayBuffer()));
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    await writeWebResponse(res, await handleConcierge(vercelToWebRequest(req)));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Concierge request failed";
    console.error("[api/concierge node]", e instanceof Error ? e.stack || msg : msg);
    if (!res.headersSent) {
      res.status(500).json({ error: msg.slice(0, 200) });
    }
  }
}
