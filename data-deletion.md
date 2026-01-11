---
title: Data Deletion
toc: true
permalink: /data-deletion.html
---

# データ削除の方法

dIAry は、開発者のサーバー上にアプリ固有のアカウントを作成しません。
そのため「開発者にアカウント削除を依頼する」形式の削除手続きはありません。

ユーザーが本アプリに関連するデータを削除したい場合は、以下の方法で行えます。

## 1) 端末内データ（ローカル）の削除

- アプリをアンインストールすると、端末内に保存されている日記データ（SQLite）や設定情報が削除されます。

## 2) Google Drive バックアップの削除（利用している場合）

バックアップはユーザーの Google Drive（アプリデータ領域: AppDataFolder）に保存されます。

- Google Drive（Web）を開く
- 右上の歯車 → **設定** → **アプリの管理（Manage Apps）**
- 一覧から dIAry を探し、**非表示のアプリデータを削除（Delete hidden app data）** を実行

## 3) Google アカウント連携（認可）の解除

- Google アカウントのサードパーティアクセス（権限）ページから、dIAry のアクセス権を削除してください。

## お問い合わせ

- https://github.com/hidenobunagai/diary/issues

---

# Data Deletion

dIAry does not create an app-specific account on the developer’s servers.
Therefore, there is no developer-handled “account deletion request” process.

If you want to delete data related to this App, you can do so as follows:

## 1) Delete local on-device data

- Uninstall the app to remove diary data (SQLite) and settings stored on your device.

## 2) Delete Google Drive backups (if used)

Backups are stored in your Google Drive app data area (AppDataFolder).

- Open Google Drive (Web)
- Gear icon → **Settings** → **Manage Apps**
- Find dIAry and run **Delete hidden app data**

## 3) Revoke Google account access

- Remove dIAry access from your Google Account third-party access/permissions page.

## Contact

- https://github.com/hidenobunagai/diary/issues
