# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

CareMol Lab Assistant — a WhatsApp-integrated platform for booking lab tests and managing home sample collection around Melattur (PIN 679326). One Node process serves both a WhatsApp webhook (real bot) and a React admin dashboard with an in-browser bot simulator.

## Commands

- `npm run dev` — start the combined server (Express + Vite dev middleware) on port 3000 via `tsx server.ts`. Use this for normal development; HMR is controlled by `DISABLE_HMR` env var.
- `npm start` — same entry point but via `node`, intended for environments that pre-compile TS.
- `npm run build` — Vite build into `dist/` (frontend only).
- `npm run preview` — Vite static preview of the build.
- `npm run lint` — type-check the project (`tsc --noEmit`). There is no separate ESLint script for source files; the ESLint config (`eslint.config.mjs`) targets only `firestore.rules`.
- `npm run clean` — `rm -rf dist`.

There is no test framework configured. `security_spec.md` describes the rules-test cases that would be implemented with `@firebase/rules-unit-testing` but no runner is wired up.

## Required environment

Copy `.env.example` to `.env.local` (or `.env`) and set:

- `GEMINI_API_KEY` — used by `src/services/geminiService.ts` to parse free-form patient details.
- `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` — WhatsApp Cloud API (Graph v17.0). When missing, `sendWhatsAppMessage` warns and no-ops, so the webhook is testable without credentials.
- `VERIFY_TOKEN` — webhook verification challenge (defaults to `caremol_verify_token`).
- `VITE_GOOGLE_MAPS_API_KEY` — read by `mapsService.ts` (note: it is checked on both `process.env` and `import.meta.env` to work on server and client).
- `CAREMOL_PHONE` / `VITE_CAREMOL_PHONE` — phone number (international format, no leading `+`, e.g. `919876543210`). Used by the "📞 Call CareMol" and "👨‍⚕️ Talk to Support" main-menu options. The unprefixed copy is read by `botLogic.ts` via `process.env.CAREMOL_PHONE`; the `VITE_`-prefixed copy is read by the in-dashboard simulator via `import.meta.env.VITE_CAREMOL_PHONE`. Both fall back to placeholder `919000000000` if unset.
- `FIREBASE_SERVICE_ACCOUNT` (optional) — JSON-stringified service account **on a single line**. Multi-line JSON breaks `.env` parsing. If absent, Admin SDK falls back to Application Default Credentials.
- `FIREBASE_KEY_FILE` or `GOOGLE_APPLICATION_CREDENTIALS` — alternative to `FIREBASE_SERVICE_ACCOUNT`; set to the path of the downloaded service account JSON file. Avoids the single-line JSON requirement.

Firebase web/client config is checked in at `firebase-applet-config.json` and imported directly by `src/lib/firebase.ts`; the `firestoreDatabaseId` field is non-`(default)` and is passed to both `getFirestore` calls (web and admin).

## Deploying Firestore rules

`firebase.json` and `.firebaserc` are checked in (project `fromdot-project`, database `ai-studio-852a3beb-4523-41d2-9151-ec3264dc215e`). After editing `firestore.rules`, deploy with:

```
firebase deploy --only firestore:rules
```

Run from the project root (where `firebase.json` lives). Two known lint warnings are harmless: `isEmailVerified` unused, and `Invalid variable name: request` (false positive — `request` is a built-in rules variable).

## Architecture

### One server, two surfaces

`server.ts` is the single entrypoint. It deliberately:

1. Registers `/api/health` and calls `app.listen()` **before** any heavy import — this keeps cold-start fast for platforms that probe the port.
2. Calls an async `init()` that dynamically imports `firebaseAdmin`, `botLogic`, and `whatsappService`, then mounts the WhatsApp webhook routes and the frontend.
3. In dev (`NODE_ENV !== 'production'`) mounts Vite as middleware so React is served from the same port; in prod it serves `dist/` and falls through to `index.html` for SPA routing.

If you add new routes that depend on the heavy services, register them **inside** `init()`, after the imports — registering them at top-level will fail.

### Bot conversation: two parallel implementations

The chatbot flow exists **twice** and the two copies must be kept in sync:

- `src/services/botLogic.ts` — authoritative server-side state machine driven by the WhatsApp webhook. Persists `BotSession` per phone number in Firestore `whatsapp_sessions/{phone}`. Uses Gemini (`parsePatientDetails`) to extract `Name, Age, Phone` from free text.
- `src/App.tsx` → `WhatsAppSimulator` component — a client-side reimplementation of the same `ChatStep` state machine for the in-dashboard simulator. It does **not** call the webhook; it does simple comma-split parsing instead of Gemini and writes directly to Firestore via the web SDK (a comment in the file flags this divergence).

When you change conversation behavior (new step, new button, new translation key), update **both** files. `ChatStep`, the translation tables, and `TEST_PRICES` are shared via `src/types.ts` and `src/constants.ts`.

**Patient profile invariant.** Patient profiles are created (or referenced) the moment patient details are captured — `PATIENT_DETAILS_ENTRY` upserts the profile and stamps `patientId` on the session; `PATIENT_SELECTION` reuses an existing profile's id; subsequent steps (`PATIENT_GENDER`, `PATIENT_ADDRESS_CONFIRM`) merge new fields into the same profile. Every `Booking` therefore has a non-null `patientId` (`Booking.patientId` is a required field on the type). The `PAYMENT` step rejects the booking if `patientId` is missing rather than writing an orphan. Helpers live in `botLogic.ts` (`upsertPatientProfile`) and `App.tsx` (`upsertPatientWeb`); keep them in lockstep. Legacy bookings without `patientId` can be relinked with `scripts/backfill-patientid.ts`. **Important:** tsx's dynamic import + dotenv have a timing conflict — env vars must be pre-loaded in the shell before running the script, not relied on from dotenv inside it. The script uses static imports. Run from the project root in PowerShell:

