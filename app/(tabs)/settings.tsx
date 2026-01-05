import {
  DiarySettings,
  getSettings,
  saveSettings,
} from "@/services/settingsService";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const TONE_OPTIONS: {
  value: DiarySettings["diaryTone"];
  label: string;
  description: string;
}[] = [
  {
    value: "formal",
    label: "フォーマル",
    description: "丁寧でビジネス向けの文体",
  },
  {
    value: "casual",
    label: "カジュアル",
    description: "くだけた普段使いの文体",
  },
  {
    value: "reflective",
    label: "内省的",
    description: "落ち着いた振り返りの文体",
  },
  { value: "poetic", label: "詩的", description: "表現豊かで文学的な文体" },
];

export default function SettingsScreen() {
  const [settings, setSettings] = useState<DiarySettings>({
    geminiApiKey: "",
    diaryTone: "reflective",
    language: "ja",
  });
  const [isSaving, setIsSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    const loaded = await getSettings();
    setSettings(loaded);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSettings();
    }, [loadSettings])
  );

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveSettings(settings);
      Alert.alert("保存完了", "設定を保存しました");
    } catch (e) {
      Alert.alert("エラー", "設定の保存に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToneSelect = (tone: DiarySettings["diaryTone"]) => {
    setSettings((prev) => ({ ...prev, diaryTone: tone }));
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-900" edges={["top"]}>
      <View className="py-2 px-4 bg-gray-900 border-b border-gray-800">
        <Text className="text-xl font-bold text-white">⚙️ 設定</Text>
      </View>

      <ScrollView className="flex-1 p-4">
        {/* API Key Section */}
        <View className="mb-6">
          <Text className="text-white font-bold text-lg mb-2">
            Gemini API キー
          </Text>
          <Text className="text-gray-400 text-sm mb-3">
            Google AI StudioでAPIキーを取得してください
          </Text>
          <TextInput
            className="bg-gray-800 text-white px-4 py-3 rounded-lg border border-gray-700"
            placeholder="AIzaSy..."
            placeholderTextColor="#6b7280"
            value={settings.geminiApiKey}
            onChangeText={(text) =>
              setSettings((prev) => ({ ...prev, geminiApiKey: text }))
            }
            secureTextEntry={true}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text className="text-red-400 text-xs mt-2">
            ※ APIキーは必須です。録音機能を使用するには設定してください
          </Text>
        </View>

        {/* Tone Selection */}
        <View className="mb-6">
          <Text className="text-white font-bold text-lg mb-2">
            日記のトーン
          </Text>
          <Text className="text-gray-400 text-sm mb-3">
            AIが生成する日記の文体を選択
          </Text>

          {TONE_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              className={`p-4 rounded-lg mb-2 border ${
                settings.diaryTone === option.value
                  ? "bg-blue-600/20 border-blue-500"
                  : "bg-gray-800 border-gray-700"
              }`}
              onPress={() => handleToneSelect(option.value)}
            >
              <View className="flex-row items-center">
                <View
                  className={`w-5 h-5 rounded-full border-2 mr-3 items-center justify-center ${
                    settings.diaryTone === option.value
                      ? "border-blue-500"
                      : "border-gray-500"
                  }`}
                >
                  {settings.diaryTone === option.value && (
                    <View className="w-3 h-3 rounded-full bg-blue-500" />
                  )}
                </View>
                <View className="flex-1">
                  <Text className="text-white font-bold">{option.label}</Text>
                  <Text className="text-gray-400 text-sm">
                    {option.description}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Save Button */}
        <TouchableOpacity
          className={`py-4 rounded-xl items-center ${
            isSaving ? "bg-gray-600" : "bg-blue-500"
          }`}
          onPress={handleSave}
          disabled={isSaving}
        >
          <Text className="text-white font-bold text-lg">
            {isSaving ? "保存中..." : "設定を保存"}
          </Text>
        </TouchableOpacity>

        <View className="h-20" />
      </ScrollView>
    </SafeAreaView>
  );
}
