// Smoke test for the GPS-first, PIN-fallback AVAILABILITY_CHECK in
// src/services/botLogic.ts.
//
// Exercises four scenarios end-to-end against the real Admin SDK:
//   1. GPS hit (inside service radius)             → t.available + step advances
//   2. GPS miss (~100 km off-radius)               → t.gpsOutsideArea + stay
//   3. After miss, text PIN "679326"               → t.available + step advances
//   4. Text PIN outside the configured list        → t.serviceUnavailable + stay
//
// Run with env pre-loaded (see CLAUDE.md):
//   PowerShell> Get-Content .env | ForEach-Object { if ($_ -match '^([^#][^=]*)=(.*)$') { [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process') } }
//   PowerShell> npx tsx scripts/smoke-test-location-flow.ts

import { adminDb } from "../src/services/firebaseAdmin";
import { handleWhatsAppMessage, type BotSession } from "../src/services/botLogic";
import { TRANSLATIONS } from "../src/constants";

const TEST_PHONE = "smoke-loc-" + Date.now();

function logStep(label: string, ok: boolean, detail?: string) {
  const tick = ok ? "✓" : "✗";
  console.log(`  ${tick} ${label}${detail ? " — " + detail : ""}`);
  if (!ok) process.exitCode = 1;
}

async function getSession(): Promise<BotSession> {
  const snap = await adminDb.collection("whatsapp_sessions").doc(TEST_PHONE).get();
  return snap.data() as BotSession;
}

async function seedAtAvailabilityCheck() {
  const now = new Date().toISOString();
  // isOnlyChecking=false so a successful check transitions the bot to the next
  // step (TEST_SELECTION). When isOnlyChecking is true the bot stays in
  // AVAILABILITY_CHECK and just offers "interested in booking?" — also correct
  // behavior, but not what we're verifying here.
  const seed: BotSession = {
    userId: TEST_PHONE,
    step: "AVAILABILITY_CHECK",
    language: "en",
    bookingData: { status: "Created" },
    isOnlyChecking: false,
    lastActive: now,
  };
  await adminDb.collection("whatsapp_sessions").doc(TEST_PHONE).set(seed);
}

async function cleanup() {
  try {
    await adminDb.collection("whatsapp_sessions").doc(TEST_PHONE).delete();
  } catch (e) {
    console.warn("[cleanup] non-fatal:", e instanceof Error ? e.message : e);
  }
}

async function run() {
  console.log(`[smoke-loc] running for phone=${TEST_PHONE}`);
  const t = TRANSLATIONS.en;

  // --- 1. GPS hit ---------------------------------------------------------
  await seedAtAvailabilityCheck();
  console.log("\n[1] GPS hit (11.0664, 76.2687 — Melattur centroid)...");
  const r1 = await handleWhatsAppMessage(TEST_PHONE, "", { latitude: 11.0664, longitude: 76.2687 });
  const s1 = await getSession();
  logStep("step advanced past AVAILABILITY_CHECK", s1.step !== "AVAILABILITY_CHECK", `step=${s1.step}`);
  logStep(
    "first response is t.available",
    r1.length > 0 && r1[0].text === t.available,
    `text="${r1[0]?.text}"`
  );

  // --- 2. GPS miss --------------------------------------------------------
  await seedAtAvailabilityCheck();
  console.log("\n[2] GPS miss (12.0, 76.0 — ~110 km off)...");
  const r2 = await handleWhatsAppMessage(TEST_PHONE, "", { latitude: 12.0, longitude: 76.0 });
  const s2 = await getSession();
  logStep("stays in AVAILABILITY_CHECK after GPS miss", s2.step === "AVAILABILITY_CHECK", `step=${s2.step}`);
  logStep(
    "response is t.gpsOutsideArea",
    r2.length > 0 && r2[0].text === t.gpsOutsideArea,
    `text="${r2[0]?.text}"`
  );

  // --- 3. PIN fallback after GPS miss (same session) ----------------------
  console.log("\n[3] PIN fallback — typing '679326' after GPS miss...");
  const r3 = await handleWhatsAppMessage(TEST_PHONE, "679326");
  const s3 = await getSession();
  logStep("step advanced past AVAILABILITY_CHECK", s3.step !== "AVAILABILITY_CHECK", `step=${s3.step}`);
  logStep(
    "first response is t.available",
    r3.length > 0 && r3[0].text === t.available,
    `text="${r3[0]?.text}"`
  );

  // --- 4. PIN out of list -------------------------------------------------
  await seedAtAvailabilityCheck();
  console.log("\n[4] PIN out of list — typing '110001' (Delhi)...");
  const r4 = await handleWhatsAppMessage(TEST_PHONE, "110001");
  const s4 = await getSession();
  logStep("stays in AVAILABILITY_CHECK on PIN miss", s4.step === "AVAILABILITY_CHECK", `step=${s4.step}`);
  logStep(
    "response is t.serviceUnavailable",
    r4.length > 0 && r4[0].text === t.serviceUnavailable,
    `text="${r4[0]?.text}"`
  );

  console.log("\n[smoke-loc] done.");
}

run()
  .catch((err) => {
    console.error("[smoke-loc] fatal", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    process.exit(process.exitCode ?? 0);
  });
