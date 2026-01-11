import { GoogleGenerativeAI } from "@google/generative-ai";
// expo-file-system v54+ throws at runtime for deprecated methods when imported from "expo-file-system".
// This service uses the classic async API (readAsStringAsync), so use the legacy entrypoint.
import * as FileSystem from "expo-file-system/legacy";
import { getGeminiApiKey, getSettings, getTonePrompt } from "./settingsService";

export type GeneratedDiaryEntry = {
  title: string;
  content: string;
};

const guessAudioMimeType = (uri: string): string => {
  const lower = uri.toLowerCase();
  if (lower.endsWith(".m4a")) return "audio/m4a";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".aac")) return "audio/aac";
  if (lower.endsWith(".3gp")) return "audio/3gpp";
  if (lower.endsWith(".mp4")) return "audio/mp4";
  return "audio/mp4";
};

const parseDiaryEntryJson = (text: string): GeneratedDiaryEntry => {
  const cleaned = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const tryParse = (candidate: string): unknown => {
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  };

  const direct = tryParse(cleaned);
  const parsed =
    direct ??
    (() => {
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start === -1 || end === -1 || end <= start) return null;
      return tryParse(cleaned.slice(start, end + 1));
    })();

  if (!parsed || typeof parsed !== "object") {
    throw new Error(
      "AIの返答(JSON)の解析に失敗しました。もう一度お試しください。"
    );
  }

  const obj = parsed as Record<string, unknown>;
  const title = typeof obj.title === "string" ? obj.title.trim() : "";
  const content = typeof obj.content === "string" ? obj.content.trim() : "";
  if (!title || !content) {
    throw new Error("AIの返答(JSON)が不完全でした。もう一度お試しください。");
  }
  return { title, content };
};

export const generateDiaryEntry = async (
  audioUri: string
): Promise<GeneratedDiaryEntry> => {
  // Get API key from user settings or fallback to env
  const apiKey = await getGeminiApiKey();

  if (!apiKey) {
    throw new Error(
      "Gemini API Keyが設定されていません。設定画面でAPIキーを入力してください。"
    );
  }

  const settings = await getSettings();
  const tonePrompt = getTonePrompt(settings.diaryTone);

  try {
    // 1. Read audio file as Base64
    const base64Audio = await FileSystem.readAsStringAsync(audioUri, {
      encoding: "base64",
    });

    // 2. Initialize Gemini with user's API key
    const genAI = new GoogleGenerativeAI(apiKey);
    const primaryModelName = "gemini-3-flash-preview";
    const fallbackModelName = "gemini-1.5-flash";

    // 3. Prompt for the diary with user-selected tone
    const prompt = `
      Listen to this audio recording.
      The speaker is talking about their day.
      Please write a diary entry based on this in Japanese.

      Style Guidelines:
      ${tonePrompt}

      CRITICAL OUTPUT FORMAT:
      You MUST return ONLY a valid JSON object. Do not include markdown formatting.
      Structure:
      {
        "title": "A concise, meaningful title in Japanese",
        "content": "The diary body text"
      }
    `;

    // 4. Generate content
    const mimeType = guessAudioMimeType(audioUri);
    const request = [
      prompt,
      {
        inlineData: {
          mimeType,
          data: base64Audio,
        },
      },
    ] as const;

    const run = async (modelName: string): Promise<string> => {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(request as any);
      const response = await result.response;
      return response.text();
    };

    let text: string;
    try {
      text = await run(primaryModelName);
    } catch (error) {
      console.warn(
        `[Gemini] Primary model failed (${primaryModelName}), retrying with ${fallbackModelName}`,
        error
      );
      text = await run(fallbackModelName);
    }

    return parseDiaryEntryJson(text);
  } catch (error) {
    console.error("Error generating diary:", error);
    throw error;
  }
};
