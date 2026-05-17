/**
 * Isolated AI parser sanity test (DeepSeek).
 *
 * Purpose: call `parsePatientDetails` once with a hardcoded message so any failure
 * is purely the DeepSeek SDK call — no WhatsApp, no webhook, no session, no Firestore.
 *
 * Usage:
 *   npx tsx scripts/test-ai-parser.ts
 *
 * If env vars don't load via `dotenv/config` (see CLAUDE.md's tsx+dotenv timing note),
 * pre-load them in PowerShell first:
 *
 *   Get-Content .env | ForEach-Object {
 *     if ($_ -match '^([^#][^=]*)=(.*)$') {
 *       [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process')
 *     }
 *   }
 *   npx tsx scripts/test-ai-parser.ts
 *
 * Expected output on success:
 *   Key present: true   keyLen: 35
 *   [ai] parsePatientDetails called, input length: 21
 *   Result: { name: 'Jafer', age: 35, phone: '9876543210', ... }
 */

import "dotenv/config";
import { parsePatientDetails } from "../src/services/aiParserService";

(async () => {
  console.log("Key present:", Boolean(process.env.DEEPSEEK_API_KEY), " keyLen:", (process.env.DEEPSEEK_API_KEY || "").length);

  const sample = "Jafer, 35, 9876543210";
  const result = await parsePatientDetails(sample);

  console.log("Input :", sample);
  console.log("Result:", result);

  if (!result) {
    console.error("\nparsePatientDetails returned null — check the AI CALL FAILED block above.");
    process.exit(1);
  }

  console.log("\nDeepSeek is reachable and parsing successfully.");
  process.exit(0);
})();
