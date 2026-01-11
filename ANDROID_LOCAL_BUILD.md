# Android ローカルビルド（Windows）

## 生成物（出力先）

- APK（デバッグ / Metro 必須）: `android/app/build/outputs/apk/debug/app-debug.apk`
- APK（standalone / Metro 不要）: `android/app/build/outputs/apk/standalone/app-standalone.apk`
- APK（リリース）: `android/app/build/outputs/apk/release/app-release.apk`
- AAB（Play Store 提出用）: `android/app/build/outputs/bundle/release/app-release.aab`

## 1) まず APK（standalone）を作る（端末でインストールして動作確認用 / Metro 不要）

PowerShell:

```powershell
Set-Location .\android
$env:NODE_ENV = "production"
.\gradlew.bat :app:assembleStandalone --stacktrace
```

※ 事故防止のため、プロジェクトルートに `.env` / `.env.*` が存在するとビルドを失敗させるようにしています（`.env.example` などは除外）。

※ `assembleDebug` で作る `app-debug.apk` は Metro（開発サーバー）が必要なため、端末単体ではスプラッシュで止まることがあります。
端末単体での動作確認は `assembleStandalone` か `assembleRelease` を使ってください。

## 2) Play Store 用の署名（Upload keystore）を用意する

### 2-1) Upload keystore を作成（新規アプリの場合）

※パスワードはコマンドに直書きせず、対話入力で作るのがおすすめです。

```powershell
Set-Location .\android
keytool -genkeypair -v -keystore upload-keystore.jks -alias upload -keyalg RSA -keysize 2048 -validity 9125
```

### 2-2) android/keystore.properties を作成（ローカル専用・コミットしない）

`keystore.properties.example` を `android/keystore.properties` にコピーして、次を埋めてください。

PowerShell（コピー）:

```powershell
Set-Location .\android
Copy-Item ..\keystore.properties.example .\keystore.properties
```

```properties
# android/keystore.properties
storeFile=upload-keystore.jks
storePassword=********
keyAlias=upload
keyPassword=********
```

※ `storeFile` は `android/` からの相対パスです。通常は `android/upload-keystore.jks` に置いてください。

## 3) Play Store 提出用 AAB を作る（署名必須）

```powershell
Set-Location .\android
$env:NODE_ENV = "production"
.\gradlew.bat :app:bundleRelease --stacktrace
```

※ `android/keystore.properties` が無い状態で `bundleRelease` を実行すると、事故防止のためビルドが失敗します。
（ローカル動作確認用にどうしても回避したい場合だけ `-PallowDebugSigningForRelease=true -PackDebugSigningForRelease=true` を付けてください。Play Console へは絶対にアップロードしないでください。）

### 3-1) 提出前チェック（署名が upload keystore になっていること）

```powershell
Set-Location .\android
.\gradlew.bat :app:signingReport
```

出力の `release` が `upload-keystore.jks` を指していることを確認してください（`debug.keystore` の場合は提出不可）。

例（回避フラグ付き・提出禁止）:

```powershell
Set-Location .\android
$env:NODE_ENV = "production"
.\gradlew.bat :app:bundleRelease -PallowDebugSigningForRelease=true -PackDebugSigningForRelease=true --stacktrace
```

## 付録) Google Drive バックアップを有効にする（Google ログイン）

Google Drive バックアップは `@react-native-google-signin/google-signin` を使います。Android では **パッケージ名** と **署名鍵(SHA-1)** の設定が合っていないと、ログイン時に `DEVELOPER_ERROR` になります。

### A-1) Google Cloud Console 側の準備（Firebase 不要）

- Google Cloud Console で対象プロジェクトを選択
- 「API とサービス」で **Google Drive API** を有効化
- 「OAuth 同意画面」を設定（外部公開の場合は、テスト中はテストユーザーに自分の Google アカウントを追加）
- 「認証情報」→「OAuth クライアント ID を作成」→ 種類 **Android**
  - パッケージ名: `android/app/build.gradle` の `applicationId`（例: `com.hidesorganization.diary`）
  - SHA-1: 次の手順で取得した値

※ `google-services.json` は **Firebase 用**の設定ファイルです。Firebase を使わない場合は不要です。
（本プロジェクトでは、Firebase 形式（`project_info` を含む）の `google-services.json` がある場合に限り Google Services プラグインが適用され、それ以外はスキップされます。）

### A-2) SHA-1 を取得して登録（今インストールしている APK の署名鍵）

standalone/debug ビルドは `android/app/debug.keystore` で署名されます。

推奨（ビルド種別ごとの署名情報をまとめて確認）:

```powershell
Set-Location .\android
.\gradlew.bat signingReport
```

または（デバッグ鍵を直接確認）:

```powershell
Set-Location .\android
keytool -list -v -keystore .\app\debug.keystore -storepass android -alias androiddebugkey
```

出力される `SHA1:` を Google Cloud Console の Android OAuth クライアントに登録します。

### A-3) SHA-1（Upload keystore）も登録（Play Store 提出向け）

```powershell
Set-Location .\android
keytool -list -v -keystore .\upload-keystore.jks -alias upload
```

※ Play App Signing を有効にした後は、Play Console の「アプリの署名」から表示される **App signing key** の SHA-1 も Google Cloud Console 側に追加が必要になることがあります（本番配布でログインが失敗する場合）。

### A-4) 再ビルド

```powershell
Set-Location .\android
$env:NODE_ENV = "production"
.\gradlew.bat :app:assembleStandalone --stacktrace
```

## 4) リリース APK も作る（署名必須）

```powershell
Set-Location .\android
$env:NODE_ENV = "production"
.\gradlew.bat :app:assembleRelease --stacktrace
```
