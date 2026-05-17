/**
 * Isolated Gemini sanity test.
 *
 * Purpose: call `parsePatientDetails` once with a hardcoded message so any failure
 * is purely the Gemini SDK call — no WhatsApp, no webhook, no session, no Firestore.
 *
 * Usage:
 *   npx tsx scripts/test-gemini.ts
 *
 * If env vars don't load via `dotenv/config` (see CLAUDE.md's tsx+dotenv timing note),
 * pre-load them in PowerShell first:
 *
 *   Get-Content .env | ForEach-Object {
 *     if ($_ -match '^([^#][^=]*)=(.*)$') {
 *       [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process')
 *     }
 *   }
 *   npx tsx scripts/test-gemini.ts
 *
 * Expected output on success:
 *   Key present: true   keyLen: 39
 *   [gemini] parsePatientDetails called, input length: 28
 *   Result: { name: 'Jafer', age: 35, phone: '9876543210', ... }
 *
 * Expected output on failure: a "===== GEMINI CALL FAILED =====" block whose
 * `status` / `name` field names the failure mode (404 = bad model, 401/403 = bad
 * key, 429 = quota, ENOTFOUND = network).
 */

import "dotenv/config";
import { parsePatientDetails } from "../src/services/geminiService";

(async () => {
  console.log("Key present:", Boolean(process.env.GEMINI_API_KEY), " keyLen:", (process.env.GEMINI_API_KEY || "").length);

  const sample = "Jafer, 35, 9876543210";
  const result = await parsePatientDetails(sample);

  console.log("Input :", sample);
  console.log("Result:", result);

  if (!result) {
    console.error("\nparsePatientDetails returned null — check the GEMINI CALL FAILED block above.");
    process.exit(1);
  }

  console.log("\nGemini is reachable and parsing successfully.");
  process.exit(0);
})();
