import { metaplexMetadataJson } from "../rwa-metadata-json";
import { getSignalRwaToken } from "../rwa-store";

export default async function handler(request: Request): Promise<Response> {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Cache-Control": "public, max-age=300",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const signalId = new URL(request.url).searchParams.get("signalId")?.trim();
  if (!signalId) {
    return new Response(JSON.stringify({ error: "signalId required" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const token = await getSignalRwaToken(signalId);
  if (!token) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify(metaplexMetadataJson(token)), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
