import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from "@react-native-google-signin/google-signin";
// expo-file-system v54+ throws at runtime for deprecated methods when imported from "expo-file-system".
// This file still uses the classic async API (getInfoAsync/readAsStringAsync/uploadAsync/etc),
// so we import the legacy entrypoint to keep runtime stable.
import * as FileSystem from "expo-file-system/legacy";
import { initDatabase, resetDatabaseConnection } from "./storageService";

const DRIVE_BACKUP_KEY = "@diary_drive_backup";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const DB_FILENAME = "diary.db";

let isGoogleSignInConfigured = false;

const ensureGoogleSignInConfigured = (): void => {
  if (isGoogleSignInConfigured) return;

  // IMPORTANT:
  // - offlineAccess=true requires a server/web client ID and will throw on Settings load.
  // - We keep the initial Sign-In minimal (email/profile).
  //   Drive scope is requested later via `addScopes`, so we can separate "login" from "Drive permission".
  GoogleSignin.configure({});
  isGoogleSignInConfigured = true;
};

const ensureDriveScopeGranted = async (): Promise<
  { ok: true } | { ok: false; error: string }
> => {
  try {
    ensureGoogleSignInConfigured();
    const currentUser = await GoogleSignin.getCurrentUser();
    if (currentUser === null) {
      return { ok: false, error: "ログインが必要です" };
    }

    await GoogleSignin.addScopes({ scopes: [DRIVE_SCOPE] });
    return { ok: true };
  } catch (error) {
    if (isErrorWithCode(error)) {
      switch (error.code) {
        case statusCodes.SIGN_IN_CANCELLED:
          return {
            ok: false,
            error: "Google Drive の権限付与がキャンセルされました",
          };
        case statusCodes.IN_PROGRESS:
          return { ok: false, error: "権限付与の処理中です" };
        case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
          return { ok: false, error: "Google Play サービスが利用できません" };
        default:
          break;
      }

      if (
        error.code === "DEVELOPER_ERROR" ||
        (typeof error.message === "string" &&
          error.message.includes("DEVELOPER_ERROR"))
      ) {
        return {
          ok: false,
          error:
            "Google Drive の権限付与に失敗しました（DEVELOPER_ERROR）。\n" +
            "- Google Cloud Console の OAuth 同意画面（テストユーザー含む）が設定済みか確認\n" +
            "- Google Drive API が有効化されているか確認\n" +
            "- OAuth クライアント（Android）のパッケージ名/SHA-1 がこのアプリの署名鍵と一致しているか再確認\n" +
            "  - ローカルAPK（standalone/debug等）: androidで .\\gradlew.bat signingReport のSHA-1\n" +
            "  - Play配布（内部テスト/クローズド等）: Play Console『アプリの署名（App signing key）』のSHA-1（Playが再署名します）\n" +
            "  - 必要に応じて SHA-1 ごとに Android OAuth クライアントを複数作成してOK\n" +
            "- 反映後、アプリを再インストールして再試行してください。",
        };
      }

      return { ok: false, error: `権限付与エラー: ${error.message}` };
    }
    return { ok: false, error: "権限付与で不明なエラーが発生しました" };
  }
};

// Configure Google Sign-In (no-op wrapper)
export const configureGoogleSignIn = () => {
  ensureGoogleSignInConfigured();
};

