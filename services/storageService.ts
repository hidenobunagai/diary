import * as SQLite from "expo-sqlite";

export interface DiaryEntry {
  id?: number;
  title: string;
  content: string;
  created_at?: string;
}

let db: SQLite.SQLiteDatabase | null = null;

const getDatabase = async (): Promise<SQLite.SQLiteDatabase> => {
  if (!db) {
    db = await SQLite.openDatabaseAsync("diary.db");
  }
  return db;
};

export const initDatabase = async (): Promise<void> => {
  try {
    const database = await getDatabase();
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS diary_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("[SQLite] Database initialized");
  } catch (e) {
    console.error("[SQLite] Failed to initialize database", e);
    throw e;
  }
};

export const saveDiaryEntry = async (
  title: string,
  content: string
): Promise<void> => {
  try {
    const database = await getDatabase();
    await database.runAsync(
      "INSERT INTO diary_entries (title, content) VALUES (?, ?)",
      [title, content]
    );
    console.log("[SQLite] Entry saved");
  } catch (e) {
    console.error("[SQLite] Failed to save entry", e);
    throw e;
  }
};

export const getDiaryEntries = async (): Promise<DiaryEntry[]> => {
  try {
    const database = await getDatabase();
    const rows = await database.getAllAsync<DiaryEntry>(
      "SELECT * FROM diary_entries ORDER BY created_at DESC"
    );
    return rows;
  } catch (e) {
    console.error("[SQLite] Failed to get entries", e);
    return [];
  }
};

export const deleteDiaryEntry = async (id: number): Promise<void> => {
  try {
    const database = await getDatabase();
    await database.runAsync("DELETE FROM diary_entries WHERE id = ?", [id]);
  } catch (e) {
    console.error("[SQLite] Failed to delete entry", e);
    throw e;
  }
};

export const updateDiaryEntry = async (
  id: number,
  title: string,
  content: string
): Promise<void> => {
  try {
    const database = await getDatabase();
    await database.runAsync(
      "UPDATE diary_entries SET title = ?, content = ? WHERE id = ?",
      [title, content, id]
    );
  } catch (e) {
    console.error("[SQLite] Failed to update entry", e);
    throw e;
  }
};

export const searchDiaryEntries = async (
  query: string
): Promise<DiaryEntry[]> => {
  try {
    const database = await getDatabase();
    const rows = await database.getAllAsync<DiaryEntry>(
      "SELECT * FROM diary_entries WHERE title LIKE ? OR content LIKE ? ORDER BY created_at DESC",
      [`%${query}%`, `%${query}%`]
    );
    return rows;
  } catch (e) {
    console.error("[SQLite] Failed to search entries", e);
    return [];
  }
};
