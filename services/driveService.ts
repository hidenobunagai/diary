import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import * as FileSystem from "expo-file-system/legacy";

const DRIVE_BACKUP_KEY = "@diary_drive_backup";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const DB_FILENAME = "diary.db";

// Configure Google Sign-In with Drive scope
export const configureGoogleSignIn = () => {
  GoogleSignin.configure({
    scopes: [DRIVE_SCOPE],
    offlineAccess: true,
  });
};

// Check if user is signed in
export const isSignedIn = async (): Promise<boolean> => {
  try {
    const currentUser = await GoogleSignin.getCurrentUser();
    return currentUser !== null;
  } catch {
    return false;
  }
};

// Sign in with Google
export const signInWithGoogle = async (): Promise<{
  success: boolean;
  email?: string;
  error?: string;
}> => {
  try {
    await GoogleSignin.hasPlayServices();
    const response = await GoogleSignin.signIn();

    if (isSuccessResponse(response)) {
      // Store backup info
      await AsyncStorage.setItem(
        DRIVE_BACKUP_KEY,
        JSON.stringify({
          email: response.data.user.email,
          signedInAt: new Date().toISOString(),
        })
      );
      return { success: true, email: response.data.user.email };
    } else {
      return { success: false, error: "Sign in was cancelled" };
    }
  } catch (error) {
    if (isErrorWithCode(error)) {
      switch (error.code) {
        case statusCodes.SIGN_IN_CANCELLED:
          return { success: false, error: "ログインがキャンセルされました" };
        case statusCodes.IN_PROGRESS:
          return { success: false, error: "ログイン処理中です" };
        case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
          return {
            success: false,
            error: "Google Play サービスが利用できません",
          };
        default:
          return { success: false, error: `エラー: ${error.message}` };
      }
    }
    return { success: false, error: "不明なエラーが発生しました" };
  }
};

// Sign out from Google
export const signOutFromGoogle = async (): Promise<void> => {
  try {
    await GoogleSignin.signOut();
    await AsyncStorage.removeItem(DRIVE_BACKUP_KEY);
  } catch (error) {
    console.error("Sign out error:", error);
  }
};

// Get current user info
export const getCurrentUser = async (): Promise<{
  email: string;
  lastBackup?: string;
} | null> => {
  try {
    const stored = await AsyncStorage.getItem(DRIVE_BACKUP_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
    return null;
  } catch {
    return null;
  }
};

// Get access token for Drive API
const getAccessToken = async (): Promise<string | null> => {
  try {
    const tokens = await GoogleSignin.getTokens();
    return tokens.accessToken;
  } catch (error) {
    console.error("Failed to get access token:", error);
    return null;
  }
};

// Backup database to Google Drive
export const backupToGoogleDrive = async (): Promise<{
  success: boolean;
  error?: string;
}> => {
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      return { success: false, error: "ログインが必要です" };
    }

    // Get SQLite database file path
    const dbPath = `${FileSystem.documentDirectory}SQLite/${DB_FILENAME}`;

    // Check if database exists
    const dbInfo = await FileSystem.getInfoAsync(dbPath);
    if (!dbInfo.exists) {
      return { success: false, error: "バックアップするデータがありません" };
    }

    // Read the database file as base64
    const dbContent = await FileSystem.readAsStringAsync(dbPath, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Check if backup already exists
    const existingFileId = await findExistingBackup(accessToken);

    if (existingFileId) {
      // Update existing file
      await updateDriveFile(accessToken, existingFileId, dbContent);
    } else {
      // Create new file
      await createDriveFile(accessToken, dbContent);
    }

    // Update last backup time
    const stored = await AsyncStorage.getItem(DRIVE_BACKUP_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      data.lastBackup = new Date().toISOString();
      await AsyncStorage.setItem(DRIVE_BACKUP_KEY, JSON.stringify(data));
    }

    return { success: true };
  } catch (error) {
    console.error("Backup error:", error);
    return { success: false, error: "バックアップに失敗しました" };
  }
};

// Restore database from Google Drive
export const restoreFromGoogleDrive = async (): Promise<{
  success: boolean;
  error?: string;
}> => {
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      return { success: false, error: "ログインが必要です" };
    }

    // Find backup file
    const fileId = await findExistingBackup(accessToken);
    if (!fileId) {
      return { success: false, error: "バックアップが見つかりません" };
    }

    // Download file content
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      return { success: false, error: "ダウンロードに失敗しました" };
    }

    // Get base64 content
    const blob = await response.blob();
    const reader = new FileReader();

    return new Promise((resolve) => {
      reader.onloadend = async () => {
        try {
          const base64 = (reader.result as string).split(",")[1];

          // Ensure SQLite directory exists
          const sqliteDir = `${FileSystem.documentDirectory}SQLite`;
          const dirInfo = await FileSystem.getInfoAsync(sqliteDir);
          if (!dirInfo.exists) {
            await FileSystem.makeDirectoryAsync(sqliteDir, {
              intermediates: true,
            });
          }

          // Write database file
          const dbPath = `${sqliteDir}/${DB_FILENAME}`;
          await FileSystem.writeAsStringAsync(dbPath, base64, {
            encoding: FileSystem.EncodingType.Base64,
          });

          resolve({ success: true });
        } catch (error) {
          console.error("Restore write error:", error);
          resolve({ success: false, error: "復元に失敗しました" });
        }
      };
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("Restore error:", error);
    return { success: false, error: "復元に失敗しました" };
  }
};

// Helper: Find existing backup file in Drive
const findExistingBackup = async (
  accessToken: string
): Promise<string | null> => {
  try {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${DB_FILENAME}'&fields=files(id,name)`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) return null;

    const data = await response.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
    return null;
  } catch {
    return null;
  }
};

// Helper: Create new file in Drive
const createDriveFile = async (
  accessToken: string,
  base64Content: string
): Promise<void> => {
  const metadata = {
    name: DB_FILENAME,
    parents: ["appDataFolder"],
  };

  const boundary = "diary_backup_boundary";
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
    metadata
  )}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\nContent-Transfer-Encoding: base64\r\n\r\n${base64Content}\r\n--${boundary}--`;

  await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );
};

// Helper: Update existing file in Drive
const updateDriveFile = async (
  accessToken: string,
  fileId: string,
  base64Content: string
): Promise<void> => {
  // Convert base64 to blob
  const byteCharacters = atob(base64Content);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);

  await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/octet-stream",
      },
      body: byteArray,
    }
  );
};
