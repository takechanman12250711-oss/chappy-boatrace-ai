# 的中報告から購入までの導線

2026-09-29のユーザー依頼: noteの的中報告をLINE・Xにも配信し、note収益につなげる。同日21:20 JSTに「両方同時配信で進めたい」と明示承認。LINEの日次まとめ案より、この同時配信方針を優先する。

## 媒体ごとの役割

| 媒体 | 内容 | 次の行動 |
| --- | --- | --- |
| X | 当日の的中速報。種類、場・R、実戦厳選点数、確定組番、公式払戻（100円あたり）、事前公開記事 | 無料の全成績・今日の予想一覧へ |
| note | 種類別の全公開記事と的中・不的中・結果待ち・不成立・照合確認中。各記事と公式結果へのリンク | 締切を確認して当日の予想へ |
| LINE公式 | Xと同じ的中速報を同じ処理から配信。公式アカウントの友だち全体が対象 | 全成績・今日の予想一覧へ |

的中だけで全体成績を良く見せない。通常予想・イン逃げ・万舟を混ぜない。実購入額を持たないため、払戻は公式の100円あたりの金額として表示し、利益や実購入の回収率とは呼ばない。新規集客・一覧への流入・記事購入・再購入を順に測り、表示回数や的中報告数だけで成功と判断しない。売上の自動取得や媒体別購入計測はこの変更には含めていない。

## 実装と証拠

- `Update note marketing` の既存更新経路を使う。新しい収集cronや予想方式は追加しない。
- `note-published` receiptで公開を確認した記事だけを対象にし、receiptが示すSHA256の保存原本を毎回照合する。
- 保存原本の `baselinePracticalTickets` と `record.prediction.practicalTickets` が一致する1〜7点だけで判定する。最大24点候補や後から生成した予想の的中は含めない。独立監視は監視・記事の元買い目とも一致させる。
- 既存の `data/results/YYYYMMDD.json` を使い、不足時は `data/stats/race-review-results.json` を参照する。日付・場・R・公式URL・取得時刻・確定着順・払戻を照合する。
- 返還や同着など、既存パーサーの単一3連単だけでは断定できないケースは照合確認中にする。未来の結果、未確定や照合不一致を的中にしない。
- 無料記事は既存の日次一覧 `https://note.com/great_robin3243/n/na76b6c6c18ff` を更新する。新規の有料記事を事後投稿する処理ではない。
- `note-marketing-state` branchの `state.json` に `rows[].settlement` と `distribution` を保存する。配信原稿のIDは根拠と本文から決まり、同じ結果で毎回増殖しない。

## 同時配信処理と接続の残作業

`distributionDrafts` v2は的中記事ごとに同一本文・同一publicationKeyのX/LINE原稿を生成する。原稿の `deliveryEnabled=false` は送信証拠ではないことを表す。実配信は `scripts/send-note-social.cjs` と `config/note-social.json` が管理し、既存 `Update note marketing` の公開一覧更新成功後に実行する。新しい収集cronは追加しない。15分ごとの予定・既存キューによる遅延があり、完全に同じ秒の着信は保証しない。

実装済みの制御:

- 当日の公開原本・公式結果を既存storeで再照合する。全成績一覧の検証済み本文hashが現在の照合結果と一致しないと送らない。miss/pending/review/voidは速報対象にしない。
- 両媒体の同一本文・280文字相当の上限・記事識別を検査する。運用開始時刻より前に締切を迎えたレースは遡って配信しない。
- GitHubの `note-social-claim/YYYYMMDD/<publicationKey hash>` を原子的に予約する。Xの有料認証確認より前に予約するので、認証失敗時も毎回課金される再試行を行わない。結果や本文が変わっても同じ記事を再送しない。
- 固定LINE基本ID、上限200通以下・残数あり、固定XユーザーIDとユーザー名を確認後、X POSTとLINE broadcastを並列開始する。LINEの実際の消費は友だち人数に依存し、上限不足時は送れない。
- 月間試行数は予約タグを数えて制限する。failed/unknownも試行数に含める。Xの料金承認と上限が未設定なら有料GETも送信も行わない。実際の金額上限はX側でも設定する。
- LINEは固定retry keyを予約に保存する。自動再送はしない。XはPOST受付後にID・作者・本文をGETで照合し、確認済み投稿URLを保存する。
- 結果は `note-social-receipt/YYYYMMDD/<publicationKey hash>` のreceipt.jsonへ保存する。X確認済みとLINE API受付の両方を満たす `both_accepted` はLINE端末配達の証明ではない。
- 一方だけ成功・通信結果不明・記録失敗は予約を残して停止。自動再投稿・予約削除・成功媒体の再送は行わない。GitHub Actions Summaryとタグを照合して復旧方針を決める。

現在の有効化条件（設定は未有効）:

