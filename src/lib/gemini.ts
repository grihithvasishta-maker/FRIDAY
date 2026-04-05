import { GoogleGenAI, Modality } from "@google/genai";
import { encryptKey, decryptKey } from "./crypto";

const RAW_KEY = process.env.GEMINI_API_KEY || "";
const SECRET = process.env.ENCRYPTION_KEY || "FRIDAY_DEFAULT_SECURE_SALT_2026";

let encryptedVault: string | null = null;

async function getSecureAI() {
  if (!encryptedVault) {
    encryptedVault = await encryptKey(RAW_KEY, SECRET);
  }
  const decryptedKey = await decryptKey(encryptedVault, SECRET);
  return new GoogleGenAI({ apiKey: decryptedKey });
}

function createWavHeader(dataLength: number, sampleRate: number = 24000): Uint8Array {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  view.setUint8(0, 'R'.charCodeAt(0)); view.setUint8(1, 'I'.charCodeAt(0));
  view.setUint8(2, 'F'.charCodeAt(0)); view.setUint8(3, 'F'.charCodeAt(0));
  view.setUint32(4, 36 + dataLength, true);
  view.setUint8(8, 'W'.charCodeAt(0)); view.setUint8(9, 'A'.charCodeAt(0));
  view.setUint8(10, 'V'.charCodeAt(0)); view.setUint8(11, 'E'.charCodeAt(0));
  view.setUint8(12, 'f'.charCodeAt(0)); view.setUint8(13, 'm'.charCodeAt(0));
  view.setUint8(14, 't'.charCodeAt(0)); view.setUint8(15, ' '.charCodeAt(0));
  view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 1 * 16 / 8, true);
  view.setUint16(32, 1 * 16 / 8, true); view.setUint16(34, 16, true);
  view.setUint8(36, 'd'.charCodeAt(0)); view.setUint8(37, 'a'.charCodeAt(0));
  view.setUint8(38, 't'.charCodeAt(0)); view.setUint8(39, 'a'.charCodeAt(0));
  view.setUint32(40, dataLength, true);
  return new Uint8Array(header);
}

export const MODELS = {
  REASONING: "gemini-2.0-flash",
  IMAGE_GEN: "gemini-2.0-flash-preview-image-generation",
  IMAGEN: "imagen-3.0-generate-002",
  VIDEO: "veo-2.0-generate-001",
  TTS: "gemini-2.5-flash-preview-tts",
};

export async function correctInput(input: string) {
  const ai = await getSecureAI();
  const response = await ai.models.generateContent({
    model: MODELS.REASONING,
    contents: [{ role: "user", parts: [{ text: `Analyze this user query for misspellings or grammatical errors: "${input}". If it is clear and correct, return the exact same string. If it has minor errors, return the corrected version. If it is nonsensical or ambiguous, return "CLARIFY: <reason>". Return ONLY the corrected string or the clarification request.` }] }],
    config: {
      systemInstruction: "You are the FRIDAY Input Correction Module. Your only task is to fix user typos or ask for clarification. Be extremely concise.",
    },
  });
  return response.text?.trim() || input;
}

export async function generateResponse(prompt: string, history: any[] = []) {
  const ai = await getSecureAI();
  const response = await ai.models.generateContent({
    model: MODELS.REASONING,
    contents: [...history, { role: "user", parts: [{ text: prompt }] }],
    config: {
      systemInstruction: `ROLE: FRIDAY Intelligence Router. 
OBJECTIVE: For general reasoning, planning, and conversation, respond directly. 
CODING PROTOCOL: If the request requires generating, debugging, or refactoring code, output exactly: [DELEGATE_TO_GEMMA]: {original_prompt_with_context}.
FORMATTING: Keep responses concise. Address the user as 'Boss'.`,
    },
  });
  return response;
}

export async function generateResponseWithPersonalization(prompt: string, personalization: any, history: any[] = []) {
  const ai = await getSecureAI();
  const context = personalization ? `User Preferences: ${JSON.stringify(personalization.preferences)}. User Name: ${personalization.name}.` : "";
  const response = await ai.models.generateContent({
    model: MODELS.REASONING,
    contents: [...history, { role: "user", parts: [{ text: prompt }] }],
    config: {
      systemInstruction: `ROLE: FRIDAY Intelligence Router. 
OBJECTIVE: For general reasoning, planning, and conversation, respond directly. 
${context}
CODING PROTOCOL: If the request requires generating, debugging, or refactoring code, output exactly: [DELEGATE_TO_GEMMA]: {original_prompt_with_context}.
FORMATTING: Keep responses concise. Address the user as 'Boss'.`,
    },
  });
  return response;
}

