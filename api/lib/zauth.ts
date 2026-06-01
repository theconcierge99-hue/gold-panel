/**
 * zauth.inc integration (Edge-safe fetch — no @zauthx402/sdk Express middleware).
 * @see https://zauth.inc/docs
 * @see https://zauth.inc/docs/database
 * @see https://zauth.inc/docs/provider-hub
 */

const ZAUTH_DIRECTORY_API = "https://api.zauth.inc/api/directory";
const ZAUTH_BACKEND_DEFAULT = "https://back.zauthx402.com";
const SDK_VERSION = "executive-lounge-1.0";

export type ZauthDirectoryEndpoint = {
  url: string;
  method?: string;
  network?: string;
  priceUsdc?: string;
  status?: string;
  successRate?: number;
  totalCalls?: number;
  verified?: boolean;
  uptime?: number;
  title?: string;
  description?: string;
  lastWorking?: string;
  lastTested?: string;
};

export type ZauthDirectoryResponse = {
  endpoints: ZauthDirectoryEndpoint[];
  pagination?: { total?: number; limit?: number; offset?: number; hasMore?: boolean };
  stats?: { totalEndpoints?: number; verified?: number; working?: number };
};

export type ZauthEndpointCheck = {
  verified: boolean;
  working: boolean;
  meaningful: boolean;
  lastChecked?: string;
  uptime?: number;
};

function zauthApiKey(): string | null {
  const key = process.env.ZAUTH_API_KEY?.trim();
  return key || null;
}

function zauthBackend(): string {
  return (process.env.ZAUTH_API_ENDPOINT || ZAUTH_BACKEND_DEFAULT).replace(/\/$/, "");
}

export function isZauthProviderEnabled(): boolean {
  return !!zauthApiKey();
}

export function zauthMetaLinks(origin: string) {
  const base = origin.replace(/\/$/, "");
  return {
    providerHubUrl: "https://zauth.inc/provider-hub",
    databaseUrl: "https://zauth.inc/database",
    docsUrl: "https://zauth.inc/docs",
    directoryApiUrl: ZAUTH_DIRECTORY_API,
    statusUrl: `${base}/api/zauth-status`,
    directoryProxyUrl: `${base}/api/zauth-directory`,
  };
}

export async function fetchZauthDirectory(params: {
  search?: string;
  network?: string;
  status?: string;
  verified?: boolean;
  limit?: number;
  offset?: number;
}): Promise<ZauthDirectoryResponse> {
  const q = new URLSearchParams();
  if (params.search) q.set("search", params.search);
  if (params.network) q.set("network", params.network);
  if (params.status) q.set("status", params.status);
  if (params.verified !== undefined) q.set("verified", String(params.verified));
  q.set("limit", String(Math.min(params.limit ?? 50, 100)));
  if (params.offset) q.set("offset", String(params.offset));

  const res = await fetch(`${ZAUTH_DIRECTORY_API}?${q}`, {
    signal: AbortSignal.timeout(8_000),
    headers: { Accept: "application/json", "User-Agent": "ExecutiveLounge/1.0" },
  });
  if (!res.ok) {
    throw new Error(`zauth directory HTTP ${res.status}`);
  }
  return (await res.json()) as ZauthDirectoryResponse;
}

export async function fetchZauthEndpointsForOrigin(origin: string): Promise<{
  origin: string;
  endpoints: ZauthDirectoryEndpoint[];
  directory: ZauthDirectoryResponse["stats"];
  providerCheck: ZauthEndpointCheck[];
}> {
  const host = origin.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const directory = await fetchZauthDirectory({ search: host, limit: 100 });
  const ours = directory.endpoints.filter((e) => e.url?.includes(host));

  const providerCheck: ZauthEndpointCheck[] = [];
  if (isZauthProviderEnabled()) {
    for (const ep of ours.slice(0, 8)) {
      providerCheck.push(await checkZauthEndpoint(ep.url));
    }
  }

  return {
    origin,
    endpoints: ours,
    directory: directory.stats,
    providerCheck,
  };
}

