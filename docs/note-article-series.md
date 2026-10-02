# 通常予想・イン逃げ・万舟の別記事掲載

2026-09-29 ユーザー承認。1レースを1記事単位とし、通常予想、独立監視のイン逃げ、独立監視の万舟を別記事・別表紙・一覧の別区分で掲載する。同じレースでも種類ごとに1回だけ。通常AIの本命・万舟欄を独立監視へ転用せず、監視の完成文章・根拠・買い目を保持する。該当しない監視記事は作らない。

| 種類 | 原本 | 表示 |
| --- | --- | --- |
| normal | note-draft-bundle-v1 | 公開用タイトルに【通常予想】、青緑の表紙 |
| escape | independent-monitor-note-v1 | 原文タイトル、緑の「イン逃げ」表紙 |
| manshu | independent-monitor-note-v1 | 原文タイトル、橙の「万舟」表紙 |

全記事300円、展示確認、締切余裕120秒超、公開買い目1〜7点、元原稿SHA、有料境界、原子的予約、公開URL・日時確認を維持する。保存予想の削減・再生成、公開済み記事の変更はしない。

## 既存の監視タスクからの原本

「狙い目監視・独立note原稿」の既存判断・文章作成方針を維持する。公式情報を実際に確認して展示後に確定した判断だけを使う。仮判定や過去チャット例から原稿を復元しない。新しい監視タスク、collector、有料サービス、通常AI呼び出しは追加しない。

完成JSONの契約は `scripts/note-independent-monitor-source.js`、`scripts/note-exhibition.js`、`scripts/note-publication-audit.js` を参照する。主な必須項目:

- `version: independent-monitor-note-v1`。`capturedAt` は実際の原本保存時刻（確定以降・締切前）。未来時刻は不可。
- `record`: `raceKey`（YYYYMMDD-JJ-R）、`date`（JSTのYYYYMMDD）、2桁 `jcd`、`place`、`raceNo`、タイムゾーン付き `deadlineAt`・`selectedAt`、`source: independent-watch`。`prediction.practicalTickets` に監視の確定買い目を保持し、mainSheet/manshuSheet/aiCoreやall-races-v1を付けない。
- `record.exhibitionSnapshot`: `version: note-exhibition-v1`、`ready: true`、実取得時刻 `capturedAt`、6艇分 `entries:[{boat,exhibition:{displayTime}}]` と `startExhibition:[{boat,course,st,mappingSource:'official-start-image'}]`。公式の進入・展示STを確認できない場合は止める。
- `monitor`: `origin: independent-watch`、`kind: escape` または `manshu`、同じ `raceKey`、`status: confirmed-after-exhibition`、`confirmedAt`（record.selectedAtと同じ）、6艇各々の `boatAssessments:[{boat,reason}]`、原文 `article`、確定 `tickets`。
- `monitor.sources`: 最低2件、`role: entry` と `role: exhibition` を含む。各要素は実際に読んだ公式 boatrace.jp のHTTPS `url`（hd/jcd/rnoが対象レース）、`observedAt`、取得根拠の原文 `text`、そのUTF-8の `sha256`。値や原文を創作しない。
- `article`: `ok:true`、`publishable:true`、`format:formation-v3`、完成済み `title`・`freeText`・`paidText`・`fullText`・`tags`・`paywallMarker`、`practicalTickets`、`boatEvaluations`（艇番1〜6）、`meta:{date,place,raceNo,deadline:'HH:mm'}`。タイトルに「狙い目監視」と対象の「イン逃げ」または「万舟」、日付・場・R・締切を含める。無料部分に「通常AIの予想とは別の、独立した監視予想です。」を含める。買い目は有料部分だけに置く。
- `paywallMarker` は `──────── ここから先は有料部分です ────────`。`fullText` は `[freeText,paywallMarker,paidText,'※舟券の購入は自己責任で、無理のない範囲でお楽しみください。',tags.join(' ')].join('\n\n')`。
- `article` と `monitor.article` は完全同一。`article.practicalTickets`、`monitor.tickets`、`record.prediction.practicalTickets`、`baselinePracticalTickets` も順序・数値を含め完全同一。未取得のオッズを捏造しない。

新規原稿を完成させる段階でこの形式を整える。完成済み原稿を投稿都合で書き換えて通さず、必要な記録が欠けていたら不足を報告する。

## 保存と自動投稿

1. 最新mainの必要スクリプトで `node scripts/save-independent-monitor-note.js <完成JSON>` を実行する。実時計で当日・展示後・文章と買い目一致・締切を検査する。テストfixtureは本番へ送らない。
2. 成功結果の `sourcePath` と `sha256` を確認する。出力は `data/note-drafts/YYYYMMDD/YYYYMMDD-JJ-R-<UTF-8ファイル全体のsha256>.json`。改行を含め出力ファイル内容をそのまま使用し、既存原本を上書きしない。
3. 承認済みGitHub接続で `takechanman12250711-oss/chappy-boatrace-ai` の `main` に同じpathの存在を確認し、存在しない場合だけ create_file で正確なUTF-8内容を新規保存する。レース原稿はライブデータの既存経路であり、コード変更PRを毎回作らない。応答不明なら同じpath・SHAを確認し、別pathでやり直さない。
4. mainを読み戻して実保存path・SHA・commitを記録する。検証を実行できない・接続で保存できない場合は停止位置と不足を伝える。チャット返答や作業用ファイルだけでキューへ届いたと扱わない。
5. `data/note-drafts/**` のpushで既存 `Note GitHub UI transport` が起動し、最新mainからhandoffを再構築する。通常collectorの既存dispatchも維持する。
6. `note-published/<予約ハッシュ>` receiptと実際の公開ページを確認する。300円・元原稿SHA・種類・公開URL/時刻が一致して初めて公開済みとする。確認済みreceiptだけを既存の日次一覧へ種類別に反映する。

`publicationKey` は `YYYYMMDD-JJ-R:normal|escape|manshu`。通常の旧予約ハッシュは維持。監視はレース+independent-watch+種類から固定ハッシュを作り、本文変更で別予約にしない。旧方式の予約があれば公開receiptと原本から種類を確認できない限り止める。予約の削除・解除や二重の最終クリックは禁止。旧iPhone v3下書きは通常だけ、監視は原本照合付き公開キューを使う。

## 表紙と検証

実写風の共通背景とZen Maru Gothic（OFL、ライセンス同梱）で種類・日付・場・R・締切をローカルChromium描画する。元背景は1回だけ生成したもの。毎記事の画像生成APIは不要で、買い目を表紙へ出さない。

`node --test scripts/note-article-series.test.js` は同一レース3種類、原文保持、未確定停止、種類別重複防止、旧予約保護、一覧を検証する。`node scripts/note-cover-render.test.js` は3種類を実描画する。実装済み・テスト成功・実レース公開済みを区別して報告する。