1. 本人が作成済みの配信用Xは `https://x.com/chappy_boat_ai`。`xUsername` は設定済み。認証接続時に同アカウントの数値IDを照合して `xUserId` を固定する。既に指定されたURLを本人へ聞き直さない。
2. X公式APIを使う場合の料金・月間上限を本人が承認する。URL付き投稿、アカウント照合、投稿読戻しが課金対象。承認なしに `xApiCostApproved` を変更しない。
3. 正規Developer ConsoleでRead and Write権限の本人用OAuth 1.0aキーを発行し、`X_API_KEY`、`X_API_SECRET`、`X_ACCESS_TOKEN`、`X_ACCESS_TOKEN_SECRET`をGitHub Secretsに保存する。鍵をチャット・スクショ・ログへ出さない。この接続は未検証であり、iPhone操作を案内する前に実画面と保存経路を確認する。note用fresh X OAuthやCookie抽出には戻らない。
4. `monthlyMaxPairs`（1〜200）、未来へ遡らない `activatedAt`、`enabled:true` を承認済みの条件で設定し、実際のX投稿URL・LINE送信結果を確認する。設定変更だけで自動配信成功と報告しない。

初期configは無効、X数値ID・認証未設定、料金未承認、月間上限0。未接続理由をSummaryへ表示する。LINEの本人宛テスト受信は完了済みだが、X/LINE同時の本番実送信は未確認。

公式仕様の確認元（2026-09-29）:
- https://docs.x.com/x-api/getting-started/pricing
- https://docs.x.com/x-api/posts/create-post
- https://developers.line.biz/en/docs/messaging-api/getting-started/
- https://developers.line.biz/en/reference/messaging-api/

検証: `node --test scripts/note-marketing.test.js scripts/note-marketing-reports.test.js scripts/check-line-connection.test.cjs scripts/send-note-social.test.cjs`。`Check paired X and LINE distribution` がPR/mainで認証なしのモック検証、note transport回帰と共有スキルの整合性を確認する。

## 2026-09-29 無料運用への変更（最新のユーザー承認）

XはBuffer Free、LINEはURIリッチメニューによるnote一覧への導線とする。以前のX API有料承認・LINE同時broadcast方針は撤回。`Update note marketing` は `send-note-buffer.cjs` だけを呼び、直接X APIの認証情報とLINE tokenを受け取らない。従来の共有claim/evidence validatorは重複防止と原本照合のため再利用する。

- Buffer Freeを本人が選択し、X `@chappy_boat_ai` を接続。Settings → API（https://publish.buffer.com/settings/api）で作ったキーをGitHub Actions Secret `BUFFER_API_KEY` に保存する。キーをチャット・PR・ログへ貼らない。iPhoneのブラウザで完結する。
- 接続後、`config/note-social.json` の `enabled` と `activatedAt` を設定する。接続前は無効で外部呼出しゼロ。開始時刻より前のレースは送らない。1つのBuffer組織・指定Xアカウントのみ許可。
- `shareNow` で的中速報を送る。作成受付だけでは公開済みにしない。Bufferの `sent`、本文・channel・post ID・本人のstatus URLを照合して `buffer_confirmed_sent` を記録。Xの公開ページ独立確認とは区別する。
- `note-social-claim` は旧方式と共通で永久保持。Buffer作成結果不明時も自動再作成しない。受付・照合完了は別tag。未確定照合は直近2日、30分間隔・最大6回、以後は手動確認。古い未確定claimも削除しない。
- 外部APIの前に `note-buffer-api` tagでリクエスト枠を予約し、ローリング24時間80リクエスト以内に制限する。この自動化だけなら30日3000回未満。キーを他用途と共用するとその分は別途消費される。429等で停止し、有料プランへ自動変更しない。空振り定期実行ではBufferを呼ばない。
- LINEは `Set up LINE free navigation` で `@009mdbvr` を照合して、2ボタンの既定メニューを設定・画像SHAと設定を再取得照合する。broadcast/push/replyは呼ばない。個別ユーザーメニューが既に設定されている場合はそちらが優先される。iPhone実表示は本人確認と区別する。
- 「今日の予想」「結果を見る」は、予想リンクと的中・不的中の両方を載せた既存の同じ日次一覧 https://note.com/great_robin3243/n/na76b6c6c18ff を開く。新しい記事や存在しないアンカーは作らない。

公式仕様確認（2026-09-29）: https://buffer.com/pricing 、https://developers.buffer.com/guides/api-limits.html 、https://developers.buffer.com/guides/posts-and-scheduling.html 、https://developers.line.biz/en/docs/messaging-api/using-rich-menus/ 。無料プランも上限はあるため無制限とは案内しない。


## 新着note記事のXまとめ告知

- 新着記事は `send-note-buffer.cjs` の announcements で既存の全記事一覧へ案内する。開始時刻以降に公開され、原稿SHAと公開receiptを照合済みで、当日かつ締切まで2分超ある未告知記事だけを対象とする。通常・イン逃げ・万舟の件数をまとめ、記事ごとのX投稿はしない。
- まとめ告知は1時間以上間隔を空け、1日最大8回。的中速報と同じ80回/直近24時間のAPI予約枠を使う。送信前の永続batch claimで対象記事を記録し、結果不明時も再送しない。新着なしは告知用Buffer APIを呼ばない。受付・sent照合・X公開ページ確認を区別する。
