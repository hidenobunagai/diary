import { Audio } from "expo-av";
import React, { useState } from "react";
import { Alert, Text, TouchableOpacity, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { generateDiaryEntry } from "../services/geminiService";

export default function VoiceRecorder() {
  const [recording, setRecording] = useState<Audio.Recording | undefined>(
    undefined
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [diaryEntry, setDiaryEntry] = useState<{
    title: string;
    content: string;
  } | null>(null);

  // Animation values
  const pulse = useSharedValue(1);

  const startAnimation = () => {
    pulse.value = withRepeat(
      withTiming(1.2, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  };

  const stopAnimation = () => {
    pulse.value = withTiming(1);
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  async function startRecording() {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== "granted") return;

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(recording);
      startAnimation();
    } catch (err) {
      console.error("Failed to start recording", err);
    }
  }

  async function stopRecording() {
    if (!recording) return;

    setRecording(undefined);
    stopAnimation();
    await recording.stopAndUnloadAsync();

    const uri = recording.getURI();
    if (!uri) return;

    setIsProcessing(true);
    try {
      const jsonString = await generateDiaryEntry(uri);
      const entryData = JSON.parse(jsonString);

      const { saveDiaryEntry } = require("../services/storageService");
      await saveDiaryEntry(entryData.title, entryData.content);

      setDiaryEntry({ title: entryData.title, content: entryData.content });
      Alert.alert("保存完了", "日記を保存しました。");
    } catch (e) {
      console.error(e);
      Alert.alert("エラー", "日記の処理または保存に失敗しました。");
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <View className="w-full items-center bg-gray-900 p-6 min-h-full">
      <Text className="text-3xl font-bold mb-2 text-white mt-8">dIAry</Text>
      <Text className="text-sm text-gray-400 mb-10">
        今日の出来事を声で記録
      </Text>

      <Animated.View style={animatedStyle}>
        <TouchableOpacity
          onPress={recording ? stopRecording : startRecording}
          className="w-36 h-36 rounded-full justify-center items-center"
          style={{
            backgroundColor: recording ? "#ef4444" : "#3b82f6",
            shadowColor: recording ? "#ef4444" : "#3b82f6",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.4,
            shadowRadius: 16,
            elevation: 12,
          }}
        >
          <Text className="text-white font-bold text-xl">
            {recording ? "🔴 停止" : "🎤 録音"}
          </Text>
        </TouchableOpacity>
      </Animated.View>

      {isProcessing && (
        <View className="mt-10 items-center">
          <Text className="text-blue-400 text-lg">処理中...</Text>
          <Text className="text-gray-500 text-sm mt-2">
            AIが日記を作成しています
          </Text>
        </View>
      )}

      {diaryEntry && (
        <View className="mt-10 p-5 bg-gray-800 rounded-xl w-full border border-gray-700">
          <Text className="text-lg font-bold mb-3 text-white">
            📝 {diaryEntry.title}
          </Text>
          <Text className="text-gray-300 leading-relaxed">
            {diaryEntry.content}
          </Text>
        </View>
      )}
    </View>
  );
}
