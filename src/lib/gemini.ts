import { GoogleGenAI, Modality } from "@google/genai";
import { encryptKey, decryptKey } from "./crypto";

// ── Keys ──────────────────────────────────────────────────────────────────────
const GEMINI_KEY = process.env.GEMINI_API_KEY || "";
const GROQ_KEY   = process.env.GROQ_API_KEY   || "";
const SECRET     = process.env.ENCRYPTION_KEY  || "FRIDAY_DEFAULT_SECURE_SALT_2026";

let encryptedVault: string | null = null;

async function getGeminiAI() {
  if (!encryptedVault) encryptedVault = await encryptKey(GEMINI_KEY, SECRET);
  const key = await decryptKey(encryptedVault, SECRET);
  return new GoogleGenAI({ apiKey: key });
}

// ── Retry helper ──────────────────────────────────────────────────────────────
async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try { return await fn(); } catch (err: any) {
      const isRate = err?.message?.includes("RESOURCE_EXHAUSTED") || err?.message?.includes("429");
      if (isRate && i < retries - 1) { await new Promise(r => setTimeout(r, (i + 1) * 8000)); continue; }
      throw err;
    }
  }
  throw new Error("Max retries exceeded");
}

// ── WAV header for TTS ────────────────────────────────────────────────────────
function createWavHeader(dataLength: number, sampleRate = 24000): Uint8Array {
  const h = new ArrayBuffer(44); const v = new DataView(h);
  "RIFF".split("").forEach((c, i) => v.setUint8(i, c.charCodeAt(0)));
  v.setUint32(4, 36 + dataLength, true);
  "WAVE".split("").forEach((c, i) => v.setUint8(8 + i, c.charCodeAt(0)));
  "fmt ".split("").forEach((c, i) => v.setUint8(12 + i, c.charCodeAt(0)));
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  "data".split("").forEach((c, i) => v.setUint8(36 + i, c.charCodeAt(0)));
  v.setUint32(40, dataLength, true);
  return new Uint8Array(h);
}

// ── SYSTEM PROMPT (shared) ────────────────────────────────────────────────────
const FRIDAY_SYSTEM = (context = "") => `
You are FRIDAY, an elite AI executive assistant. You are sharp, efficient, and loyal.
ALWAYS address the user as "Boss" — at the START and END of every single response, no exceptions.
Example opening: "On it, Boss." Example closing: "Standing by, Boss."
${context}
CODING PROTOCOL: If asked to write/debug/refactor code, output exactly: [DELEGATE_TO_GEMMA]: {prompt}
Keep responses concise and direct. No filler. No corporate speak.
`.trim();

// ── GROQ chat (handles 30 users free) ────────────────────────────────────────
async function groqChat(messages: { role: string; content: string }[]): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages,
      max_tokens: 1024,
      temperature: 0.7,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "No response, Boss.";
}

// ── Public chat functions ─────────────────────────────────────────────────────
export async function correctInput(input: string): Promise<string> {
  const text = await groqChat([
    { role: "system", content: "You are a spelling/grammar corrector. If the input is clear, return it exactly. If it has errors, return the corrected version. If nonsensical, return 'CLARIFY: <reason>'. Return ONLY the corrected string." },
    { role: "user",   content: input },
  ]);
  return text.trim();
}

export async function generateResponse(prompt: string, history: any[] = []) {
  const messages = [
    { role: "system", content: FRIDAY_SYSTEM() },
    ...history.map((m: any) => ({ role: m.role === "model" ? "assistant" : "user", content: m.parts?.[0]?.text || "" })),
    { role: "user", content: prompt },
  ];
  const text = await withRetry(() => groqChat(messages));
  return { text };
}

export async function generateResponseWithPersonalization(prompt: string, personalization: any, history: any[] = []) {
  const context = personalization
    ? `User name: ${personalization.name}. Preferences: ${JSON.stringify(personalization.preferences)}.`
    : "";
  const messages = [
    { role: "system", content: FRIDAY_SYSTEM(context) },
    ...history.map((m: any) => ({ role: m.role === "model" ? "assistant" : "user", content: m.parts?.[0]?.text || "" })),
    { role: "user", content: prompt },
  ];
  const text = await withRetry(() => groqChat(messages));
  return { text };
}

