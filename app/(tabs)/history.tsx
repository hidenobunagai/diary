import BannerAd from "@/components/BannerAd";
import {
  DiaryEntry,
  deleteDiaryEntry,
  getDiaryEntries,
  searchDiaryEntries,
  subscribeDatabaseChanges,
  updateDiaryEntry,
} from "@/services/storageService";
import { useIsFocused } from "@react-navigation/native";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Calendar, DateData } from "react-native-calendars";
import { SafeAreaView } from "react-native-safe-area-context";

const toDateKey = (createdAt: string | undefined): string | null => {
  if (!createdAt) return null;

  // Common SQLite format: "YYYY-MM-DD HH:MM:SS"
  // Common ISO-ish format: "YYYY-MM-DDTHH:MM:SS(.sss)Z"
  // If it's already starting with YYYY-MM-DD, take that part reliably.
  const m = createdAt.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m && m[1]) return m[1];

  // Fallback: try Date parsing (may fail depending on engine/format)
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return null;

  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
};

const formatDateSafe = (createdAt: string | undefined): string => {
  if (!createdAt) return "";

  const d = new Date(createdAt);

  // If the runtime can't parse (e.g., "YYYY-MM-DD HH:MM:SS" on some engines),
  // fall back to showing the date key.
  if (Number.isNaN(d.getTime())) {
    const key = toDateKey(createdAt);
    return key ? `${key} (日付のみ)` : createdAt;
  }

  return d.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
};

