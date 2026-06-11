import type { VercelRequest, VercelResponse } from "@vercel/node";

/** Map @vercel/node request to Web Fetch API Request (handlers in lib/concierge-api/). */
export function vercelRequestToWebRequest(req: VercelRequest, pathname: string): Request {
  const proto = String(req.headers["x-forwarded-proto"] ?? "https");
  const host = String(req.headers.host ?? "conc-exe.xyz");
  const path = req.url?.startsWith("/") ? req.url : pathname;
  const url = `${proto}://${host}${path}`;

  const headers = new Headers();
  for (const [key, val] of Object.entries(req.headers)) {
    if (val === undefined) continue;
    if (Array.isArray(val)) {
      for (const v of val) headers.append(key, v);
    } else {
      headers.set(key, val);
    }
  }

  const method = req.method ?? "GET";
  let body: BodyInit | undefined;
  if (method !== "GET" && method !== "HEAD") {
    if (typeof req.body === "string") {
      body = req.body;
    } else if (Buffer.isBuffer(req.body)) {
      body = req.body;
    } else if (req.body != null && typeof req.body === "object") {
      body = JSON.stringify(req.body);
      if (!headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }
    }
  }

  return new Request(url, { method, headers, body });
}

export async function sendWebResponse(res: VercelResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      const existing = res.getHeader("set-cookie");
      if (existing) {
        res.setHeader("set-cookie", ([] as string[]).concat(existing as string[], value));
      } else {
        res.setHeader("set-cookie", value);
      }
    } else {
      res.setHeader(key, value);
    }
  });
  res.end(Buffer.from(await response.arrayBuffer()));
}

export function runWebHandler(
  req: VercelRequest,
  res: VercelResponse,
  pathname: string,
  handler: (request: Request) => Promise<Response>,
): Promise<void> {
  return handler(vercelRequestToWebRequest(req, pathname))
    .then((response) => sendWebResponse(res, response))
    .catch((e) => {
      console.error(`[${pathname}]`, e instanceof Error ? e.message : e);
      if (res.headersSent) return;
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify({ error: "A server error has occurred" }));
    });
}
