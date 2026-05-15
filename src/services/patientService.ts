// Web-SDK patient profile helpers. Shared by the in-dashboard WhatsAppSimulator
// and the New Booking modal so the patient-profile invariant (every booking has
// a patientId, profiles live at users/{userId}/patients/{patientId}) is enforced
// from a single place.
//
// Mirrors upsertPatientProfile() in src/services/botLogic.ts which does the same
// thing through the Admin SDK on the WhatsApp webhook side.

import {
  doc,
  setDoc,
  getDocs,
  collection,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { generateId } from "../lib/utils";
import type { PatientProfile } from "../types";

export async function upsertPatientWeb(
  userId: string,
  fields: Partial<PatientProfile>,
  existingId?: string
): Promise<string> {
  const patientId = existingId || generateId("PT");
  const ref = doc(db, "users", userId, "patients", patientId);
  const payload: Record<string, unknown> = {
    ...fields,
    id: patientId,
    userId,
    updatedAt: serverTimestamp(),
  };
  if (!existingId) payload.createdAt = serverTimestamp();
  await setDoc(ref, payload, { merge: true });
  return patientId;
}

// Returns every saved patient profile for a given user (phone).
export async function listPatientsForUser(userId: string): Promise<PatientProfile[]> {
  const snap = await getDocs(collection(db, "users", userId, "patients"));
  return snap.docs.map((d) => d.data() as PatientProfile);
}

// Conservative name normalization for dedup matching. Same phone + same normalized
// name MUST map to the same patient profile; different name on the same phone is
// allowed (multiple family members).
export function normalizePatientName(name: string): string {
  return (name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Finds an existing patient under `users/{userId}/patients/*` whose normalized
 * name matches `fields.name`. If found, merges the incoming fields onto that
 * record and returns its id. If not, creates a fresh profile.
 *
 * Use this from any code path that does NOT have an explicit `existingId` — the
 * modal's "Add new patient" path, the bot's lead-capture step, etc. Callers
 * that have already resolved an existingId (e.g. the customer picked a saved
 * profile from a list) should use `upsertPatientWeb(id, fields, existingId)`
 * directly to honor the explicit selection.
 */
export async function findOrCreatePatient(
  userId: string,
  fields: Partial<PatientProfile> & { name: string }
): Promise<string> {
  const target = normalizePatientName(fields.name);
  const existing = await listPatientsForUser(userId);
  const match = existing.find((p) => normalizePatientName(p.name || "") === target);
  return upsertPatientWeb(userId, fields, match?.id);
}
