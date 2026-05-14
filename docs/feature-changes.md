# CareMol Lab Assistant — Feature Changes Log

Ordered newest-first. Each entry describes what changed, why, and the main files affected.

---

## [2026-05-13/14] Booking Date & Per-Phlebotomist Slot Scheduling

**Branch:** `claude/inspiring-hamilton-5b3b27`

### What changed

**Customer booking flow**
- A new `DATE_SELECTION` step is inserted between `PATIENT_ADDRESS_CONFIRM` and `TIME_SLOT`.
- Customers pick a date (today + up to `maxAdvanceDays` days ahead, default 7) from a localized list (Today / Tomorrow / "Wed, 14 May" / "ബുധൻ, 14 മേയ്").
- The slot picker now reads from the admin-configured slot template (default 3 × 1-hour slots from 07:00–10:00) rather than hardcoded strings.
- Both `botLogic.ts` (real WhatsApp webhook) and `WhatsAppSimulator` (in-dashboard) updated identically.

**New booking fields** (`Booking` interface, `src/types.ts`)
- `bookingDate?: string` — `YYYY-MM-DD` in IST. Optional only for legacy back-compat.
- `slotStart?: string` — `HH:mm` 24h canonical slot start (e.g. `"07:00"`).
- `slotEnd?: string` — `HH:mm` 24h canonical slot end.
- `timeSlot: string` — unchanged; now derived from `slotStart/slotEnd` at write time for new bookings.

**Admin Settings tab** — edits `config/booking` singleton:
- Slot template (add/remove/reorder 1-hour time windows).
- `maxAdvanceDays` (1–30).
- Changes immediately reflected in the customer bot and simulator.

**Admin Schedule tab** — per-date phleb availability grid:
- Rows = active phlebs; columns = template slots; cells = checked/unchecked.
- Default state derived from `staff.defaultSchedule[weekday]`.
- Admin can override per-date via `phlebAvailability/{YYYY-MM-DD}_{phlebUid}` sparse docs.
- Conflict guard: toggling off a slot that has a live booking shows a warning instead.

**Staff tab addition** — `DefaultScheduleEditor`:
- 7-weekday rows × template slots when adding a new phlebotomist.
- Inline **Edit Schedule** on each existing phleb row.
- Stored as `defaultSchedule` on the `staff/{uid}` doc.

**Admin Bookings table enhancements:**
- New **Date** column; sort defaults to `(bookingDate ASC, slotStart ASC)`, legacy bookings last.
- Upcoming/all filter.
- **Assignment dropdown** filters to phlebs whose effective schedule includes the booking's (date, slot) and who don't already have a booking there. Override checkbox bypasses the filter for emergencies.
- Legacy bookings (no `bookingDate`) show "—" + "Legacy" badge; dropdown falls back to unfiltered.

**Phlebotomist dashboard enhancements:**
- Booking cards show the booking date with a calendar icon and "Legacy" badge where applicable.
- Sorted by `(bookingDate ASC, slotStart ASC)`.
- "Completed Today" filter uses `bookingDate == today (IST)` instead of `createdAt`.

**New shared service** `src/services/slotService.ts`:
- `getISTToday()`, `getNextNDates(n)`, `formatDateLabel()`, `formatSlotLabel()`, `effectiveSlotsFromDocs()`, `isWithinAdvanceWindow()`, TTL-cached `getCachedBookingConfig()` / `rememberBookingConfig()`.
- All pure/SDK-agnostic — imported by both `botLogic.ts` and `App.tsx`.

**Firestore rules** (`firestore.rules`):
- Owner and admin `hasOnly` lists extended with `bookingDate, slotStart, slotEnd, timeSlot`.
- New `match /config/{document}` — authenticated read, admin write.
- New `match /phlebAvailability/{document}` — admin/phleb read, admin write.
- **Critical fix:** Added `match /{path=**}/patients/{patientId}` wildcard rule to support `collectionGroup(db, 'patients')` queries in the admin dashboard. Path-bound rules alone do not cover collection group queries; missing this rule caused "Database Error: list on patients" at runtime.

**Firestore index** (`firestore.indexes.json` — new file):
- Composite index `(bookingDate ASC, slotStart ASC, assignedTo ASC, status ASC)` on `bookings` collection. Required for derived slot-occupancy queries. Declared for Firebase CLI deployment.

**`firebase.json`:** Added `"indexes": "firestore.indexes.json"` to the `firestore` block.

**New types** (`src/types.ts`): `WeeklySchedule`, `SlotConfig`, `BookingConfig`, `PhlebAvailability`; `'DATE_SELECTION'` added to `ChatStep` union.

