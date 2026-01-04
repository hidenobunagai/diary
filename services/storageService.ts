import { createClient } from "@libsql/client/http";

const TURSO_URL = process.env.EXPO_PUBLIC_TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.EXPO_PUBLIC_TURSO_AUTH_TOKEN;

console.log("[Turso] URL:", TURSO_URL);
console.log("[Turso] Token exists:", !!TURSO_AUTH_TOKEN);

const client = createClient({
  url: TURSO_URL || "file:///data/data/host.exp.exponent/files/default.db", // Fallback or strict requirement
  authToken: TURSO_AUTH_TOKEN,
});

export interface DiaryEntry {
  id?: number;
  title: string;
  content: string;
  created_at?: string;
}

export const initDatabase = async () => {
  if (!TURSO_URL) return;
  try {
    await client.execute(`
            CREATE TABLE IF NOT EXISTS diary_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT,
                content TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);
  } catch (e) {
    console.error("Failed to init DB", e);
  }
};

export const saveDiaryEntry = async (title: string, content: string) => {
  try {
    await client.execute({
      sql: "INSERT INTO diary_entries (title, content) VALUES (?, ?)",
      args: [title, content],
    });
  } catch (e) {
    console.error("Failed to save entry", e);
    throw e;
  }
};

export const getDiaryEntries = async (): Promise<DiaryEntry[]> => {
  try {
    const rs = await client.execute(
      "SELECT * FROM diary_entries ORDER BY created_at DESC"
    );
    return rs.rows.map((row) => ({
      id: row.id as number,
      title: row.title as string,
      content: row.content as string,
      created_at: row.created_at as string,
    }));
  } catch (e) {
    console.error("Failed to get entries", e);
    return [];
  }
};

export const deleteDiaryEntry = async (id: number): Promise<void> => {
  try {
    await client.execute({
      sql: "DELETE FROM diary_entries WHERE id = ?",
      args: [id],
    });
  } catch (e) {
    console.error("Failed to delete entry", e);
    throw e;
  }
};

export const updateDiaryEntry = async (
  id: number,
  title: string,
  content: string
): Promise<void> => {
  try {
    await client.execute({
      sql: "UPDATE diary_entries SET title = ?, content = ? WHERE id = ?",
      args: [title, content, id],
    });
  } catch (e) {
    console.error("Failed to update entry", e);
    throw e;
  }
};

export const searchDiaryEntries = async (
  query: string
): Promise<DiaryEntry[]> => {
  try {
    const rs = await client.execute({
      sql: "SELECT * FROM diary_entries WHERE title LIKE ? OR content LIKE ? ORDER BY created_at DESC",
      args: [`%${query}%`, `%${query}%`],
    });
    return rs.rows.map((row) => ({
      id: row.id as number,
      title: row.title as string,
      content: row.content as string,
      created_at: row.created_at as string,
    }));
  } catch (e) {
    console.error("Failed to search entries", e);
    return [];
  }
};
