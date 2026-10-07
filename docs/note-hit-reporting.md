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


## 2026-10-04 X運用を任せる追加承認

ユーザーは告知改善・無料の注目点・外れも含む振り返りの運用を依頼。既存Buffer FreeとUpdate note marketingを使い、新しいcronや有料契約は追加しない。

- 告知はAI展開・本命・万舟の名称、場/R、締切、公開receiptの価格を示す。締切が近い順に最大3件、複数なら既存一覧へ、1件ならその公開記事へ案内する。保存原本の展開説明から買い目や断定保証を含まない短い注目点を添える。原本SHA・取得時刻・公開時刻を照合し、説明が得られなければ作らない。既存の1時間間隔・1日8回・締切余裕120秒超・永久claimを維持する。
- 22:30 JST以降、全掲載レースの締切から30分以上経過したら1日1回、的中・不的中を種類別に、確認中・結果待ち・不成立を別に出す。公開時の中心買い目だけで判定し、未確定を外れや的中に数えない。外れ例は元の1着候補と公式1着の一致を述べるだけで、着順から実際のレース展開を創作しない。時点を明記し、note全成績へ案内する。受付不明でも再作成しない。
- 試験提供のBuffer post metricsを22:30以降に最大6投稿・1日1回取得する。送信済みreceiptの投稿ID・本文hash・channel・本人URLを照合し、指標の更新時刻と取得時刻を保存する。欠測はnullで、実際に取得した0と区別する。note-buffer-metricsの日次記録は参考値であり、投稿成功・閲覧・購入を同一視せず、自動で予想や投稿戦略を変更しない。購入元の特定と再購入の自動取得は未接続。
- API枠は既存の80回/直近24時間を共用し、投稿を計測より先に行う。実験指標の失敗で公開済み投稿を再送しない。独立したX公開画面確認とBuffer sent確認を区別する。

仕様確認: https://developers.buffer.com/examples/get-post-metrics.html 、https://support.buffer.com/en-us/articles/using-buffers-api-GtIYIQilz5 （2026-10-04）。Bufferは指標APIを試験提供と説明しており、本番の唯一の判断根拠にしない。


## 2026-10-05 note・X連携改善（ユーザー承認）

- 締切前の新着告知を的中報告より先に処理する。通常は1時間間隔だが、次の通常枠まで待つと締切まで120秒以下になる対象がある場合は、前回から5分以上で繰り上げる。1日8回、直近24時間80 API予約、投稿直前の締切再確認、永久claimは維持する。既存スケジュールだけを使い、実行間隔による取り逃しが完全になくなるとは説明しない。
- noteの公式X案内は `https://x.com/chappy_boat_ai`。古いログイン連携先のプロフィール表示と自動メンションはオフにし、ログイン連携自体は保持する。プロフィール本文にクリックできる公式Xリンクを掲載済み。
- 正しいレースIDのレース前未確定結果は `pending/official_result_stale` とする。確定・不成立を締切前の確認時刻で受け入れない。公開receiptと保存原本が一致し、締切15分後もpendingのレースだけ、既存 `api/result.js` で最大12レース/回、同レース20分以上空けて補完する。結果・試行時刻は `note-marketing-state` に保存し、当日・前日分だけ保持する。研究台帳や元予想は更新しない。不一致、返還、同着はreviewのまま。
- 効果測定は `docs/note-price-trial.md` の手順を使う。X送信、note閲覧、購入、別日再購入を分ける。非公開の売上・購入者データを公開リポジトリやActionsログへ入れない。販売CSVの取得にnoteのパスワード再確認が必要な場合、未取得を0件に置き換えない。

## 2026-10-07 確認済み結果カード・前日回復・締切後案内（承認済み）

この節が、上記の「当日のみ」「事前公開の有料記事への結果速報リンク」「締切15分後」の旧指定に優先する。

