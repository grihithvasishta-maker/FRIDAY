import { GoogleGenAI } from "@google/genai";

const GEMMA_KEY = process.env.GEMMA_API_KEY;

export async function delegateToGemma(prompt: string) {
  if (!GEMMA_KEY) {
    return "[ERROR]: Gemma API Key not found. Please add GEMMA_API_KEY to your secrets.";
  }

  const ai = new GoogleGenAI({ apiKey: GEMMA_KEY });

  try {
    const response = await ai.models.generateContent({
      model: "gemma-4-31b-it",
      contents: [{ role: "user", parts: [{ text: `Role: Professional Code Engine. Output ONLY raw code. No talk. No explanations.
Task: ${prompt}` }] }],
      config: {
        temperature: 0.1,
        topP: 0.95,
      },
    });

    return response.text || "[ERROR]: Gemma returned empty response.";
  } catch (error) {
    console.error("Gemma Tier Error:", error);
    return `[ERROR]: Gemma Tier failed to process request. ${error instanceof Error ? error.message : String(error)}`;
  }
}