export async function generateSpeech(text: string) {
  const ai = await getSecureAI();
  const response = await ai.models.generateContent({
    model: MODELS.TTS,
    contents: [{ parts: [{ text: `Say with a direct, efficient, slightly robotic but high-fidelity female voice: ${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
      },
    },
  });
  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (base64Audio) {
    const pcmData = Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0));
    const wavHeader = createWavHeader(pcmData.length, 24000);
    const wavData = new Uint8Array(wavHeader.length + pcmData.length);
    wavData.set(wavHeader); wavData.set(pcmData, wavHeader.length);
    const audioBlob = new Blob([wavData], { type: 'audio/wav' });
    return URL.createObjectURL(audioBlob);
  }
  return null;
}

// ✅ FIXED: Image generation using Gemini 2.0 Flash image gen model
export async function generateImage(prompt: string) {
  const ai = await getSecureAI();
  const response = await ai.models.generateContent({
    model: MODELS.IMAGE_GEN,
    contents: prompt,
    config: {
      responseModalities: ["TEXT", "IMAGE"],
    },
  });
  for (const part of response.candidates![0].content.parts) {
    if (part.inlineData) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }
  return null;
}

// ✅ FIXED: High quality image using Imagen 3
export async function generateImageHQ(prompt: string) {
  const ai = await getSecureAI();
  const response = await ai.models.generateImages({
    model: MODELS.IMAGEN,
    prompt: prompt,
    config: {
      numberOfImages: 1,
      aspectRatio: "1:1",
    },
  });
  const imageData = response.generatedImages?.[0]?.image?.imageBytes;
  if (imageData) {
    return `data:image/png;base64,${imageData}`;
  }
  return null;
}

// ✅ NEW: Video generation using Veo 2
export async function generateVideo(prompt: string): Promise<string | null> {
  const ai = await getSecureAI();

  let operation = await ai.models.generateVideos({
    model: MODELS.VIDEO,
    prompt: prompt,
    config: {
      aspectRatio: "16:9",
      durationSeconds: 5,
    },
  });

  // Poll every 10 seconds until done (max 2 minutes)
  const maxAttempts = 12;
  let attempts = 0;
  while (!operation.done && attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 10000));
    operation = await ai.operations.getVideosOperation({ operation });
    attempts++;
  }

  if (!operation.done) throw new Error("Video generation timed out. Try again.");

  const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!videoUri) throw new Error("No video returned.");

  return videoUri;
}

export async function editImage(prompt: string, base64Data: string, mimeType: string) {
  const ai = await getSecureAI();
  const response = await ai.models.generateContent({
    model: MODELS.IMAGE_GEN,
    contents: {
      parts: [
        { inlineData: { data: base64Data, mimeType } },
        { text: prompt }
      ]
    },
    config: { responseModalities: ["TEXT", "IMAGE"] },
  });
  for (const part of response.candidates![0].content.parts) {
    if (part.inlineData) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }
  return null;
}

export async function analyzeImage(prompt: string, base64Data: string, mimeType: string, personalization: any, history: any[] = []) {
  const ai = await getSecureAI();
  const context = personalization ? `User Preferences: ${JSON.stringify(personalization.preferences)}. User Name: ${personalization.name}.` : "";
  const response = await ai.models.generateContent({
    model: MODELS.REASONING,
    contents: [
      ...history,
      {
        role: "user",
        parts: [
          { text: prompt || "Analyze this image." },
          { inlineData: { data: base64Data, mimeType } }
        ]
      }
    ],
    config: {
      systemInstruction: `ROLE: FRIDAY Intelligence Router. 
OBJECTIVE: Analyze images and respond directly. 
${context}
FORMATTING: Keep responses concise. Address the user as 'Boss'.`,
    }
  });
  return response;
}

export async function generateMusic(prompt: string, type: 'clip' | 'track' = 'clip') {
  const ai = await getSecureAI();
  const model = type === 'clip' ? "lyria-3-clip-preview" : "lyria-3-pro-preview";
  const response = await ai.models.generateContentStream({
    model: model,
    contents: prompt,
  });
  let audioBase64 = ""; let mimeType = "audio/wav";
  for await (const chunk of response) {
    const parts = chunk.candidates?.[0]?.content?.parts;
    if (!parts) continue;
    for (const part of parts) {
      if (part.inlineData?.data) {
        if (!audioBase64 && part.inlineData.mimeType) mimeType = part.inlineData.mimeType;
        audioBase64 += part.inlineData.data;
      }
    }
  }
  if (!audioBase64) return null;
  const binary = atob(audioBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mimeType });
  return URL.createObjectURL(blob);
}
