import VoiceRecorder from "@/components/VoiceRecorder";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function HomeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-gray-900" edges={["top"]}>
      <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1 }}>
        <VoiceRecorder />
      </ScrollView>
    </SafeAreaView>
  );
}
