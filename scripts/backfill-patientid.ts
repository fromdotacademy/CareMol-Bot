// One-time backfill: ensure every document in `bookings` has a valid `patientId`.
//
// Strategy:
//   1. For each booking missing `patientId`, look under users/{booking.userId}/patients
//      for a patient whose `name` (case-insensitive) matches `patientName`.
//      If multiple match, pick the most recently updated/created.
//   2. If no match exists, create a new patient profile from the booking's
//      denormalized fields (name/age/gender/phone/address) and link to it.
//
// Run with:
//   PowerShell> Get-Content .env.local | ForEach-Object { if ($_ -match '^([^#][^=]*)=(.*)$') { [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process') } }
//   PowerShell> npx tsx scripts/backfill-patientid.ts --dry
//   PowerShell> npx tsx scripts/backfill-patientid.ts

import { adminDb } from "../src/services/firebaseAdmin";
import { generateId } from "../src/lib/utils";

const DRY_RUN = process.argv.includes("--dry");

interface BookingDoc {
  bookingId: string;
  userId: string;
  patientId?: string;
  patientName?: string;
  patientAge?: number;
  patientGender?: "Male" | "Female" | "Other";
  patientPhone?: string;
  patientAddress?: string;
}

async function findMatchingPatient(userId: string, name: string): Promise<string | null> {
  if (!userId || !name) return null;
  const snap = await adminDb.collection("users").doc(userId).collection("patients").get();
  const target = name.trim().toLowerCase();
  const matches = snap.docs
    .map((d) => d.data())
    .filter((p) => typeof p.name === "string" && p.name.trim().toLowerCase() === target);
  if (matches.length === 0) return null;
  matches.sort((a, b) => {
    const ta = a.updatedAt || a.createdAt || "";
    const tb = b.updatedAt || b.createdAt || "";
    return tb.localeCompare(ta);
  });
  return matches[0].id;
}

async function createPatientFromBooking(booking: BookingDoc): Promise<string> {
  const patientId = generateId("PT");
  const now = new Date().toISOString();
  const payload: any = {
    id: patientId,
    userId: booking.userId,
    name: booking.patientName || "Unknown",
    age: booking.patientAge || 0,
    gender: booking.patientGender || "Other",
    phone: booking.patientPhone || "",
    address: booking.patientAddress || "",
    createdAt: now,
    updatedAt: now,
    backfilled: true,
  };
  if (!DRY_RUN) {
    await adminDb
      .collection("users")
      .doc(booking.userId)
      .collection("patients")
      .doc(patientId)
      .set(payload, { merge: true });
  }
  return patientId;
}

async function run() {
  console.log(`[backfill] mode=${DRY_RUN ? "DRY" : "WRITE"}`);
  const snap = await adminDb.collection("bookings").get();
  console.log(`[backfill] scanning ${snap.size} bookings`);

  let linked = 0;
  let created = 0;
  let skippedOk = 0;
  let skippedBad = 0;

  for (const d of snap.docs) {
    const b = { bookingId: d.id, ...(d.data() as Omit<BookingDoc, "bookingId">) };

    if (b.patientId) {
      skippedOk++;
      continue;
    }
    if (!b.userId || !b.patientName) {
      console.warn(`[backfill] skip ${b.bookingId} — missing userId or patientName`);
      skippedBad++;
      continue;
    }

    let pid = await findMatchingPatient(b.userId, b.patientName);
    if (pid) {
      linked++;
      console.log(`[backfill] link  ${b.bookingId} -> ${pid} (matched by name)`);
    } else {
      pid = await createPatientFromBooking(b);
      created++;
      console.log(`[backfill] create ${b.bookingId} -> ${pid} (new profile)`);
    }

    if (!DRY_RUN) {
      await adminDb.collection("bookings").doc(b.bookingId).update({ patientId: pid });
    }
  }

  console.log(
    `\n[backfill] done: linked=${linked} created=${created} alreadyOk=${skippedOk} skipped=${skippedBad}`
  );
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[backfill] fatal", err);
    process.exit(1);
  });
