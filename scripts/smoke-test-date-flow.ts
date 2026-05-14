// One-off smoke test for the new DATE_SELECTION + config-driven TIME_SLOT
// transitions in src/services/botLogic.ts.
//
// Pre-seeds a whatsapp_sessions doc at PATIENT_ADDRESS_CONFIRM with a fully
// populated bookingData, then drives handleWhatsAppMessage through:
//   PATIENT_ADDRESS_CONFIRM -> DATE_SELECTION -> TIME_SLOT -> FASTING_CHECK
// Asserts that bookingData picks up bookingDate / slotStart / slotEnd / timeSlot.
// Cleans up the test session and any test patient doc on exit.
//
// Run with env pre-loaded (see CLAUDE.md):
//   PowerShell> Get-Content .env.local | ForEach-Object { ... }
//   PowerShell> npx tsx scripts/smoke-test-date-flow.ts

import { adminDb } from "../src/services/firebaseAdmin";
import { handleWhatsAppMessage, type BotSession } from "../src/services/botLogic";
import { getNextNDates, formatDateLabel, formatSlotLabel, defaultBookingConfig } from "../src/services/slotService";
import { generateId } from "../src/lib/utils";

const TEST_PHONE = "smoke-test-" + Date.now();
const TEST_PATIENT_ID = generateId("PT");

function logStep(label: string, ok: boolean, detail?: string) {
  const tick = ok ? "✓" : "✗";
  console.log(`  ${tick} ${label}${detail ? " — " + detail : ""}`);
  if (!ok) process.exitCode = 1;
}

async function getSession(): Promise<BotSession> {
  const snap = await adminDb.collection("whatsapp_sessions").doc(TEST_PHONE).get();
  return snap.data() as BotSession;
}

async function cleanup() {
  try {
    await adminDb.collection("whatsapp_sessions").doc(TEST_PHONE).delete();
    await adminDb
      .collection("users")
      .doc(TEST_PHONE)
      .collection("patients")
      .doc(TEST_PATIENT_ID)
      .delete();
  } catch (e) {
    console.warn("[cleanup] non-fatal:", e instanceof Error ? e.message : e);
  }
}

async function run() {
  console.log(`[smoke] running for phone=${TEST_PHONE}`);

  // Pre-seed: skip past patient-details entry by writing a session that
  // already has everything except date/slot. Patient profile must exist
  // (the PAYMENT step rejects orphans).
  const now = new Date().toISOString();
  await adminDb
    .collection("users")
    .doc(TEST_PHONE)
    .collection("patients")
    .doc(TEST_PATIENT_ID)
    .set({
      id: TEST_PATIENT_ID,
      userId: TEST_PHONE,
      name: "Smoke Test Patient",
      age: 30,
      gender: "Male",
      phone: TEST_PHONE,
      address: "12 Main St, Melattur",
      createdAt: now,
      updatedAt: now,
    });

  const seedSession: BotSession = {
    userId: TEST_PHONE,
    step: "PATIENT_ADDRESS_CONFIRM",
    language: "en",
    bookingData: {
      status: "Created",
      patientId: TEST_PATIENT_ID,
      patientName: "Smoke Test Patient",
      patientAge: 30,
      patientGender: "Male",
      patientPhone: TEST_PHONE,
      patientAddress: "12 Main St, Melattur",
      testNames: ["Basic Health Check"],
      price: 499,
    },
    isOnlyChecking: false,
    lastActive: now,
  };
  await adminDb.collection("whatsapp_sessions").doc(TEST_PHONE).set(seedSession);
  console.log(`[smoke] session seeded at PATIENT_ADDRESS_CONFIRM`);

  // Step 1: confirm address -> expect DATE_SELECTION + date labels in response
  console.log("\n[1] Sending 'Yes, it's correct' (yesCorrect)...");
  const r1 = await handleWhatsAppMessage(TEST_PHONE, "Yes, it's correct");
  const s1 = await getSession();
  const cfg = defaultBookingConfig();
  const expectedDates = getNextNDates(cfg.maxAdvanceDays);
  const expectedDateLabels = expectedDates.map((d) => formatDateLabel(d, "en"));
  logStep("transitioned to DATE_SELECTION", s1.step === "DATE_SELECTION", `step=${s1.step}`);
  logStep(
    "response contains date labels",
    r1.length > 0 && expectedDateLabels.every((lbl) => r1[0].buttons?.includes(lbl)),
    `buttons=${JSON.stringify(r1[0]?.buttons)}`
  );
  logStep("response contains chooseDate prompt", r1[0]?.text?.toLowerCase().includes("date") ?? false);

  // Step 2: pick "Today" -> expect TIME_SLOT + bookingDate set
  console.log("\n[2] Sending 'Today'...");
  const r2 = await handleWhatsAppMessage(TEST_PHONE, "Today");
  const s2 = await getSession();
  const today = expectedDates[0];
  logStep("transitioned to TIME_SLOT", s2.step === "TIME_SLOT", `step=${s2.step}`);
  logStep(
    "bookingData.bookingDate is today",
    s2.bookingData.bookingDate === today,
    `got=${s2.bookingData.bookingDate} expected=${today}`
  );
  const expectedSlotLabels = cfg.slots.map((s) => formatSlotLabel(s, "en"));
  logStep(
    "response contains slot labels",
    r2.length > 0 && expectedSlotLabels.every((lbl) => r2[0].buttons?.includes(lbl)),
    `buttons=${JSON.stringify(r2[0]?.buttons)}`
  );

  // Step 3: pick first slot -> expect FASTING_CHECK + slot fields populated
  const firstSlot = cfg.slots[0];
  const firstSlotLabel = formatSlotLabel(firstSlot, "en");
  console.log(`\n[3] Sending '${firstSlotLabel}'...`);
  const r3 = await handleWhatsAppMessage(TEST_PHONE, firstSlotLabel);
  const s3 = await getSession();
  logStep("transitioned to FASTING_CHECK", s3.step === "FASTING_CHECK", `step=${s3.step}`);
  logStep(
    "bookingData.slotStart matches",
    s3.bookingData.slotStart === firstSlot.start,
    `got=${s3.bookingData.slotStart} expected=${firstSlot.start}`
  );
  logStep(
    "bookingData.slotEnd matches",
    s3.bookingData.slotEnd === firstSlot.end,
    `got=${s3.bookingData.slotEnd} expected=${firstSlot.end}`
  );
  logStep(
    "bookingData.timeSlot matches display label",
    s3.bookingData.timeSlot === firstSlotLabel,
    `got=${s3.bookingData.timeSlot} expected=${firstSlotLabel}`
  );

  // Step 4 (negative): bad date input on DATE_SELECTION should re-prompt
  // Reset to DATE_SELECTION
  await adminDb.collection("whatsapp_sessions").doc(TEST_PHONE).set({
    ...seedSession,
    step: "DATE_SELECTION",
  });
  console.log("\n[4] Sending invalid date 'Yesterday'...");
  const r4 = await handleWhatsAppMessage(TEST_PHONE, "Yesterday");
  const s4 = await getSession();
  logStep("stays on DATE_SELECTION on bad input", s4.step === "DATE_SELECTION", `step=${s4.step}`);
  logStep(
    "re-prompt mentions advance limit",
    r4[0]?.text?.includes(String(cfg.maxAdvanceDays)) ?? false,
    `text snippet="${r4[0]?.text?.slice(0, 80)}"`
  );

  console.log("\n[smoke] done.");
}

run()
  .catch((err) => {
    console.error("[smoke] fatal", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    process.exit(process.exitCode ?? 0);
  });
