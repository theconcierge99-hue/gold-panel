/**
 * Deterministic regression checks for BNB x402 rail.
 * Run: npx tsx scripts/verify-bnb-x402.mjs
 *
 * Asserts:
 * - BNB is fail-closed by default
 * - When enabled on mainnet: eip155:56, USDT + USDC at 18d, Permit2, Dexter-pinned
 * - Both BSC assets are advertised as separate accepts, and USDC can be dropped
 * - Testnet never advertises BNB
 * - Legacy Base/Arbitrum/Solana atomic amounts stay 6-decimal
 */
import assert from "node:assert/strict";

process.env.X402_EVM_PAY_TO = "0x1111111111111111111111111111111111111111";
process.env.X402_SOL_PAY_TO = "";
delete process.env.X402_BNB_ENABLED;
process.env.X402_NETWORK_MODE = "mainnet";
process.env.X402_ARBITRUM_ENABLED = "true";
process.env.X402_ROBINHOOD_ENABLED = "false";

const pricing = await import("../backend/concierge-api/x402-pricing.ts");
const config = await import("../backend/concierge-api/x402-config.ts");
const facilitator = await import("../backend/concierge-api/x402-facilitator.ts");

function section(title) {
  console.log(`\n== ${title} ==`);
}

section("multi-decimal pricing");
assert.equal(pricing.atomicAmountForResource("concierge"), "100000");
assert.equal(pricing.atomicAmountForResourceDecimals("concierge", 6), "100000");
assert.equal(
  pricing.atomicAmountForResourceDecimals("concierge", 18),
  "100000000000000000",
);
assert.equal(
  pricing.scaleUsdcAtomicToDecimals("20000", 18),
  "20000000000000000",
);
assert.equal(pricing.usdToAtomic(0.1, 18), "100000000000000000");
console.log("ok pricing");

section("BNB fail-closed by default");
assert.equal(config.isBnbX402Enabled(), false);
assert.ok(!config.getX402EvmAcceptNetworks().includes("eip155:56"));
const pubOff = config.getPublicX402Config();
assert.equal(pubOff.acceptsBnb, false);
assert.equal(pubOff.bnbNetwork, undefined);
console.log("ok default off");

section("BNB enabled on mainnet");
process.env.X402_BNB_ENABLED = "true";
assert.equal(config.isBnbX402Enabled(), true);
const nets = config.getX402EvmAcceptNetworks();
assert.ok(nets.includes("eip155:8453"));
assert.ok(nets.includes("eip155:42161"));
assert.ok(nets.includes("eip155:56"));
assert.ok(!nets.includes("eip155:97"));

const profile = config.getSettlementAssetProfile("eip155:56");
assert.equal(profile.symbol, "USDT");
assert.equal(profile.decimals, 18);
assert.equal(profile.transferMethod, "permit2");
assert.equal(
  profile.asset.toLowerCase(),
  "0x55d398326f99059ff775485246999027b3197955",
);

const extra = config.getAcceptExtraForNetwork("eip155:56");
assert.equal(extra.assetTransferMethod, "permit2");

const bnbProfiles = config.getSettlementAssetProfiles("eip155:56");
assert.equal(bnbProfiles.length, 2, "BSC should advertise USDT and USDC");
assert.deepEqual(
  bnbProfiles.map((p) => p.symbol),
  ["USDT", "USDC"],
  "USDT must come first — it is by far the more liquid BSC stablecoin",
);
assert.equal(
  bnbProfiles[1].asset.toLowerCase(),
  "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
);
for (const p of bnbProfiles) {
  assert.equal(p.decimals, 18, `${p.symbol} on BSC must be 18 decimals`);
  assert.equal(p.transferMethod, "permit2", `${p.symbol} has no EIP-3009/2612 on BSC`);
  assert.equal(config.getAcceptExtraForAsset(p).assetTransferMethod, "permit2");
}
assert.equal(
  pricing.atomicAmountForResourceDecimals("concierge", bnbProfiles[0].decimals),
  pricing.atomicAmountForResourceDecimals("concierge", bnbProfiles[1].decimals),
  "same USD price must yield the same atomic amount for both BSC assets",
);

// Single-asset rails must not regress into multi-asset accepts.
assert.equal(config.getSettlementAssetProfiles("eip155:8453").length, 1);
assert.equal(config.getSettlementAssetProfiles("eip155:42161").length, 1);

