#!/usr/bin/env node
/** One-off self-audit runner — passive scan of conc-exe.xyz */
import { runSecurityScanAudit } from "../backend/concierge-api/concierge-security-audit.ts";

const target = process.argv[2] ?? "https://conc-exe.xyz";
const report = await runSecurityScanAudit(target, { selfAudit: true });
console.log(JSON.stringify(report, null, 2));
