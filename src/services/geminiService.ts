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
  const model = "gemini-1.5-flash";
  
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
  } catch (error) {
    console.error("Gemini Parsing Error:", error);
    return null;
  }
}
