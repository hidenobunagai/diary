import { GoogleGenerativeAI } from "@google/generative-ai";
import * as FileSystem from "expo-file-system/legacy";

// NOTE: Ideally this comes from process.env.EXPO_PUBLIC_GEMINI_API_KEY
// For now, we'll let the user provide it or rely on env vars.
const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || "";

const genAI = new GoogleGenerativeAI(API_KEY);

export const generateDiaryEntry = async (audioUri: string): Promise<string> => {
  if (!API_KEY) {
    throw new Error(
      "Gemini API Key is missing. Please set EXPO_PUBLIC_GEMINI_API_KEY."
    );
  }

  try {
    // 1. Read audio file as Base64
    const base64Audio = await FileSystem.readAsStringAsync(audioUri, {
      encoding: "base64",
    });

    // 2. Prepare the model
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

    // 3. Prompt for the diary
    const prompt = `
      Listen to this audio recording.
      The speaker is a 38-year-old professional man talking about his day.
      Please write a diary entry based on this in Japanese.

      Style Guidelines:
      - Write in a mature, reflective tone suitable for an adult man
      - Use polite but natural Japanese (です/ます調 or 常体, whichever fits the content)
      - Include thoughtful observations and personal reflections
      - Avoid overly casual expressions, emoji, or cute language
      - Keep it sincere and genuine, like a personal journal
      - The tone should be calm, composed, and introspective

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
          mimeType: "audio/mp4", // expo-av default usually m4a/mp4, adjust if needed
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
