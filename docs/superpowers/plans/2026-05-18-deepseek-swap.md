# DeepSeek Swap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Gemini with DeepSeek (`deepseek-chat`) as the AI provider behind `parsePatientDetails`, preserving the existing function contract so the webhook flow, comma-split fallback, and simulator all keep working unchanged.

**Architecture:** Rename `geminiService.ts` → `aiParserService.ts` and re-implement against the `openai` SDK pointed at `https://api.deepseek.com`. The function signature and `null`-on-failure contract are preserved, so `botLogic.ts`'s `PATIENT_DETAILS_ENTRY` handler (including the just-added comma-split fallback) needs only an import-path update and one log-string update. The simulator in `App.tsx` is intentionally unchanged — it stays on comma-split because shipping an AI key to the browser would leak it.

**Tech Stack:** TypeScript, `openai` (SDK pointed at DeepSeek base URL), `tsx`, dotenv, Node ≥18 (for built-in fetch the SDK relies on).

**Reference spec:** `docs/superpowers/specs/2026-05-18-deepseek-swap-design.md`

**Pre-flight notes:**
- Working tree currently has unrelated edits to `firestore.rules` and `src/lib/adminEmails.ts`. Commit those separately or stash them — every `git add` in this plan names exact files to avoid mixing them in.
- The project has no test runner (per CLAUDE.md). Verification is via `npm run lint` (which runs `tsc --noEmit && tsx scripts/check-button-limits.ts`), the standalone `scripts/test-ai-parser.ts` script, and manual WhatsApp send.
- You'll need a real DeepSeek API key (https://platform.deepseek.com → API Keys, after adding credit) before Task 4 can fully verify.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/services/aiParserService.ts` | **Create** | DeepSeek-backed implementation of `parsePatientDetails`. Single seam for all AI parsing. |
| `src/services/geminiService.ts` | **Delete** (Task 7) | Removed once the new service is verified working. |
| `src/services/botLogic.ts` | **Modify** (import + 1 log line) | Switch import target; rename "Gemini" → "AI" in the fallback log. |
| `scripts/test-ai-parser.ts` | **Create** | Standalone sanity test that calls `parsePatientDetails` once. |
| `scripts/test-gemini.ts` | **Delete** (Task 7) | Replaced by `test-ai-parser.ts`. |
| `package.json` | **Modify** | Remove `@google/genai`, add `openai`. |
| `.env.example` | **Modify** | Replace `GEMINI_API_KEY=` with `DEEPSEEK_API_KEY=`. |
| `CLAUDE.md` | **Modify** ("Required environment" section) | Replace Gemini bullet with DeepSeek. |
| `.env` (your local file, gitignored) | **You edit by hand** | Add `DEEPSEEK_API_KEY=sk-...`; can leave `GEMINI_API_KEY=` in place or delete — it's unused after this plan. |

---

## Task 1: Add `openai` dependency alongside the existing `@google/genai`

**Files:**
- Modify: `package.json` (dependencies block)

Add `openai` first while `@google/genai` is still present — keeps the tree compiling between tasks. The old package gets removed in Task 7.

- [ ] **Step 1: Install the openai SDK**

Run in PowerShell at the project root:

```powershell
npm install openai
```

Expected: package.json `dependencies` now contains a new `"openai": "^<version>"` entry. `package-lock.json` updates.

- [ ] **Step 2: Confirm both packages now coexist**

```powershell
npm ls openai @google/genai
```

Expected output lists both packages with version numbers (no UNMET DEPENDENCY).

- [ ] **Step 3: Type-check the unchanged codebase still passes**

```powershell
npm run lint
```

Expected: clean exit. The pre-existing button-label warning about "🏠 Home Sample Test" is acceptable noise.

- [ ] **Step 4: Commit**

```powershell
git add package.json package-lock.json
git commit -m "chore: add openai SDK ahead of DeepSeek swap"
```

---

## Task 2: Create `aiParserService.ts` with the DeepSeek implementation

**Files:**
- Create: `src/services/aiParserService.ts`

Keep `geminiService.ts` in place for now — nothing imports the new file yet, so both coexist harmlessly.

- [ ] **Step 1: Create the new service file**

Create `src/services/aiParserService.ts` with this exact content:

