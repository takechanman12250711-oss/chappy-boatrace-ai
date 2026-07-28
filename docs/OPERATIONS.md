# 認証・接続・公開運用

## 唯一の本番経路

| 対象 | ソース | 公開先 |
|---|---|---|
| 画面 | `takechanman12250711-oss/chappy-boatrace-ai` | [GitHub Pages](https://takechanman12250711-oss.github.io/chappy-boatrace-ai/) |
| API | `takechanman12250711-oss/chappy-boatrace-api` | [Vercel API](https://chappy-boatrace-api.vercel.app/) |

Vercel API の確認済みプロジェクトIDは
`prj_N3K9AFjSqVIWtLWXh446AmzMbXJc`。
Vercel に残る画面の旧複製
`prj_TIc04qWwcIlYM5p1ncwuvy6yro09` は本番ではなく、
このリポジトリをそこへ直接デプロイしない。

## セッション開始時の確認

1. `node scripts/preflight-connections.js` を実行する。
2. GitHub Connector で画面リポジトリの `main` を読む。
3. API変更、API公開、API障害調査の場合だけ
   `node scripts/preflight-connections.js --with-api` を実行する。
4. 同じAPI作業の場合だけ、GitHub Connector で非公開 API
   リポジトリの `main` を読み、Vercel Connector で
   `chappy-boatrace-api` と最新 Production を読む。
5. 必要な接続が成功したら、同じセッションで再接続を求めない。

通常のローカル検査は GitHub の読み取りと GitHub Pages、
`--with-api` 指定時はVercel APIの到達性も確認する。
Connector の権限はローカルファイルへ保存せず、
各 Connector の安全な読み取り操作で確認する。

## GitHub への書き込み

推奨順序:

1. 最新 `origin/main` を取得し、作業ブランチを更新する。
2. Node.js 20 で全CIコマンドを通す。
3. ローカル Git 認証が使える場合は通常の push を使う。
4. ローカル認証が無い場合は、接続済み GitHub Connector で
   blob、tree、commit、branch を作成し、PRを開く。
5. PR のCIを確認する。
6. `main` へのマージは、利用者の明示された依頼範囲内だけで行う。

`gh: command not found` や `git push` の資格情報エラーは、
GitHub Connector の認証切れを意味しない。Connector の読み取りが
成功していれば、Connector の書き込み経路を使う。

## 公開確認

画面:

- PR マージ後、GitHub Pages の `index.html` と `main` を照合する。
- HTML が参照する主要 CSS・JavaScript の HTTP 応答を確認する。

API:

- 非公開 API リポジトリの対象コミットを確認する。
- Vercel の Production が `READY` であることを確認する。
- Deployment の Git repository/ref が
  `chappy-boatrace-api` / `main` であることを確認する。
- `https://chappy-boatrace-api.vercel.app/api/schedule` の応答を確認する。

## 失敗時の判断

| 症状 | 判断と対応 |
|---|---|
| `gh` が無い | Connector が読めるなら再認証せず、Connectorで書き込む |
| ローカル `git push` が認証失敗 | Connector の読み取りを確認し、成功ならConnectorで書き込む |
| Connector が Connect/Reconnect を要求 | 認証操作が必要。そこで停止して利用者へ伝える |
| GitHub Pages と `main` が不一致 | 接続ではなく公開遅延として扱い、Pages反映を再確認する |
| Vercel API が不調 | APIプロジェクトの最新Productionとログを確認する |
| Vercelの画面プロジェクトしか見えない | 誤った旧複製。そこへ画面をデプロイしない |

## 秘密情報

認証は GitHub/Vercel Connector、GitHub Actions、Vercel 側の
Secret 管理へ置く。トークン、秘密鍵、Cookie、`.env` の実値を
リポジトリ、Issue、PR、チャットへ貼らない。
