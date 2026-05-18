// One-time backfill: any booking with `status='Created'` AND a non-null
// `assignedTo` is invisible to both phleb tabs (Unassigned filters out anything
// with assignedTo set; Assigned filters out Created status). Flip those to
// `status='Assigned'` so they land in the phleb's queue.
//
// Run with:
//   PowerShell> Get-Content .env | ForEach-Object { if ($_ -match '^([^#][^=]*)=(.*)$') { [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process') } }
//   PowerShell> npx tsx scripts/backfill-status-assigned.ts --dry
//   PowerShell> npx tsx scripts/backfill-status-assigned.ts

import { adminDb } from "../src/services/firebaseAdmin";

const DRY_RUN = process.argv.includes("--dry");

async function run() {
  console.log(`[backfill-status] mode=${DRY_RUN ? "DRY" : "WRITE"}`);
  const snap = await adminDb
    .collection("bookings")
    .where("status", "==", "Created")
    .get();
  console.log(`[backfill-status] scanning ${snap.size} Created bookings`);

  let fixed = 0;
  let skipped = 0;

  for (const d of snap.docs) {
    const b = d.data() as { assignedTo?: string | null; assignedToName?: string | null };
    if (!b.assignedTo) {
      skipped++;
      continue;
    }
    console.log(
      `[backfill-status] fix ${d.id} — assignedTo=${b.assignedTo} (${b.assignedToName || "?"}) status: Created -> Assigned`
    );
    if (!DRY_RUN) {
      await adminDb.collection("bookings").doc(d.id).update({ status: "Assigned" });
    }
    fixed++;
  }

  console.log(`\n[backfill-status] done: fixed=${fixed} alreadyOk=${skipped}`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[backfill-status] fatal", err);
    process.exit(1);
  });
