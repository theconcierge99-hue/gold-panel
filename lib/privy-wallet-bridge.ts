/**
 * Privy embedded-wallet bridge for Executive Lounge (vanilla JS).
 * @see https://docs.privy.io/recipes/core-js
 */
import Privy, {
  LocalStorage,
  getEntropyDetailsFromUser,
  getUserEmbeddedEthereumWallet,
  getUserEmbeddedSolanaWallet,
  type EIP1193Provider,
  type PrivyEmbeddedSolanaWalletProvider,
} from "@privy-io/js-sdk-core";
import type { VersionedTransaction } from "@solana/web3.js";

export type PrivyWalletAddresses = {
  sol?: string;
  evm?: string;
};

type PrivyBridgeState = {
  enabled: boolean;
  loggingIn: boolean;
};

let client: Privy | null = null;
let lastInitError: string | null = null;
let iframe: HTMLIFrameElement | null = null;
let messageListener: ((e: MessageEvent) => void) | null = null;
let evmProvider: EIP1193Provider | null = null;
let solProvider: PrivyEmbeddedSolanaWalletProvider | null = null;
let evmAddress: string | null = null;
let solAddress: string | null = null;

const state: PrivyBridgeState = { enabled: false, loggingIn: false };

function isBenignPrivySessionError(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return (
    msg.includes("no tokens found") ||
    msg.includes("not authenticated") ||
    msg.includes("must_be_authenticated") ||
    msg.includes("no session")
  );
}

function privyUnavailableError(): Error {
  if (lastInitError) {
    const host = typeof window !== "undefined" ? window.location.host : "your domain";
    const domainHint = /origin|domain|allowed|cors/i.test(lastInitError)
      ? ` Add https://${host} in Privy Dashboard → Domains.`
      : "";
    return new Error(`Privy login failed: ${lastInitError}.${domainHint}`);
  }
  return new Error(
    "Privy is not configured — set PRIVY_APP_ID and PRIVY_CLIENT_ID in Vercel, then redeploy.",
  );
}

