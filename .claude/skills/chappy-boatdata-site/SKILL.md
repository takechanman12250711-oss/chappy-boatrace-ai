---
name: chappy-boatdata-site
description: 買い目なしのデータ専門サイト「ボートデータ帳」（boatdata/）の改修・運用・不具合調査に使う。出走表・見立て・モーター・24場・答え合わせ・直前情報の取得と表示、保存ルールの確認が対象。チャッピーの予想や買い目の変更は対象外。
---

# ボートデータ帳

## 役割を混ぜない
- データ帳は数字と見立て（荒れそう／混戦／堅そう）だけ。**買い目・予想は出さない**。買い目はチャッピー（note・X・LINE）に残す（2026-11-07 本人確認）。
- 見た目・名前は独自。他サイト（例：データ攻め）の模倣・数字の転載をしない。
- チャッピーの予想・保存原本・Vercel API を使わない／変更しない。公式サイト（boatrace.jp）から直接取る。

## どこに何があるか
| 対象 | 場所 |
| --- | --- |
| 画面（1ファイル） | `boatdata/index.html`、`boatdata/manifest.json`、アイコン |
| 朝の出走表・見立て・モーター順位 | `scripts/data-site/collect-day.cjs` → `data/site/days/YYYYMMDD.json` |
| 24場（直近3年） | `scripts/data-site/build-venues.cjs` → `data/site/venues.json` |
| 答え合わせ | `scripts/data-site/build-checks.cjs` → `data/site/checks.json` |
| 直前情報 | `scripts/data-site/collect-before.cjs` → `data/site/before/YYYYMMDD.json` |
| 保存（1ファイルずつ・競合時に作り直し） | `scripts/data-site/persist.cjs day|venues|before|checks`（ledger と同じ transport） |
| 見立ての式（固定） | `config/race-roughness-v1.json`、`scripts/build-race-insight-report.cjs` の `classifyRoughness` |
| 定期実行 | `build-boat-data-site.yml`（08:23・11:43 JST）、`build-boat-data-before.yml`（09:00〜21:40 JST・20分ごと）、`build-boat-data-checks.yml`（結果収集の成功後） |
| 説明 | `docs/boatdata.md` |
| テスト | `node --test tests/data-site.test.cjs`（公式ページの形の見本 `tests/fixtures/data-site-racelist.cjs`） |

## 守る保存ルール
- 朝に保存した見立ては後から書き換えない。取り直しは「取れなかったレース」と「空の締切時刻」だけを補う。
- 直前情報は締切50分前から、締切1分前を切ったら取りに行かない。締切前に取れた分だけ保存し、そろったレースは書き換えない。展示前の空ページは保存しない。新しい分がなければコミットしない。
- 答え合わせは、朝の見立て（と直前の見立て）を公式の3連単払戻で採点（5,000円以上＝荒れた）。混戦は採点外。外れも全部数える。
- 公式サイトへは1件ごとに0.35秒あける。

## 表示とデータの読み方
- 画面はデータを `raw.githubusercontent.com/.../main/data/...` から先に読み、だめならサイト上のコピー（`../data/...`）を読む。**GitHub Pages の反映は、数分おきのデータ保存で作り直しが止められ、30〜40分遅れることがある**ため。画面（HTML）の変更は反映を待つ必要がある。
- 公開先：`https://takechanman12250711-oss.github.io/chappy-boatrace-ai/boatdata/`。反映確認は `pages build and deployment` の成功runが対象コミットを含むかで見る。

## 実データで見つかった落とし穴（2026-11-07）
- schedule の races に締切が入らないことがある → 出走表ページの「締切予定時刻」（12R分）から読む（`deadlineFromPage`）。
- 出走表のレース名欄にサイトのメニュー文字が入る → 短い名前だけ使う（`raceTitle`、画面でも24文字以下だけ表示）。
- `eventSession` は文字列（morning/day/night/midnight/summer）。

## 変更するとき
1. この環境から boatrace.jp・raw へは接続できないことがある。見本ページのテストで確かめ、本物の取得はマージ後の最初の実行（ログの `{"kind":...}` 行と保存ファイル）で確認する。
2. 見本データで画面を確かめたら、`data/site/` の見本ファイルはコミットしない。
3. PRは `chappy-pr-merge-chain` の手順で承認・マージする。

## あとから入れる予定（必ず本人へ提案する）
万舟の記録、選手ページ、各レースからチャッピーの予想への案内（チャッピーが予想したレースだけ）、独自URLへの移設、チャッピー本体の Pages 反映遅れ対策。
