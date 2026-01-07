import AsyncStorage from "@react-native-async-storage/async-storage";

const SETTINGS_KEY = "@diary_settings";

export interface DiarySettings {
  geminiApiKey: string;
  diaryTone: "simple" | "casual" | "reflective";
  language: "ja" | "en";
}

const DEFAULT_SETTINGS: DiarySettings = {
  geminiApiKey: "",
  diaryTone: "simple",
  language: "ja",
};

export const getSettings = async (): Promise<DiarySettings> => {
  try {
    const stored = await AsyncStorage.getItem(SETTINGS_KEY);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
    return DEFAULT_SETTINGS;
  } catch (e) {
    console.error("Failed to load settings", e);
    return DEFAULT_SETTINGS;
  }
};

export const saveSettings = async (
  settings: Partial<DiarySettings>
): Promise<void> => {
  try {
    const current = await getSettings();
    const updated = { ...current, ...settings };
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error("Failed to save settings", e);
    throw e;
  }
};

export const getGeminiApiKey = async (): Promise<string> => {
  const settings = await getSettings();
  // User must provide their own API key - no fallback for Play Store release
  return settings.geminiApiKey;
};

export const getTonePrompt = (tone: DiarySettings["diaryTone"]): string => {
  const tonePrompts = {
    simple: `
      - Summarize what was said in a straightforward, factual manner
      - Use plain, natural Japanese without literary embellishment
      - Focus on the actual events and facts mentioned
      - Keep it simple and easy to understand
      - Do not add poetic expressions or metaphors
      - Write as if taking notes of what happened`,
    casual: `
      - Write in casual, relaxed Japanese (常体/タメ口)
      - Use natural everyday language
      - Include personal opinions freely
      - Keep it light and easy to read`,
    reflective: `
      - Write in a mature, reflective tone
      - Use polite but natural Japanese
      - Include thoughtful observations and personal reflections
      - Keep it sincere and genuine, like a personal journal
      - The tone should be calm, composed, and introspective`,
  };
  return tonePrompts[tone];
};
