/** Edge-safe Privy config presence (no SDK imports). */

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

export function getPublicPrivyConfig() {
  const appId = privyAppId();
  const clientId = privyClientId();
  return {
    enabled: !!(appId && clientId),
    appId: appId ?? undefined,
    clientId: clientId ?? undefined,
    loginMethods: ["email", "google"] as const, // OAuth UI: Google only; email via More
    embeddedWallets: {
      solana: true,
      ethereum: true,
    },
    docsUrl: "https://docs.privy.io/",
    dashboardUrl: "https://dashboard.privy.io/",
  };
}
