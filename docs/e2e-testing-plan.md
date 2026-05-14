# E2E Manual Testing Plan — Booking Date & Scheduling Feature

Run these steps in order. Each section must pass before moving to the next.

---

## Prerequisites

- App running at `http://localhost:3000` (`npm run dev`)
- Signed in as a hardcoded admin (`tubejaf@gmail.com` or `fromdotacademy@gmail.com`)
- `config/booking` doc exists in Firestore (run `npx tsx scripts/seed-booking-config.ts` if missing)
- At least one active phlebotomist in `staff/{uid}` with a non-empty `defaultSchedule`

---

## 1. Settings Tab — Slot Template

**Goal:** Admin can view and edit the slot configuration.

1. Open the admin dashboard → click **Settings** tab.
2. Confirm three default slots are shown: `07:00–08:00`, `08:00–09:00`, `09:00–10:00`.
3. Confirm `Max advance days` shows `7`.
4. Click **Add Slot** → fill in `10:00` / `11:00` → click **Save**.
5. Reload the page → open Settings again → confirm the fourth slot persists.
6. Open Firestore console → `config/booking` → confirm `slots` array has 4 entries.
7. Remove the `10:00–11:00` slot → Save → confirm it disappears after reload.

**Pass criteria:** Slot edits persist and round-trip correctly.

---

## 2. Settings Tab — Max Advance Days

1. Change `Max advance days` to `3` → Save.
2. Open the in-dashboard WhatsApp Simulator → start a new booking → walk through patient details → confirm address.
3. At the date step, confirm only **3** date options appear (Today, Tomorrow, Day-after-tomorrow).
4. Reset `maxAdvanceDays` back to `7` via Settings → Save.

**Pass criteria:** Simulator date list respects `maxAdvanceDays`.

---

## 3. Schedule Tab — Phleb Availability Grid

**Goal:** Admin can override a phleb's working slots for a specific date.

1. Open **Schedule** tab → select today's date.
2. Confirm the grid shows each active phlebotomist with cells for each template slot.
3. Cells matching the phleb's `defaultSchedule[weekday]` should appear checked/active.
4. Toggle OFF one cell (e.g. phleb Anu, slot 07:00).
5. Open Firestore → `phlebAvailability` → confirm a doc `{today}_{phlebUid}` was created with `workingSlots` missing `07:00`.
6. Toggle the cell back ON → confirm the doc is updated (or removed if it now matches the default).
7. Click **Day Off** for a phleb → confirm `unavailable: true` is written to the override doc.
8. Reload the Schedule tab → confirm the grid reflects the saved state.

**Pass criteria:** Override docs are created/updated correctly; grid loads persisted state on reload.

---

## 4. Staff Tab — Default Schedule Editor

1. Open **Staff** tab → click **Add Staff** → choose role `phlebotomist`.
2. Confirm a **Default Schedule** section appears with 7 weekday rows.
3. Uncheck some slots (e.g. Saturday all slots) → click **Add**.
4. Confirm the new staff doc in Firestore has `defaultSchedule` set correctly.
5. Click **Edit Schedule** on the new phleb's row → modify Wednesday slots → confirm the inline editor updates the Firestore doc.

**Pass criteria:** `defaultSchedule` is written on create and editable inline.

---

## 5. WhatsApp Simulator — Date Selection Flow (Happy Path)

**Goal:** Full booking flow includes date and slot selection, and all new fields are written to Firestore.

1. Open the simulator → start a new booking.
2. Enter patient details (Name, Age, Phone), gender, address → confirm address.
3. **DATE_SELECTION step:** Confirm a message appears with 7 date buttons/rows (Today, Tomorrow, + 5 more).
4. Click **Tomorrow** → confirm the simulator advances to the time slot step.
5. **TIME_SLOT step:** Confirm 3 slot buttons appear matching the template.
6. Click `7:00 AM – 8:00 AM` → confirm the simulator advances to the fasting check.
7. Complete the booking (fasting, tests, payment) → confirm booking confirmation message shows:
   - The date (e.g. "Tomorrow — Thu, 15 May")
   - The slot (e.g. "7:00 AM – 8:00 AM")
8. Open Firestore → `bookings/{bookingId}` → confirm:
   - `bookingDate` = tomorrow's date as `YYYY-MM-DD`
   - `slotStart` = `"07:00"`
   - `slotEnd` = `"08:00"`
   - `timeSlot` = `"7:00 AM – 8:00 AM"`
   - `patientId` is set (non-null)

**Pass criteria:** All four new fields present on the booking doc.

---

## 6. WhatsApp Simulator — Malayalam Language

