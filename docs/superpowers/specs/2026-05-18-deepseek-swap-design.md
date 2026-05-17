# DeepSeek swap — design

**Status:** Approved
**Date:** 2026-05-18
**Author:** Jafer (with Claude)

## Context

The patient-details parser in the WhatsApp webhook currently calls Google Gemini via `@google/genai`. Free-tier quota on the bound Google Cloud project is disabled (`limit: 0`), so every API call returns `429 RESOURCE_EXHAUSTED` and the parser returns `null`. A comma-split fallback was just added so the bot doesn't loop, but free-text and Malayalam inputs still fail.

Rather than enable billing on a free-tier-disabled Gemini project, switch the AI provider to DeepSeek (`deepseek-chat`). DeepSeek is OpenAI-API-compatible, has no free tier but cheap pay-as-you-go pricing, handles Malayalam well, and supports JSON-mode responses.

## Goal

Replace Gemini with DeepSeek behind the same `parsePatientDetails` seam, without disturbing the rest of the bot, the simulator, or the just-added comma-split fallback.

## Non-goals

- Switching the in-dashboard simulator (`App.tsx`) to use the AI provider. It stays on comma-split — calling DeepSeek from the browser would leak the API key in the client bundle, and the divergence is already documented in CLAUDE.md.
- Changing what fields are extracted (still name, age, phone, gender).
- Adding cost / usage tracking.
- Removing the comma-split fallback in `botLogic.ts` — it stays as defense-in-depth against any AI outage (DeepSeek 5xx, 402, network blocks).

## Architecture

The single seam is the function

```ts
parsePatientDetails(text: string): Promise<ExtractedPatientDetails | null>
```

in what is currently `src/services/geminiService.ts`. Its signature, return shape (`ExtractedPatientDetails`), and contract ("returns `null` on any failure, never throws") all stay exactly the same. Only the implementation swaps providers.

**Why this seam matters:** `botLogic.ts:317` calls `parsePatientDetails(value)` and branches on `parsed ?? commaSplitFallback`. As long as the contract holds, both the success path and the fallback path keep working without modification.

## File changes

| File | Change |
|---|---|
| `src/services/geminiService.ts` | Rename to `src/services/aiParserService.ts`. Re-implement against the `openai` SDK pointed at DeepSeek. |
| `src/services/botLogic.ts` | Update the single import path. No logic change. |
| `scripts/test-gemini.ts` | Rename to `scripts/test-ai-parser.ts`. Update import. |
| `package.json` | Remove `@google/genai`, add `openai`. |
| `.env.example` | Remove `GEMINI_API_KEY`, add `DEEPSEEK_API_KEY=`. |
| `CLAUDE.md` | In "Required environment", replace the Gemini bullet with DeepSeek. |
| `.env` | **User edits by hand** — delete `GEMINI_API_KEY`, add `DEEPSEEK_API_KEY=sk-...`. |

## Implementation sketch

### `src/services/aiParserService.ts`

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

### `src/services/botLogic.ts`

Only the import line changes:

```ts
// before
import { parsePatientDetails } from "./geminiService";
// after
import { parsePatientDetails } from "./aiParserService";
```

The `PATIENT_DETAILS_ENTRY` case (including the comma-split fallback) is untouched.

### `scripts/test-ai-parser.ts`

Same as today, with the import path updated and the env-var name in the log line changed to `DEEPSEEK_API_KEY`.

## Failure modes & monitoring

The renamed `===== AI CALL FAILED =====` block surfaces every failure mode by HTTP status. Operationally, the most likely failure once live is **402 Payment Required** — DeepSeek has no free tier and there's no quota that resets daily. If credits run out, the block names it explicitly and the comma-split fallback covers the gap so the bot keeps working for formatted inputs.

## Verification

You're done when **all** of these pass:

1. `npm install` after the dep swap completes without errors.
2. `npm run lint` (which is `tsc --noEmit && tsx scripts/check-button-limits.ts`) is clean.
3. `npx tsx scripts/test-ai-parser.ts` prints `Key present: true` and `Result: { name: 'Jafer', age: 35, phone: '9876543210', ... }`.
4. Real WhatsApp test, comma format ("Jafer, 35, 9876543210") → bot advances from `PATIENT_DETAILS_ENTRY` to `AVAILABILITY_CHECK` (asks for location).
5. Real WhatsApp test, free text ("I am Jafer, 35 years old, phone 9876543210") → same outcome.
6. Real WhatsApp test, Malayalam phrase containing name + age + phone → same outcome.
7. Server log shows `[ai] parsePatientDetails called` on every patient-details message, and no `===== AI CALL FAILED =====` block.
8. (Resilience check) Temporarily blank `DEEPSEEK_API_KEY` in `.env`, restart, send `Jafer, 35, 9876543210` over WhatsApp → fallback kicks in, log shows `[botLogic] AI parse failed — using comma-split fallback` (per the in-scope log-text update in the next section), bot still advances.

## Small follow-up (in scope)

The fallback log line in `botLogic.ts` currently reads `[botLogic] Gemini parse failed — using comma-split fallback`. Update it to `[botLogic] AI parse failed — using comma-split fallback` so the message matches the provider-neutral seam. One-line edit.

## Critical files

- `src/services/aiParserService.ts` (renamed from geminiService.ts) — full rewrite per sketch above.
- `src/services/botLogic.ts` — import path + one log string update.
- `scripts/test-ai-parser.ts` (renamed) — import path + env-var name in log.
- `package.json`, `.env.example`, `CLAUDE.md` — env/dep/doc updates.
