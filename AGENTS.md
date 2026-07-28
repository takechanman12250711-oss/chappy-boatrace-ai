# チャッピーボートレースAI 作業ルール

このリポジトリで作業する担当は、最初に
`docs/CHAPPY_CHARTER.md` と `docs/OPERATIONS.md` を読むこと。
機械判定用の正本は `config/chappy-charter.json` とする。

## 正本と作業開始

- 正本は GitHub の
  `takechanman12250711-oss/chappy-boatrace-ai` の `main`。
- 毎回 `git status`、`git remote get-url origin`、
  `git fetch origin main` を確認し、最新 `main` から作業ブランチを作る。
- 既存の未コミット変更は利用者の作業として保護し、破棄・上書きしない。
- 画面の接続確認には `node scripts/preflight-connections.js` を使う。
  API作業時だけ `--with-api` を付ける。

## 本番構成

- 画面のソースはこのリポジトリ。本番は GitHub Pages。
- API のソースは非公開リポジトリ
  `takechanman12250711-oss/chappy-boatrace-api`。
  本番は Vercel の `chappy-boatrace-api`。
- このリポジトリの `api/` はテスト・収集処理用であり、
  本番 Vercel API のデプロイ元ではない。
- Vercel に残る同名の画面プロジェクト
  `chappy-boatrace-ai` は古い複製。本番画面としてデプロイしない。

## 認証と接続

- GitHub Connector とローカル Git の認証は別物。
  `gh` が無い、またはローカル `git push` が認証できないだけで、
  GitHub Connector の切断と判断しない。
- 作業開始時に GitHub Connector で画面リポジトリを1回読む。
- API変更、API公開、API障害調査を行う場合だけ、非公開APIリポジトリと
  Vercel の API プロジェクト・最新本番も1回読む。
- 読み取りが成功した接続について、再認証を要求しない。
  Connector が明示的な認証エラーまたは Connect/Reconnect を返した場合だけ停止する。
- トークン、Cookie、秘密鍵、`.env`、Vercel 認証情報を
  コード、ログ、PR、引き継ぎ文へ保存・表示しない。
- ローカル push 認証が無くても、接続済み GitHub Connector の
  Git Data 操作でブランチ・コミット・PRを作成できる。

## 変更、検証、公開

- 予想ロジック、重み、70点基準は、管理者の明示同意なしに変更しない。
- CI と同じ Node.js 20 で憲章チェックと全テストを実行する。
- 書き込み許可がある場合も、作業ブランチへ push して PR を作る。
  `main` へのマージは、その依頼または承認が明示されている場合だけ行う。
- 画面変更は GitHub Pages、本番 API 変更は Vercel の
  `chappy-boatrace-api` の Git メタデータと本番URLで確認する。
