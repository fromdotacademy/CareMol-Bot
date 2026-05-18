// One-off smoke test for the customer cancel/reschedule bot flow.
//
// Drives handleWhatsAppMessage through MAIN_MENU -> MY_BOOKINGS_LIST ->
// BOOKING_DETAIL -> cancel and reschedule sub-flows, asserting booking
// audit fields land in Firestore correctly. Also asserts the 3-hour
// action-window gate hides cancel/reschedule buttons for an imminent booking.
//
// Run with env pre-loaded (see CLAUDE.md):
//   PowerShell> Get-Content .env | ForEach-Object { ... }
//   PowerShell> npx tsx scripts/smoke-test-cancel-reschedule.ts

import { adminDb } from "../src/services/firebaseAdmin";
import { handleWhatsAppMessage, type BotSession } from "../src/services/botLogic";
import {
  formatDateLabel,
  formatSlotLabel,
  defaultBookingConfig,
  bookableDates,
  slotsForDate,
  filterBookableSlots,
} from "../src/services/slotService";
import { generateId } from "../src/lib/utils";
import { TRANSLATIONS } from "../src/constants";
import type { Booking } from "../src/types";

const TEST_PHONE = "smoke-cr-" + Date.now();
const TEST_PATIENT_ID = generateId("PT");
const t = TRANSLATIONS.en;

function logStep(label: string, ok: boolean, detail?: string) {
  const tick = ok ? "✓" : "✗";
  console.log(`  ${tick} ${label}${detail ? " — " + detail : ""}`);
  if (!ok) process.exitCode = 1;
}

async function getSession(): Promise<BotSession> {
  const snap = await adminDb.collection("whatsapp_sessions").doc(TEST_PHONE).get();
  return snap.data() as BotSession;
}

async function getBooking(bookingId: string): Promise<Booking> {
  const snap = await adminDb.collection("bookings").doc(bookingId).get();
  return { ...(snap.data() as Booking), bookingId: snap.id };
}

async function seedBooking(opts: {
  bookingDate: string;
  slotStart: string;
  slotEnd: string;
  status?: Booking["status"];
}): Promise<string> {
  const bookingId = generateId("BK");
  const now = new Date().toISOString();
  const slot = { start: opts.slotStart, end: opts.slotEnd };
  const booking: Booking = {
    bookingId,
    userId: TEST_PHONE,
    patientId: TEST_PATIENT_ID,
    patientName: "Smoke CR Patient",
    patientAge: 30,
    patientGender: "Male",
    patientPhone: TEST_PHONE,
    patientAddress: "12 Main St, Melattur 679326",
    testNames: ["Basic Health"],
    timeSlot: formatSlotLabel(slot, "en"),
    bookingDate: opts.bookingDate,
    slotStart: opts.slotStart,
    slotEnd: opts.slotEnd,
    status: opts.status ?? "Created",
    price: 299,
    paymentMethod: "Cash",
    isFastingConfirmed: true,
    createdAt: now,
    language: "en",
  };
  await adminDb.collection("bookings").doc(bookingId).set(booking);
  return bookingId;
}

async function seedSession(step: BotSession["step"]): Promise<void> {
  await adminDb.collection("whatsapp_sessions").doc(TEST_PHONE).set({
    userId: TEST_PHONE,
    step,
    language: "en",
    bookingData: {},
    isOnlyChecking: false,
    lastActive: new Date().toISOString(),
  });
}

async function cleanup(bookingIds: string[]) {
  try {
    await adminDb.collection("whatsapp_sessions").doc(TEST_PHONE).delete();
    await adminDb
      .collection("users")
      .doc(TEST_PHONE)
      .collection("patients")
      .doc(TEST_PATIENT_ID)
      .delete();
    for (const id of bookingIds) {
      await adminDb.collection("bookings").doc(id).delete();
    }
  } catch (e) {
    console.warn("[cleanup] non-fatal:", e instanceof Error ? e.message : e);
  }
}