export async function checkZauthEndpoint(url: string): Promise<ZauthEndpointCheck> {
  const apiKey = zauthApiKey();
  if (!apiKey) {
    return { verified: false, working: false, meaningful: false };
  }
  try {
    const res = await fetch(`${zauthBackend()}/api/verification/check`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return { verified: false, working: false, meaningful: false };
    const data = (await res.json()) as {
      verified?: boolean;
      working?: boolean;
      meaningful?: boolean;
      checkedAt?: string;
      uptime?: number;
    };
    return {
      verified: data.verified ?? false,
      working: data.working ?? false,
      meaningful: data.meaningful ?? false,
      lastChecked: data.checkedAt,
      uptime: data.uptime,
    };
  } catch {
    return { verified: false, working: false, meaningful: false };
  }
}

function generateEventId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function generateBatchId(): string {
  return `batch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function eventBase(type: string, apiKey: string) {
  return {
    eventId: generateEventId(),
    timestamp: new Date().toISOString(),
    type,
    apiKey,
    sdkVersion: SDK_VERSION,
  };
}

function truncateBody(body: unknown, max = 8_000): unknown {
  if (body === undefined || body === null) return body;
  try {
    const s = JSON.stringify(body);
    if (s.length <= max) return body;
    return { _truncated: true, _preview: s.slice(0, max) };
  } catch {
    return { _truncated: true };
  }
}

function validateConciergeStyleBody(body: unknown, statusCode: number): {
  valid: boolean;
  meaningfulnessScore: number;
  reason?: string;
} {
  if (statusCode >= 500) {
    return { valid: false, meaningfulnessScore: 0, reason: "server_error" };
  }
  if (statusCode === 402) {
    return { valid: true, meaningfulnessScore: 1, reason: "payment_required" };
  }
  if (statusCode < 200 || statusCode >= 300) {
    return { valid: false, meaningfulnessScore: 0.2, reason: `http_${statusCode}` };
  }
  if (!body || typeof body !== "object") {
    return { valid: false, meaningfulnessScore: 0, reason: "empty_body" };
  }
  const o = body as Record<string, unknown>;
  if (o.error) {
    return { valid: false, meaningfulnessScore: 0.1, reason: String(o.error) };
  }
  if (o.reply || o.title || o.signalId || o.published) {
    return { valid: true, meaningfulnessScore: 0.95 };
  }
  return { valid: true, meaningfulnessScore: 0.7 };
}

/** Fire-and-forget provider telemetry for a completed paid x402 route. */
export function scheduleZauthProviderReport(options: {
  request: Request;
  resourceUrl: string;
  statusCode: number;
  responseBody: unknown;
  responseTimeMs: number;
  payer?: string;
  transaction?: string;
  paymentResponseHeader?: string | null;
  expectedResponse?: string;
}): void {
  const apiKey = zauthApiKey();
  if (!apiKey) return;

  void (async () => {
    try {
      await submitZauthProviderExchange({ ...options, apiKey });
    } catch (e) {
      console.error("[zauth] report", e instanceof Error ? e.message : e);
    }
  })();
}

async function submitZauthProviderExchange(options: {
  apiKey: string;
  request: Request;
  resourceUrl: string;
  statusCode: number;
  responseBody: unknown;
  responseTimeMs: number;
  payer?: string;
  transaction?: string;
  paymentResponseHeader?: string | null;
  expectedResponse?: string;
}): Promise<void> {
  const {
    apiKey,
    request,
    resourceUrl,
    statusCode,
    responseBody,
    responseTimeMs,
    payer,
    transaction,
    paymentResponseHeader,
    expectedResponse,
  } = options;

  const validation = validateConciergeStyleBody(responseBody, statusCode);
  const requestEvent = {
    ...eventBase("request", apiKey),
    type: "request" as const,
    url: resourceUrl,
    baseUrl: resourceUrl.split("?")[0],
    method: request.method,
    headers: { "content-type": request.headers.get("content-type") || "application/json" },
    queryParams: {},
    body: undefined,
    requestSize: 0,
    userAgent: request.headers.get("user-agent") || undefined,
    paymentHeader:
      request.headers.get("payment-signature") ||
      request.headers.get("PAYMENT-SIGNATURE") ||
      undefined,
  };

  const responseEvent = {
    ...eventBase("response", apiKey),
    type: "response" as const,
    requestEventId: requestEvent.eventId,
    url: resourceUrl,
    statusCode,
    headers: { "content-type": "application/json" },
    body: truncateBody(responseBody),
    responseSize: JSON.stringify(responseBody ?? {}).length,
    responseTimeMs,
    success: validation.valid,
    meaningful: validation.meaningfulnessScore >= 0.7,
    validationResult: validation,
    errorMessage: validation.reason,
    expectedResponse,
  };

  const events: Record<string, unknown>[] = [requestEvent, responseEvent];

  if (payer && statusCode >= 200 && statusCode < 300) {
    let payNetwork = "base";
    if (paymentResponseHeader) {
      try {
        const json =
          typeof atob !== "undefined"
            ? atob(paymentResponseHeader)
            : "";
        const decoded = json ? (JSON.parse(json) as { network?: string }) : null;
        if (decoded?.network) payNetwork = decoded.network;
      } catch {
        /* ignore */
      }
    }
    events.push({
      ...eventBase("payment", apiKey),
      type: "payment",
      requestEventId: requestEvent.eventId,
      url: resourceUrl,
      network: payNetwork,
      transactionHash: transaction || "",
      amountPaid: "0",
      amountPaidUsdc: "0",
      payTo: "",
      asset: "USDC",
      payer,
      scheme: "exact",
    });
  }

  const res = await fetch(`${zauthBackend()}/api/sdk/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
      "X-SDK-Version": SDK_VERSION,
      "X-Environment": process.env.VERCEL_ENV || "production",
    },
    body: JSON.stringify({
      events,
      batchId: generateBatchId(),
      sentAt: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`zauth events HTTP ${res.status}: ${t.slice(0, 120)}`);
  }
}
