// Pure helpers and shared state for the booking-date + slot-template system.
//
// SDK-agnostic on purpose: callers do their own Firestore reads/writes with
// either the Admin SDK (server/webhook) or the web SDK (dashboard/simulator)
// and feed the resulting docs into the pure functions here.

import type {
  BookingConfig,
  Language,
  PhlebAvailability,
  SlotConfig,
  Staff,
  WeeklySchedule,
} from "../types";
import { TRANSLATIONS } from "../constants";

const IST_TZ = "Asia/Kolkata";
const WEEKDAY_KEYS: ReadonlyArray<keyof WeeklySchedule> = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
];

// ============================================================================
// Date utilities — all dates are "YYYY-MM-DD" strings in Asia/Kolkata.
// ============================================================================

/** Today's date as YYYY-MM-DD in Asia/Kolkata. */
export function getISTToday(): string {
  return formatDateAsISO(new Date());
}

/** Current wall-clock in Asia/Kolkata: ISO date plus hour/minute (0-padded ints). */
export function getISTNow(): { isoDate: string; hour: number; minute: number } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return { isoDate: formatDateAsISO(now), hour, minute };
}

/** Minimum minutes between "now" and a slot's start for it to remain bookable
 *  on the same day. Slots inside this window are filtered out by
 *  filterBookableSlots(). */
export const SAME_DAY_LEAD_MINUTES = 60;

/** Minutes from current IST clock to slotStart on isoDate.
 *  - Positive: slot is in the future
 *  - Negative or zero: slot start has passed
 *  - Infinity: isoDate is after today (we never block future-day slots) */
export function minutesUntilSlot(slotStart: string, isoDate: string): number {
  const now = getISTNow();
  if (isoDate > now.isoDate) return Infinity;
  if (isoDate < now.isoDate) return -Infinity;
  const [hStr, mStr] = slotStart.split(":");
  const slotMinutes = Number(hStr) * 60 + Number(mStr ?? "0");
  const nowMinutes = now.hour * 60 + now.minute;
  return slotMinutes - nowMinutes;
}

/** Drops slots whose start is less than `leadMinutes` away on the same day.
 *  No-op for dates other than today (future days return all slots). */
export function filterBookableSlots(
  slots: SlotConfig[],
  isoDate: string,
  leadMinutes: number = SAME_DAY_LEAD_MINUTES,
): SlotConfig[] {
  if (isoDate !== getISTToday()) return slots;
  return slots.filter((s) => minutesUntilSlot(s.start, isoDate) >= leadMinutes);
}

/** Next n consecutive calendar dates starting from today (IST), as YYYY-MM-DD. */
export function getNextNDates(n: number): string[] {
  const today = getISTToday();
  const [y, m, d] = today.split("-").map(Number);
  const result: string[] = [];
  for (let i = 0; i < n; i++) {
    const utc = new Date(Date.UTC(y, m - 1, d) + i * 86_400_000);
    result.push(formatUtcDateAsISO(utc));
  }
  return result;
}

/** Weekday key for a YYYY-MM-DD date. Uses UTC arithmetic on the date triple
 *  so the result is timezone-independent — the date string IS the date. */
export function weekdayKey(isoDate: string): keyof WeeklySchedule {
  const [y, m, d] = isoDate.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  return WEEKDAY_KEYS[utc.getUTCDay()];
}

/** True if isoDate is in [today, today + maxAdvanceDays - 1] (IST). */
export function isWithinAdvanceWindow(isoDate: string, maxAdvanceDays: number): boolean {
  const window = getNextNDates(Math.max(1, maxAdvanceDays));
  return window.includes(isoDate);
}