export default function HistoryScreen() {
  const isFocused = useIsFocused();
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<DiaryEntry | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [markedDates, setMarkedDates] = useState<Record<string, any>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  // Prevent double refresh when focus effect and DB event fire close together.
  const lastRefreshAtRef = useRef<number>(0);

  const loadEntries = useCallback(async () => {
    try {
      const data = await getDiaryEntries();
      setEntries(data);

      const marks: Record<string, any> = {};
      data.forEach((entry) => {
        const dateKey = toDateKey(entry.created_at);
        if (dateKey) {
          marks[dateKey] = { marked: true, dotColor: "#3b82f6" };
        }
      });
      setMarkedDates(marks);
    } catch (e) {
      console.error("Failed to load entries", e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadEntries();

      // Auto-refresh when DB changes (e.g., after Drive restore).
      // Only refresh when this screen is focused to avoid unnecessary work.
      const unsubscribe = subscribeDatabaseChanges(() => {
        if (!isFocused) return;

        const now = Date.now();
        if (now - lastRefreshAtRef.current < 500) return;
        lastRefreshAtRef.current = now;

        loadEntries();
      });

      return () => {
        unsubscribe();
        setSelectedEntry(null);
        setIsEditing(false);
      };
    }, [loadEntries, isFocused]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadEntries();
    setRefreshing(false);
  }, [loadEntries]);

  const handleSearch = useCallback(
    async (query: string) => {
      setSearchQuery(query);
      if (query.trim() === "") {
        await loadEntries();
      } else {
        const results = await searchDiaryEntries(query);
        setEntries(results);
      }
    },
    [loadEntries],
  );

  const handleDelete = useCallback(async () => {
    if (!selectedEntry?.id) return;

    Alert.alert("削除確認", "この日記を削除しますか？", [
      { text: "キャンセル", style: "cancel" },
      {
        text: "削除",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDiaryEntry(selectedEntry.id!);
            setSelectedEntry(null);
            await loadEntries();
            Alert.alert("完了", "日記を削除しました");
          } catch {
            Alert.alert("エラー", "削除に失敗しました");
          }
        },
      },
    ]);
  }, [selectedEntry, loadEntries]);

  const handleEdit = useCallback(() => {
    if (!selectedEntry) return;
    setEditTitle(selectedEntry.title);
    setEditContent(selectedEntry.content);
    setIsEditing(true);
  }, [selectedEntry]);

  const handleSaveEdit = useCallback(async () => {
    if (!selectedEntry?.id) return;

    try {
      await updateDiaryEntry(selectedEntry.id, editTitle, editContent);
      setIsEditing(false);
      setSelectedEntry({
        ...selectedEntry,
        title: editTitle,
        content: editContent,
      });
      await loadEntries();
      Alert.alert("完了", "日記を更新しました");
    } catch {
      Alert.alert("エラー", "更新に失敗しました");
    }
  }, [selectedEntry, editTitle, editContent, loadEntries]);

  const formatDate = (dateStr: string | undefined) => {
    return formatDateSafe(dateStr);
  };

  const onDayPress = (day: DateData) => {
    setSelectedDate(day.dateString);
    setSearchQuery("");
  };

  const filteredEntries = useMemo(() => {
    if (!selectedDate) return entries;

    return entries.filter((entry) => {
      const entryDate = toDateKey(entry.created_at);
      return entryDate === selectedDate;
    });
  }, [entries, selectedDate]);

  const renderItem = ({ item }: { item: DiaryEntry }) => (
    <TouchableOpacity
      className="bg-gray-800 rounded-xl p-4 mb-3 mx-4 border border-gray-700 active:opacity-70"
      onPress={() => setSelectedEntry(item)}
    >
      <Text className="text-lg font-bold text-white mb-1">{item.title}</Text>
      <Text className="text-xs text-gray-500 mb-2">
        {formatDate(item.created_at)}
      </Text>
      <Text className="text-gray-400 leading-relaxed" numberOfLines={3}>
        {item.content}
      </Text>
      <Text className="text-blue-400 text-sm mt-2">タップして詳細を見る →</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView className="flex-1 bg-gray-900" edges={["top"]}>
      <View className="py-2 px-4 bg-gray-900 border-b border-gray-800">
        <Text className="text-xl font-bold text-white">📅 日記一覧</Text>
      </View>

      {/* Search Bar */}
      <View className="mx-4 mt-4">
        <TextInput
          className="bg-gray-800 text-white px-4 py-2 rounded-lg border border-gray-700"
          placeholder="🔍 日記を検索..."
          placeholderTextColor="#6b7280"
          value={searchQuery}
          onChangeText={handleSearch}
        />
      </View>

      {searchQuery === "" && (
        <View className="bg-gray-800 mx-4 mt-2 rounded-lg overflow-hidden">
          <Calendar
            onDayPress={onDayPress}
            markedDates={{
              ...markedDates,
              ...(selectedDate
                ? {
                    [selectedDate]: {
                      ...markedDates[selectedDate],
                      selected: true,
                      selectedColor: "#3b82f6",
                    },
                  }
                : {}),
            }}
            hideExtraDays={true}
            style={{ paddingLeft: 0, paddingRight: 0 }}
            theme={{
              calendarBackground: "#1f2937",
              textSectionTitleColor: "#9ca3af",
              selectedDayBackgroundColor: "#3b82f6",
              selectedDayTextColor: "#ffffff",
              todayTextColor: "#3b82f6",
              dayTextColor: "#ffffff",
              textDisabledColor: "#4b5563",
              dotColor: "#3b82f6",
              monthTextColor: "#ffffff",
              arrowColor: "#3b82f6",
              textDayFontSize: 13,
              textMonthFontSize: 14,
              textDayHeaderFontSize: 11,
              weekVerticalMargin: 0,
            }}
          />
        </View>
      )}

      {selectedDate && (
        <TouchableOpacity
          className="mx-4 mt-2 py-2"
          onPress={() => setSelectedDate(null)}
        >
          <Text className="text-blue-400 text-center">すべて表示 ✕</Text>
        </TouchableOpacity>
      )}

      {filteredEntries.length === 0 ? (
        <View className="flex-1 justify-center items-center">
          <Text className="text-gray-500 text-lg">
            {searchQuery
              ? "検索結果がありません"
              : selectedDate
                ? "この日の日記はありません"
                : "まだ日記がありません"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredEntries}
          renderItem={renderItem}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingVertical: 16 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#3b82f6"
            />
          }
        />
      )}

      {isFocused && <BannerAd />}

      {/* Detail/Edit Modal */}
      <Modal
        visible={selectedEntry !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setSelectedEntry(null);
          setIsEditing(false);
        }}
      >
        <View className="flex-1 bg-black/70 justify-end">
          <View className="bg-gray-800 rounded-t-3xl max-h-[90%] min-h-[50%]">
            <View className="flex-row justify-between items-center p-4 border-b border-gray-700">
              {isEditing ? (
                <TextInput
                  className="text-lg font-bold text-white flex-1 mr-4 bg-gray-700 px-3 py-2 rounded-lg"
                  value={editTitle}
                  onChangeText={setEditTitle}
                  placeholder="タイトル"
                  placeholderTextColor="#6b7280"
                />
              ) : (
                <Text
                  className="text-lg font-bold text-white flex-1 mr-4"
                  numberOfLines={2}
                >
                  {selectedEntry?.title}
                </Text>
              )}
              <Pressable
                onPress={() => {
                  setSelectedEntry(null);
                  setIsEditing(false);
                }}
                className="bg-gray-700 rounded-full w-8 h-8 items-center justify-center"
              >
                <Text className="text-gray-300 text-lg">✕</Text>
              </Pressable>
            </View>

            {isEditing ? (
              <ScrollView className="p-4 flex-1">
                <TextInput
                  className="text-gray-300 leading-relaxed text-base bg-gray-700 px-4 py-3 rounded-lg min-h-[200px]"
                  value={editContent}
                  onChangeText={setEditContent}
                  placeholder="内容"
                  placeholderTextColor="#6b7280"
                  multiline
                  textAlignVertical="top"
                />
              </ScrollView>
            ) : (
              <ScrollView className="p-4 flex-1">
                <Text className="text-xs text-gray-500 mb-4">
                  {formatDate(selectedEntry?.created_at)}
                </Text>
                <Text className="text-gray-300 leading-relaxed text-base">
                  {selectedEntry?.content}
                </Text>
              </ScrollView>
            )}

            {/* Action Buttons */}
            <View className="flex-row p-4 border-t border-gray-700 gap-3">
              {isEditing ? (
                <>
                  <TouchableOpacity
                    className="flex-1 bg-gray-600 py-3 rounded-xl items-center"
                    onPress={() => setIsEditing(false)}
                  >
                    <Text className="text-white font-bold">キャンセル</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    className="flex-1 bg-blue-500 py-3 rounded-xl items-center"
                    onPress={handleSaveEdit}
                  >
                    <Text className="text-white font-bold">保存</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TouchableOpacity
                    className="flex-1 bg-red-500/20 py-3 rounded-xl items-center border border-red-500"
                    onPress={handleDelete}
                  >
                    <Text className="text-red-400 font-bold">🗑️ 削除</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    className="flex-1 bg-blue-500 py-3 rounded-xl items-center"
                    onPress={handleEdit}
                  >
                    <Text className="text-white font-bold">✏️ 編集</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