```ts
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || "",
  baseURL: "https://api.deepseek.com",
});

export interface ExtractedPatientDetails {
  name: string;
  age: number;
  phone: string;
  isMale?: boolean;
  isFemale?: boolean;
}

export async function parsePatientDetails(
  text: string,
): Promise<ExtractedPatientDetails | null> {
  const model = "deepseek-chat";

  console.log("[ai] parsePatientDetails called, input length:", text.length);

  const systemPrompt =
    "You extract patient details from short messages. " +
    "Messages may be in English or Malayalam. " +
    "Respond ONLY with a JSON object of shape " +
    `{"name": string, "age": number, "phone": string, "gender": "Male"|"Female"|"Other"|"Unknown"}. ` +
    "If a field is missing, omit it or set it to null. Use null for unknown gender.";

  try {
    const response = await client.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
    });

    const raw = response.choices[0]?.message?.content || "{}";
    const result = JSON.parse(raw);
    if (!result.name) return null;

    return {
      name: result.name,
      age: result.age || 0,
      phone: result.phone || "",
      isMale: result.gender === "Male",
      isFemale: result.gender === "Female",
    };
  } catch (error: any) {
    // Loud, structured failure log so the actual cause is obvious in `npm run dev` output.
    //   - status 401 → bad/missing DEEPSEEK_API_KEY
    //   - status 402 → account out of credits (DeepSeek has no free tier; top up at platform.deepseek.com)
    //   - status 429 → rate limit
    //   - status 5xx → DeepSeek outage
    //   - name 'FetchError' / ENOTFOUND / ETIMEDOUT → network blocked
    console.error("===== AI CALL FAILED =====");
    console.error("name:        ", error?.name);
    console.error("status:      ", error?.status);
    console.error("message:     ", error?.message);
    console.error("apiKeyPresent:", Boolean(process.env.DEEPSEEK_API_KEY));
    console.error("apiKeyLen:   ", (process.env.DEEPSEEK_API_KEY || "").length);
    console.error("model:       ", model);
    console.error("==========================");
    return null;
  }
}
```

- [ ] **Step 2: Type-check**

```powershell
npm run lint
```

