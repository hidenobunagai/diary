# dIAry

音声日記アプリです。

- 音声録音 → Google Gemini API で文字起こし/要約
- 日記データは端末内（SQLite）に保存
- 任意で Google Drive（AppDataFolder）へバックアップ/復元
- 広告表示（AdMob）

このリポジトリは Expo の仕組み（Expo Router など）を使いつつ、Play Store 提出用の AAB は **EAS などのクラウドビルド無し**で **Windows のローカル Gradle**から生成できる形にしています。

## Links

- GitHub Pages: https://hidenobunagai.github.io/diary/
- Privacy Policy: https://hidenobunagai.github.io/diary/PRIVACY_POLICY.html
- Account/Data Deletion: https://hidenobunagai.github.io/diary/account-deletion.html
- Issues: https://github.com/hidenobunagai/diary/issues

## Development

```bash
npm install
npx expo start
```

## Android (Windows local Gradle)

詳細は ANDROID_LOCAL_BUILD.md を参照してください。

- standalone APK（Metro 不要）: `:app:assembleStandalone`
- Play 提出用 AAB（署名必須）: `:app:bundleRelease`

## Notes (Google Sign-In / Drive)

Play 配布は Play App Signing により再署名されるため、Google ログイン/Drive を使う場合は **Play Console の App signing key の SHA-1** を Google Cloud Console の OAuth（Android）に登録してください。