- 既存15分予定 `7,22,37,52` と無料運用を維持。公開receipt・SHA・中心1〜7点が一致するpendingだけ、締切5分後から既存公式result parserで照会する。同一レース20分間隔、1回12R、当日・前日の保持は不変。公式が未確定ならpendingのまま。GitHubの遅延もあるため、即時・秒単位の配信保証ではない。
- 無料note一覧は当日・前日の全公開記事をhit/miss/pending/void/reviewで掲載し、記事数と重複しないレース数を分ける。同一レースのnormal/escape/manshuを複数レース的中に数えない。判定は公開時の中心買い目だけ。返還・同着はreview、候補24点・参考券を含めない。
- X的中速報は従来の `note-social-claim/<レース日>/<publicationKey hash>` を保持。未claimの前日分も「前日分」と明記して一度だけ送る。受付・sent照合のタグは配信日の下へ保存し、遅れた投稿も照合窓に入れる。claimを削除せず、本文変更や日付変更で再送しない。
- 22:30 JST以降の全結果振り返りを維持。前日に未実行だった場合は前日分として回復する。前日振り返りがsent確認済みで、pending/reviewから確定したものがあり、pendingが残らない場合に限り、別の永久claimで「結果追記」を一度だけ送る。旧送信が不明・失敗の場合、振り返りを再作成しない。掲載0件は投稿しない。
- `rows[].resultObservation` は `firstResultSeenAt`（この処理で結果を最初に確認）、`officialSourceCheckedAt`（公式取得データの確認時刻）、`noteVerifiedAt`（その結果を含む無料一覧を匿名照合した時刻）を保持。公式が確定した時刻ではない。一時的にpending/reviewになっても同一根拠の初回確認をリセットしない。ブラウザ処理の前に観測を保存し、失敗で遅延計測を短縮しない。過去の未計測時刻を作らない。
- Buffer receiptは `bufferAcceptedAt` と `sentObservedAt` を別保存。`sentObservedAt` はsent応答を確認した時刻で、Xが公開した実時刻の保証ではない。本文・channel・post ID・本人status URLを照合する。画像ありではimage source/MIME/実寸も照合し、不一致はreviewへ。X公開画面の独立確認とは区別する。
- `note-result-card.cjs` は保存中心的中だけから、日本語の1200×675 PNGを生成する。日付・前日分・種類・場R・中心点数・確定出目・公式100円当たり払戻・無料全結果一覧を表示。実購入金額、獲得利益、将来の有料買い目や元原稿は画像に入れない。公開画像だけを既存public repoの不変commit/tagへ保存し、無認証GETのPNG bytes/SHAを照合後にBufferの `assets.image.url` へ渡す。第三者画像ホストや有料画像APIを追加しない。
- Pillow 12.3.0とNoto Sans CJKを用いる。生成は同じrenderer/font環境で決定的。画像URLは投稿後も保持し、タグを自動削除しない。画像生成／公開読取り失敗時はテキストだけを黙って送らず、claim前に停止する。
- 80回/直近24時間は投稿数ではなくBufferリクエスト総数。告知・速報・まとめ・読戻し・計測で共用する。GitHub/画像の検証はBuffer枠を消費しない。新cron・有料アップグレード・直接X API・LINE broadcastを追加しない。
- 締切を過ぎた有料記事URLは無料一覧から外し「締切済み｜購入リンクの掲載終了」と表示。保存コロがし欄の期限切れ・期限不明の有料URLも表示上だけ除去する。公式結果リンク、結果本文、保存原本・receipt・元記事と購入者アクセスは保持。無料一覧の本文だけでなく余分な有料anchorが残っていないことも匿名検証する。
- これは記事本体の販売停止ではない。直接URLや更新前の画面から購入できる可能性を一覧に明示する。削除・無料化・価格変更はしない。結果カード／X結果速報は有料記事への直リンクを外し、無料全結果一覧と公式結果へ案内する。送信直前にも現在時刻の一覧hashを再検査し、日付またぎ・締切またぎで未更新なら停止する。

検証: `node --test scripts/note-marketing*.test.js scripts/note-result-card.test.cjs scripts/send-note-social.test.cjs scripts/send-note-buffer.test.cjs`、`node scripts/note-github-ui-transport.test.js`、`node scripts/check-note-skills.js`。

