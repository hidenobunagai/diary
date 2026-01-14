import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const SETTINGS_KEY = "@diary_settings";
const GEMINI_API_KEY_SECURE_KEY = "@diary_gemini_api_key";

export interface DiarySettings {
  /**
   * Deprecated: Stored in SecureStore. Kept for compatibility/migration only.
   */
  geminiApiKey: string;
  diaryTone: "simple" | "casual" | "reflective";
  language: "ja" | "en";
}

const DEFAULT_SETTINGS: DiarySettings = {
  geminiApiKey: "",
  diaryTone: "simple",
  language: "ja",
};

const canUseSecureStore = async (): Promise<boolean> => {
  try {
    // On some environments SecureStore can be unavailable.
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
};

const readGeminiApiKeySecure = async (): Promise<string> => {
  try {
    if (!(await canUseSecureStore())) return "";
    const v = await SecureStore.getItemAsync(GEMINI_API_KEY_SECURE_KEY);
    return typeof v === "string" ? v : "";
  } catch {
    return "";
  }
};

const writeGeminiApiKeySecure = async (value: string): Promise<void> => {
  try {
    if (!(await canUseSecureStore())) return;
    const trimmed = value.trim();
    if (!trimmed) {
      await SecureStore.deleteItemAsync(GEMINI_API_KEY_SECURE_KEY);
      return;
    }
    await SecureStore.setItemAsync(GEMINI_API_KEY_SECURE_KEY, trimmed);
  } catch {
    // Intentionally swallow to avoid blocking settings save in environments
    // where SecureStore isn't working reliably.
  }
};

/**
 * One-way migration:
 * - If SecureStore key is not set but AsyncStorage settings has a legacy value,
 *   move it into SecureStore and clear the legacy field.
 */
const migrateGeminiApiKeyIfNeeded = async (): Promise<void> => {
  try {
    const secureKey = await readGeminiApiKeySecure();
    if (secureKey) return;

    const stored = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!stored) return;

    const parsed = JSON.parse(stored) as Partial<DiarySettings> | null;
    const legacy =
      typeof parsed?.geminiApiKey === "string" ? parsed.geminiApiKey : "";
    const legacyTrimmed = legacy.trim();
    if (!legacyTrimmed) return;

    await writeGeminiApiKeySecure(legacyTrimmed);

    // Clear legacy key from AsyncStorage to reduce exposure.
    const cleaned = {
      ...DEFAULT_SETTINGS,
      ...(parsed ?? {}),
      geminiApiKey: "",
    };
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(cleaned));
  } catch {
    // Best-effort migration.
  }
};

export const getSettings = async (): Promise<DiarySettings> => {
  try {
    await migrateGeminiApiKeyIfNeeded();

    const stored = await AsyncStorage.getItem(SETTINGS_KEY);
    const base = stored
      ? ({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) } as DiarySettings)
      : DEFAULT_SETTINGS;

    // Do not hydrate the real key into JS settings state.
    // Keep `geminiApiKey` blank here to avoid leaking it via logs/serialization.
    return { ...base, geminiApiKey: "" };
  } catch (e) {
    console.error("Failed to load settings", e);
    return { ...DEFAULT_SETTINGS, geminiApiKey: "" };
  }
};

export const saveSettings = async (
  settings: Partial<DiarySettings>,
): Promise<void> => {
  try {
    // Persist the API key to SecureStore (if provided)
    if (typeof settings.geminiApiKey === "string") {
      await writeGeminiApiKeySecure(settings.geminiApiKey);
    }

    // Store the rest of settings in AsyncStorage, but never store the API key.
    const current = await getSettings();
    const updated: DiarySettings = {
      ...current,
      ...settings,
      geminiApiKey: "",
    };
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error("Failed to save settings", e);
    throw e;
  }
};

export const getGeminiApiKey = async (): Promise<string> => {
  await migrateGeminiApiKeyIfNeeded();

  // User must provide their own API key - no fallback for Play Store release
  const secure = await readGeminiApiKeySecure();
  if (secure) return secure;

  // Backward compatibility fallback (should be cleared by migration)
  try {
    const stored = await AsyncStorage.getItem(SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<DiarySettings> | null;
      const legacy =
        typeof parsed?.geminiApiKey === "string"
          ? parsed.geminiApiKey.trim()
          : "";
      return legacy;
    }
  } catch {
    // ignore
  }

  return "";
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
