# ボートデータ帳（boatdata/）

2026-11-07 ユーザー依頼：競艇データサイト「データ攻め」のような、**買い目・予想を出さないデータ専門サイト**をチャッピーとは別のサイトとして作る。見た目・名前は独自（他サイトの模倣はしない）。

- 公開先：`https://takechanman12250711-oss.github.io/chappy-boatrace-ai/boatdata/`（当面はチャッピーと同じ GitHub Pages の別フォルダ。独自URLへの移設は後日提案）
- 最初の版：ホーム（今日の開催・荒れそう／堅そうなレース）、出走表（全場全レース・見立てと理由）、モーター順位（今日使うモーターを公式2連率順）、24場（過去3年のイン1着率・荒れ率・万舟率・コース別1着率・決まり手）
- データ：
  - `data/site/days/YYYYMMDD.json` … `scripts/data-site/collect-day.cjs`。公式 racelist を全場全レース取得（1件ごとに350ms空ける）。見立ては `config/race-roughness-v1.json` の固定式を朝の出走表（進入は枠なり、展示・風は既定値）で適用。
  - `data/site/venues.json` … `scripts/data-site/build-venues.cjs`。`data/results` の直近3年。
- 更新：`Build boat data site`（08:23 JST、11:43 JST に取り直し）。保存は ledger と同じ単一ファイル transport（`scripts/data-site/persist.cjs`）。チャッピーの予想・保存原本・Vercel API は使わない／変更しない。
- 検査：`node --test tests/data-site.test.cjs`

## あとから入れる予定（必ず本人へ提案する）

答え合わせ（見立ての成績を毎晩・外れ込み）、万舟の記録、直前情報（展示タイム・チルト・進入・風）の反映、選手ページ、場ごとの「今日の見どころ」文章、独自URLへの移設。
