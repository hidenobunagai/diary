import * as SQLite from "expo-sqlite";

// Lightweight DB change event (in-memory). Screens can subscribe and refresh immediately,
// e.g. right after a Drive restore reopens the DB connection.
type DbChangeListener = (event: { type: "reset" | "init" | "write" }) => void;

const dbChangeListeners = new Set<DbChangeListener>();

export const subscribeDatabaseChanges = (
  listener: DbChangeListener,
): (() => void) => {
  dbChangeListeners.add(listener);
  return () => {
    dbChangeListeners.delete(listener);
  };
};

const emitDatabaseChange = (event: { type: "reset" | "init" | "write" }) => {
  for (const listener of dbChangeListeners) {
    try {
      listener(event);
    } catch {
      // Listener errors should never break app flow.
    }
  }
};

export interface DiaryEntry {
  id?: number;
  title: string;
  content: string;
  created_at?: string;
}

let db: SQLite.SQLiteDatabase | null = null;
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let initPromise: Promise<void> | null = null;

export const resetDatabaseConnection = (): void => {
  db = null;
  dbPromise = null;
  initPromise = null;

  emitDatabaseChange({ type: "reset" });
};

const ensureInitialized = async (
  database: SQLite.SQLiteDatabase,
): Promise<void> => {
  if (!initPromise) {
    initPromise = database.execAsync(`
      CREATE TABLE IF NOT EXISTS diary_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }
  await initPromise;
};

const getDatabase = async (): Promise<SQLite.SQLiteDatabase> => {
  if (db) {
    await ensureInitialized(db);
    return db;
  }

  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync("diary.db");
  }

  db = await dbPromise;
  await ensureInitialized(db);
  return db;
};

export const initDatabase = async (): Promise<void> => {
  try {
    await getDatabase();
    console.log("[SQLite] Database initialized");
    emitDatabaseChange({ type: "init" });
  } catch (e) {
    console.error("[SQLite] Failed to initialize database", e);
    throw e;
  }
};

export const saveDiaryEntry = async (
  title: string,
  content: string,
): Promise<void> => {
  try {
    const database = await getDatabase();
    await database.runAsync(
      "INSERT INTO diary_entries (title, content) VALUES (?, ?)",
      [title, content],
    );
    console.log("[SQLite] Entry saved");
    emitDatabaseChange({ type: "write" });
  } catch (e) {
    console.error("[SQLite] Failed to save entry", e);
    throw e;
  }
};

export const getDiaryEntries = async (): Promise<DiaryEntry[]> => {
  try {
    const database = await getDatabase();
    const rows = await database.getAllAsync<DiaryEntry>(
      "SELECT * FROM diary_entries ORDER BY created_at DESC",
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
    emitDatabaseChange({ type: "write" });
  } catch (e) {
    console.error("[SQLite] Failed to delete entry", e);
    throw e;
  }
};

export const updateDiaryEntry = async (
  id: number,
  title: string,
  content: string,
): Promise<void> => {
  try {
    const database = await getDatabase();
    await database.runAsync(
      "UPDATE diary_entries SET title = ?, content = ? WHERE id = ?",
      [title, content, id],
    );
    emitDatabaseChange({ type: "write" });
  } catch (e) {
    console.error("[SQLite] Failed to update entry", e);
    throw e;
  }
};

export const searchDiaryEntries = async (
  query: string,
): Promise<DiaryEntry[]> => {
  try {
    const database = await getDatabase();
    const rows = await database.getAllAsync<DiaryEntry>(
      "SELECT * FROM diary_entries WHERE title LIKE ? OR content LIKE ? ORDER BY created_at DESC",
      [`%${query}%`, `%${query}%`],
    );
    return rows;
  } catch (e) {
    console.error("[SQLite] Failed to search entries", e);
    return [];
  }
};
