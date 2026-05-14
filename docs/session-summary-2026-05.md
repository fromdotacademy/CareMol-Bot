# Session Summary — CareMol Booking Date & Scheduling Feature (May 2026)

Paste this at the start of the next conversation for full context.

---

## Project

**CareMol Lab Assistant** — WhatsApp bot + React admin dashboard for home blood-sample collection near Melattur, Kerala (PIN 679326).

- One Node process: Express webhook + Vite dev middleware on port 3000.
- Two parallel bot implementations that MUST stay in lockstep:
  - `src/services/botLogic.ts` — Admin SDK, server, real WhatsApp webhook.
  - `WhatsAppSimulator` in `src/App.tsx` — web SDK, in-dashboard, for testing.
- Firebase project `fromdot-project`, named database `ai-studio-852a3beb-4523-41d2-9151-ec3264dc215e`.
- Hardcoded admin emails: `tubejaf@gmail.com`, `fromdotacademy@gmail.com`.

---

## What Was Built This Session

### Core feature: booking date + per-phlebotomist slot scheduling

Customers now pick a **date** (up to `maxAdvanceDays` days ahead) and a **time slot** from the admin-configured template. Admin can manage:

- **Slot template** via Settings tab → `config/booking` Firestore singleton.
- **Phleb weekly default schedule** on `staff/{uid}.defaultSchedule`.
- **Per-date overrides** via Schedule tab → `phlebAvailability/{YYYY-MM-DD}_{phlebUid}` (sparse).
- **Filtered assignment dropdown** showing only phlebs available for the booking's (date, slot).

### New/changed files

| File | Change |
|---|---|
| `src/types.ts` | Added `DATE_SELECTION` to `ChatStep`; added `bookingDate/slotStart/slotEnd` to `Booking`; added `WeeklySchedule`, `SlotConfig`, `BookingConfig`, `PhlebAvailability` interfaces; added `defaultSchedule` to `Staff` |
| `src/constants.ts` | New i18n keys: `chooseDate`, `today`, `tomorrow`, `weekdaysShort`, `monthsShort`, `advanceLimitError`, `legacyTimeSlotMissing` (en + ml) |
| `src/services/slotService.ts` | **New.** All pure date/slot helpers: `getISTToday`, `getNextNDates`, `formatDateLabel`, `formatSlotLabel`, `effectiveSlotsFromDocs`, TTL-cached config loader |
| `src/services/botLogic.ts` | `loadBookingConfig()` helper; `PATIENT_ADDRESS_CONFIRM` now goes to `DATE_SELECTION`; new `DATE_SELECTION` case; rewritten `TIME_SLOT` case; confirmation summary includes date + slot |
| `src/App.tsx` | `useBookingConfig()` hook; `DefaultScheduleEditor`, `SettingsView`, `ScheduleView` components; `getAssignablePhlebs()` with conflict detection; `useMemo filteredBookings` with date sort; `WhatsAppSimulator` mirrors `botLogic.ts` changes; phleb dashboard shows date; Staff tab has schedule editor |
| `firestore.rules` | Extended `hasOnly` lists; added `config` + `phlebAvailability` rules; **added collection-group wildcard rule** for `patients` |
| `firestore.indexes.json` | **New.** Composite index `(bookingDate, slotStart, assignedTo, status)` on `bookings` |
| `firebase.json` | Added `"indexes": "firestore.indexes.json"` |
| `firebase-blueprint.json` | Updated Booking/Staff schemas; added BookingConfig + PhlebAvailability entities and Firestore paths |
| `CLAUDE.md` | Added scheduling section; collection-group rule note; smoke test note |
| `scripts/seed-booking-config.ts` | **New.** Idempotent seed for `config/booking` (3 default slots 07–10, maxAdvanceDays 7) |
| `scripts/smoke-test-date-flow.ts` | **New.** Admin SDK bot E2E test for DATE_SELECTION → TIME_SLOT → FASTING_CHECK |
| `docs/e2e-testing-plan.md` | **New.** 15-step manual testing plan |
| `docs/feature-changes.md` | **New.** Full feature changelog |