const bnbFac = facilitator.getBnbFacilitatorProfile();
assert.equal(bnbFac.id, "dexter");
assert.equal(bnbFac.url, "https://x402.dexter.cash");

const pubOn = config.getPublicX402Config();
assert.equal(pubOn.acceptsBnb, true);
assert.equal(pubOn.bnbNetwork, "eip155:56");
assert.equal(pubOn.bnbAssetTransferMethod, "permit2");
assert.equal(pubOn.bnbFacilitator, "Dexter");
assert.equal(pubOn.bnbUsdtDecimals, 18);
assert.equal(pubOn.bnbStableDecimals, 18);
assert.equal(
  pubOn.bnbUsdc.toLowerCase(),
  "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
  "browser client needs the USDC address to offer it as a payment option",
);
console.log("ok mainnet enabled");

section("USDC on BSC can be dropped without losing the rail");
process.env.X402_BNB_USDC_ENABLED = "false";
assert.equal(config.isBnbX402Enabled(), true, "USDT alone must keep the rail alive");
const usdtOnly = config.getSettlementAssetProfiles("eip155:56");
assert.equal(usdtOnly.length, 1);
assert.equal(usdtOnly[0].symbol, "USDT");
assert.equal(config.getPublicX402Config().bnbUsdc, undefined);
delete process.env.X402_BNB_USDC_ENABLED;
assert.equal(config.getSettlementAssetProfiles("eip155:56").length, 2);
console.log("ok USDC opt-out");

section("BNB never on testnet");
process.env.X402_NETWORK_MODE = "testnet";
assert.equal(config.isBnbX402Enabled(), false);
assert.equal(config.getX402NetworkProfile().bnb, null);
assert.ok(!config.getX402EvmAcceptNetworks().includes("eip155:56"));
assert.ok(!config.getX402EvmAcceptNetworks().includes("eip155:97"));
console.log("ok testnet suppressed");

section("legacy EIP-3009 extras unchanged");
process.env.X402_NETWORK_MODE = "mainnet";
const baseExtra = config.getAcceptExtraForNetwork("eip155:8453");
assert.equal(baseExtra.name, "USD Coin");
assert.equal(baseExtra.version, "2");
assert.equal(baseExtra.assetTransferMethod, undefined);
const baseAsset = config.getSettlementAssetProfile("eip155:8453");
assert.equal(baseAsset.decimals, 6);
assert.equal(baseAsset.transferMethod, "eip3009");
console.log("ok legacy rails");

section("MPP protocols include BNB when enabled");
const protocols = facilitator.mppPaymentProtocols({
  bnb: true,
  bnbAssets: ["USDT", "USDC"],
});
const bnbProtos = protocols.filter(
  (p) => p.x402 && p.x402.network === "bnb" && p.x402.caip2 === "eip155:56",
);
assert.equal(bnbProtos.length, 2);
assert.deepEqual(
  bnbProtos.map((p) => p.x402.asset),
  ["USDT", "USDC"],
);
for (const proto of bnbProtos) {
  assert.equal(proto.x402.assetTransferMethod, "permit2");
  assert.equal(proto.x402.facilitator, "https://x402.dexter.cash");
}
// Callers that omit bnbAssets must keep the previous USDT-only behaviour.
const legacyProtos = facilitator
  .mppPaymentProtocols({ bnb: true })
  .filter((p) => p.x402 && p.x402.network === "bnb");
assert.equal(legacyProtos.length, 1);
assert.equal(legacyProtos[0].x402.asset, "USDT");
console.log("ok MPP");

section("402 extensions advertise Permit2 approval sponsoring when BNB on");
process.env.X402_BNB_ENABLED = "true";
process.env.X402_NETWORK_MODE = "mainnet";
const mpp = await import("../backend/concierge-api/mpp-discovery.ts");
const extOn = mpp.buildBazaarExtension("concierge");
assert.ok(extOn.bazaar);
assert.ok(extOn.erc20ApprovalGasSponsoring);
process.env.X402_BNB_ENABLED = "false";
const extOff = mpp.buildBazaarExtension("concierge");
assert.equal(extOff.erc20ApprovalGasSponsoring, undefined);
console.log("ok approval extension");

console.log("\nAll BNB x402 regression checks passed.");
