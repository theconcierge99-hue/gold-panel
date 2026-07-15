/** x402 PAYMENT-REQUIRED / PAYMENT-SIGNATURE helpers (base64 JSON). */

export type X402Accept = {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds?: number;
  extra?: Record<string, unknown>;
};

export type PaymentRequiredPayload = {
  x402Version?: number;
  accepts?: X402Accept[];
  resource?: string;
  error?: string;
  [key: string]: unknown;
};

export function b64EncodeJson(value: unknown): string {
  const json = JSON.stringify(value);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(json, "utf-8").toString("base64");
  }
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export function b64DecodeJson<T>(header: string): T | null {
  try {
    let json: string;
    if (typeof Buffer !== "undefined") {
      json = Buffer.from(header, "base64").toString("utf-8");
    } else {
      const binary = atob(header);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      json = new TextDecoder().decode(bytes);
    }
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export function parsePaymentRequired(header: string | null | undefined): PaymentRequiredPayload | null {
  if (!header) return null;
  return b64DecodeJson<PaymentRequiredPayload>(header);
}
