import {
  backupToGoogleDrive,
  configureGoogleSignIn,
  deleteBackupFromGoogleDrive,
  getCurrentUser,
  isSignedIn,
  restoreFromGoogleDrive,
  signInWithGoogle,
  signOutFromGoogle,
} from "@/services/driveService";
import {
  DiarySettings,
  getSettings,
  saveSettings,
} from "@/services/settingsService";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
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
    value: "simple",
    label: "シンプル",
    description: "話した内容をそのままわかりやすくまとめる",
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
];

export default function SettingsScreen() {
  const [settings, setSettings] = useState<DiarySettings>({
    geminiApiKey: "",
    diaryTone: "simple",
    language: "ja",
  });
  const [isSaving, setIsSaving] = useState(false);

  // Google Drive state
  const [driveEnabled, setDriveEnabled] = useState(false);
  const [driveSignedIn, setDriveSignedIn] = useState(false);
  const [driveEmail, setDriveEmail] = useState<string | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const loadSettings = useCallback(async () => {
    const loaded = await getSettings();
    setSettings(loaded);
  }, []);

  const loadDriveStatus = useCallback(async () => {
    try {
      const signedIn = await isSignedIn();
      setDriveSignedIn(signedIn);

      if (signedIn) {
        const user = await getCurrentUser();
        if (user) {
          setDriveEmail(user.email);
          setLastBackup(user.lastBackup || null);
        }
      } else {
        setDriveEmail(null);
        setLastBackup(null);
      }
    } catch {
      setDriveSignedIn(false);
      setDriveEmail(null);
      setLastBackup(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSettings();
      if (driveEnabled) {
        loadDriveStatus();
      }
    }, [loadSettings, loadDriveStatus, driveEnabled])
  );

  const enableDrive = async () => {
    try {
      configureGoogleSignIn();
      setDriveEnabled(true);
      await loadDriveStatus();
    } catch {
      Alert.alert(
        "エラー",
        "Google Drive機能の初期化に失敗しました。しばらくしてから再度お試しください。"
      );
      setDriveEnabled(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveSettings(settings);
      Alert.alert("保存完了", "設定を保存しました");
    } catch {
      Alert.alert("エラー", "設定の保存に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToneSelect = (tone: DiarySettings["diaryTone"]) => {
    setSettings((prev) => ({ ...prev, diaryTone: tone }));
  };

  const handleGoogleSignIn = async () => {
    if (!driveEnabled) {
      await enableDrive();
    }
    const result = await signInWithGoogle();
    if (result.success) {
      setDriveSignedIn(true);
      setDriveEmail(result.email || null);
      Alert.alert("ログイン成功", "Googleアカウントに接続しました");
    } else {
      Alert.alert("エラー", result.error || "ログインに失敗しました");
    }
  };

  const handleGoogleSignOut = async () => {
    Alert.alert("ログアウト確認", "Googleアカウントとの連携を解除しますか？", [
      { text: "キャンセル", style: "cancel" },
      {
        text: "ログアウト",
        style: "destructive",
        onPress: async () => {
          await signOutFromGoogle();
          setDriveSignedIn(false);
          setDriveEmail(null);
          setLastBackup(null);
        },
      },
    ]);
  };

  const handleBackup = async () => {
    setIsBackingUp(true);
    try {
      const result = await backupToGoogleDrive();
      if (result.success) {
        setLastBackup(new Date().toISOString());
        Alert.alert("バックアップ完了", "Google Driveにバックアップしました");
      } else {
        Alert.alert("エラー", result.error || "バックアップに失敗しました");
      }
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRestore = async () => {
    Alert.alert(
      "復元確認",
      "現在のデータを上書きしてバックアップから復元しますか？\n※この操作は取り消せません",
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "復元",
          style: "destructive",
          onPress: async () => {
            setIsRestoring(true);
            try {
              const result = await restoreFromGoogleDrive();
              if (result.success) {
                Alert.alert(
                  "復元完了",
                  "バックアップから復元しました。画面に反映されない場合はアプリを再起動してください。"
                );
              } else {
                Alert.alert("エラー", result.error || "復元に失敗しました");
              }
            } finally {
              setIsRestoring(false);
            }
          },
        },
      ]
    );
  };

  const handleDeleteBackup = async () => {
    Alert.alert(
      "削除確認",
      "Google Drive上のバックアップを削除しますか？\n※この操作は取り消せません",
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "削除",
          style: "destructive",
          onPress: async () => {
            const result = await deleteBackupFromGoogleDrive();
            if (result.success) {
              setLastBackup(null);
              Alert.alert(
                "削除完了",
                "Google Drive上のバックアップを削除しました"
              );
            } else {
              Alert.alert(
                "エラー",
                result.error || "バックアップ削除に失敗しました"
              );
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
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
          className={`py-4 rounded-xl items-center mb-8 ${
            isSaving ? "bg-gray-600" : "bg-blue-500"
          }`}
          onPress={handleSave}
          disabled={isSaving}
        >
          <Text className="text-white font-bold text-lg">
            {isSaving ? "保存中..." : "設定を保存"}
          </Text>
        </TouchableOpacity>

        {/* Google Drive Backup Section */}
        <View className="mb-6 border-t border-gray-700 pt-6">
          <Text className="text-white font-bold text-lg mb-2">
            ☁️ Google Drive バックアップ
          </Text>
          <Text className="text-gray-400 text-sm mb-4">
            日記データをGoogle Driveにバックアップ・復元
          </Text>

          {!driveEnabled ? (
            <View>
              <Text className="text-gray-500 text-sm mb-3">
                ※ Google Drive機能は必要なときだけ有効化できます
              </Text>
              <TouchableOpacity
                className="py-4 rounded-xl items-center bg-gray-800 border border-gray-700"
                onPress={enableDrive}
              >
                <Text className="text-white font-bold text-lg">
                  ☁️ Google Driveを有効化
                </Text>
              </TouchableOpacity>
            </View>
          ) : driveSignedIn ? (
            <View>
              <View className="bg-gray-800 p-4 rounded-lg mb-4">
                <Text className="text-gray-400 text-sm">ログイン中:</Text>
                <Text className="text-white font-bold">{driveEmail}</Text>
                {lastBackup && (
                  <Text className="text-gray-500 text-xs mt-1">
                    最終バックアップ: {formatDate(lastBackup)}
                  </Text>
                )}
              </View>

              <View className="flex-row gap-3 mb-3">
                <TouchableOpacity
                  className={`flex-1 py-3 rounded-xl items-center ${
                    isBackingUp ? "bg-gray-600" : "bg-green-600"
                  }`}
                  onPress={handleBackup}
                  disabled={isBackingUp || isRestoring}
                >
                  {isBackingUp ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text className="text-white font-bold">
                      📤 バックアップ
                    </Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  className={`flex-1 py-3 rounded-xl items-center ${
                    isRestoring ? "bg-gray-600" : "bg-orange-600"
                  }`}
                  onPress={handleRestore}
                  disabled={isBackingUp || isRestoring}
                >
                  {isRestoring ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text className="text-white font-bold">📥 復元</Text>
                  )}
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                className="py-3 rounded-xl items-center bg-gray-800 border border-gray-700 mb-2"
                onPress={handleDeleteBackup}
                disabled={isBackingUp || isRestoring}
              >
                <Text className="text-white font-bold">
                  🗑️ バックアップ削除
                </Text>
                <Text className="text-gray-400 text-xs mt-1">
                  ※ Driveの「アプリデータ」領域から削除されます
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                className="py-2 items-center"
                onPress={handleGoogleSignOut}
              >
                <Text className="text-gray-400 underline">ログアウト</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              className="py-4 rounded-xl items-center bg-white"
              onPress={handleGoogleSignIn}
            >
              <Text className="text-gray-800 font-bold text-lg">
                🔗 Googleでログイン
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View className="h-20" />
      </ScrollView>
    </SafeAreaView>
  );
}
