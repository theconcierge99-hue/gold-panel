/** TCX mint — post-launch (Pump.fun fair launch). */
window.TCX_MINT = "F2bnJW1z55UQ9ZqGX5RwYQfvNJrd23n66eyBV5QZpump";
window.TCX_LINKS = {
  pump: "https://pump.fun/coin/F2bnJW1z55UQ9ZqGX5RwYQfvNJrd23n66eyBV5QZpump",
  solscan: "https://solscan.io/token/F2bnJW1z55UQ9ZqGX5RwYQfvNJrd23n66eyBV5QZpump",
  dex: "https://dexscreener.com/solana/F2bnJW1z55UQ9ZqGX5RwYQfvNJrd23n66eyBV5QZpump",
};
window.copyTcxCa = function (btn) {
  const mint = window.TCX_MINT;
  if (!mint || !navigator.clipboard) return;
  navigator.clipboard.writeText(mint).then(function () {
    const prev = btn ? btn.textContent : "";
    if (btn) btn.textContent = "Copied";
    if (typeof window.toast === "function") window.toast("Contract address copied");
    setTimeout(function () {
      if (btn) btn.textContent = prev || "Copy CA";
    }, 2000);
  });
};
