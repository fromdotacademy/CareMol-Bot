// Single source of truth for the "Booking Confirmed ✅" WhatsApp message body.
//
// Called from:
//   - src/services/botLogic.ts PAYMENT step (server, WhatsApp flow)
//   - src/App.tsx WhatsAppSimulator PAYMENT case (client, in-dashboard simulator)
//   - server.ts POST /api/bookings/:id/notify (manual-booking confirmation)
//
// Keeping the template here dissolves the old "two parallel implementations"
// dual-sync rule for the receipt text — change once, all three call sites pick
// it up.

import type { Booking, CustomTest, Language } from "../types";
import {
  TRANSLATIONS,
  ECG_ADDON_PRICE,
  computeBookingTotal,
} from "../constants";
import { formatDateLabel } from "./slotService";

type ConfirmationInput = Pick<
  Booking,
  | "bookingId"
  | "patientName"
  | "patientAge"
  | "patientGender"
  | "patientAddress"
  | "testNames"
  | "customTests"
  | "ecgAddon"
  | "timeSlot"
  | "bookingDate"
  | "isFastingConfirmed"
  | "notes"
  | "paymentMethod"
>;

const GENDER_LABEL_ML: Record<"Male" | "Female" | "Other", string> = {
  Male: "പുരുഷൻ",
  Female: "സ്ത്രീ",
  Other: "മറ്റ്",
};

function localizeGender(gender: Booking["patientGender"], lang: Language): string {
  if (lang === "ml") return GENDER_LABEL_ML[gender] ?? gender;
  return gender;
}

function formatCustomTests(items: CustomTest[] | undefined | null): string | null {
  if (!items || items.length === 0) return null;
  const rendered = items
    .filter((t) => t && t.name && Number.isFinite(Number(t.price)))
    .map((t) => `${t.name} — ₹${t.price}`);
  return rendered.length > 0 ? rendered.join(", ") : null;
}

// Builds the success-message body. `language` defaults to "en" so that callers
// without language context still get a sensible English message.
export function buildBookingConfirmation(
  booking: ConfirmationInput,
  language: Language = "en"
): string {
  const t = TRANSLATIONS[language];
  const sl = t.summaryLabels;

  const total = computeBookingTotal(
    booking.testNames ?? [],
    booking.customTests,
    !!booking.ecgAddon
  );
  const ecgLine = booking.ecgAddon ? `+ ECG (+₹${ECG_ADDON_PRICE})` : null;

  const dateLabel = booking.bookingDate
    ? formatDateLabel(booking.bookingDate, language)
    : "—";
  const fastingLabel = booking.isFastingConfirmed ? t.fastingYesLabel : t.fastingNoLabel;
  const notesText = (booking.notes || "").trim();
  const customLine = formatCustomTests(booking.customTests);

  const lines: (string | null)[] = [
    `*🧾 ${t.success}*`,
    "",
    `*${t.bookingId}:* ${booking.bookingId}`,
    `*${sl.patient}:* ${booking.patientName} (${booking.patientAge}, ${localizeGender(booking.patientGender, language)})`,
    `*${sl.tests}:* ${(booking.testNames || []).join(", ") || "—"}`,
    customLine ? `*${sl.additionalItems}:* ${customLine}` : null,
    ecgLine,
    `*${sl.price}:* ₹${total}`,
    `*${sl.address}:* ${booking.patientAddress || "—"}`,
    `*${sl.date}:* ${dateLabel}`,
    `*${sl.slot}:* ${booking.timeSlot || "—"}`,
    `*${sl.fasting}:* ${fastingLabel}`,
    notesText ? `*${sl.notes}:* ${notesText}` : null,
    `*${sl.payment}:* ${booking.paymentMethod}`,
    "",
    t.phlebMsg,
  ];

  return lines.filter((line): line is string => line !== null).join("\n");
}
