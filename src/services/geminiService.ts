import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface ExtractedPatientDetails {
  name: string;
  age: number;
  phone: string;
  isMale?: boolean;
  isFemale?: boolean;
}

export async function parsePatientDetails(text: string): Promise<ExtractedPatientDetails | null> {
  // gemini-1.5-flash is deprecated per @google/genai 2.x docs; using the lite tier of 2.0 (fast, low-cost,
  // sufficient for short structured-JSON extraction like Name/Age/Phone, higher free-tier RPM).
  const model = "gemini-2.0-flash-lite";

  console.log("[gemini] parsePatientDetails called, input length:", text.length);


  const prompt = `
    Extract patient details from the following message. 
    The message might be in English or Malayalam.
    If the message is in Malayalam, understand the intent and extract correctly.

    Look for:
    - Name (Full name if possible)
    - Age (numeric, e.g. 35)
    - Phone number (10 digits usually)
    - Gender (Male/Female/Other)

    Message: "${text}"

    Rules:
    1. If a detail is missing, set it to null or omit.
    2. Respond strictly in JSON format.
    3. For gender, use "Male", "Female", or "Other".
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            age: { type: Type.NUMBER },
            phone: { type: Type.STRING },
            gender: { type: Type.STRING, enum: ["Male", "Female", "Other", "Unknown"] }
          },
          required: ["name"]
        }
      }
    });

    const result = JSON.parse(response.text || "{}");
    if (!result.name) return null;

    return {
      name: result.name,
      age: result.age || 0,
      phone: result.phone || "",
      isMale: result.gender === "Male",
      isFemale: result.gender === "Female"
    };
  } catch (error: any) {
    // Loud, structured failure log so the actual cause is obvious in `npm run dev` output.
    // Failure modes this surfaces:
    //   - status 404 → bad/deprecated model name
    //   - status 401/403 → missing or invalid GEMINI_API_KEY
    //   - status 429 → quota exhausted
    //   - name 'FetchError' / ENOTFOUND / ETIMEDOUT → network blocked (firewall, DNS, VPN)
    console.error("===== GEMINI CALL FAILED =====");
    console.error("name:        ", error?.name);
    console.error("status:      ", error?.status);
    console.error("message:     ", error?.message);
    console.error("apiKeyPresent:", Boolean(process.env.GEMINI_API_KEY));
    console.error("apiKeyLen:   ", (process.env.GEMINI_API_KEY || "").length);
    console.error("model:       ", model);
    console.error("==============================");
    return null;
  }
}