**New i18n keys** (`src/constants.ts`): `chooseDate`, `today`, `tomorrow`, `weekdaysShort`, `monthsShort`, `advanceLimitError`, `legacyTimeSlotMissing` — in both `en` and `ml`.

**New scripts:**
- `scripts/seed-booking-config.ts` — idempotent seed for `config/booking`; `--dry` preview, `--force` overwrite.
- `scripts/smoke-test-date-flow.ts` — Admin SDK bot E2E test: seeds a session at `PATIENT_ADDRESS_CONFIRM`, drives DATE_SELECTION → TIME_SLOT → FASTING_CHECK, asserts all new booking fields, self-cleans.

**`firebase-blueprint.json`:** Updated `Booking` and `Staff` entities; added `BookingConfig` and `PhlebAvailability` entities; added `/config/booking` and `/phlebAvailability/{date_phlebUid}` Firestore paths.

**`CLAUDE.md`:** Added "Booking date & per-phleb scheduling" section; added collection-group rule note; added smoke test script note.

**`docs/e2e-testing-plan.md`:** 15-step manual testing plan for this feature.

### Design decisions

- **Slot occupancy is derived, not materialized.** No separate inventory collection. "Is (phleb, date, slot) taken?" = query `bookings where bookingDate==D and slotStart==S and assignedTo==P and status != 'Completed'`. Reassignment and date changes cascade automatically.
- **Legacy bookings unaffected.** `bookingDate/slotStart/slotEnd` are optional in rules indefinitely; existing bookings render with a "Legacy" badge.
- **Customer sees all slots.** Phleb availability is admin-facing only; the customer picks from the full template. Admin absorbs over-allocation via the filtered assign dropdown.
- **`YYYY-MM-DD` string dates, not Timestamps.** Single-timezone app (IST); string keys avoid tz conversion bugs and are equality-comparable in Firestore queries.

---

## [2026-05] Phlebotomist Dashboard, Role-Based Routing & Patient Profile Invariant

**Commit:** `7f4426b`

### What changed

**Patient profile invariant:**
- Patient profiles are created immediately when patient details are captured (`PATIENT_DETAILS_ENTRY` / `PATIENT_SELECTION`) and referenced via `patientId` on every new booking.
- `Booking.patientId` is a required field. The `PAYMENT` step rejects bookings without it rather than writing orphan records.
- Helpers: `upsertPatientProfile` (botLogic.ts) and `upsertPatientWeb` (App.tsx).
- Backfill script: `scripts/backfill-patientid.ts` — links existing orphan bookings to patient profiles using `patientName` matching.

**Role-based routing:**
- `useStaffRole` hook subscribes to `staff/{uid}` and returns `'admin' | 'phlebotomist' | 'customer'`.
- Admins → `DashboardView`. Phlebotomists → `PhlebotomistDashboard`. Customers → simulator.
- Hardcoded bootstrap admins (`tubejaf@gmail.com`, `fromdotacademy@gmail.com`) always route to admin regardless of `staff` collection state.

**PhlebotomistDashboard:**
- Two scoped Firestore subscriptions: own assignments (`assignedTo == uid`) + unassigned queue (`status == 'Created'`).
- `TestPickerModal` for editing tests during home visits.
- Self-assignment: phleb picks an unclaimed `Created` booking from the queue.

**Admin UI additions:**
- Priority dropdown on booking rows (`high / medium / low`).
- Phlebotomist assignment dropdown.
- **Staff tab**: add staff by UID + email + name + role; deactivate via `active: false`.

**Firestore rules rewrite:**
- `isPhlebotomist()`, `isHardcodedAdmin()`, `phlebStatusOK()` helpers.
- `staff/{uid}` collection rules.
- Granular booking update branches per role (owner / admin / phleb self-assign / phleb progress).

**`firebaseAdmin.ts`:**
- Added `FIREBASE_KEY_FILE` / `GOOGLE_APPLICATION_CREDENTIALS` env var support as alternative to JSON-stringified `FIREBASE_SERVICE_ACCOUNT`.

**Deployment:**
- `firebase.json` and `.firebaserc` added. Project: `fromdot-project`; database: `ai-studio-852a3beb-4523-41d2-9151-ec3264dc215e`.

---

## [2026-05] Initial Project Setup

**Commit:** `6ead04b`

- Express + Vite single-server architecture (`server.ts`).
- WhatsApp Cloud API webhook (`/webhook`).
- Gemini-powered patient detail extraction (`geminiService.ts`).
- Firebase Admin + web SDK dual setup.
- Basic `DashboardView` with booking list and status transitions.
- `BotSession` state machine with `ChatStep` flow from language selection → test selection → patient details → booking confirmation.
- Initial `firestore.rules` with user/booking/notification access control.
