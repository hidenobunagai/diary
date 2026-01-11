---
title: Account Deletion / Data Deletion
toc: true
permalink: /account-deletion.html
---

# アカウント削除 / データ削除

dIAry は、開発者のサーバー上に「アプリ固有のアカウント」を作成しません。
（Google Drive バックアップ/復元を利用する場合のみ、Google アカウントで認証します）

以下は、ユーザーがデータ削除を行う方法です。

## 1) 端末内データ（ローカル）を削除する

- アプリをアンインストールすると、端末内に保存されている日記データ（SQLite）や設定情報が削除されます。

## 2) Google Drive のバックアップデータを削除する（利用している場合）

バックアップはユーザーの Google Drive（アプリデータ領域: AppDataFolder）に保存されます。

- Google Drive（Web）を開く
- 右上の歯車 → **設定** → **アプリの管理（Manage Apps）**
- 一覧から dIAry を探し、**非表示のアプリデータを削除（Delete hidden app data）** を実行

または、Google アカウントの「サードパーティ アクセス」から dIAry のアクセス権を削除できます。

## 3) Google アカウント連携（認可）を解除する

- Google アカウントの権限ページ（サードパーティ アクセス）で、dIAry のアクセスを削除してください。

## 4) 広告（AdMob）について

dIAry は Google Mobile Ads SDK（AdMob）を利用する場合があります。
広告配信に関するデータの取り扱いは Google のポリシーが適用されます。

- [Google プライバシーポリシー](https://policies.google.com/privacy)

## お問い合わせ

削除に関するご質問は GitHub Issues へお願いします。

- https://github.com/hidenobunagai/diary/issues

---

# Account Deletion / Data Deletion

dIAry does not create an app-specific account on the developer’s servers.
(Only when using Google Drive backup/restore, you authenticate with your Google account.)

Below are the ways to delete your data.

## 1) Delete local on-device data

- Uninstalling the app deletes diary data (SQLite) and settings stored on your device.

## 2) Delete Google Drive backup data (if you used backup)

Backups are stored in your Google Drive app data area (AppDataFolder).

- Open Google Drive (Web)
- Click the gear icon → **Settings** → **Manage Apps**
- Find dIAry and run **Delete hidden app data**

You can also revoke the app’s access from your Google Account’s third-party access settings.

## 3) Revoke Google account access

- Remove dIAry access from your Google Account permissions (third-party access) page.

## 4) About ads (AdMob)

dIAry may use Google Mobile Ads SDK (AdMob). Google’s policies apply.

- [Google Privacy Policy](https://policies.google.com/privacy)

## Contact

For questions, please use GitHub Issues:

- https://github.com/hidenobunagai/diary/issues
