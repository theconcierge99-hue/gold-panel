import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["lib/x402-browser-client.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2020"],
  outfile: "public/js/x402-pay.mjs",
  minify: true,
  sourcemap: false,
  logLevel: "info",
});

console.log("Built public/js/x402-pay.mjs");