1. Start a new booking → choose **Malayalam** as language.
2. At the date step, confirm labels are in Malayalam (ഇന്ന്, നാളെ, etc.).
3. At the slot step, confirm the label is formatted in Malayalam (e.g. `7:00 AM – 8:00 AM` — format is the same but interface text is Malayalam).
4. Complete the booking → confirm `timeSlot` on the Firestore doc matches what was shown in the simulator.

**Pass criteria:** Malayalam date/slot labels display correctly; stored `timeSlot` matches displayed label.

---

## 7. WhatsApp Simulator — Invalid Date Input

1. Start a booking → reach the `DATE_SELECTION` step.
2. Type a free-text message like `"Yesterday"` or `"Next Monday"` (not matching any button label).
3. Confirm the bot re-prompts with an error mentioning the advance limit (e.g. "Please choose a date within the next 7 days") and shows the date options again.
4. Confirm the session stays on `DATE_SELECTION` (check Firestore `whatsapp_sessions/{phone}` if accessible).

**Pass criteria:** Bad date input triggers reprompt without advancing step.

---

## 8. Admin Bookings Table — New Date Column

1. Open the **Bookings** tab in the admin dashboard.
2. Confirm a **Date** column appears next to the Time column.
3. Bookings created in step 5 above should show the date formatted (e.g. "Thu, 15 May").
4. Any legacy booking (created before this feature) should show "—" with a "Legacy" badge.
5. Confirm the default sort is ascending by `bookingDate` then `slotStart`, with legacy bookings at the end.

**Pass criteria:** Date column renders correctly; sort order is correct; legacy bookings show badge.

---

## 9. Admin Assignment Dropdown — Filtered by Availability

1. Open the booking created in step 5 → click the **Assign** dropdown.
2. Confirm only phlebs with `slotStart = "07:00"` in their effective schedule for `bookingDate` appear.
   - If no phleb is scheduled, the dropdown should be empty or show a notice.
3. Check **Show all phlebs (override)** checkbox → confirm all active phlebs appear.
4. Assign a phleb → confirm `assignedTo`, `assignedToName`, and `status` → `Assigned` are written to Firestore.

**Pass criteria:** Filtered list respects availability; override bypass works; assignment writes correctly.

---

## 10. Schedule Tab — Conflict Guard

1. Navigate to the date of the booking created in step 5.
2. Find the assigned phleb's cell for slot `07:00`.
3. Try to toggle it OFF.
4. Confirm a warning appears: e.g. "1 booking exists at this slot — reassign first."
5. Confirm the cell toggle is disabled / reverted.

**Pass criteria:** Conflict guard prevents disabling an occupied slot.

---

## 11. Cascade Test — Reassignment

1. Take the booking from step 5 assigned to Phleb A.
2. Reassign it to Phleb B (use override toggle if needed).
3. Create a second booking for the same date + slot → open its assign dropdown.
4. Confirm Phleb A is now available again for this (date, slot).
5. Confirm Phleb B is NOT listed (already assigned there).

**Pass criteria:** Slot occupancy is derived correctly after reassignment — no stale inventory.

---

## 12. Legacy Booking Compatibility

1. Locate a booking without `bookingDate` (created before this feature, or create one by directly writing to Firestore without those fields).
2. Open it in the admin Bookings table → confirm "—" + "Legacy" badge in the Date column.
3. Admin can still edit `price`, `status`, `notes` → confirm the update succeeds.
4. Assign dropdown falls back to the unfiltered phleb list with a banner explaining why.
5. Attempt (as owner, via simulator) to update a legacy booking's patient details while status = `Created` → confirm it succeeds.

**Pass criteria:** Legacy bookings work without regressions; no forced migration required.

---

## 13. Firestore Rules Security Checks

Run these from the simulator while logged in as a **non-admin regular user** (customer):

| Test | Expected result |
|---|---|
| Write to `config/booking` | **Rejected** |
| Write to `phlebAvailability/*` | **Rejected** |
| Update own `Created` booking's `bookingDate` | **Allowed** |
| Update own `Assigned` booking | **Rejected** (status is not `Created`) |
| Read `staff/{uid}` of another user | **Rejected** |
| Read own `staff/{uid}` | **Allowed** (staff member reading own doc) |

**Pass criteria:** All six rules behave as expected.

---

## 14. Smoke Test Script (Optional but Recommended)

Pre-load env vars then run:

```powershell
Get-Content .env.local | ForEach-Object { if ($_ -match '^([^#][^=]*)=(.*)$') { [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process') } }
npx tsx scripts/smoke-test-date-flow.ts
```

Confirm all lines show `✓`. Any `✗` lines indicate a regression in the bot state machine.

---

## 15. Build & Type Check

```powershell
npm run lint   # must exit 0
npm run build  # must succeed
```

**Pass criteria:** Zero TypeScript errors; Vite build produces `dist/`.