Expected: clean exit. (If you get a "cannot find module 'openai'" error, Task 1 didn't run — re-run `npm install openai`.)

- [ ] **Step 3: Commit**

```powershell
git add src/services/aiParserService.ts
git commit -m "feat(ai): add aiParserService backed by DeepSeek"
```

---

## Task 3: Create the standalone test script and add your DeepSeek key

**Files:**
- Create: `scripts/test-ai-parser.ts`
- You edit by hand: `.env` (add `DEEPSEEK_API_KEY=sk-...`)

- [ ] **Step 1: Create the test script**

Create `scripts/test-ai-parser.ts` with this exact content:

```ts
/**
 * Isolated AI parser sanity test (DeepSeek).
 *
 * Purpose: call `parsePatientDetails` once with a hardcoded message so any failure
 * is purely the DeepSeek SDK call — no WhatsApp, no webhook, no session, no Firestore.
 *
 * Usage:
 *   npx tsx scripts/test-ai-parser.ts
 *
 * If env vars don't load via `dotenv/config` (see CLAUDE.md's tsx+dotenv timing note),
 * pre-load them in PowerShell first:
 *
 *   Get-Content .env | ForEach-Object {
 *     if ($_ -match '^([^#][^=]*)=(.*)$') {
 *       [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process')
 *     }
 *   }
 *   npx tsx scripts/test-ai-parser.ts
 *
 * Expected output on success:
 *   Key present: true   keyLen: 35
 *   [ai] parsePatientDetails called, input length: 21
 *   Result: { name: 'Jafer', age: 35, phone: '9876543210', ... }
 */

import "dotenv/config";
import { parsePatientDetails } from "../src/services/aiParserService";

(async () => {
  console.log("Key present:", Boolean(process.env.DEEPSEEK_API_KEY), " keyLen:", (process.env.DEEPSEEK_API_KEY || "").length);

  const sample = "Jafer, 35, 9876543210";
  const result = await parsePatientDetails(sample);

  console.log("Input :", sample);
  console.log("Result:", result);

  if (!result) {
    console.error("\nparsePatientDetails returned null — check the AI CALL FAILED block above.");
    process.exit(1);
  }

  console.log("\nDeepSeek is reachable and parsing successfully.");
  process.exit(0);
})();
```

- [ ] **Step 2: Add your DeepSeek API key to `.env`**

Open `.env` in your editor. Add a new line:

```
DEEPSEEK_API_KEY=sk-...your real key here...
```

If you haven't got a key yet: https://platform.deepseek.com/api_keys (you must add a few dollars of credit first — DeepSeek has no free tier). Save the file.

Do not commit `.env`. It's gitignored.

- [ ] **Step 3: Type-check the new script**

```powershell
npm run lint
```

Expected: clean exit.

- [ ] **Step 4: Commit the script**

```powershell
git add scripts/test-ai-parser.ts
git commit -m "test(ai): add isolated DeepSeek sanity script"
```

---

## Task 4: Verify DeepSeek end-to-end via the test script

**Files:** none modified — verification only.

- [ ] **Step 1: Run the test script**

```powershell
npx tsx scripts/test-ai-parser.ts
```

Expected output:

```
Key present: true   keyLen: <some number > 30>
[ai] parsePatientDetails called, input length: 21
Input : Jafer, 35, 9876543210
Result: { name: 'Jafer', age: 35, phone: '9876543210', isMale: false, isFemale: false }

DeepSeek is reachable and parsing successfully.
```

- [ ] **Step 2: If you see `===== AI CALL FAILED =====`, diagnose by `status`**

- `apiKeyPresent: false` → Step 2 of Task 3 didn't take effect. Confirm `.env` has the key with no quotes and no trailing spaces; if env loading is flaky on tsx, use the PowerShell pre-load one-liner in the script header.
- `status: 401` → key is malformed or revoked. Mint a new one.
- `status: 402` → account out of credits. Top up at platform.deepseek.com.
- `status: 429` → rate limit. Wait a few seconds and retry.
- `name: 'FetchError'` / `ENOTFOUND` / `ETIMEDOUT` → network blocked. Check VPN/firewall reach to `api.deepseek.com`.

Resolve before continuing. Do not proceed to Task 5 until the test script prints `DeepSeek is reachable`.

- [ ] **Step 3: No commit for this task**

This task is verification only — nothing to commit.

---

## Task 5: Switch `botLogic.ts` to the new service and update the fallback log

**Files:**
- Modify: `src/services/botLogic.ts` (one import line, one log string)

- [ ] **Step 1: Update the import**

Open `src/services/botLogic.ts`. Find the existing import line (near the top of the file):

```ts
import { parsePatientDetails } from "./geminiService";
```

Replace with:

```ts
import { parsePatientDetails } from "./aiParserService";
```

- [ ] **Step 2: Update the fallback log message**

In the same file, inside the `PATIENT_DETAILS_ENTRY` case (around lines 320–340), find this line:

```ts
console.warn('[botLogic] Gemini parse failed — using comma-split fallback');
```

Replace with:

```ts
console.warn('[botLogic] AI parse failed — using comma-split fallback');
```

- [ ] **Step 3: Type-check**

```powershell
npm run lint
```

Expected: clean exit.

- [ ] **Step 4: Commit**

```powershell
git add src/services/botLogic.ts
git commit -m "refactor(bot): wire PATIENT_DETAILS_ENTRY to aiParserService"
```

---

## Task 6: Manual WhatsApp verification (end-to-end)

**Files:** none modified — runtime verification only.

- [ ] **Step 1: Restart the dev server**

If `npm run dev` is already running, stop it (Ctrl+C) and restart:

```powershell
npm run dev
```

Wait for "Listening on :3000" or equivalent.

- [ ] **Step 2: Send a comma-format message via real WhatsApp**

From your phone, message the bot's WhatsApp number: `Jafer, 35, 9876543210`

Expected in server logs:
- `[ai] parsePatientDetails called, input length: 21`
- No `===== AI CALL FAILED =====` block.

Expected on phone: bot advances to the location/availability prompt (the `t.askLocation` message).

- [ ] **Step 3: Send a free-text message via real WhatsApp**

Start a fresh session (back to main menu, choose home sample test again). Send: `I am Jafer, 35 years old, my number is 9876543210`

Expected: same outcome as Step 2 — this is what DeepSeek buys you over plain comma-split.

- [ ] **Step 4: (Optional) Malayalam check**

If you have a Malayalam phrase containing name/age/phone, send it. Expected: same outcome. If it fails, that's not a blocker for this plan — it's a prompt-tuning issue.

- [ ] **Step 5: Resilience check — fallback still fires when AI is down**

Stop the dev server. Edit `.env`: comment out `DEEPSEEK_API_KEY` (prepend `#`). Restart `npm run dev`. Send `Jafer, 35, 9876543210` from WhatsApp.

Expected in logs:
- `===== AI CALL FAILED =====` (with `apiKeyPresent: false`)
- `[botLogic] AI parse failed — using comma-split fallback`

Expected on phone: bot still advances. The fallback works.

Stop the server, uncomment the key in `.env`, restart.

- [ ] **Step 6: No commit for this task**

Runtime verification only.

---

## Task 7: Remove the old Gemini code

**Files:**
- Delete: `src/services/geminiService.ts`
- Delete: `scripts/test-gemini.ts`
- Modify: `package.json` (remove `@google/genai`)

- [ ] **Step 1: Confirm nothing still imports `geminiService`**

```powershell
npx tsc --noEmit
```

Then search for stragglers (recursive search through TS sources):

```powershell
Get-ChildItem -Path src,scripts,server.ts -Include *.ts -Recurse -File | Select-String -Pattern "geminiService" -SimpleMatch
```

Expected: zero matches. (If any match exists, fix it before deleting the file.)

- [ ] **Step 2: Delete the old service and script via git**

```powershell
git rm src/services/geminiService.ts scripts/test-gemini.ts
```

- [ ] **Step 3: Uninstall `@google/genai`**

```powershell
npm uninstall @google/genai
```

Expected: `package.json` no longer lists `@google/genai`; `package-lock.json` updates.

- [ ] **Step 4: Type-check and run the (renamed) test once more**

```powershell
npm run lint
npx tsx scripts/test-ai-parser.ts
```

Expected: lint clean; test script prints `DeepSeek is reachable`.

- [ ] **Step 5: Commit the cleanup**

```powershell
git add package.json package-lock.json
git commit -m "chore: remove @google/genai and legacy gemini files"
```

---

## Task 8: Update `.env.example` and `CLAUDE.md`

**Files:**
- Modify: `.env.example`
- Modify: `CLAUDE.md` (Required environment section)

- [ ] **Step 1: Update `.env.example`**

Open `.env.example`. Find these two lines (around line 9–10):

```
# Gemini
GEMINI_API_KEY=
```

Replace with:

```
# DeepSeek (AI parser for patient details). No free tier — top up at platform.deepseek.com.
DEEPSEEK_API_KEY=
```

- [ ] **Step 2: Update `CLAUDE.md`**

In `CLAUDE.md`'s "Required environment" section, find the bullet:

```
- `GEMINI_API_KEY` — used by `src/services/geminiService.ts` to parse free-form patient details.
```

Replace with:

```
- `DEEPSEEK_API_KEY` — used by `src/services/aiParserService.ts` to parse free-form patient details via DeepSeek (`deepseek-chat`). DeepSeek has no free tier; add credit at platform.deepseek.com. The webhook falls back to a strict comma-split parser if the call fails for any reason.
```

- [ ] **Step 3: Commit**

```powershell
git add .env.example CLAUDE.md
git commit -m "docs: switch env and CLAUDE.md from Gemini to DeepSeek"
```

---

## Final Verification Checklist

After Task 8, all of these must hold:

- [ ] `npm run lint` clean.
- [ ] `npx tsx scripts/test-ai-parser.ts` exits 0 with `DeepSeek is reachable`.
- [ ] `git log --oneline -10` shows the eight-task commit sequence (chore → feat → test → refactor → chore → docs).
- [ ] Real WhatsApp comma-format message advances to `AVAILABILITY_CHECK`.
- [ ] Real WhatsApp free-text message advances to `AVAILABILITY_CHECK`.
- [ ] Disabling `DEEPSEEK_API_KEY` and re-sending a comma-format message still advances (fallback fires).
- [ ] Stragglers check returns zero matches outside `.env` (your local file) and `package-lock.json` transitive entries:

```powershell
Get-ChildItem -Path src,scripts,server.ts,package.json,.env.example,CLAUDE.md -Include *.ts,*.json,*.md -Recurse -File | Select-String -Pattern "GEMINI_API_KEY|geminiService|@google/genai"
```

(`package-lock.json` may still mention transitive Google packages — that's fine. The direct `@google/genai` line in `package.json` should be gone, and no source file should reference `geminiService` or `GEMINI_API_KEY`.)
