/** Edge-safe Privy config presence (no SDK imports). */

type PrivyAppConfigResponse = {
  email_auth?: boolean;
  google_oauth?: boolean;
};

let loginMethodsCache: { at: number; methods: string[] } | null = null;
const LOGIN_METHODS_CACHE_MS = 60_000;

export function privyAppId(): string | null {
  const id = process.env.PRIVY_APP_ID?.trim();
  return id || null;
}

export function privyClientId(): string | null {
  const id = process.env.PRIVY_CLIENT_ID?.trim();
  return id || null;
}

export function isPrivyEnabled(): boolean {
  return !!(privyAppId() && privyClientId());
}

async function fetchPrivyLoginMethods(appId: string): Promise<string[]> {
  const now = Date.now();
  if (loginMethodsCache && now - loginMethodsCache.at < LOGIN_METHODS_CACHE_MS) {
    return loginMethodsCache.methods;
  }

  try {
    const res = await fetch(`https://auth.privy.io/api/v1/apps/${appId}`, {
      headers: { "privy-app-id": appId },
    });
    if (!res.ok) return ["email"];
    const data = (await res.json()) as PrivyAppConfigResponse;
    const methods: string[] = [];
    if (data.email_auth) methods.push("email");
    if (data.google_oauth) methods.push("google");
    loginMethodsCache = { at: now, methods };
    return methods;
  } catch {
    return ["email"];
  }
}

export async function getPublicPrivyConfig() {
  const appId = privyAppId();
  const clientId = privyClientId();
  const enabled = !!(appId && clientId);
  const loginMethods = enabled && appId ? await fetchPrivyLoginMethods(appId) : [];
  return {
    enabled,
    appId: appId ?? undefined,
    clientId: clientId ?? undefined,
    loginMethods,
    embeddedWallets: {
      solana: true,
      ethereum: true,
    },
    docsUrl: "https://docs.privy.io/",
    dashboardUrl: "https://dashboard.privy.io/",
  };
}
