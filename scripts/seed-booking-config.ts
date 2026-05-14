// One-time seed: write the singleton `config/booking` document with the
// default slot template and booking constraints. Idempotent: skips if a
// config already exists, unless --force is passed.
//
// Run with:
//   PowerShell> Get-Content .env.local | ForEach-Object { if ($_ -match '^([^#][^=]*)=(.*)$') { [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process') } }
//   PowerShell> npx tsx scripts/seed-booking-config.ts --dry
//   PowerShell> npx tsx scripts/seed-booking-config.ts
//   PowerShell> npx tsx scripts/seed-booking-config.ts --force   # overwrite existing config

import { adminDb } from "../src/services/firebaseAdmin";
import type { BookingConfig } from "../src/types";

const DRY_RUN = process.argv.includes("--dry");
const FORCE = process.argv.includes("--force");

const DEFAULT_CONFIG: BookingConfig = {
  slots: [
    { start: "07:00", end: "08:00" },
    { start: "08:00", end: "09:00" },
    { start: "09:00", end: "10:00" },
  ],
  maxAdvanceDays: 7,
  timezone: "Asia/Kolkata",
};

async function run() {
  console.log(`[seed-config] mode=${DRY_RUN ? "DRY" : "WRITE"} force=${FORCE}`);

  const ref = adminDb.collection("config").doc("booking");
  const snap = await ref.get();

  if (snap.exists && !FORCE) {
    console.log("[seed-config] config/booking already exists — skipping. Use --force to overwrite.");
    console.log("[seed-config] current value:", JSON.stringify(snap.data(), null, 2));
    return;
  }

  const payload = {
    ...DEFAULT_CONFIG,
    updatedAt: new Date().toISOString(),
    updatedBy: "seed-script",
  };

  console.log(`[seed-config] ${snap.exists ? "overwriting" : "creating"} config/booking with:`);
  console.log(JSON.stringify(payload, null, 2));

  if (!DRY_RUN) {
    await ref.set(payload, { merge: false });
    console.log("[seed-config] wrote config/booking");
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed-config] fatal", err);
    process.exit(1);
  });
