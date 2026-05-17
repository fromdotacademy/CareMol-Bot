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
