import { GoogleGenAI, Type, GenerateContentResponse, Modality } from "@google/genai";
import { encryptKey, decryptKey } from "./crypto";

const RAW_KEY = process.env.GEMINI_API_KEY || "";
const SECRET = process.env.ENCRYPTION_KEY || "FRIDAY_DEFAULT_SECURE_SALT_2026";

// Obfuscated storage
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

  // RIFF identifier
  view.setUint8(0, 'R'.charCodeAt(0));
  view.setUint8(1, 'I'.charCodeAt(0));
  view.setUint8(2, 'F'.charCodeAt(0));
  view.setUint8(3, 'F'.charCodeAt(0));

  // File length
  view.setUint32(4, 36 + dataLength, true);

  // WAVE identifier
  view.setUint8(8, 'W'.charCodeAt(0));
  view.setUint8(9, 'A'.charCodeAt(0));
  view.setUint8(10, 'V'.charCodeAt(0));
  view.setUint8(11, 'E'.charCodeAt(0));

  // fmt chunk identifier
  view.setUint8(12, 'f'.charCodeAt(0));
  view.setUint8(13, 'm'.charCodeAt(0));
  view.setUint8(14, 't'.charCodeAt(0));
  view.setUint8(15, ' '.charCodeAt(0));

  // fmt chunk length
  view.setUint32(16, 16, true);

  // sample format (1 is PCM)
  view.setUint16(20, 1, true);

  // channel count (1 for mono)
  view.setUint16(22, 1, true);

  // sample rate
  view.setUint32(24, sampleRate, true);

  // byte rate (sampleRate * channelCount * bitsPerSample / 8)
  view.setUint32(28, sampleRate * 1 * 16 / 8, true);

  // block align (channelCount * bitsPerSample / 8)
  view.setUint16(32, 1 * 16 / 8, true);

  // bits per sample
  view.setUint16(34, 16, true);

  // data chunk identifier
  view.setUint8(36, 'd'.charCodeAt(0));
  view.setUint8(37, 'a'.charCodeAt(0));
  view.setUint8(38, 't'.charCodeAt(0));
  view.setUint8(39, 'a'.charCodeAt(0));

  // data chunk length
  view.setUint32(40, dataLength, true);

  return new Uint8Array(header);
}

export const MODELS = {
  REASONING: "gemini-3-flash-preview",
  SPEED: "gemini-3-flash-preview",
  IMAGE: "gemini-2.5-flash-image",
  IMAGE_HQ: "gemini-2.5-flash-image",
  LIVE: "gemini-3.1-flash-live-preview",
  TTS: "gemini-2.5-flash-preview-tts",
};

export async function correctInput(input: string) {
  const ai = await getSecureAI();
  const response = await ai.models.generateContent({
    model: MODELS.REASONING,
    contents: [{ role: "user", parts: [{ text: `Analyze this user query for misspellings or grammatical errors: "${input}". If it is clear and correct, return the exact same string. If it has minor errors, return the corrected version. If it is nonsensical or ambiguous, return "CLARIFY: <reason>". Return ONLY the corrected string or the clarification request.` }] }],
    config: {
      systemInstruction: "You are the FRIDAY Input Correction Module. Your only task is to fix user typos or ask for clarification. Be extremely concise. If the user is asking for code, do not correct the code itself, just the surrounding text if needed.",
    },
  });
  return response.text?.trim() || input;
}

export async function generateResponse(prompt: string, history: any[] = []) {
  const ai = await getSecureAI();

  try {
    // Single-pass generation using Gemini 3.0 Flash (Free Tier)
    const response = await ai.models.generateContent({
      model: MODELS.REASONING,
      contents: [
        ...history,
        { role: "user", parts: [{ text: prompt }] }
      ],
      config: {
        systemInstruction: `ROLE: FRIDAY Intelligence Router. 
OBJECTIVE: For general reasoning, planning, and conversation, respond directly using internal Gemini logic. 
CODING PROTOCOL: If the request requires generating, debugging, or refactoring code, DO NOT generate code. Instead, output exactly: [DELEGATE_TO_GEMMA]: {original_prompt_with_context}. Replace {original_prompt_with_context} with the user's coding request and relevant context.
FORMATTING: Keep responses concise. Address the user as 'Boss'. Never output raw code blocks yourself; always delegate.`,
      },
    });
    
    return response;
  } catch (error) {
    console.error("FRIDAY System Error:", error);
    throw error;
  }
}