export async function analyzeImage(prompt: string, base64Data: string, mimeType: string, personalization: any, history: any[] = []) {
  // Image analysis still uses Gemini (Groq doesn't support vision yet)
  const ai = await getGeminiAI();
  const context = personalization ? `User name: ${personalization.name}.` : "";
  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: [
      ...history,
      { role: "user", parts: [{ text: prompt || "Analyze this image." }, { inlineData: { data: base64Data, mimeType } }] }
    ],
    config: { systemInstruction: FRIDAY_SYSTEM(context) }
  });
  return response;
}

// ── TTS (Gemini) ──────────────────────────────────────────────────────────────
export async function generateSpeech(text: string): Promise<string | null> {
  const ai = await getGeminiAI();
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: `Say with a direct, efficient, slightly robotic female voice: ${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
    },
  });
  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) return null;
  const pcm = Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0));
  const wav = new Uint8Array(createWavHeader(pcm.length).length + pcm.length);
  wav.set(createWavHeader(pcm.length)); wav.set(pcm, createWavHeader(pcm.length).length);
  return URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
}

// ── Image generation (Gemini) ─────────────────────────────────────────────────
export async function generateImage(prompt: string): Promise<string | null> {
  const ai = await getGeminiAI();
  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash-preview-image-generation",
    contents: prompt,
    config: { responseModalities: ["TEXT", "IMAGE"] },
  });
  for (const part of response.candidates![0].content.parts) {
    if (part.inlineData) return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
  }
  return null;
}

export async function generateImageHQ(prompt: string): Promise<string | null> {
  const ai = await getGeminiAI();
  const response = await ai.models.generateImages({
    model: "imagen-3.0-generate-002",
    prompt,
    config: { numberOfImages: 1, aspectRatio: "1:1" },
  });
  const bytes = response.generatedImages?.[0]?.image?.imageBytes;
  return bytes ? `data:image/png;base64,${bytes}` : null;
}

export async function editImage(prompt: string, base64Data: string, mimeType: string): Promise<string | null> {
  const ai = await getGeminiAI();
  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash-preview-image-generation",
    contents: { parts: [{ inlineData: { data: base64Data, mimeType } }, { text: prompt }] },
    config: { responseModalities: ["TEXT", "IMAGE"] },
  });
  for (const part of response.candidates![0].content.parts) {
    if (part.inlineData) return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
  }
  return null;
}

// ── Video generation (Gemini Veo 2) ──────────────────────────────────────────
export async function generateVideo(prompt: string): Promise<string | null> {
  const ai = await getGeminiAI();
  let op = await ai.models.generateVideos({
    model: "veo-2.0-generate-001",
    prompt,
    config: { aspectRatio: "16:9", durationSeconds: 5 },
  });
  for (let i = 0; i < 12 && !op.done; i++) {
    await new Promise(r => setTimeout(r, 10000));
    op = await ai.operations.getVideosOperation({ operation: op });
  }
  if (!op.done) throw new Error("Video generation timed out. Try again, Boss.");
  return op.response?.generatedVideos?.[0]?.video?.uri ?? null;
}

// ── Music generation (Gemini) ─────────────────────────────────────────────────
export async function generateMusic(prompt: string, type: "clip" | "track" = "clip"): Promise<string | null> {
  const ai = await getGeminiAI();
  const model = type === "clip" ? "lyria-3-clip-preview" : "lyria-3-pro-preview";
  const stream = await ai.models.generateContentStream({ model, contents: prompt });
  let audioBase64 = ""; let mime = "audio/wav";
  for await (const chunk of stream) {
    for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data) {
        if (!audioBase64 && part.inlineData.mimeType) mime = part.inlineData.mimeType;
        audioBase64 += part.inlineData.data;
      }
    }
  }
  if (!audioBase64) return null;
  const bytes = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}
