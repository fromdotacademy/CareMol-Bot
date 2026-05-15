// One-time cleanup: collapse duplicate patient profiles that share the same
// phone account AND the same (case-insensitive, whitespace-collapsed) name.
//
// Strategy:
//   1. Walk every patient document via collection-group query.
//   2. Group by `userId + normalize(name)`.
//   3. For each group with >1 doc:
//        - Keep the earliest-created record as the survivor.
//        - Merge non-empty fields from the duplicates onto the survivor
//          (so address/age/gender supplied later are not lost).
//        - Rewrite every booking with `patientId in <duplicate ids>` to point
//          at the survivor's id.
//        - Delete the duplicate patient docs.
//   4. Print a summary.
//
// Default mode is DRY — no writes. Pass `--apply` to actually mutate Firestore.
//
// Run from project root after pre-loading env into the shell:
//   PowerShell> Get-Content .env | ForEach-Object { if ($_ -match '^([^#][^=]*)=(.*)$') { [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process') } }
//   PowerShell> npx tsx scripts/dedup-patients.ts            # dry run
//   PowerShell> npx tsx scripts/dedup-patients.ts --apply    # actually write

import { adminDb } from "../src/services/firebaseAdmin";

const APPLY = process.argv.includes("--apply");

interface PatientDoc {
  id: string;
  userId: string;
  name?: string;
  age?: number;
  gender?: "Male" | "Female" | "Other";
  phone?: string;
  address?: string;
  createdAt?: string;
  updatedAt?: string;
  _ref: FirebaseFirestore.DocumentReference;
}

function normalize(name: string): string {
  return (name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function pickEarliest(a: PatientDoc, b: PatientDoc): PatientDoc {
  const ta = a.createdAt || a.updatedAt || "";
  const tb = b.createdAt || b.updatedAt || "";
  if (!ta && !tb) return a;
  if (!ta) return b;
  if (!tb) return a;
  return ta <= tb ? a : b;
}

async function main() {
  console.log(`[dedup] mode=${APPLY ? "APPLY (writing)" : "DRY (no writes)"}`);

  const snap = await adminDb.collectionGroup("patients").get();
  const all: PatientDoc[] = snap.docs.map((d) => {
    const data = d.data() as Omit<PatientDoc, "_ref">;
    return { ...data, _ref: d.ref, id: data.id || d.id };
  });
  console.log(`[dedup] scanned ${all.length} patient documents`);

  // Group by userId + normalized name.
  const groups = new Map<string, PatientDoc[]>();
  for (const p of all) {
    if (!p.userId) continue;
    const nname = normalize(p.name || "");
    if (!nname) continue;
    const key = `${p.userId}::${nname}`;
    const list = groups.get(key) || [];
    list.push(p);
    groups.set(key, list);
  }

  const dups = [...groups.entries()].filter(([, list]) => list.length > 1);
  console.log(`[dedup] ${dups.length} group(s) have duplicates`);

  if (dups.length === 0) {
    console.log("[dedup] nothing to do");
    return;
  }

  let totalPatientsDeleted = 0;
  let totalBookingsRepointed = 0;

  for (const [key, list] of dups) {
    let survivor = list[0];
    for (const p of list.slice(1)) survivor = pickEarliest(survivor, p);
    const losers = list.filter((p) => p.id !== survivor.id);
    console.log(
      `[dedup] group="${key}" survivor=${survivor.id} losers=${losers.map((l) => l.id).join(", ")}`
    );

    // Merge non-empty fields from losers onto survivor.
    const merged: Record<string, unknown> = {};
    for (const f of ["name", "age", "gender", "phone", "address"] as const) {
      if (survivor[f] === undefined || survivor[f] === "" || survivor[f] === null) {
        for (const l of losers) {
          const v = l[f];
          if (v !== undefined && v !== "" && v !== null) {
            merged[f] = v;
            break;
          }
        }
      }
    }

    // Repoint bookings.
    const loserIds = losers.map((l) => l.id);
    let pointed = 0;
    if (loserIds.length > 0) {
      // Firestore "in" supports up to 30 values per query. With our scale (<<30 dups per group)
      // a single query is fine; if you ever exceed it, batch the loserIds in chunks of 10.
      const bsnap = await adminDb
        .collection("bookings")
        .where("patientId", "in", loserIds.slice(0, 30))
        .get();
      for (const b of bsnap.docs) {
        if (APPLY) {
          await b.ref.update({ patientId: survivor.id });
        }
        pointed += 1;
      }
    }
    totalBookingsRepointed += pointed;
    console.log(`[dedup]   bookings re-pointed: ${pointed}`);

    if (Object.keys(merged).length > 0) {
      console.log(`[dedup]   survivor merge fields: ${JSON.stringify(merged)}`);
      if (APPLY) {
        await survivor._ref.set(
          { ...merged, updatedAt: new Date().toISOString() },
          { merge: true }
        );
      }
    }

    // Delete losers.
    for (const l of losers) {
      if (APPLY) await l._ref.delete();
      totalPatientsDeleted += 1;
    }
  }

  console.log("[dedup] —— summary ——");
  console.log(`  duplicate groups:     ${dups.length}`);
  console.log(`  patient docs removed: ${totalPatientsDeleted}`);
  console.log(`  bookings re-pointed:  ${totalBookingsRepointed}`);
  console.log(`  mode:                 ${APPLY ? "APPLIED" : "DRY (re-run with --apply to write)"}`);
}

main().catch((e) => {
  console.error("[dedup] failed:", e);
  process.exit(1);
});
