# チャッピーボートレースAI 検証・情報更新

対象レース日：2026年10月10日（日本時間）。引き継ぎ再確認：2026年10月11日。確認基準main：`bd3aebd4454d6de436b0f0642a47d9b25df64340`（10月11日00:19:09 JST）。
本記録は保存レポート・原本receipt・Actionsログ・artifactを照合した状態更新。新しい予想方式の採用や、全研究の再実行完了を意味しない。

## 引き継ぎ訂正：前チャットの最新到達点（2026-10-11 JST）

前版はmainの保存レポートとPR本文を中心に確認したため、Issue #1214の後続研究記録とPR #1087の最新コメントを引き継ぎ切れていなかった。「次は相手選定を同条件比較」「次は候補根拠から原因を調査」とした説明を訂正する。これらは既に比較・診断が進み、その先のペア単位の研究用診断設計が未完了である。以下は新たな性能試験の実施報告ではなく、既存成果の引き継ぎと証跡の再照合。

### 既に完了した工程 — 再実施しない

|工程|確定した結果・到達点|根拠|
|---|---|---|
|相手再選定の原因確認・候補E|過去143RでB39/E38的中。Eは発見段階で昇格見送り。本番不採用|Issue #1214本文、PR #1215|
|A/B/D前向き保存・方式別分離|PR #1222/#1238で接続済み。旧方式100枠・確定99RのA26/B22/D23は比較済み|PR #1277の固定比較|
|3着根拠保護・交換診断|現行Aと同券で改善なし。変更46枠は3着のみ5・1/2着組再配分41。追加側の購入根拠不足も診断済み|PR #1277の続編|
|候補根拠の保存・実運用確認|候補プール全体を同形式保存。10/10の3Rで締切前原本保存まで完了|[完了記録](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/issues/1214#issuecomment-6097043632)、PR #1278|
|新根拠を使った初回診断|住之江12R 1-6-5は成立購入枝なし。丸亀12R 5-1-3は役割検査成立と購入資格が別。2Rとも順位変更だけでは救えない|[2R診断](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/issues/1214#issuecomment-6097538762)|
|外6コース2着の上流追跡|住之江は正式hold枝0。escapeのhold対象2/3/4コースと正式役割への接続を確認。physicalCoverageのhold表記は正式holdの証明ではない|[経路追跡](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/issues/1214#issuecomment-6097642368)|
|未採用順位モデルの数式分解|保存逃げ112R×20候補の順位点を4項で再現。追加コース補正差が艇別2着点の最大寄与を上回る条件を特定。本番の固定hold制限とは別問題|[寄与分解](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/issues/1214#issuecomment-6097730080)|
|2/3着コース補正を同時に外す案|実装・CI・同点数比較・検算・本番不採用判定まで完了|[比較完了](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/issues/1214#issuecomment-6097807958)|
|2着コース補正だけを外す案|実装・CI・同点数比較・検算・本番不採用判定まで完了。外艇2着4件を拾うが全体悪化|[比較完了](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/issues/1214#issuecomment-6098476482)|
|2・3着ペア根拠の接続監査|通常3Rの同一購入枝を監査。独立研究の進路・競合情報は保存済みだが、ペア順位では未使用と特定|[直近の到達点](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/issues/1214#issuecomment-6098700177)|

### 抜けていた2案の比較結果

PR #1087の研究ブランチで比較済み。本番未採用・draft未マージ。発案前に参照済みの過去362Rであり、未使用期間や最新方式の前向き成績とは呼ばない。

|期間・母数|保存元券|旧順位モデル|2/3着補正を同時除去|2着補正だけ除去|
|---|---:|---:|---:|---:|
|9/18〜23・222R|68的中|74的中|75的中（元券比追加14/喪失7）|64的中（追加7/喪失11）|
|9/24〜27・140R|37的中|42的中|36的中（追加10/喪失11）|33的中（追加4/喪失8）|

同一点数・1券100円の仮想会計。前半の回収率は元78.84%／旧93.85%／同時除去94.75%／2着のみ94.17%、後半は元252.28%／旧71.59%／同時除去61.28%／2着のみ64.02%。後半の元券には大きな払戻1件の影響があり、的中率と収益を別に読む。両案とも今回研究では本番不採用。正式gateによる棄却ではなく、保存JSONはINSUFFICIENT_EVIDENCE・採用gate未登録。

- 同時除去：head `7cf29d7a32bf2a67e1bb973d15ab889d2c071870`、run38054319914、artifact11670408474、SHA256 `9e8be2a63be88c44cfb2c30135ab2c5841a7fadea121ce1e45abbe87f089e495`。
- 2着のみ：head `20378e1c3cbdc0c1c93f08a10915b982e1504098`、run38059291471/job114234078738、artifact11672516699、SHA256 `b6e71bd332c1ec826f2524b982a1b3e492f942ab14284724657ce75e8c165682`。
- 今回両ZIPを取得してSHA256/CRCと内部比較JSONを再確認。後者の専用jobはテスト・固定入力再利用・比較・原本不変検査・保存までsuccess。前チャットの独立362行検算は当時の記録として引き継ぎ、今回再学習・全件再計算はしていない。
- 2着だけの除去では、外艇2着の診断対象11R中4Rを拾う一方、3着の採用券が3/4コースへ集中。拾った4Rだけを改善証拠にせず、同じ既視期間で係数を調整し続けない。

### 最後に完了したペア根拠監査

10/10 蒲郡12R・住之江12R・丸亀12Rの購入資格あり券は36/35/35券。同じ購入枝で2着holdと3着hold/pickupの双方チェックが保存されているのは各4券、最終8/6/9券のうち各3券だった。これは保存形式の診断であり、双方チェックがない券を無根拠・購入不適格とする新条件ではない。

独立研究の既存 `independent-route-water-v1.cjs` は条件付きpath/zone、pressureFrom、followsAttacker、potentialCompetition、required/unobservedを既に保存する。`independent-partner-selector-v2.cjs` は全体整合を検査するが、これらの進路相互作用をペア順位へ接続していない。同じzoneを両立不能とみなさず、実旋回の未観測 `actualTurnObserved=false` を維持する。通常AI・9月の順位モデル・独立研究を合算しない。

### 正しい次の1工程

**独立研究の既存routesから、各2・3着ペアへ「同一展開・進路・競合候補・未観測条件」を参照付きで結ぶ研究用診断を設計する。**

このペア診断の実装・新選定方式・未使用期間の性能確認・本番反映は未完了。今回の情報訂正では診断実装を開始していない。既存の進路収集を作り直さず、同一zoneによる一律除外・外艇強制追加・通常予想への無検証流用・過去sealの補完は行わない。根拠hash、方式別初回seal、原本不変を保持する。

担当は既決のとおり、**チャッピー＝相手選定の精度研究・レビュー、dot＝収集・writer・公開安定化**。分析15工程のOOMは別の残件として保持し、チャッピーの次工程を勝手にそちらへ置き換えない。今回dotへ新たな指示送信はしていない。

### 再発を防ぐ引き継ぎ順序

mainとPR本文だけで完了・未完了を判断しない。関連Issue/PRの最新コメントまで読み、そこで指定されたhead・run・artifact・次工程を対応付ける。古いコメントの「次」は後続の完了報告で上書きする。完了した不採用研究を、未マージという理由で未実施へ戻さない。

## 集計・運用の確認

- 保存レポート117ファイルを読み、UTC日付で10月10日生成94件、以前の生成19件、generatedAt/sourceGeneratedAtなし4件を区別した。原本・キャッシュ等12ファイルは一覧とblob SHAを記録し、再計算・変更しなかった。
- 直近の保存実戦券100R（10月8～10日、6～10点）は28的中、的中率28.00%、回収率65.82%。仮想投資88,000円、払戻57,920円、収支−30,080円。本人の実購入ではない。
- 同100Rの外れ72Rは頭不足17、1・2着組不足35、3着不足20。1号艇が勝った60Rでは頭不足0、相手不足41。これは券のカバー状況で、因果関係の実証ではない。
- 相手選定の旧方式100枠は結果99R・返還等1枠。現行方式は締切前seal4Rを別確認したが、日次partnerレポートは方式更新前の集計で未収録。
- 全履歴four-stage診断と研究用定期処理14本はメモリ不足。前者は親runがsuccessでも成果artifactが存在せず、更新成功ではない。
- 本番予想・既存買い目・過去原本・公開済み記事は変更していない。

## 成績の区別

|対象|照合R|的中|的中率|仮想購入|仮想払戻|回収率|
|---|---:|---:|---:|---:|---:|---:|
|継続台帳・全世代混在|3,286|793|24.13%|2,823,700円|2,199,820円|77.91%|
|直近保存実戦券100R|100|28|28.00%|88,000円|57,920円|65.82%|
|最大24点候補・同一660R|660|265|40.15%|1,188,900円|756,050円|63.59%|
|保存実戦券・同一660R|660|165|25.00%|580,500円|443,990円|76.48%|

各券100円均等の検証値。最大24点は実際の保存点数を使用。候補プールの成績を実戦券へ混ぜない。直近100Rは2026-10-10T13:39:39.311Zの台帳末尾を固定したもの。全開催・全購入の成績ではない。

直近100R artifact：run [38055112647](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/actions/runs/38055112647)、artifact 11672047110、生成2026-10-10T13:43:21.823Z、ZIP SHA256 `7a6ad6fa6f83b6f7da78375726701d22ef0906d78ddece7ed54e52fb369a247c`。実取得digest一致、source.complete=true、100件の重複なし、保存券から的中・賭金・払戻・排他的外れ分類を再確認。

## 主要研究と採否

|対象|確認できた状態|残る条件・扱い|
|---|---|---|
|相手選定A/B/D・旧method f54394|100枠、99R確定。A26的中・B22・D23。ROIはA67.76%、B71.14%、D69.68%|B/Dは的中純減。採用gate未登録、本番未採用|
|3着根拠保護・PR #1277|同99Rで26的中、Aと全100枠の券集合一致|改善実証なし。draft未マージを維持|
|候補24券の根拠保存・PR #1278|main反映済み。PRの実保存検査は蒲郡12R・住之江12R・丸亀12Rの3原本|実装・保存の確認。的中率改善とは別|
|相手選定・現行method c1f7a618|10月10日の4Rを締切前にGitHub artifact確認。ID/digest/run/head一致|日次レポートのsourceCommit後の新着。旧100枠へ足さない|
|8点shadow A|160R確定、48→48的中、ROI55.01%|純増0、本番未採用|
|展示比較C|63R確定、16→16的中、ROI61.69%|純増0、本番未採用|
|壁成立・主攻め2号艇の購入見送り|193R・39日。購入A48的中、ROI71.0%、収支−50,910円|OWNER_APPROVED_IMPLEMENTED。承認待ちに戻さない。見送りで48的中も逃す。250R判定は未到達|
|外攻め・既存中央A/B|62R保存、44R精算、18R比較不能。cover43/100、flow41/100、hole0/100|推奨variantなし。件数は合算しない|
|外攻め・全展開研究|382R保存、358R精算|既存A/Bとは別。採用gate未登録|
|外攻め・当日の取得範囲|予定156R・観測156R・保存32R・未保存124R|展示待ち・締切・取得中締切・時間予算等。全開催の予想保存完成ではない|
|外攻め・経路損失診断|対象信号67R：archive-missed18、not-comparable17、settled32|全A/B44Rとは対象が違う。保存漏れと条件不成立を分ける|
|正式active100R|正式適格0。入力3881中、incompleteShadowV2 2706、nonActiveGeneration724、legacy303、notSettled148|全レース側の現行4保存・3精算・1的中とは別枠。正式100R完了ではない|
|逃げ固定入力比較|206Rで現行48的中、候補49。変更頭4R・変更券6R、役割修正による券変化0|発見用の再計算。投資額も182,500→182,100円で完全同点数比較ではない。未採用|
|独立無人仮説|151seal。escape6R・upset6R精算、各0的中。138件見送り|限定展示仮説。Chatの全8段階判断や独立有料記事の完成ではない|
|独立役割入力比較|人の役割判断を必要とする方式は0seal|無人仮説151件と混同しない|
|独立相手・進路/当地研究|相手116seal・選定4・精算3、進路当地102seal・選定4・精算3。各0的中|全8段階完成・自動採用なし|
|気象履歴v1/v2|v1採用1256R、v2採用1463R。v2のnote補足207R|観測母数。潮既知0。v7接続93seal・履歴あり91、条件一致標本9艇。適性順位や精度改善は未実証|
|日和/マクール/BR|日和229capture精算、マクール519capture精算、BR0|頭一致24/229・230/519は抽出信号の一致率で舟券的中率ではない。同条件での優劣・採用は未実証|
|大村記者比較|10月10日生成artifactはpaired0、eligible0、errors0|成功runでも比較0件。大村の記者予想を本番反映済みとしない|
|枠別浮沈率・negative clip|固定100R結果ゲート不合格|candidate-fails-fixed-100。再試験・自動採用しない|

## 13理論の既存候補ライフサイクル

以下は各理論そのものの否定ではなく、登録された特定候補の状態。Phase7/8のphaseCompleteは管理経路の完了であり、予想改善の完了ではない。

|理論|登録候補の状態|次の扱い|
|---|---|---|
|展開|REJECTED|REJECTED_STANDALONE_FLOW_SIGNAL|
|残し・拾い|REJECTED|REJECTED_HOLDOUT_ROI_WORSE|
|コース|REJECTED|REJECTED_BY_FIXED100_GATE|
|ST・スリット|PERMANENT_BLOCKER|STANDALONE_COUNTERFACTUAL_UNSPECIFIED|
|展示|PERMANENT_BLOCKER|EXHIBITION_STANDALONE_COUNTERFACTUAL_UNSPECIFIED|
|当地|PERMANENT_BLOCKER|LOCAL_EFFECT_NOT_IDENTIFIABLE_FROM_COMBINED_AB|
|水面・気象|PERMANENT_BLOCKER|WATER_EFFECT_NOT_IDENTIFIABLE_FROM_COMBINED_AB|
|選手技量|PERMANENT_BLOCKER|SKILL_STANDALONE_COUNTERFACTUAL_NOT_PREREGISTERED|
|モーター・整備|PERMANENT_BLOCKER|MOTOR_STANDALONE_COUNTERFACTUAL_NOT_PREREGISTERED|
|レース傾向|PERMANENT_BLOCKER|RACE_TREND_STANDALONE_COUNTERFACTUAL_NOT_PREREGISTERED|
|壁艇|ADOPTED_BY_USER|OWNER_APPROVED_PURCHASE_SKIP_ACTIVE|
|攻め|REJECTED|REJECTED_NO_TRIGGER_ON_FROZEN_HOLDOUT|
|新環境|PERMANENT_BLOCKER|NO_FIXED_CANDIDATE_FROM_DISCOVERY|

## 更新失敗・未完了を明示する

### 全履歴7点の外れ診断

run38055112647のjob114221860381で2026-10-10T13:42:42Zに `Reached heap limit / JavaScript heap out of memory`、exit134。four-stage成果物の保存はskip。同runには8点A/Cとhit-firstの3artifactだけがある。`continue-on-error:true` のため親runはsuccessだが、全履歴診断は未更新。10月2日の2787R・586的中を最新値として再掲しない。

### 研究用の定期処理14本

下記は取得した最新schedule実行。各失敗jobのログでOOM/exit134を確認。情報更新では失敗を記録し、再実行・コード修正は行っていない。担当の収集/集計安定化と重複しないよう、この一覧から修正対象を引き継ぐ。

|workflow|失敗run|確認した原因|
|---|---|---|
|Run combined three rescue forward v1|[37989709644](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/actions/runs/37989709644)|メモリ不足・exit134|
|Run forward data completeness v1|[37988636949](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/actions/runs/37988636949)|メモリ不足・exit134|
|Run head11 score90 forward v1|[37987430243](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/actions/runs/37987430243)|メモリ不足・exit134|
|Run second-place rank9 forward v1|[37986168507](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/actions/runs/37986168507)|メモリ不足・exit134|
|Run role ticket special trigger v1|[37986139548](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/actions/runs/37986139548)|メモリ不足・exit134|
|Run role ticket shadow v1|[37986124983](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/actions/runs/37986124983)|メモリ不足・exit134|
|Run pre-race theory outcomes v1|[37986045100](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/actions/runs/37986045100)|メモリ不足・exit134|
|Run pre-race theory context v1|[37986032785](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/actions/runs/37986032785)|メモリ不足・exit134|
|Run role ticket marginal cap v1|[37985880163](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/actions/runs/37985880163)|メモリ不足・exit134|
|Run counter hole pair forward shadow v1|[37985637304](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/actions/runs/37985637304)|メモリ不足・exit134|
|Run third-place rank8 goodscore forward v1|[37985283517](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/actions/runs/37985283517)|メモリ不足・exit134|
|Run new-head prospective shadow|[37985002772](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/actions/runs/37985002772)|メモリ不足・exit134|
|Run rescue subgroup forward shadow v1|[37984851954](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/actions/runs/37984851954)|メモリ不足・exit134|
|Run outer head forward shadow v1|[37976230337](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/actions/runs/37976230337)|メモリ不足・exit134|

`forward-research-status-v1` のrun37986155615は成功でcommonSettledRaceCount=0/collectingを出したが、下位roleTicketの3処理が失敗して0へ集約される実装。これを正常な母数待ちと説明しない。signalAvailabilityの996件も他方式へ足さない。

### 日次集計待ち・運用未確認

- partner/independent/weatherのレポートは10月10日10時台JSTのsourceCommit `3c25608b…`。その後のsealを反映済みとしない。
- PR #1279の安全writerはmainへ反映済み。確認基準時点のactive100R/negative-clip最新runはマージ前。変更後2workflowでの自然本番artifact・保存byte照合は未確認。
- 公式結果run38057094622は原本取得・診断・publish_reportsが成功。main bd3aebd4454d6de436b0f0642a47d9b25df64340へ診断レポート保存済み。後続calibrateは確認時点で実行中。前回基準から変わった保存レポート42件を今回読み直し、一覧の生成時刻・blob SHAを更新した。Phase9は3546R・875的中・106パターン・eligibleCandidates=0。全世代の継続台帳3286Rとは別母集団。
- Vercel API実データ、iPhone表示/操作、LINEリッチメニューの本人画面、売上・継続購入は今回再検証していない。
- YouTube動画2本の本編/字幕は、会話引き継ぎでは未取得・未分析。検証済み理論へ取り込まない。

## note・X・LINE

note-marketing-stateの確認済みdateは20261010。10月10日分は通常記事7件、各200円・締切前公開の保存記録。独立escape/manshuは当日記録0。無料一覧は2026-10-10T11:49:08.741Zに匿名照合成功（run38049643793）。

保存実戦券の判定は2的中/7R。一方、公開4区分の広い買い目では6的中/7R（各26～37点）。定義・購入点数が異なるため、6/7を実戦6～7点の的中率と表示しない。note販売実績や実購入利益とも別。

当日URL：
- [戸田1R](https://note.com/great_robin3243/n/n1f9713dcef98)：2026-10-10T10:40:12.000+09:00公開、200円、保存実戦券7点、実戦券判定hit／公開区分判定hit。
- [唐津1R](https://note.com/great_robin3243/n/n89877682f908)：2026-10-10T08:26:24.000+09:00公開、200円、保存実戦券6点、実戦券判定miss／公開区分判定hit。
- [常滑2R](https://note.com/great_robin3243/n/nb875ce382395)：2026-10-10T10:38:48.000+09:00公開、200円、保存実戦券7点、実戦券判定miss／公開区分判定hit。
- [児島1R](https://note.com/great_robin3243/n/n410977b31d65)：2026-10-10T10:43:45.000+09:00公開、200円、保存実戦券6点、実戦券判定miss／公開区分判定hit。
- [江戸川9R](https://note.com/great_robin3243/n/n2d240461cee8)：2026-10-10T14:44:11.000+09:00公開、200円、保存実戦券7点、実戦券判定hit／公開区分判定hit。
- [蒲郡7R](https://note.com/great_robin3243/n/n883b3e8e23f5)：2026-10-10T18:03:43.000+09:00公開、200円、保存実戦券7点、実戦券判定miss／公開区分判定hit。
- [住之江12R](https://note.com/great_robin3243/n/n4b917ee5e14e)：2026-10-10T20:23:05.000+09:00公開、200円、保存実戦券6点、実戦券判定miss／公開区分判定miss。

Xは `note-buffer-final/20261010/` の6件がbuffer_confirmed_sent、本人URL・画像source確認の記録あり。各receiptのpublicPageIndependentlyVerified=falseなので、今回X公開ページまで独立確認済みとはしない。最新Buffer処理はno_new_articles/no_new_hits。旧state.distributionのawaiting_connectionは旧直接配信欄で、現行Buffer未接続という意味ではない。LINEは既存URIメニュー方式を維持。

検索サービスで取得した無料一覧は10月2日のキャッシュだったため、現在の公開内容の証明に使用しなかった。

## 最新の開発と次の一手

- PR #1275：公式結果の取得と共有writerを分離、main反映済み。
- PR #1276：継続台帳・外攻め脱落・連動研究の3集計のメモリ縮約、main反映済み。その成功を他のOOM14本やfour-stageの修正完了へ広げない。
- PR #1278：候補プールの購入/拡張資格・枝/役割根拠の保存、main反映済み。買い目不変。
- PR #1279：生成artifact保全と短い安全writer、main反映済み。本番変更後の対象2workflow確認は残る。
- PR #1277：研究完了・未採用draft。現在の本番へマージしない。

チャッピーの次工程は、冒頭の引き継ぎ訂正にある独立研究のペア診断設計。根拠保存後の原因診断と補正除去2案は既に完了しており、再提案しない。OOMとwriter等の運用残件はdot担当との分担を維持して別管理する。Work常時監視・新cron・有料APIは追加しない。

## 保存レポート全117件の一覧

生成時刻はUTC。本文のgeneratedAt/sourceGeneratedAtを記録し、ない場合のみcheckpointのappliedAtを補助表示。古い固定研究を日付だけで障害・未完了にしない。生成日が当日でも入力範囲や採用条件が揃った証明にはならない。全ファイルの内容を読み、数値を詳しく照合した主要対象は上記のとおり。

|保存レポート|記録内生成/適用時刻|記録内status/decision|Git blob SHA|
|---|---|---|---|
|[active-100r-early-monitor.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/active-100r-early-monitor.json)|2026-10-10T13:31:30.642Z|定義なし|6f4c99f8e76215b456fac13e5e8418142b56d01f|
|[auto-prediction-collector-debug.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/auto-prediction-collector-debug.json)|2026-08-07T10:31:57.242Z|定義なし|38ee1a2d9d2b260d0339f47a922a860b8e2154b8|
|[candidate24-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/candidate24-report.json)|2026-10-10T13:25:18.024Z|定義なし|01cd6f50c51fa7aa7fb10b2181ce49ed532b6f37|
|[collector-recovery-20260807.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/collector-recovery-20260807.json)|2026-08-07T08:53:12.052Z|定義なし|12db815a799058d44bc266e1ed050e76a7d022ff|
|[continuous-performance-ledger.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/continuous-performance-ledger.json)|2026-10-10T13:39:39.311Z|定義なし|c58524683ca12a9f9e0fbaf305f3c6181dc3de1a|
|[effective-score-miss-attribution-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/effective-score-miss-attribution-report.json)|2026-08-29T06:51:30Z|retrospective-proposal-only|fa4ef5cf909e35156603934f687aa6fd792872f1|
|[effective-score-weight-ab-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/effective-score-weight-ab-report.json)|2026-08-29T04:02:32Z|preregistered-shadow-only|8ba994ba7fbefb00a98ae14f100ccd584df8d175|
|[escape-frozen-comparison.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/escape-frozen-comparison.json)|2026-10-10T13:32:44.557Z|定義なし|8090ecd02a951178b6e31a0ce2bc125fb73303ac|
|[escape-main-audit.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/escape-main-audit.json)|2026-10-10T01:08:55.919Z|定義なし|ba30f40f28480488a310af0db828993ef20808e1|
|[escape-partner-history-research.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/escape-partner-history-research.json)|2026-10-10T01:09:07.570Z|INSUFFICIENT_EVIDENCE|21658daedfef165f669dfa5cbf8baa827a10f49c|
|[exhibition-foot-branch-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/exhibition-foot-branch-report.json)|2026-10-10T14:40:13.935Z|定義なし|ba8537ccbb2d81bd8216612427adbcaad52b99f0|
|[exhibition-rank3plus-breakdown.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/exhibition-rank3plus-breakdown.json)|2026-10-10T14:43:32.358Z|定義なし|94288156926192c8eccdd6917d64449f7408f25e|
|[external-reference-collector-v1.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/external-reference-collector-v1.json)|2026-10-10T13:45:22.496Z|定義なし|d56f75434a518c24c90aa35e73b267ead5d9e339|
|[external-reference-result-report-v1.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/external-reference-result-report-v1.json)|2026-10-10T13:47:12.033Z|定義なし|c7484c3d696f3e49b0fe1155f5ecfa287586a027|
|[flow-reading-miss-breakdown.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/flow-reading-miss-breakdown.json)|2026-08-23T14:31:59.183Z|定義なし|f46d79e09c7112523ba8c43c3630defbc9ca698d|
|[flow-suppression-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/flow-suppression-report.json)|2026-09-20T13:30:18.289Z|定義なし|614d6ad41a68447ef4aab0d728318fe854a57081|
|[four-kado-escape-rescue-ab-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/four-kado-escape-rescue-ab-report.json)|2026-08-23T13:45:05.792Z|定義なし|ddc6e4b789965d1f731c69be99aee0d56bf4d0af|
|[four-kado-escape-rescue-post-adoption-monitor.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/four-kado-escape-rescue-post-adoption-monitor.json)|2026-10-10T14:39:17.967Z|定義なし|26d59f87fc1c7181675c3351902e0a7c2ad6015c|
|[frame-rise-fall-negative-clip-result-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/frame-rise-fall-negative-clip-result-report.json)|2026-10-10T14:49:18.058Z|candidate-fails-fixed-100|b23649e88d666feab2d6f02b7b965217b27b4f66|
|[frame-rise-fall-shadow-result-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/frame-rise-fall-shadow-result-report.json)|2026-10-10T14:48:28.238Z|candidate-fails-fixed-100|b11943710b9605f4ae72b63abc199d5ebb016471|
|[improvement-proposal-phase3.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/improvement-proposal-phase3.json)|2026-10-10T14:58:25.204Z|proposal-candidates-ready|40aae64d0e358bdaeb9baf9065e8650bc32f5020|
|[improvement-review.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/improvement-review.json)|2026-10-10T13:04:24.795Z|定義なし|1ab553029692d2d1e8bbc1247d5d52f19c27cc0c|
|[independent-autonomous-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/independent-autonomous-report.json)|2026-10-10T01:13:11.582Z|INSUFFICIENT_EVIDENCE|738b4ea0d8c7956d424f12f0b834bb25959855bf|
|[independent-decision-readiness-20261005.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/independent-decision-readiness-20261005.json)|2026-10-05T08:09:26.026Z|定義なし|9f1ca8e6392de8f09e8e167d54614803a172c33a|
|[independent-rule-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/independent-rule-report.json)|2026-10-10T01:09:08.535Z|INSUFFICIENT_EVIDENCE|d0028b556c28177834260f40625661a6e1d3725d|
|[independent-weather-history-v2.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/independent-weather-history-v2.json)|2026-10-10T01:11:59.183Z|定義なし|72fe4f2ec2970259640c98c63317a7dc38bc6056|
|[independent-weather-history.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/independent-weather-history.json)|2026-10-10T01:09:08.573Z|定義なし|624771fb9d3cf3263eaee3eb011a9919a9c0b6bc|
|[learning-pipeline-gate-phase4.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/learning-pipeline-gate-phase4.json)|2026-10-10T15:02:36.262Z|awaiting-human-approval|4dd64bb6cc0ff3e18b3d953636b0a943d13248a6|
|[local-water-branch-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/local-water-branch-report.json)|2026-10-10T14:41:51.186Z|定義なし|6fbf1f23d3632b05413b9c3a0040dcb8aaaea76e|
|[local-water-main-head-selection-audit.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/local-water-main-head-selection-audit.json)|2026-10-10T13:23:43.266Z|定義なし|43772b5d6be84775d5822cbb6039294f65d61541|
|[local-water-outer-head-bottleneck-audit.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/local-water-outer-head-bottleneck-audit.json)|2026-10-10T13:23:42.527Z|定義なし|783451f902ff3ef3d38ba41698dd1a525186f829|
|[local-water-outer-head-candidate-ranking-audit.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/local-water-outer-head-candidate-ranking-audit.json)|2026-10-10T13:23:38.077Z|定義なし|c79c967fee68d7e164857c01a72fc5635681dc20|
|[local-water-outer-head-priority-score-audit.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/local-water-outer-head-priority-score-audit.json)|2026-10-10T13:29:50.549Z|定義なし|1096e9b8e589e3f36a5e7a0a95b5a3172e3182fb|
|[local-water-outer-head-role-qualification-audit.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/local-water-outer-head-role-qualification-audit.json)|2026-10-10T13:56:17.520Z|定義なし|031ef179f4efbc57c205323d5e0d41f6e855bd2d|
|[local-water-outer-head-stage-audit.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/local-water-outer-head-stage-audit.json)|2026-10-10T13:25:00.386Z|定義なし|6fd6ecddfe02445eaa523a0f642a4a57c3181298|
|[local-water-outside-head-miss-structure.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/local-water-outside-head-miss-structure.json)|2026-10-10T13:21:36.516Z|定義なし|4e6320b4420ff48077d7e47642f6516b837376a1|
|[local-water-priority-selection-consistency-audit.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/local-water-priority-selection-consistency-audit.json)|2026-10-10T13:50:19.985Z|定義なし|b579909b03d65bc5818f6d7543436de87d7837db|
|[local-water-priority-selector-shadow-replay.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/local-water-priority-selector-shadow-replay.json)|2026-10-10T14:00:07.169Z|定義なし|e12d89b262a705d668067be121665a3b0107f2f5|
|[local-water-result-breakdown.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/local-water-result-breakdown.json)|2026-10-10T13:24:44.755Z|定義なし|e4de566bfcb5fecb2699a7ffd49e60370dc6ae22|
|[local-water-strong-condition-cohort.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/local-water-strong-condition-cohort.json)|2026-10-10T13:23:57.150Z|定義なし|b4d5af312aef86fb17397c4435d3adcd05274fde|
|[local-water-v2-post-adoption-monitor.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/local-water-v2-post-adoption-monitor.json)|2026-10-10T15:13:13.577Z|定義なし|2b6a629b2c5531f4c3d9771cd281661acbf2eb4e|
|[motor-course-branch-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/motor-course-branch-report.json)|2026-10-10T14:46:47.818Z|定義なし|abf24a82c2d87b4eb6ca1e0ac6428b5a81d35aec|
|[outer-attack-gate-dropoff-v1.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/outer-attack-gate-dropoff-v1.json)|2026-10-10T13:37:41.963Z|定義なし|72c0e04c502937d228b64860473326e7e182f630|
|[outer-attack-pipeline-loss-v1.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/outer-attack-pipeline-loss-v1.json)|2026-10-10T13:37:38.045Z|定義なし|f3af596caae716f977f8cf209dff6db0714eee53|
|[outer-attack-research-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/outer-attack-research-report.json)|2026-10-10T13:34:44.560Z|NOT_REGISTERED_FOR_PRODUCTION_ADOPTION|972ff2745bb77522b8a68c60a5d81beec5d48a06|
|[outer-attack-ticket-central-report-v1.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/outer-attack-ticket-central-report-v1.json)|2026-10-10T13:34:40.900Z|定義なし|a2fc5558590a08322f0329828df13240e37a2a18|
|[outer-head-coverage-audit.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/outer-head-coverage-audit.json)|2026-09-20T13:36:53.222Z|定義なし|8e81f63f873f198ba290baf3a265eb03b3a0cc05|
|[outer-head-drop-stage-audit.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/outer-head-drop-stage-audit.json)|2026-10-10T13:25:11.669Z|定義なし|317545f9e91a965f93c6aa6aa0abf4075986d549|
|[partner-forward-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/partner-forward-report.json)|2026-10-10T01:09:08.474Z|INSUFFICIENT_EVIDENCE|93305426b8acb6a01fff9b7c6d6c81e18a52ca23|
|[phase3-learning-handoff.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/phase3-learning-handoff.json)|2026-10-10T15:05:56.576Z|定義なし|f813e9d6636add8d8cba10cbd9bb13c025c0492b|
|[phase4-daily-cycle-gate.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/phase4-daily-cycle-gate.json)|2026-10-10T15:06:45.717Z|定義なし|3aa7be765e88456695ace637258499a014ee57e1|
|[phase6-data-audit.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/phase6-data-audit.json)|2026-10-10T15:03:26.300Z|healthy|cce793a3195154c7f3555629caac452fb9f96800|
|[phase9-live-improvement-cycle.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/phase9-live-improvement-cycle.json)|2026-10-10T15:01:46.294Z|定義なし|2f9d387d1bd547beff9c53a1980f1e59768a5c26|
|[playful-link-position-forward-v1.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/playful-link-position-forward-v1.json)|2026-10-10T13:36:16.901Z|定義なし|2c6461a2f238d061c3385b9db49f4927ce38ad21|
|[playful-manshu-20260923.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/playful-manshu-20260923.json)|2026-09-24T03:04:38.386Z|定義なし|3c1b895318a9d1fe69326e0637420f601647846a|
|[practical-priority-shadow-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/practical-priority-shadow-report.json)|2026-10-03T09:21:55.518Z|review-candidate-rejected|b45010b3e1fbaa53fac4bd1f3209db383a725b26|
|[prediction-gap-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/prediction-gap-report.json)|2026-10-10T13:05:04.930Z|定義なし|eb8a6c5c54d937417879cf1d686a1760b7ed2d33|
|[prediction-index-size-audit-20260807.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/prediction-index-size-audit-20260807.json)|2026-08-07T11:33:24.530Z|定義なし|206bf778055a8eba9cfe7a8e3805c620c96ebf2f|
|[profit-priority-ranking.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/profit-priority-ranking.json)|2026-10-10T15:00:06.152Z|candidate-selected|b37ba52799e460eb0ce23e878ad2732df46b54f4|
|[race-flow-2course-sashi-skip-ab-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/race-flow-2course-sashi-skip-ab-report.json)|2026-10-10T14:51:49.863Z|定義なし|24a8b3eedbca49e5dcfd4fee70c0219e077a06ca|
|[race-flow-3course-alert-skip-ab-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/race-flow-3course-alert-skip-ab-report.json)|2026-10-10T14:50:59.206Z|定義なし|54926df09fa24039285776d4116bef9c8b1b554e|
|[race-flow-3course-internal-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/race-flow-3course-internal-report.json)|2026-10-10T14:42:41.809Z|定義なし|a59aed13a84d55f4eb8f7da008bbfc39b2acd3a6|
|[race-flow-4kado-alert-skip-ab-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/race-flow-4kado-alert-skip-ab-report.json)|2026-10-10T14:50:08.640Z|定義なし|d533fffcc8e83a96634b31087eb2844970d098d6|
|[race-flow-branch-profit-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/race-flow-branch-profit-report.json)|2026-10-10T14:41:04.811Z|定義なし|e80bb611eda11a6b92587d73f4c9062150e51e01|
|[race-flow-in-first-outside-alert-skip-ab-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/race-flow-in-first-outside-alert-skip-ab-report.json)|2026-10-10T14:54:21.127Z|定義なし|e39d0b1fe9acea119f16402c53973a9ec075aeb5|
|[race-flow-outside-push-skip-ab-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/race-flow-outside-push-skip-ab-report.json)|2026-10-10T14:53:30.517Z|定義なし|a1ea747ca1c178bceba1dd842c593a422aa2ba4d|
|[race-review-progress.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/race-review-progress.json)|2026-10-10T13:25:37.677Z|定義なし|3b56158715b437cb6c97c31a397e5b3b75323901|
|[remain-pickup-branch-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/remain-pickup-branch-report.json)|2026-09-20T13:11:27.442Z|定義なし|3ef84f8b648917c22e85841858dcdeefefe0abaf|
|[remain-pickup-hold3-shadow-ab-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/remain-pickup-hold3-shadow-ab-report.json)|2026-10-10T14:55:11.760Z|review-ready|d7c04ca63ebbbf0084e760fac2536481055d6658|
|[remain-pickup-same-stake-shadow-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/remain-pickup-same-stake-shadow-report.json)|2026-09-08T21:50:46.986Z|candidate-fails-retrospective-holdout-100|393f214909bcb5ad1916385ab4109feffe5b2573|
|[result-calibration-checkpoint.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/result-calibration-checkpoint.json)|該当フィールドなし|定義なし|027e00083c6114713b0d833bf0907eb57a854894|
|[result-diagnostics-checkpoint.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/result-diagnostics-checkpoint.json)|定義なし|定義なし|5a0511cb853599c779cffc8534131c4ffb47b3da|
|[result-source-checkpoint.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/result-source-checkpoint.json)|2026-10-10T14:21:58.673Z|定義なし|d764b7bc952df6acc6e7141ba14b474732126b08|
|[sashi-core-post-adoption-monitor.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/sashi-core-post-adoption-monitor.json)|2026-08-18T16:54:34.140Z|定義なし|4e88a5bafa390056cbc53ccdf1ad692b846be254|
|[sashi-safety-post-adoption-monitor.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/sashi-safety-post-adoption-monitor.json)|2026-08-18T16:49:21.970Z|定義なし|ed91b67ed2b24687a7571f451c11ea7f80e461b7|
|[scenario-ai-v6-ab-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/scenario-ai-v6-ab-report.json)|2026-10-10T13:03:03.288Z|定義なし|81c263d7b916c3c63de19cfa6b706687d2d9bfb2|
|[scenario-ai-v6-adoption-review.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/scenario-ai-v6-adoption-review.json)|2026-10-10T13:03:03.391Z|collecting-evidence|cd1530e2d537f980d11df6f4bd08117ed06d049c|
|[scenario-ai-v6-approval-status.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/scenario-ai-v6-approval-status.json)|2026-10-10T13:03:03.463Z|not-candidate|723bd6edca49fd444ecb2b451c727d7dedaba986|
|[scenario-ai-v6-learning-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/scenario-ai-v6-learning-report.json)|2026-10-10T13:01:41.677Z|定義なし|49f811b8973c27e58aedf0d3635a7f47e91e2106|
|[scenario-ai-v6-monitor.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/scenario-ai-v6-monitor.json)|2026-10-10T13:03:03.578Z|inactive|bbb4f6a0e325b5b24e816fa4cd73759564efe300|
|[scenario-ai-v6-reproducibility-gate.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/scenario-ai-v6-reproducibility-gate.json)|2026-10-10T13:02:22.535Z|定義なし|5d2e7826ba781518d99022e128e957cab88bb8d8|
|[scenario-ai-v6-rollout-status.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/scenario-ai-v6-rollout-status.json)|2026-10-10T13:03:03.518Z|off|8f9029b374fe6570539950a8323deb19192350c4|
|[scenario-ai-v6-stop-decision.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/scenario-ai-v6-stop-decision.json)|2026-10-10T13:03:03.636Z|not-running|264ae560ea93dadff622ae2d90340bfe8d17f1af|
|[scenario-likelihood-v5-ab-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/scenario-likelihood-v5-ab-report.json)|2026-10-10T13:07:06.800Z|shadow-only|a92a658d10e5288f9b5a07cc2892b186be00994a|
|[scenario-likelihood-v5-calibration.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/scenario-likelihood-v5-calibration.json)|2026-10-10T13:05:45.318Z|proposal-only|ab331bc3b9a14821a9fe48eefd84fa724a6cfc5d|
|[skill-branch-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/skill-branch-report.json)|2026-10-10T14:46:01.272Z|定義なし|032edbbd62a63fdc779f93335185dfac14c808fa|
|[st-role-attack-exhibition-holdout-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/st-role-attack-exhibition-holdout-report.json)|2026-09-20T13:14:50.643Z|rejected|cf4c61b5f6d98189ddc834b9a22d5ab529885342|
|[st-slit-branch-profit-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/st-slit-branch-profit-report.json)|2026-10-10T14:47:38.445Z|定義なし|39920091219cac6d5bff3b1e617e0ce65147e78a|
|[theory-ab-phase10.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/theory-ab-phase10.json)|2026-10-06T15:56:42.716Z|ready-for-shadow-ab|9b4c96a8e8df23a25f104612a0ad7a014b84a327|
|[theory-adoption-approval-status.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/theory-adoption-approval-status.json)|2026-10-10T13:10:07.987Z|collecting-evidence|acd41476bbd7b5e99fd5be83c424e80612244f5e|
|[theory-adoption-monitor.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/theory-adoption-monitor.json)|2026-10-10T13:10:08.045Z|inactive|2b4b8fd575a6918a5ef0f61de80d5840cf7024fc|
|[theory-adoption-phase5.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/theory-adoption-phase5.json)|2026-10-10T15:00:06.114Z|review-ready|c089ae750a92cad3c2e60ec1eb880a8164c64ee6|
|[theory-adoption-review-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/theory-adoption-review-report.json)|2026-10-10T13:10:07.910Z|collecting-evidence|d9e667efbd875ea3b565443af9d956e26450599f|
|[theory-candidate-branch-analysis-phase9.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/theory-candidate-branch-analysis-phase9.json)|2026-10-10T15:00:56.482Z|unsupported-phase9-theory|b64b2df5273d84a70a806667cb9dca25a1e25412|
|[theory-evidence-coverage-phase7.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/theory-evidence-coverage-phase7.json)|2026-10-10T15:00:06.045Z|evidence-expansion-required|51f1f4f3f0cd43043e96d67cfffa554cb6f39cc6|
|[theory-evidence-growth-monitor.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/theory-evidence-growth-monitor.json)|2026-10-10T15:00:06.076Z|healthy|4733aacebed563e921538783fbbdfb223caa1f24|
|[theory-improvement-proposal-phase9.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/theory-improvement-proposal-phase9.json)|2026-10-10T15:00:06.220Z|proposal-ready|26ef390ca2dbcf8743c1e7a08abcfb44e4567c7d|
|[theory-improvement-proposals.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/theory-improvement-proposals.json)|2026-10-10T13:08:30.298Z|proposals-ready|48d2d97ff67c217a395eb7b6acbf51f1f23743f1|
|[theory-performance-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/theory-performance-report.json)|2026-10-10T14:59:15.182Z|collecting-data|e936a6eefb61c5bcc5e53063d310db00e8b891a5|
|[theory-profit-review-phase8.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/theory-profit-review-phase8.json)|2026-10-10T15:00:06.189Z|review-candidate-ready|2ac52319daef10d9d3c726f58647c6aa110740f7|
|[theory-shadow-ab-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/theory-shadow-ab-report.json)|2026-10-10T13:08:30.823Z|collecting-comparisons|f4aa07227ef5914f67fcffe5167d0d4a223ede9e|
|[theory-shadow-production-gate.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/theory-shadow-production-gate.json)|2026-10-10T13:09:18.780Z|collecting-evidence|6c4676cfee2781d11991f23054c4110f0f438921|
|[theory-stop-decision-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/theory-stop-decision-report.json)|2026-10-10T13:10:08.103Z|no-action|b93092cb18642113f89923ec3ae4688c74faacce|
|[theory-tag-catalog-reachability-20260807.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/theory-tag-catalog-reachability-20260807.json)|該当フィールドなし|定義なし|bb4ad2a1ba4c1d2fd3e1db8b4f90a779f18371d5|
|[theory-validation-phase6-prospective.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/theory-validation-phase6-prospective.json)|2026-10-10T13:21:11.088Z|定義なし|f4a3d1a684e64e3dee0e81f6730c555f5aa6e336|
|[theory-validation-phase7-lifecycle.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/theory-validation-phase7-lifecycle.json)|2026-10-10T13:21:11.137Z|定義なし|c0abf802f8467327a62f863865ba38073cd1a885|
|[theory-validation-phase8-cycle.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/theory-validation-phase8-cycle.json)|2026-10-10T15:00:56.746Z|定義なし|1c7be2c8391fbde95f97ad2fdc87fd4be9bf756c|
|[three-course-escape-rescue-ab-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/three-course-escape-rescue-ab-report.json)|2026-08-23T12:49:04.738Z|定義なし|7e1c1ff5c0ac6f03b43582361f525a17be7278f6|
|[three-course-escape-rescue-post-adoption-monitor.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/three-course-escape-rescue-post-adoption-monitor.json)|2026-10-10T14:37:36.872Z|定義なし|d2ca41484033f615f2821c79ba58f7c628a850db|
|[unified-improvement-decision-gate.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/unified-improvement-decision-gate.json)|2026-10-10T14:55:11.898Z|定義なし|ed759268a6535903d7e3c64f79bffdfacf4bb9dc|
|[venue-2course-sashi-skip-shadow.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/venue-2course-sashi-skip-shadow.json)|2026-10-10T14:52:39.838Z|定義なし|c4aabd6b0c376311d7e974e51846e25300b3ebbb|
|[venue-scenario-improvement-candidates.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/venue-scenario-improvement-candidates.json)|2026-10-10T14:59:16.716Z|定義なし|e93e37e369ef13b816cc8d02ab01402277adbc5b|
|[venue-theory-profile.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/venue-theory-profile.json)|2026-10-10T14:59:16.713Z|定義なし|3ab5c684dbbca3596ca72679791cd2228f043ba4|
|[venue-three-attack-race-diagnosis.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/venue-three-attack-race-diagnosis.json)|2026-10-10T14:59:16.725Z|定義なし|f1cd879d4093d645b44153ff238ed85611635384|
|[wall-boat-branch-profit-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/wall-boat-branch-profit-report.json)|2026-10-10T14:44:23.227Z|定義なし|94985a3a5a2871fcd05369452dd0787373606269|
|[wall-established-attacker2-skip-ab-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/wall-established-attacker2-skip-ab-report.json)|2026-10-10T13:21:10.957Z|定義なし|4c728c76092593570cf4413f5ace46e2355be482|
|[wall-established-breakdown.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/bd3aebd4454d6de436b0f0642a47d9b25df64340/data/stats/wall-established-breakdown.json)|2026-10-10T14:45:14.215Z|定義なし|578cbc0600a1d7751d22cced9eecebab7d215ef2|

## 読み替え・再計算をしなかった原本系12件

- course-structure-patterns.json：4737eac5f490d43571a245c27c4de10c14299275（51730 bytes）。一覧のみ確認。
- frame-rise-fall-shadow-snapshot-archive.json：e9b46a9ddef6ba4dcc3d6c1f3d6ad6c4563f6a10（15592146 bytes）。一覧のみ確認。
- frame-rise-sink-patterns.json：bbac4a5a6253a1aa30e0e8274fc8f6639460ad6f（290320 bytes）。一覧のみ確認。
- local-water-v2-post-adoption-input-cache.json：e2a286e91eef5f91e3c5328c5de177e59cfbaa45（40932757 bytes）。一覧のみ確認。
- outer-attack-ticket-central-settlements-v1.json：ed336918f3b6258055a55f54bb7fa0edf57907b2（156768 bytes）。一覧のみ確認。
- outer-attack-ticket-central-shadow-archive-v1.json：097f61b2725f0c5edc844712dd62b91b462ad145（1030475 bytes）。一覧のみ確認。
- race-patterns.json：6f4556236542f4731f31e915f8d8a3d7497b2510（3550666 bytes）。一覧のみ確認。
- race-review-results.json：8eba5997c8704f4ef1847b5917e1fa85930ba45a（725730 bytes）。一覧のみ確認。
- racer-skill-patterns.json：47a62a98b5a53c67fea6053c70e8b43cd3b07981（7587348 bytes）。一覧のみ確認。
- racer-venue-starts.json：8805c6754e4d0f0302f6693e5e6ce334be2383f2（376352 bytes）。一覧のみ確認。
- trifecta-by-venue-race.json：b709abea8f415d60906596b11b19074b6e6005f7（1204048 bytes）。一覧のみ確認。
- venue-race-patterns.json：370fd33798702227ce570fc57c280fb6e8695dad（2570647 bytes）。一覧のみ確認。

この更新は情報の整備と証拠確認の記録。更新失敗15工程（定期14本＋four-stage）、日次集計待ち、未実施の実機確認を残したまま「すべての検証が完了」とはしない。
