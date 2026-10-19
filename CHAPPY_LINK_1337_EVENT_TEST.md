# 共同開発のイベント受信テスト（マージ不要）

Issue: #1337

この文書だけを追加したPRで、プロジェクト側のイベント受信を試験する。本番変更ではなく、mainへマージしない。

## 既存の読取専用結果

- Codex task ID: `01a15304-9a5c-74f8-81b8-0c7ec74490f4`
- Source SHA: `30fab6e646ceaaa7cd5a5547acb545a3c7b24075`
- Source path: `js/api.js`
- Result: `API_BASE = "https://chappy-boatrace-api.vercel.app"`
- dot receipt: https://github.com/takechanman12250711-oss/chappy-boatrace-ai/issues/1337#issuecomment-6261873298

## 今回の試験範囲

このPRはプロジェクト側が既存結果をもとに作る。dotが自動でPRを生成した証拠ではなく、Codexを再起動したものでもない。

専用PRのopenedイベントから受信タスクが起動し、上記固定SHAの内容を照合して元チャットへ結果を返すことが合格条件。PR作成、GitHub CI成功、手動Run now、最終実行時刻だけでは合格にしない。自動起動した実行の結果と戻り先を確認する。

main・予想コード・本番API・公開・資格情報・課金契約を変更しない。丸ボタン、dot側PR自動生成、二重起動防止は別途未検証。