---

## Critical Bug Fixed

**"Database Error: list on patients"** — The admin dashboard uses `collectionGroup(db, 'patients')`. This requires a Firestore wildcard rule `match /{path=**}/patients/{patientId}` in addition to the existing path-bound rule. The path rule alone does NOT cover collection group queries. The wildcard rule was added and deployed.

---

## Key Architecture Facts

### Slot occupancy is derived
No inventory collection. "Is (phleb, date, slot) taken?" = query:
```
bookings where bookingDate == D and slotStart == S and assignedTo == P and status != 'Completed'
```
Composite index declared in `firestore.indexes.json`. Must be deployed with `firebase deploy --only firestore:indexes`.

### Effective slot resolution (priority order)
1. `phlebAvailability/{date}_{uid}` override doc (if exists and `unavailable: true` → empty)
2. `phlebAvailability/{date}_{uid}.workingSlots` (if override doc exists)
3. `staff/{uid}.defaultSchedule[weekday]`
4. Empty (phleb has no schedule)

Function: `effectiveSlotsFromDocs(staff, override, isoDate)` in `slotService.ts`.

### Date handling
- All `bookingDate` as `YYYY-MM-DD` strings (not Timestamps) to avoid IST timezone bugs.
- `getISTToday()` uses `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' })`.
- Legacy bookings (no `bookingDate`) are optional in rules; render with "Legacy" badge in UI.

### Config cache
`getCachedBookingConfig()` / `rememberBookingConfig()` provide ~60s in-memory TTL so the bot doesn't hit Firestore on every WhatsApp turn. `invalidateBookingConfigCache()` for testing.

### Bot state machine dual-sync rule
When changing `ChatStep` flow in `botLogic.ts`, you MUST make the same change in `WhatsAppSimulator` in `App.tsx`. They share types and constants but are separate state machines.

---

## What's Not Done Yet

1. **Smoke test not run yet** — `scripts/smoke-test-date-flow.ts` was written but not executed. Run it after env pre-load to confirm the bot flow works end-to-end.
2. **Firestore indexes not deployed** — `firebase.json` references `firestore.indexes.json` but `firebase deploy --only firestore:indexes` has not been run. The composite index may auto-create from the first failed query in Firestore, but explicit deployment is safer.
3. **Seed script not run** — `scripts/seed-booking-config.ts` needs to be run once to create the `config/booking` doc if it doesn't already exist. Check Firestore console first.
4. **End-to-end browser testing not complete** — The patients error was fixed and rules deployed, but the full 15-step E2E plan in `docs/e2e-testing-plan.md` has not been walked through yet.
5. **No reschedule notifications** — when admin changes booking date/slot/assignee, the customer is NOT notified over WhatsApp. Deferred to future iteration.
6. **Branch not merged to main** — all changes are on `claude/inspiring-hamilton-5b3b27`.

---

## Commit Advice (carried over)

See the next section in the main conversation for detailed commit guidance. Short version:
- Run `npm run lint` → must pass.
- Run the smoke test → all `✓`.
- Do one comprehensive commit or split into: (1) schema + rules, (2) slotService, (3) botLogic + simulator, (4) admin UI.
- Merge to `main` only after manual E2E verification.

---

## How to Run

```powershell
# Load env vars
Get-Content .env.local | ForEach-Object { if ($_ -match '^([^#][^=]*)=(.*)$') { [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process') } }

# Seed config/booking (first time only)
npx tsx scripts/seed-booking-config.ts

# Deploy rules + indexes
firebase deploy --only firestore:rules,firestore:indexes

# Run smoke test
npx tsx scripts/smoke-test-date-flow.ts

# Start dev server
npm run dev
```
