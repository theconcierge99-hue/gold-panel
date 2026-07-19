/** Playground wallet — shares el-wallet session with Executive Lounge. */

export const WALLET_KEY = "el-wallet";

export const WALLET_PROVIDERS = {
  phantom: {
    label: "Phantom",
    sol: () => window.phantom?.solana ?? window.solana ?? null,
    evm: () => window.phantom?.ethereum ?? null,
  },
  okx: {
    label: "OKX Wallet",
    sol: () => window.okxwallet?.solana ?? null,
    evm: () => window.okxwallet?.ethereum ?? null,
  },
};

export function loadWalletSession() {
  try {
    return JSON.parse(localStorage.getItem(WALLET_KEY) || "{}");
  } catch {
    return {};
  }
}

export function saveWalletSession(session) {
  localStorage.setItem(WALLET_KEY, JSON.stringify(session));
}

export function getWalletSession() {
  const s = loadWalletSession();
  return { sol: s.sol || null, evm: s.evm || null };
}

export function shortAddr(addr, chain = "sol") {
  if (!addr) return "";
  if (chain === "sol") return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
  const a = addr.startsWith("0x") ? addr : `0x${addr}`;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function getSolanaProvider(session = getWalletSession()) {
  if (session.sol?.wallet === "privy") {
    return window.__elPrivy?.getSolanaSigner?.() ?? null;
  }
  if (session.sol?.wallet === "okx") return WALLET_PROVIDERS.okx.sol();
  return WALLET_PROVIDERS.phantom.sol();
}

export async function connectSolanaWallet(providerId = "phantom") {
  const cfg = WALLET_PROVIDERS[providerId] || WALLET_PROVIDERS.phantom;
  const provider = cfg.sol();
  if (!provider?.connect) {
    throw new Error(`${cfg.label} not found — install the extension or open in wallet browser`);
  }
  const res = await provider.connect();
  const pk = res?.publicKey || provider.publicKey;
  if (!pk) throw new Error("Connection cancelled");
  const address = typeof pk === "string" ? pk : pk.toString();
  const session = loadWalletSession();
  session.sol = { wallet: providerId, address, connectedAt: Date.now() };
  saveWalletSession(session);
  return session.sol;
}

async function connectEvmWallet(providerId = "phantom") {
  const cfg = WALLET_PROVIDERS[providerId] || WALLET_PROVIDERS.phantom;
  const provider = cfg.evm?.();
  if (!provider?.request) {
    throw new Error(`${cfg.label} EVM not available — update the extension or reconnect on Lounge`);
  }
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  if (!accounts?.[0]) throw new Error("EVM connection cancelled");
  const session = loadWalletSession();
  session.evm = { wallet: providerId, address: accounts[0], connectedAt: Date.now() };
  saveWalletSession(session);
  return session.evm;
}

export async function connectWalletPair(providerId = "phantom") {
  const errors = [];
  let sol = null;
  let evm = null;
  try {
    sol = await connectSolanaWallet(providerId);
  } catch (e) {
    errors.push(`SOL: ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    evm = await connectEvmWallet(providerId);
  } catch (e) {
    errors.push(`EVM: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!sol && !evm) {
    throw new Error(errors.join(" · ") || "Wallet connection failed");
  }
  return { sol, evm, warnings: errors };
}

export function disconnectSolanaWallet() {
  const session = loadWalletSession();
  delete session.sol;
  saveWalletSession(session);
}

/** Mirror Executive Lounge x402ServerPayConfig for createX402PaidFetch. */
export function x402ServerPayConfigFromApi(cfg) {
  const tp = cfg?.tokenPay || {};
  const def = tp.default || {};
  const merchants = Array.isArray(tp.merchants)
    ? tp.merchants.map((m) => ({
        id: m.id,
        symbol: m.symbol,
        name: m.name,
        mint: m.mint,
        decimals: m.decimals,
        live: m.live,
        usdcRate: m.usdcRate,
        conciergeAtomic: m.conciergeAtomic,
        comingSoonMessage: m.comingSoonMessage,
        merchantTokenAta: m.merchantTokenAta,
      }))
    : [];
  return {
    acceptsEvm: !!cfg.acceptsEvm,
    acceptsArbitrum: !!cfg.acceptsArbitrum,
    acceptsRobinhood: !!cfg.acceptsRobinhood,
    robinhoodUsdg: cfg.robinhoodUsdg || undefined,
    robinhoodNetwork: cfg.robinhoodNetwork || undefined,
    evmNetworks: cfg.evmNetworks,
    acceptsSol: !!cfg.acceptsSol,
    evmPayToReady: !!cfg.evmPayToReady,
    solPayToReady: !!cfg.solPayToReady,
    hasCustomSolRpc: !!cfg.hasCustomSolRpc,
    solPayTo: cfg.solPayTo || undefined,
    evmPayTo: cfg.evmPayTo || undefined,
    solMerchantUsdcAta: cfg.solMerchantUsdcAta,
    tokenMerchants: merchants,
    tokenPaySymbol: cfg.tokenPaySymbol || def.symbol || "TCX",
    acceptsTokenPaySol: !!(cfg.acceptsTokenPaySol ?? cfg.acceptsSoonSol),
    tokenPayMint: cfg.tokenPayMint || cfg.soonMint || def.mint || undefined,
    tokenUsdcRate: cfg.tokenUsdcRate ?? cfg.soonUsdcRate,
    tokenConciergeAtomic: cfg.tokenConciergeAtomic || cfg.soonConciergeAtomic || def.conciergeAtomic,
    solMerchantTokenAta: cfg.solMerchantTokenAta ?? cfg.solMerchantSoonAta,
    tokenComingSoonMessage: def.comingSoonMessage,
    acceptsSoonSol: !!(cfg.acceptsTokenPaySol ?? cfg.acceptsSoonSol),
    soonMint: cfg.tokenPayMint || cfg.soonMint || undefined,
    soonUsdcRate: cfg.tokenUsdcRate ?? cfg.soonUsdcRate,
    soonConciergeAtomic: cfg.tokenConciergeAtomic || cfg.soonConciergeAtomic,
    solMerchantSoonAta: cfg.solMerchantTokenAta ?? cfg.solMerchantSoonAta,
  };
}

export function paidFetchOptionsForRail(rail) {
  if (rail === "sol") return { preferredChain: "sol" };
  if (rail === "tcx") return { preferredChain: "soon", preferredTokenMerchantId: "soon" };
  if (rail === "arbitrum") return { preferredChain: "arbitrum" };
  if (rail === "robinhood") return { preferredChain: "robinhood" };
  if (rail === "evm" || rail === "base") return { preferredChain: "base" };
  return {};
}
