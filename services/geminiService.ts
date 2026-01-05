import { GoogleGenerativeAI } from "@google/generative-ai";
import * as FileSystem from "expo-file-system/legacy";
import { getGeminiApiKey, getSettings, getTonePrompt } from "./settingsService";

export const generateDiaryEntry = async (audioUri: string): Promise<string> => {
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
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

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
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: "audio/mp4",
          data: base64Audio,
        },
      },
    ]);

    const response = await result.response;
    const text = response.text();

    // Clean up potential markdown code blocks if Gemini ignores instructions
    const cleanJson = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
    return cleanJson;
  } catch (error) {
    console.error("Error generating diary:", error);
    throw error;
  }
};