// Check if user is signed in
export const isSignedIn = async (): Promise<boolean> => {
  try {
    ensureGoogleSignInConfigured();
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
    ensureGoogleSignInConfigured();
    await GoogleSignin.hasPlayServices();
    const response = await GoogleSignin.signIn();

    if (isSuccessResponse(response)) {
      // Request Drive scope after login (separates login issues from Drive permission issues)
      const scopeResult = await ensureDriveScopeGranted();
      if (!scopeResult.ok) {
        return { success: false, error: scopeResult.error };
      }

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
      if (
        error.code === "DEVELOPER_ERROR" ||
        (typeof error.message === "string" &&
          error.message.includes("DEVELOPER_ERROR"))
      ) {
        return {
          success: false,
          error:
            "GoogleログインのAndroid設定が一致していません（DEVELOPER_ERROR）。\n" +
            "- Google Cloud Console で OAuth クライアントID（種類: Android）を作成/更新\n" +
            "  - パッケージ名: com.hidesorganization.diary（android/app/build.gradle の applicationId）\n" +
            "  - SHA-1: このアプリの署名鍵\n" +
            "    - ローカルAPK（standalone/debug等）: androidで .\\gradlew.bat signingReport\n" +
            "    - Play配布（内部テスト/クローズド等）: Play Console『アプリの署名（App signing key）』のSHA-1（Playが再署名します）\n" +
            "    - 必要に応じて SHA-1 ごとに Android OAuth クライアントを複数作成してOK\n" +
            "- 反映まで数分かかることがあるので数分待って再試行\n" +
            "- 端末側で Google Play開発者サービス のキャッシュ/データ削除 → 再試行\n" +
            "- 反映後、APKを再ビルド/再インストールしてください。",
        };
      }
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
    ensureGoogleSignInConfigured();
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
    ensureGoogleSignInConfigured();
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
    ensureGoogleSignInConfigured();
    const scopeResult = await ensureDriveScopeGranted();
    if (!scopeResult.ok) {
      console.warn(scopeResult.error);
      return null;
    }

    const tokens = await GoogleSignin.getTokens();
    return tokens.accessToken;
  } catch (error) {
    console.error("Failed to get access token:", error);
    return null;
  }
};

const safeReadResponseText = async (response: Response): Promise<string> => {
  try {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const json = await response.json();
      return JSON.stringify(json);
    }
    return await response.text();
  } catch {
    return "";
  }
};

const startResumableUploadSession = async (params: {
  accessToken: string;
  fileId?: string;
}): Promise<string> => {
  const { accessToken, fileId } = params;

  const url = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=resumable`
    : "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable";

  const method = fileId ? "PATCH" : "POST";
  const metadata = fileId
    ? { name: DB_FILENAME }
    : { name: DB_FILENAME, parents: ["appDataFolder"] };

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": "application/octet-stream",
    },
    body: JSON.stringify(metadata),
  });

  if (!response.ok) {
    const detail = await safeReadResponseText(response);
    throw new Error(
      `Driveアップロード初期化に失敗しました (${response.status}). ${detail}`
    );
  }

  const uploadUrl = response.headers.get("Location");
  if (!uploadUrl) {
    const detail = await safeReadResponseText(response);
    throw new Error(`DriveアップロードURLが取得できませんでした. ${detail}`);
  }

  return uploadUrl;
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

    // Check if backup already exists
    const existingFileId = await findExistingBackup(accessToken);

    // Use resumable upload and stream from file path to avoid base64 memory issues.
    const uploadUrl = await startResumableUploadSession({
      accessToken,
      fileId: existingFileId ?? undefined,
    });
    const uploadResult = await FileSystem.uploadAsync(uploadUrl, dbPath, {
      httpMethod: "PUT",
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        "Content-Type": "application/octet-stream",
      },
    });

    if (uploadResult.status !== 200 && uploadResult.status !== 201) {
      throw new Error(
        `Driveアップロードに失敗しました (${uploadResult.status}). ${
          uploadResult.body || ""
        }`
      );
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
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `バックアップに失敗しました: ${message}` };
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

          // Ensure the app uses the restored DB file (re-open SQLite connection)
          resetDatabaseConnection();
          await initDatabase();

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

export const deleteBackupFromGoogleDrive = async (): Promise<{
  success: boolean;
  error?: string;
}> => {
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      return { success: false, error: "ログインが必要です" };
    }

    const fileId = await findExistingBackup(accessToken);
    if (!fileId) {
      return { success: false, error: "削除するバックアップが見つかりません" };
    }

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok && response.status !== 404) {
      const detail = await safeReadResponseText(response);
      return {
        success: false,
        error: `バックアップ削除に失敗しました (${response.status}). ${detail}`,
      };
    }

    const stored = await AsyncStorage.getItem(DRIVE_BACKUP_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      delete data.lastBackup;
      await AsyncStorage.setItem(DRIVE_BACKUP_KEY, JSON.stringify(data));
    }

    return { success: true };
  } catch (error) {
    console.error("Delete backup error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `バックアップ削除に失敗しました: ${message}`,
    };
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

// NOTE: Upload is handled via resumable upload + FileSystem.uploadAsync above.