公式仕様: [Buffer画像投稿](https://developers.buffer.com/examples/create-image-post.html)、[公開メディアURL](https://developers.buffer.com/guides/hosting-media.html)、[Buffer schema](https://developers.buffer.com/reference.html)、[Pillow 12.3.0](https://pypi.org/project/pillow/12.3.0/)。画像付きの実投稿成功と公開画面の確認は、本番の実対象で別途検証する。テスト原稿や架空的中を本番送信しない。

## 同日追加承認：公開済みの本命・押さえ・展開・万舟を結果対象へ

この節が「中心のみを的中速報の対象」とした旧指定に優先する。予想方式や過去の券を変更するものではない。

- 新しい報告基準は `published-main-sections-v1`。締切前の公開receiptと不変原稿に対応する、本当に掲載された主な4区分の和集合だけを照合する。現在のreadable-v1では「中心の買い目」「相手を広げるなら」「別の展開を考えるなら」「高配当を狙うなら」。実際に的中した掲載欄を表示する。本命と押さえが同じ追加欄に整理されていた場合、事後にどちらかの名前を捏造しない。
- 「別会計の参考予想」は引き続き対象外。内部のcandidate24、非掲載プール、後から生成した券も含めない。原本の中心1〜7点が掲載和集合に含まれることと、参考の除外を検査する。
- `rows[].settlement` と従来の中心のみ・記事別成績は維持。新しい `rows[].publishedSettlement`、別観測 `publicResultObservation`、レース単位の `publishedRaceResults` を追加する。記事種類別の結果も保持し、同じ実レースは全体の的中・不的中・待ち・不成立・確認中で1回だけ数える。別記事の公式結果・締切・会場などが矛盾した場合は全体をreviewにする。
- 旧receiptは、そのcommitの唯一のparentが示す当時の公開checkoutを取得し、レビュー済みの表示adapter・publication source・generatorの3つの完全一致SHA256を確認する。原稿のformatや日付だけでは掲載版を推定しない。履歴のコードを実行しない。未対応の掲載版はreviewのまま。
- 新しい公開handoffに `presentationVersion` と `publishedDisplayProofJson` を追加。receiptの `publishedDisplayProof` は、最終有料本文SHA・実際の区分の名称／点数／券集合SHA・参考除外済み和集合SHAを保持する。券の文字列や有料本文そのものは新receiptへ格納しない。最終クリック前の原本・editor本文照合を保持し、旧receiptは書き換えない。
- `note-marketing-state` のreceipt窓をv3へ移行し、当日・前日分に公開版証拠を付ける。同じpublicationKey・原本SHAの既存観測時刻を保持する。過去の未計測時刻は埋めない。公開原稿の証明可能な表示集合を復元するのであり、結果を見て予想を再生成する処理ではない。
- X速報とカードはレース単位。画像は「掲載全券N点（重複なし）」と記事種類ごとの実際の的中欄、確定出目、100円当たりの公式払戻を示す。初回のレース永久claimは `${raceKey}:published-main` で予約する。旧article単位の的中claimが1つでもあれば、そのレースを新定義で再速報しない。不明な過去送信も同じ扱いとし、claim削除や改名再送を行わない。
- 日次全体は実レース単位の新基準。併記する「中心のみ（従来・記事別）」は旧成績のまま。母数を混ぜない。購入額・利益・ROIは表示しない。今後仮定の回収率を追加する場合も、掲載和集合の重複を除いた全点数を分母にし、中心の点数を流用しない。
- 新規記事の無料説明もこの結果基準を説明する。公開済み記事本文は変更しない。カードからは無料一覧へ、X速報は無料一覧・公式結果へ案内し、締切済み有料記事の購入を誘導しない。

追加検証：`node --test scripts/note-public-results.test.js scripts/note-published-ticket-sections.test.js scripts/note-result-card.test.cjs`、`node scripts/note-publication-source.test.js`。公開済み原本からの追加欄的中・中心不的中の両立、参考/candidate24除外、複数記事の1R集約、旧claim、旧観測保持、掲載本文proofの欠落/改変、締切前の券非出力を確認する。


## 2026-10-07 表示の読みやすさ改善（追加依頼）

- 無料一覧の各レースは「🎯 的中」「❌ 不的中」「⏳ 結果待ち」「➖ 不成立」「🔎 照合確認中」を先頭に置く。確定出目と公式100円あたり払戻は一度だけ示し、実際の的中欄・掲載全券の重複なし点数・中心点数・締切・公開時価格・公式結果リンクを保持する。未確定の券を無料側へ追加しない。
- 集計は正の件数がある状態だけを表示する。全不的中・全結果待ちでも全対象を残し、公開レース数／記事数と一致させる。ゼロの的中・不的中や未掲載種類の空行を連続表示しない。掲載全券の種類別成績と中心のみの従来成績は一覧末尾の「集計の詳細」へまとめ、判定ロジックと台帳は変更しない。
- Xの速報は結果・場R・確定出目・払戻・掲載点数・的中欄の順に改行する。日次まとめは全状態を示し、種類別・中心のみの内訳は無料一覧へ案内する。文字数を超える旧記事別まとめも正の全状態を保持した集約表示にし、外れだけを削らない。過去投稿・永久claimは変更せず、文言変更による再送もしない。
- 結果カードは従来と同じ1200×675の決定的PNG。的中・日付・場Rを大きく表示し、確定出目と公式100円あたり払戻を白い枠へまとめる。的中欄・掲載全券の点数・利益ではない注記を残す。対象は照合済みhitだけで、不的中や一覧全体を的中画像にしない。
- 無料一覧用の固定表紙は `assets/note/chappy-index-cover.jpg`。「予想・結果一覧」「今日の予想」「レース結果」と判定状態を示す中立的な画像で、日付や実績値を埋め込まない。一度の表紙差し替えを想定し、既存の本文更新処理が動的に表紙を更新するとは扱わない。新規予想3種類の表紙はそのまま。
- 新規予想記事の無料部分だけに見出しの絵文字と改行を追加する。readable-v1の有料本文・区分名・券集合・点数・予算表示・証拠の契約は保持する。公開済み有料本文は改稿しない。

確認は既存のfree X／LINE navigation CI、note本文・結果・送信・画像・有料原本proofの回帰テストで行う。画像プレビュー、コード反映、無料noteの公開確認、新しい実対象X投稿の確認は別々に報告する。

## 同日追加依頼：的中した区分を目立たせ、新規買い目を区分別にする

- 新規の公開コピーは `readable-v2`。通常AIは保存元の `mainSheet.tickets`（🎯 本命）、`coverTickets`（🛡️ 押さえ）、`flowTickets`（🌊 流し）、`manshuSheet.tickets`（💥 万舟狙い）を混ぜずに表示する。同じ券が複数の元区分に属する場合はその所属を保持し、区分別の延べ点数と重複なし合計を分ける。実戦厳選の保存・優先順・1〜7点ゲートは変更しない。元区分が欠損している券を推定で本命へ入れない。
- 独立本命・独立万舟は別記事系列のまま、通常AIのプールを持ち込まない。参考は「🧾 別会計の参考予想」として分離し、公開予想の主な区分の和集合へ足さない。新v2は点数を示し、金額案内は出さない。すべて買う前提ではない旨を明記する。
- `note-category-article.js` がv2の固定書式、区分集合、点数、重複除外の正本。公開前に不変原本から同じ有料本文を復元できることを確認する。receipt proofはpresentationVersionを識別し、旧readable-v1の有料本文・旧指紋・過去receiptはそのまま照合する。公開済み有料本文は変更しない。
- 的中の元区分は `note-result-provenance.js` が不変原本のSHA・締切・公開版証拠・的中券を確認して任意の表示メタデータへ導く。「相手を広げるなら」のような複数元区分をまとめた旧見出しだけで押さえと推定しない。同じ的中券の元区分が複数あればすべて残す。実際の掲載欄と記事系列も併記する。
- メタデータは同一実行内で原本検証から生成したオブジェクトだけを信頼する。保存JSON・複製・自己再計算したhashだけでは区分証明とせず、再読込後は既存settleで原本から再検証する。証明できない場合は実際の掲載欄だけを表示し、的中・不的中の判定や配信可否を変えない。従来のsettlement/evidenceId/観測時刻/永久claimは変えない。
- note本文・X本文・画像は「的中した元区分 → 記事系列 → 実際の掲載欄 → 的中買い目 → 公式100円あたり払戻 → 掲載全券点数」の関係を明確にする。Xの文字数上限では全的中系列を残し、全欄は画像・無料一覧で確認できるようにする。長い区分名を一部の的中だけに置き換えない。
- 見本画像の色付き枠・点数バッジは構成確認用。実際のnote本文はnote対応の段落・絵文字・空行による表示で、画像と同じ独自UIを挿入する処理ではない。見本に過去レースを使う場合は終了レースの表示例と明示し、過去の的中を再投稿しない。