```powershell
# Step 1 — load env vars into the current shell session
Get-Content .env.local | ForEach-Object { if ($_ -match '^([^#][^=]*)=(.*)$') { [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process') } }
# Step 2 — preview (no writes)
npx tsx scripts/backfill-patientid.ts --dry
# Step 3 — write
npx tsx scripts/backfill-patientid.ts
```

The Melattur service-area gate currently checks `value.includes('679326')` literally in `botLogic.ts`; `mapsService.geocodeLocation` / `isWithinRange` exist but are not wired into the booking flow.

### Firestore model and access

Two SDKs are used in the same process:

- `src/lib/firebase.ts` — **web SDK**, used by the React app and the in-browser simulator. Subject to `firestore.rules`.
- `src/services/firebaseAdmin.ts` — **Admin SDK**, used by the WhatsApp webhook path. Bypasses rules.

Collections (see `firebase-blueprint.json` for canonical shapes):

- `users/{phone}` — per-WhatsApp-user profile.
- `users/{phone}/patients/{patientId}` — saved patient profiles, reused on repeat bookings.
- `bookings/{bookingId}` — booking records; the dashboard subscribes via `onSnapshot`.
- `notifications/{id}` — created by the dashboard when a booking transitions to `Completed`.
- `whatsapp_sessions/{phone}` — server-only session state for the webhook bot.

### Role model & gating

Roles live in `staff/{uid}` (top-level collection) with `{ role: 'admin' | 'phlebotomist', active, name, email, … }`. Resolution order in both client and rules:

1. **Hardcoded bootstrap admins** — `tubejaf@gmail.com` and `fromdotacademy@gmail.com` are always treated as admins so the app can be re-administered if `staff` is wiped. Defined twice and kept in sync: `HARDCODED_ADMIN_EMAILS` in `src/App.tsx` and `isHardcodedAdmin()` in `firestore.rules`.
2. **`staff/{uid}` lookup** — when present and `active: true`, the doc's `role` field decides whether the user routes to `DashboardView` (admin), `PhlebotomistDashboard` (phlebotomist), or the customer-only view.

`useStaffRole` (`src/App.tsx`) subscribes to `staff/{uid}` and returns `'admin' | 'phlebotomist' | 'customer'`. Rules expose `isAdmin()` and `isPhlebotomist()` built on the same lookup. Booking rules:

- **Admin**: may edit `status, price, assignedTo, assignedToName, priority, testNames, notes` on any booking (final transition to `Completed` is admin-only).
- **Phlebotomist**: may self-assign an unclaimed `Created` booking (sets `status: 'Assigned'` + `assignedTo: own uid`), and once assigned may update `testNames, price, status, notes` of their own bookings through the transitions `Assigned → Collected → Processing`.
- **Owner** (the booking's `userId == auth.uid`): may edit a narrow set of fields only while `status == 'Created'`.

### Path alias

`tsconfig.json` and `vite.config.ts` both map `@/*` to the project root (not `src/`). Existing source uses relative imports; if you introduce `@/...` imports, verify they resolve in both server (`tsx`) and Vite contexts.

### Priority helper

`resolvePriority(booking)` in `src/App.tsx` is the single source of truth: it returns the explicit `booking.priority` if set, otherwise derives from status (`Created → high`, `Assigned → medium`, `Collected/Processing → low`, `Completed → null`). Both admin and phlebotomist views use this; if you change the derivation, fix here only.

### Staff onboarding flow

There is no Firebase-Admin-side user creation in the app. To onboard a phlebotomist or admin: have them sign in to the app once with Google (which creates their Firebase Auth account), grab their UID from the Auth tab in Firebase console, then in the admin dashboard's **Staff** tab paste the UID + email + name + role. The `staff/{uid}` doc gates everything else. Disabling is `active: false` (the rules check both presence and `active`); the user instantly drops to the customer view.

### Phlebotomist queries

Phlebotomists cannot list `bookings` unfiltered — the rules require a filter that all returned docs can satisfy. `PhlebotomistDashboard` runs two scoped subscriptions:

1. `where('assignedTo', '==', user.uid)` — own assignments (any status).
2. `where('status', '==', 'Created')` — the unassigned queue. The UI further filters to `!assignedTo` because the rule allows reading any Created booking (including admin-pre-assigned ones) to keep the rule simple.

## Conventions worth knowing

- The Express webhook responds to WhatsApp `text` and `interactive` (button/list reply) message types only; other types are silently dropped (`server.ts:51`).
- `sendWhatsAppMessage` (`src/services/whatsappService.ts`) auto-picks the WhatsApp payload shape from `buttons.length`: text-only, 1–3 reply buttons, or list (up to 10). Button titles are truncated to 20 chars, list rows to 24.
- `App.tsx` is a single ~1300-line file containing the auth wrapper, dashboard, and simulator. Prefer extending it in place; the only extracted component so far is `src/components/Verify.tsx` (a `/api/health` probe widget).
- `firestore.rules` denies everything by default (`match /{document=**} { allow read, write: if false; }`) and then re-opens specific paths. New collections need explicit allow rules or they will be inaccessible from the web SDK.
- The dev server intentionally disables file-watching when `DISABLE_HMR=true` (set by AI Studio) to prevent flicker during agent edits — leave the guard in `vite.config.ts` alone.