function formatDateAsISO(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function formatUtcDateAsISO(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// ============================================================================
// Display formatters
// ============================================================================

/** "07:00" -> "7:00 AM", "13:30" -> "1:30 PM". */
export function formatTime12h(time: string): string {
  const [hStr, mStr] = time.split(":");
  const h = Number(hStr);
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${(mStr ?? "00").padStart(2, "0")} ${period}`;
}

/** Localized slot label, e.g. "7:00 AM – 8:00 AM". Currently identical across
 *  languages — AM/PM markers are universal in the existing Malayalam copy. */
export function formatSlotLabel(slot: SlotConfig, _language: Language = "en"): string {
  return `${formatTime12h(slot.start)} – ${formatTime12h(slot.end)}`;
}

/** Date label for the WhatsApp date picker.
 *  - Today / Tomorrow get the localized special label.
 *  - Other dates render as "Wed, 14 May" / "ബുധൻ, 14 മേയ്". */
export function formatDateLabel(isoDate: string, language: Language): string {
  const upcoming = getNextNDates(2);
  if (isoDate === upcoming[0]) return TRANSLATIONS[language].today;
  if (isoDate === upcoming[1]) return TRANSLATIONS[language].tomorrow;
  const [y, m, d] = isoDate.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const wd = TRANSLATIONS[language].weekdaysShort[utc.getUTCDay()];
  const month = TRANSLATIONS[language].monthsShort[utc.getUTCMonth()];
  return `${wd}, ${d} ${month}`;
}

// ============================================================================
// Effective working slots
// ============================================================================

/** Pure: resolves effective working slot starts for a phlebotomist on a date.
 *
 *  Priority:
 *    1. override.unavailable === true  -> []
 *    2. override exists                -> override.workingSlots
 *    3. staff active + defaultSchedule -> staff.defaultSchedule[weekday]
 *    4. otherwise                      -> []
 */
export function effectiveSlotsFromDocs(
  staff: Staff | null,
  override: PhlebAvailability | null,
  isoDate: string,
): string[] {
  if (override) {
    if (override.unavailable) return [];
    return override.workingSlots ?? [];
  }
  if (!staff || !staff.active) return [];
  const wd = weekdayKey(isoDate);
  return staff.defaultSchedule?.[wd] ?? [];
}

/** Pure: is phleb scheduled to work slotStart on isoDate? */
export function isSlotInEffectiveSchedule(
  staff: Staff | null,
  override: PhlebAvailability | null,
  isoDate: string,
  slotStart: string,
): boolean {
  return effectiveSlotsFromDocs(staff, override, isoDate).includes(slotStart);
}

// ============================================================================
// Booking config — in-memory TTL cache (~60s)
// ============================================================================

const CONFIG_TTL_MS = 60_000;
let configCache: { config: BookingConfig; expiresAt: number } | null = null;

/** Fresh cached config or null. Consumers do the SDK read on miss, then call
 *  rememberBookingConfig() to populate. */
export function getCachedBookingConfig(): BookingConfig | null {
  if (configCache && configCache.expiresAt > Date.now()) return configCache.config;
  return null;
}

/** Records a freshly fetched config so the next ~60s skip the read. */
export function rememberBookingConfig(config: BookingConfig): void {
  configCache = { config, expiresAt: Date.now() + CONFIG_TTL_MS };
}

/** Clear the cache — call after writing config/booking. */
export function invalidateBookingConfigCache(): void {
  configCache = null;
}

/** Dates the customer can actually book in the next `maxAdvanceDays` window.
 *  Drops today if every same-day slot is past the lead-time cutoff, and drops
 *  any date whose weekday template is an empty list (admin-set "closed"). */
export function bookableDates(cfg: BookingConfig): string[] {
  const dates = getNextNDates(cfg.maxAdvanceDays);
  return dates.filter((d) => filterBookableSlots(slotsForDate(cfg, d), d).length > 0);
}

/** Slot template for a specific date. Returns the per-weekday override if the
 *  admin has customized that weekday (including an empty array, which means
 *  "closed by template"); otherwise falls back to the global cfg.slots. */
export function slotsForDate(cfg: BookingConfig, isoDate: string): SlotConfig[] {
  const wd = weekdayKey(isoDate);
  const override = cfg.slotsByWeekday?.[wd];
  return override !== undefined ? override : cfg.slots;
}

/** Fallback when config/booking has not been seeded. Mirrors
 *  scripts/seed-booking-config.ts so the two stay aligned. */
export function defaultBookingConfig(): BookingConfig {
  return {
    slots: [
      { start: "07:00", end: "08:00" },
      { start: "08:00", end: "09:00" },
      { start: "09:00", end: "10:00" },
    ],
    maxAdvanceDays: 7,
    timezone: IST_TZ,
    servicePins: ["679326"],
    serviceCenter: { lat: 11.0664, lng: 76.2687 },
    serviceRadiusKm: 5,
  };
}

// ============================================================================
// Booking → composite key helpers
// ============================================================================

/** Doc id for phlebAvailability/{date}_{phlebUid}. */
export function phlebAvailabilityDocId(isoDate: string, phlebUid: string): string {
  return `${isoDate}_${phlebUid}`;
}