function redirectUri(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}${window.location.pathname}`;
}

function mountSecureContext(privy: Privy): void {
  if (iframe) return;
  iframe = document.createElement("iframe");
  iframe.src = privy.embeddedWallet.getURL();
  iframe.style.display = "none";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);
  const poster = iframe.contentWindow;
  if (!poster) throw new Error("Privy secure context failed to load");
  privy.setMessagePoster(poster as unknown as Parameters<Privy["setMessagePoster"]>[0]);
  messageListener = (e: MessageEvent) => {
    if (e.source !== iframe?.contentWindow) return;
    const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
    privy.embeddedWallet.onMessage(data);
  };
  window.addEventListener("message", messageListener);
}

async function ensureEmbeddedWallets(privy: Privy): Promise<void> {
  let { user } = await privy.user.get();
  if (!user) throw new Error("Privy session missing after login");

  let ethWallet = getUserEmbeddedEthereumWallet(user);
  if (!ethWallet) {
    const solAccount = getUserEmbeddedSolanaWallet(user) ?? undefined;
    const session = await privy.embeddedWallet.create({ solanaAccount: solAccount });
    user = session.user;
    ethWallet = getUserEmbeddedEthereumWallet(user);
  }

  let solWallet = getUserEmbeddedSolanaWallet(user);
  if (!solWallet) {
    const session = await privy.embeddedWallet.createSolana({
      ethereumAccount: ethWallet ?? undefined,
    });
    user = session.user;
    solWallet = getUserEmbeddedSolanaWallet(user);
  }

  const entropy = getEntropyDetailsFromUser(user);
  if (!entropy) throw new Error("Privy wallet entropy unavailable");

  if (ethWallet) {
    evmAddress = ethWallet.address;
    evmProvider = await privy.embeddedWallet.getEthereumProvider({
      wallet: ethWallet,
      entropyId: entropy.entropyId,
      entropyIdVerifier: entropy.entropyIdVerifier,
    });
  } else {
    evmAddress = null;
    evmProvider = null;
  }

  if (solWallet) {
    solAddress = solWallet.address;
    solProvider = await privy.embeddedWallet.getSolanaProvider(
      solWallet,
      entropy.entropyId,
      entropy.entropyIdVerifier,
    );
  } else {
    solAddress = null;
    solProvider = null;
  }
}

async function initPrivy(): Promise<boolean> {
  if (state.enabled && client) return true;
  lastInitError = null;
  try {
    const res = await fetch("/api/privy-config", { cache: "no-store" });
    if (!res.ok) {
      lastInitError = `privy-config HTTP ${res.status}`;
      return false;
    }
    const cfg = (await res.json()) as { enabled?: boolean; appId?: string; clientId?: string };
    if (!cfg.enabled || !cfg.appId || !cfg.clientId) {
      return false;
    }

    client = new Privy({
      appId: cfg.appId,
      clientId: cfg.clientId,
      storage: new LocalStorage(),
    });
    await client.initialize();
    mountSecureContext(client);

    const oauthHandled = await handleOAuthCallback();
    if (!oauthHandled) {
      try {
        const { user } = await client.user.get();
        if (user) await ensureEmbeddedWallets(client).catch(() => undefined);
      } catch (e) {
        if (!isBenignPrivySessionError(e)) throw e;
      }
    }

    state.enabled = true;
    lastInitError = null;
    return true;
  } catch (e) {
    if (client && isBenignPrivySessionError(e)) {
      state.enabled = true;
      lastInitError = null;
      return true;
    }
    console.warn("[privy] init failed", e);
    lastInitError = e instanceof Error ? e.message : String(e);
    client = null;
    state.enabled = false;
    return false;
  }
}

export async function handleOAuthCallback(): Promise<boolean> {
  if (!client) return false;
  const params = new URLSearchParams(window.location.search);
  const code = params.get("privy_oauth_code");
  const oauthState = params.get("privy_oauth_state");
  if (!code || !oauthState) return false;

  state.loggingIn = true;
  try {
    await client.auth.oauth.loginWithCode(code, oauthState);
    await ensureEmbeddedWallets(client);
    params.delete("privy_oauth_code");
    params.delete("privy_oauth_state");
    const qs = params.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", next);
    return true;
  } finally {
    state.loggingIn = false;
  }
}

export async function privySendEmailCode(email: string): Promise<void> {
  if (!email.trim()) throw new Error("Enter your email");
  const ok = await initPrivy();
  if (!ok || !client) throw privyUnavailableError();
  await client.auth.email.sendCode(email.trim());
}

export async function privyLoginWithEmail(email: string, code: string): Promise<PrivyWalletAddresses> {
  if (!email.trim() || !code.trim()) throw new Error("Email and verification code required");
  const ok = await initPrivy();
  if (!ok || !client) throw privyUnavailableError();

  state.loggingIn = true;
  try {
    await client.auth.email.loginWithCode(email.trim(), code.trim());
    await ensureEmbeddedWallets(client);
    return getPrivyAddresses();
  } finally {
    state.loggingIn = false;
  }
}

export type PrivyOAuthProvider = "google" | "twitter" | "github" | "linkedin";

export async function privyLoginWithOAuth(provider: PrivyOAuthProvider): Promise<void> {
  const ok = await initPrivy();
  if (!ok || !client) throw privyUnavailableError();
  const oauth = await client.auth.oauth.generateURL(provider, redirectUri());
  const url = typeof oauth === "string" ? oauth : oauth.url;
  if (!url) throw new Error("Privy OAuth URL missing");
  window.location.assign(url);
}

export async function privyLoginWithGoogle(): Promise<void> {
  return privyLoginWithOAuth("google");
}

export function getPrivyAddresses(): PrivyWalletAddresses {
  return {
    sol: solAddress ?? undefined,
    evm: evmAddress ?? undefined,
  };
}

export async function getPrivyAddressesAsync(): Promise<PrivyWalletAddresses> {
  if (!client) return {};
  let user;
  try {
    ({ user } = await client.user.get());
  } catch (e) {
    if (isBenignPrivySessionError(e)) return {};
    throw e;
  }
  if (!user) return {};
  const eth = getUserEmbeddedEthereumWallet(user);
  const sol = getUserEmbeddedSolanaWallet(user);
  return {
    evm: eth?.address,
    sol: sol?.address,
  };
}

export function getPrivyEvmProvider(): EIP1193Provider | null {
  return evmProvider;
}

/** Phantom-compatible signer for x402 Solana exact scheme. */
export function getPrivySolanaSigner(): {
  signTransaction: (tx: unknown) => Promise<unknown>;
} | null {
  if (!solProvider) return null;
  return {
    signTransaction: async (tx: unknown) => {
      const res = await solProvider!.request({
        method: "signTransaction",
        params: { transaction: tx as VersionedTransaction },
      });
      return res.signedTransaction;
    },
  };
}

export async function privyDisconnect(): Promise<void> {
  if (client) {
    const { user } = await client.user.get();
    if (user) await client.auth.logout({ userId: user.id });
  }
  evmProvider = null;
  solProvider = null;
  evmAddress = null;
  solAddress = null;
  if (messageListener) {
    window.removeEventListener("message", messageListener);
    messageListener = null;
  }
  iframe?.remove();
  iframe = null;
  client = null;
  state.enabled = false;
}

export function isPrivyBridgeEnabled(): boolean {
  return state.enabled;
}

export function getPrivyInitError(): string | null {
  return lastInitError;
}

declare global {
  interface Window {
    __elPrivy?: {
      init: () => Promise<boolean>;
      sendEmailCode: (email: string) => Promise<void>;
      loginWithEmail: (email: string, code: string) => Promise<PrivyWalletAddresses>;
      loginWithGoogle: () => Promise<void>;
      loginWithOAuth: (provider: PrivyOAuthProvider) => Promise<void>;
      disconnect: () => Promise<void>;
      getAddresses: () => Promise<PrivyWalletAddresses>;
      getEvmProvider: () => EIP1193Provider | null;
      getSolanaSigner: () => ReturnType<typeof getPrivySolanaSigner>;
      isEnabled: () => boolean;
      getInitError: () => string | null;
      isConfigPresent: () => Promise<boolean>;
    };
  }
}

if (typeof window !== "undefined") {
  window.__elPrivy = {
    init: initPrivy,
    sendEmailCode: privySendEmailCode,
    loginWithEmail: async (email, code) => {
      await privyLoginWithEmail(email, code);
      return getPrivyAddressesAsync();
    },
    loginWithGoogle: privyLoginWithGoogle,
    loginWithOAuth: privyLoginWithOAuth,
    disconnect: privyDisconnect,
    getAddresses: getPrivyAddressesAsync,
    getEvmProvider: getPrivyEvmProvider,
    getSolanaSigner: getPrivySolanaSigner,
    isEnabled: isPrivyBridgeEnabled,
    getInitError: getPrivyInitError,
    isConfigPresent: async () => {
      try {
        const res = await fetch("/api/privy-config", { cache: "no-store" });
        if (!res.ok) return false;
        const cfg = (await res.json()) as { enabled?: boolean };
        return !!cfg.enabled;
      } catch {
        return false;
      }
    },
  };
}
