# 対象別の入口

検索を短くする入口として使い、存在・呼び出し経路は最新mainで確認する。全項目を毎回読む必要はない。

| 対象 | 最初に見る場所 |
| --- | --- |
| 固定条件 | `config/chappy-charter.json`、`scripts/check-charter.js` |
| スマホ画面・遅延読込 | `index.html`、`js/home-dashboard-v2.js`、`js/app-runtime-loader.js`、`js/prediction-runtime-loader.js`。現在の入口から表示部品に到達するか確認する |
| 予想描画・noteアシスト | `js/script.js`、`js/render.js` の対象関数とイベント |
| 定期予想と原稿保存 | `scripts/collect-predictions.js`、`.github/workflows/collect-predictions.yml` |
| 原稿生成・監査 | `js/note-generator.js`、`scripts/note-publication-audit.js`、`docs/note-automation.md` |
| 保存原稿と同時点の根拠 | `scripts/note-draft-bundle.js`、`data/note-drafts/`。原稿の買い目を独立比較元として複製しない |
| 軽量な日次表示 | `scripts/build-prediction-summaries.js`、`data/predictions/summaries/`。要約にない項目を原本にもないと判断しない |
| 原本と圧縮 | `scripts/daily-prediction-source-archive.js`、`scripts/restore-daily-prediction-source.js`。必要な期間だけ調べ、巨大な全原本を毎回読まない |
| 公式結果 | `.github/workflows/collect-results.yml` とその呼び出し先。note公開記事との照合とは区別する |
| 共通Skill | `.agents/skills/`、`.claude/skills/`、`scripts/check-note-skills.js` |

フロントはGitHub Pages、取得APIは別の `takechanman12250711-oss/chappy-boatrace-api`（Vercel）。API側も変更する必要があるかは、実際の不具合と依頼範囲から判断する。

改善研究では対象期間、元の予想、公式結果、通常/参考の区分を揃える。新方式の検証と本番採用済みの結果を混ぜない。根拠が足りなければ不足を示し、元データを保持する。