export async function generateResponseWithPersonalization(prompt: string, personalization: any, history: any[] = []) {
  const ai = await getSecureAI();
  const context = personalization ? `User Preferences: ${JSON.stringify(personalization.preferences)}. User Name: ${personalization.name}.` : "";

  try {
    const response = await ai.models.generateContent({
      model: MODELS.REASONING,
      contents: [
        ...history,
        { role: "user", parts: [{ text: prompt }] }
      ],
      config: {
        systemInstruction: `ROLE: FRIDAY Intelligence Router. 
OBJECTIVE: For general reasoning, planning, and conversation, respond directly using internal Gemini logic. 
${context}
CODING PROTOCOL: If the request requires generating, debugging, or refactoring code, DO NOT generate code. Instead, output exactly: [DELEGATE_TO_GEMMA]: {original_prompt_with_context}. Replace {original_prompt_with_context} with the user's coding request and relevant context.
FORMATTING: Keep responses concise. Address the user as 'Boss'. Never output raw code blocks yourself; always delegate.`,
      },
    });
    
    return response;
  } catch (error) {
    console.error("FRIDAY System Error:", error);
    throw error;
  }
}

export async function generateSpeech(text: string) {
  const ai = await getSecureAI();
  const response = await ai.models.generateContent({
    model: MODELS.TTS,
    contents: [{ parts: [{ text: `Say with a direct, efficient, and slightly robotic but high-fidelity female voice: ${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (base64Audio) {
    const pcmData = Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0));
    const wavHeader = createWavHeader(pcmData.length, 24000);
    const wavData = new Uint8Array(wavHeader.length + pcmData.length);
    wavData.set(wavHeader);
    wavData.set(pcmData, wavHeader.length);
    
    const audioBlob = new Blob([wavData], { type: 'audio/wav' });
    return URL.createObjectURL(audioBlob);
  }
  return null;
}

export async function generateImage(prompt: string, size: "1K" | "2K" | "4K" = "1K") {
  const ai = await getSecureAI();
  const response = await ai.models.generateContent({
    model: MODELS.IMAGE_HQ,
    contents: { parts: [{ text: prompt }] },
    config: {
      imageConfig: {
        aspectRatio: "1:1",
        imageSize: size
      }
    }
  });

  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  return null;
}

export async function generateMusic(prompt: string, type: 'clip' | 'track' = 'clip') {
  const ai = await getSecureAI();
  const model = type === 'clip' ? "lyria-3-clip-preview" : "lyria-3-pro-preview";
  
  const response = await ai.models.generateContentStream({
    model: model,
    contents: prompt,
  });

  let audioBase64 = "";
  let mimeType = "audio/wav";

  for await (const chunk of response) {
    const parts = chunk.candidates?.[0]?.content?.parts;
    if (!parts) continue;
    for (const part of parts) {
      if (part.inlineData?.data) {
        if (!audioBase64 && part.inlineData.mimeType) {
          mimeType = part.inlineData.mimeType;
        }
        audioBase64 += part.inlineData.data;
      }
    }
  }

  if (!audioBase64) return null;

  const binary = atob(audioBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType });
  return URL.createObjectURL(blob);
}

export async function editImage(prompt: string, base64Data: string, mimeType: string) {
  const ai = await getSecureAI();
  const response = await ai.models.generateContent({
    model: MODELS.IMAGE_HQ,
    contents: {
      parts: [
        { inlineData: { data: base64Data, mimeType } },
        { text: prompt }
      ]
    },
    config: {
      imageConfig: {
        aspectRatio: "1:1",
      }
    }
  });

  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
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
OBJECTIVE: For general reasoning, planning, and conversation, respond directly using internal Gemini logic. 
${context}
CODING PROTOCOL: If the request requires generating, debugging, or refactoring code, DO NOT generate code. Instead, output exactly: [DELEGATE_TO_GEMMA]: {original_prompt_with_context}. Replace {original_prompt_with_context} with the user's coding request and relevant context.
FORMATTING: Keep responses concise. Address the user as 'Boss'. Never output raw code blocks yourself; always delegate.`,
    }
  });
  return response;
}