async function run() {
  console.log(`[smoke] running for phone=${TEST_PHONE}`);

  // Seed patient profile (PAYMENT step would reject orphans; not strictly
  // needed for cancel/reschedule, but mirrors real shape).
  const now = new Date().toISOString();
  await adminDb
    .collection("users")
    .doc(TEST_PHONE)
    .collection("patients")
    .doc(TEST_PATIENT_ID)
    .set({
      id: TEST_PATIENT_ID,
      userId: TEST_PHONE,
      name: "Smoke CR Patient",
      age: 30,
      gender: "Male",
      phone: TEST_PHONE,
      address: "12 Main St, Melattur 679326",
      createdAt: now,
      updatedAt: now,
    });

  const cfg = defaultBookingConfig();
  const dates = bookableDates(cfg);
  // Pick a date several days out so the 3-hour rule definitely passes.
  const futureDate = dates[Math.min(2, dates.length - 1)] || dates[0];
  const futureSlots = filterBookableSlots(slotsForDate(cfg, futureDate), futureDate);
  if (futureSlots.length === 0) {
    console.error("[smoke] no bookable slots for future date — aborting");
    process.exit(1);
  }
  const futureSlot = futureSlots[0];

  const bookingIds: string[] = [];

  // ==========================================================================
  // Part A: Cancel flow
  // ==========================================================================
  const cancelBookingId = await seedBooking({
    bookingDate: futureDate,
    slotStart: futureSlot.start,
    slotEnd: futureSlot.end,
  });
  bookingIds.push(cancelBookingId);
  console.log(`\n[A] Cancel flow for booking ${cancelBookingId}`);

  await seedSession("MAIN_MENU");

  // A1: open My Bookings from main menu
  console.log("[A1] Send 'My Bookings'");
  const rA1 = await handleWhatsAppMessage(TEST_PHONE, t.options.myBookings);
  const sA1 = await getSession();
  logStep("transitioned to MY_BOOKINGS_LIST", sA1.step === "MY_BOOKINGS_LIST", `step=${sA1.step}`);
  const cacheA1 = sA1.myBookingsCache || [];
  const cancelEntry = cacheA1.find((e: { bookingId: string; label: string }) => e.bookingId === cancelBookingId);
  logStep(
    "booking appears in list cache",
    !!cancelEntry,
    `cache=${JSON.stringify(cacheA1.map((e: { label: string }) => e.label))}`
  );
  logStep(
    "list response includes booking label",
    !!cancelEntry && (rA1[0]?.buttons?.includes(cancelEntry.label) ?? false),
    `buttons=${JSON.stringify(rA1[0]?.buttons)}`
  );
  if (!cancelEntry) throw new Error("no list entry for seeded booking");

  // A2: drill into booking detail
  console.log(`[A2] Send '${cancelEntry.label}'`);
  const rA2 = await handleWhatsAppMessage(TEST_PHONE, cancelEntry.label);
  const sA2 = await getSession();
  logStep("transitioned to BOOKING_DETAIL", sA2.step === "BOOKING_DETAIL", `step=${sA2.step}`);
  logStep("activeBookingId set", sA2.activeBookingId === cancelBookingId, `got=${sA2.activeBookingId}`);
  logStep(
    "detail offers Cancel button (future date, status Created)",
    rA2[0]?.buttons?.includes(t.bookingActionCancel) ?? false,
    `buttons=${JSON.stringify(rA2[0]?.buttons)}`
  );

  // A3: pick Cancel -> reason prompt
  console.log(`[A3] Send '${t.bookingActionCancel}'`);
  await handleWhatsAppMessage(TEST_PHONE, t.bookingActionCancel);
  const sA3 = await getSession();
  logStep("transitioned to BOOKING_CANCEL_REASON", sA3.step === "BOOKING_CANCEL_REASON", `step=${sA3.step}`);

  // A4: skip reason -> confirm
  console.log("[A4] Send 'skip'");
  const rA4 = await handleWhatsAppMessage(TEST_PHONE, t.cancelReasonSkip);
  const sA4 = await getSession();
  logStep("transitioned to BOOKING_CANCEL_CONFIRM", sA4.step === "BOOKING_CANCEL_CONFIRM", `step=${sA4.step}`);
  logStep(
    "confirm offers Yes/No buttons",
    (rA4[0]?.buttons?.includes(t.cancelConfirmYes) && rA4[0]?.buttons?.includes(t.cancelConfirmNo)) ?? false,
    `buttons=${JSON.stringify(rA4[0]?.buttons)}`
  );

  // A5: confirm cancel
  console.log(`[A5] Send '${t.cancelConfirmYes}'`);
  await handleWhatsAppMessage(TEST_PHONE, t.cancelConfirmYes);
  const cancelled = await getBooking(cancelBookingId);
  logStep("booking status is Cancelled", cancelled.status === "Cancelled", `status=${cancelled.status}`);
  logStep(
    "cancelledByRole is customer",
    cancelled.cancelledByRole === "customer",
    `got=${cancelled.cancelledByRole}`
  );
  logStep(
    "cancelledBy contains phone",
    typeof cancelled.cancelledBy === "string" && cancelled.cancelledBy.includes(TEST_PHONE),
    `got=${cancelled.cancelledBy}`
  );
  logStep("cancelledAt is set", !!cancelled.cancelledAt, `got=${cancelled.cancelledAt}`);

  // A6: cancelled booking should not appear in My Bookings list anymore
  console.log("[A6] Re-open My Bookings — expect cancelled booking hidden");
  await seedSession("MAIN_MENU");
  await handleWhatsAppMessage(TEST_PHONE, t.options.myBookings);
  const sA6 = await getSession();
  const stillVisible = (sA6.myBookingsCache || []).some(
    (e: { bookingId: string }) => e.bookingId === cancelBookingId
  );
  logStep("cancelled booking is hidden from list", !stillVisible, `cache=${JSON.stringify(sA6.myBookingsCache)}`);

  // ==========================================================================
  // Part B: Reschedule flow
  // ==========================================================================
  const rescheduleBookingId = await seedBooking({
    bookingDate: futureDate,
    slotStart: futureSlot.start,
    slotEnd: futureSlot.end,
  });
  bookingIds.push(rescheduleBookingId);
  console.log(`\n[B] Reschedule flow for booking ${rescheduleBookingId}`);

  await seedSession("MAIN_MENU");

  // B1: open My Bookings, drill in
  await handleWhatsAppMessage(TEST_PHONE, t.options.myBookings);
  const sB1 = await getSession();
  const rEntry = (sB1.myBookingsCache || []).find(
    (e: { bookingId: string }) => e.bookingId === rescheduleBookingId
  );
  if (!rEntry) throw new Error("reschedule booking missing from list");
  await handleWhatsAppMessage(TEST_PHONE, rEntry.label);

  // B2: Reschedule -> date prompt
  console.log(`[B2] Send '${t.bookingActionReschedule}'`);
  const rB2 = await handleWhatsAppMessage(TEST_PHONE, t.bookingActionReschedule);
  const sB2 = await getSession();
  logStep("transitioned to BOOKING_RESCHEDULE_DATE", sB2.step === "BOOKING_RESCHEDULE_DATE", `step=${sB2.step}`);
  const expectedDateLabels = dates.map((d) => formatDateLabel(d, "en"));
  logStep(
    "date prompt offers all bookable dates",
    expectedDateLabels.every((lbl) => rB2[0]?.buttons?.includes(lbl)),
    `buttons=${JSON.stringify(rB2[0]?.buttons)}`
  );

  // B3: pick a different date than the original
  const newDate = dates.find((d) => d !== futureDate) || dates[0];
  const newDateLabel = formatDateLabel(newDate, "en");
  console.log(`[B3] Send '${newDateLabel}'`);
  const rB3 = await handleWhatsAppMessage(TEST_PHONE, newDateLabel);
  const sB3 = await getSession();
  logStep("transitioned to BOOKING_RESCHEDULE_SLOT", sB3.step === "BOOKING_RESCHEDULE_SLOT", `step=${sB3.step}`);
  logStep(
    "rescheduleDraft.bookingDate set",
    sB3.rescheduleDraft?.bookingDate === newDate,
    `got=${sB3.rescheduleDraft?.bookingDate} expected=${newDate}`
  );
  const newSlots = filterBookableSlots(slotsForDate(cfg, newDate), newDate);
  if (newSlots.length === 0) {
    console.log("[smoke] no slots for new date — skipping rest of B");
    await cleanup(bookingIds);
    return;
  }
  const newSlot = newSlots[0];
  const newSlotLabel = formatSlotLabel(newSlot, "en");
  logStep(
    "slot prompt includes expected slot labels",
    rB3[0]?.buttons?.includes(newSlotLabel) ?? false,
    `buttons=${JSON.stringify(rB3[0]?.buttons)}`
  );

  // B4: pick slot
  console.log(`[B4] Send '${newSlotLabel}'`);
  const rB4 = await handleWhatsAppMessage(TEST_PHONE, newSlotLabel);
  const sB4 = await getSession();
  logStep(
    "transitioned to BOOKING_RESCHEDULE_CONFIRM",
    sB4.step === "BOOKING_RESCHEDULE_CONFIRM",
    `step=${sB4.step}`
  );
  logStep(
    "confirm offers Yes/No buttons",
    (rB4[0]?.buttons?.includes(t.rescheduleConfirmYes) && rB4[0]?.buttons?.includes(t.rescheduleConfirmNo)) ?? false,
    `buttons=${JSON.stringify(rB4[0]?.buttons)}`
  );

  // B5: confirm reschedule
  console.log(`[B5] Send '${t.rescheduleConfirmYes}'`);
  await handleWhatsAppMessage(TEST_PHONE, t.rescheduleConfirmYes);
  const rescheduled = await getBooking(rescheduleBookingId);
  logStep("bookingDate updated", rescheduled.bookingDate === newDate, `got=${rescheduled.bookingDate}`);
  logStep("slotStart updated", rescheduled.slotStart === newSlot.start, `got=${rescheduled.slotStart}`);
  logStep("slotEnd updated", rescheduled.slotEnd === newSlot.end, `got=${rescheduled.slotEnd}`);
  logStep("timeSlot updated", rescheduled.timeSlot === newSlotLabel, `got=${rescheduled.timeSlot}`);
  logStep("rescheduledByRole is customer", rescheduled.rescheduledByRole === "customer", `got=${rescheduled.rescheduledByRole}`);
  logStep("rescheduledAt is set", !!rescheduled.rescheduledAt, `got=${rescheduled.rescheduledAt}`);
  logStep("previousBookingDate captured", rescheduled.previousBookingDate === futureDate, `got=${rescheduled.previousBookingDate}`);
  logStep("previousSlotStart captured", rescheduled.previousSlotStart === futureSlot.start, `got=${rescheduled.previousSlotStart}`);

  // ==========================================================================
  // Part C: 3-hour gate (imminent booking should hide Cancel/Reschedule)
  // ==========================================================================
  // Build a slot starting ~1 hour from now in IST. We compute IST today and a
  // slot 1 hour out; isWithinCustomerActionWindow should return false.
  const oneHrFromNow = new Date(Date.now() + 60 * 60 * 1000);
  // IST = UTC+5:30; bookingDate/slotStart are IST.
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const ist = new Date(oneHrFromNow.getTime() + istOffsetMs);
  const istDate = ist.toISOString().slice(0, 10);
  const istHH = String(ist.getUTCHours()).padStart(2, "0");
  const istMM = String(ist.getUTCMinutes()).padStart(2, "0");
  const imminentStart = `${istHH}:${istMM}`;
  const imminentEnd = `${String((ist.getUTCHours() + 1) % 24).padStart(2, "0")}:${istMM}`;

  const imminentBookingId = await seedBooking({
    bookingDate: istDate,
    slotStart: imminentStart,
    slotEnd: imminentEnd,
  });
  bookingIds.push(imminentBookingId);
  console.log(`\n[C] 3-hour gate for booking ${imminentBookingId} (${istDate} ${imminentStart})`);

  await seedSession("MAIN_MENU");
  await handleWhatsAppMessage(TEST_PHONE, t.options.myBookings);
  const sC1 = await getSession();
  const iEntry = (sC1.myBookingsCache || []).find(
    (e: { bookingId: string }) => e.bookingId === imminentBookingId
  );
  if (!iEntry) {
    logStep("imminent booking appears in list", false, `cache=${JSON.stringify(sC1.myBookingsCache)}`);
  } else {
    const rC2 = await handleWhatsAppMessage(TEST_PHONE, iEntry.label);
    const buttons = rC2[0]?.buttons || [];
    logStep(
      "Cancel button is hidden for imminent booking",
      !buttons.includes(t.bookingActionCancel),
      `buttons=${JSON.stringify(buttons)}`
    );
    logStep(
      "Reschedule button is hidden for imminent booking",
      !buttons.includes(t.bookingActionReschedule),
      `buttons=${JSON.stringify(buttons)}`
    );
    logStep(
      "Back button is still offered",
      buttons.includes(t.bookingActionBack),
      `buttons=${JSON.stringify(buttons)}`
    );
  }

  console.log("\n[smoke] done.");
  await cleanup(bookingIds);
}

run()
  .catch(async (err) => {
    console.error("[smoke] fatal", err);
    process.exitCode = 1;
  })
  .finally(() => {
    process.exit(process.exitCode ?? 0);
  });
