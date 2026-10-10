# 独立研究の2・3着ペア進路診断 v1 — 設計

設計日: 2026-10-11 JST。状態: **設計完了、実装・収集接続は未着手**。
確認基準: main `5371ac9edaac469ebbf1403ef87127f139090b7c`。
引き継ぎ: [Issue #1214 の接続監査](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/issues/1214#issuecomment-6098700177)。
本書のフィールドとファイル名は新規実装の契約案であり、既に保存されている項目とは区別する。

## 目的と完了範囲

既存の独立研究にある各艇の条件付き進路を、同一主展開の順序付き2・3着ペアへ参照付きで結ぶ。
何が保存根拠にあり、何が未観測なのかを診断できるようにする。ペアの優劣・購入適格性・両立可否は判定しない。

2/3着コース補正同時除去、2着だけの除去、通常3Rの同一枝監査は完了済み。本書のために再比較しない。
通常AI、旧順位モデルの既視362R、独立研究を混ぜない。同じzoneによる一律除外、外艇の強制追加、点数埋め、係数調整を導入しない。
今回は入力・出力・未知値・不変条件・保存接続・実装受入条件を固定する。予想改善の実証や本番採用の完了ではない。

## 再利用する実装と未接続部分

| 既存ファイル | 再利用するもの | この診断で追加するもの |
|---|---|---|
| `scripts/independent-flow-roles-v1.cjs` | 主展開・主役と検証契約 | 同一展開への参照 |
| `scripts/independent-route-water-v1.cjs` | 6艇のroutes、根拠hash、厳密再生検査 | 2・3着それぞれのroute参照と関係の投影 |
| `scripts/independent-partner-selector-v2.cjs` | roles、pool、status/reason、ticketsと再生検査 | poolへの参照。選定処理自体は変更しない |
| `scripts/independent-autonomous-forward.cjs` | capture、prepare、seal、方式別cohort、日次report | 新規診断の版・hash・別コホートを既存経路へ接続 |

route-waterの確認時blobは `00c70991ded7bb857b193f1f6e728a7dc8d219b2`、
selector-v2は `d9f73a9534a5e6376e0d55b6c9d376cef1888fc9`。
selector-v2はroutesを含む入力全体を検証するが、艇比較では主に `routeWater.local` を使う。
`dominatedBy` は2着個別比較と3着個別比較の合成であり、進路相互作用の判定ではない。

## 入力契約と信頼境界

新規純粋関数の予定名は `scripts/independent-pair-route-diagnostic-v1.cjs` の
`judge(input, context, flow, support, routeWater, selection)`。
入力は**同じ新規snapshot内**の以下だけを明示的に渡す。

- input / judgmentContext / flowStudy.judgment
- partnerStudy.context
- routeWaterStudy.context / routeWaterStudy.judgment

結果、払戻、オッズ、通常AIの候補・順位、後日取得の進路、別snapshotの根拠は渡さない。
既存flow・support・routeWater・selectorのvalidateを再利用し、検証済みであるとの自己申告だけでは受け入れない。
raceKey、inputHash、contextHash、flowHash、scenarioId、head、艇と実進入の一意対応を一致させる。
入力オブジェクトに書き込まず、再現用hashと元snapshotのhashを別に保持する。

参照先欠落、hash不一致、異なる主展開、重複艇、未知版、再生不一致は**invalid**。
主展開未確定や履歴不足は正常に保存された**unknown/skipped**であり、invalidとは別。
invalidを0件・通常の見送り・データ待ちへ変換しない。

## 対象ペアと状態

主展開は既存flowがreferenceとした一意なescapeまたはmakuriだけ。
頭を除く5艇の順序付き20組を実進入順に列挙する。2着と3着を交換した組は別行。
この20組は診断上の索引であり、購入券の生成・購入資格の付与ではない。

既存selectorは履歴不足等で早期skipするとpoolが空になる。
その場合も主展開とroutesが有効なら20組を診断できるが、
`selectionPoolMembership='not-evaluated'`、`selectionPoolRef=null` とする。
後段のfrontier超過skipではpoolが20組あるため、その参照を保つ。
空poolを「20組すべて不採用」と表示しない。

主展開未確定は `status='unavailable'`、`reason='main-scenario-unresolved'`、
`pairs=[]`、`expectedPairCount=null` とする。unknownのrouteから仮の頭を選ばない。
主展開有効時は `status='available'`、`expectedPairCount=20`。
availableは参照を構成できた意味で、進路両立が確認できた意味ではない。

## 保存フィールド

診断本体のversionは `independent-pair-route-diagnostic-v1`。
hashは既存と同じ `JSON.stringify(value) + '\\n'` のUTF-8 SHA256を使う。
`diagnosticHash` は同フィールドを除いたbodyから計算する。

| 階層 | フィールド | 意味 |
|---|---|---|
| 本体 | version / raceKey / observedAt / status / reason | 対象と診断可能状態 |
| 本体 | inputHash / contextHash / flowHash / supportHash / routeWaterHash / selectionHash | 使用した各入力の固定参照。selectionHashはselection全体のhash |
| 本体 | scenarioId / head / scenarioRef / expectedPairCount | 一意な主展開と頭。未確定時はnull |
| 本体 | sourceSelectionStatus / sourceSelectionReason / sourceTickets | 元の選定結果をそのまま参照用に保持 |
| 各pair | pairKey / head / second / third / secondCourse / thirdCourse / scenarioId | raceKey:scenarioId:head-second-third の識別子と実進入 |
| 各pair | secondRouteRef / thirdRouteRef / secondRoleRef / thirdRoleRef | 元routes・rolesを参照 |
| 各pair | selectionPoolMembership / selectionPoolRef / selectedBySource | evaluatedならpool参照。未評価ならnull。元tickets包含はそのまま記録 |
| 各pair | secondRoute / thirdRoute | path、zone、status、pressureFrom、followsAttacker、potentialCompetition、required、unobservedの参照付き投影 |
| 各pair | relations | 下記の限定した関係。実際の相互作用とは呼ばない |
| 各pair | compatibility / actualTurnObserved | 常にunknown / false |
| 本体 | diagnosticHash | 診断body全体のhash |

元の `evidenceHash` はrouteWater bodyのhash。
それをsnapshotHash・原文HTML hash・コードhashと取り違えない。
各参照は `{source, sourceHash, pointer, value}` とする。
pointerは入力オブジェクトのJSON Pointer（例: `/routes/2/path`）。
sourceはflow / routeWater / selection等の閉じた集合、sourceHashは上表の対応hash。
配列添字だけで艇を特定せず、解決時にboatとcourseも照合する。
routeの元evidenceはroute全体の参照から追跡できる。転載した値だけを根拠にしない。
参照やpairの並び順は実進入と2着→3着の順で固定し、実装時に決定的再生を検査する。

### relationsの意味

各関係を `{value: true|false|null, evidenceRefs: [...]}` で保存する。
true/falseは**保存済み仮説内の関係**、nullは必要な仮説が不明という意味。

| 関係 | 計算と必要な参照 | 読み替えてはいけない結論 |
|---|---|---|
| sameScenario | flowとrouteWaterとpairが同じ有効scenarioId。異なる場合はinvalid | 実際にその展開になった |
| sameZone | 両routeがconditionalかつzone既知なら完全一致、未知ならnull | true=両立不能、false=両立可能 |
| secondListsThirdAsCompetition / thirdListsSecondAsCompetition | 各potentialCompetition内の相手艇包含。元配列を参照 | 競合相手が実際に妨害・敗退した |
| secondUnderPressureFromThird / thirdUnderPressureFromSecond | 各pressureFrom内の相手艇包含 | 実際に圧力がかかった |
| secondFollowsThird / thirdFollowsSecond | 各followsAttackerと相手艇の一致 | 追走が成立した、着順が確定した |
| sharedPressureSources | 両pressureFromの共通艇番号と両元配列への参照。未知時null | 共通の圧力を相殺できた |

sharedPressureSourcesだけvalueは艇番号配列またはnull。
上記の方向付き関係はrouteがunknownならfalseへ補わずnull。
既知仮説の空配列から得たfalseや[]は、観測上の「圧力なし」「安全」を意味しない。
現行route仮説ではpressure/followsの相手は主役に限定されるため、相手ペア間はfalseが多くなる。
これは設計上の情報範囲であり、値を増やすために経路を創作しない。

requiredとunobservedは艇別の元配列を保持し、ペアの共通・和集合を出す場合にも艇別参照を残す。
requiredの列挙を「条件成立済み」に変換しない。
両立可能性は全件unknown。既存データだけからconfidence、pairScore、pairRank、
eligible、blocked、推奨券、実旋回順、距離・確率を新設しない。

## 将来の保存接続と過去データ保護

**本設計PRでは収集コード・config・snapshotの版を変更しない。** 実装時は次を一つの検証可能な接続として行う。

1. 診断モジュールと専用configを追加し、版・codeHashes・依存hash・安全フラグを固定する。
   既存water/partnerのcodeHashes・protocolHashは診断追加のために変更しない。
2. 現在のsnapshot-v7に対する次版としてv8を予約する。実装時に最新mainで未使用を再確認する。
   新規snapshotにのみ `pairRouteDiagnosticStudy={protocolHash,diagnostic}` を追加する。
   既存candidate、flowStudy、partnerStudy、routeWaterStudy、weatherHistoryStudyは同じ入力で従来どおり保持する。
3. createRecorderは既存の公式取得で作ったwaterContextとselectionを再利用する。
   通常公開の優先順は維持し、prepare→artifact確認→sealを既存経路に追加する。
   生成時の締切120秒超、artifactのID/digest/run/head/確認時刻と締切前条件は従来どおり。
4. validateはv1〜v7を旧契約で保持し、v8でだけ診断必須・厳密再生を行う。
   診断失敗時は新規v8をsealしない。公開後の研究工程として失敗を明示し、
   v7へ黙ってfallbackして成功扱いにしない。既存公開receiptの再送はしない。
5. 診断用cohortは `raceKey + diagnostic protocolHash` ごとの最初の有効v8 seal。
   confirmedAt、同時刻はsnapshotHashの既存順序を使う。
   recorderのseenと各旧cohortの版フィルタも検査する。
   旧方式の最初のsealを新診断の都合で置き換えない。同じRの旧v7と新v8を合算しない。
6. 過去原本、旧artifact、receipt、旧cohortへ追記・上書き・再封印しない。
   現在の保存分に診断を後付けしない。既存材料を使った開発用テストは合成fixtureとして区別し、
   締切前診断件数へ数えない。

安全フラグは `selectionImplemented=false`、`usedForSelection=false`、
`productionChanged=false`、`automaticApplication=false`、
`usableForPrediction=false`、`actualTacticsInferred=false`、
`fullJudgmentImplemented=false`、`resultUsedForGeneration=false`、`adoptionGate=null`。
このselectionImplementedは診断モジュールの値であり、既存selector-v2のtrueを変更する意味ではない。

## 日次診断の契約

既存 `escape-main-audit.yml` のreport経路に
`independent-autonomous-report.json.pairRouteDiagnosticStudy` を追加する予定。
新cronやWork定期監視は不要。収集・writer・公開安定化はdot担当で、今回の研究設計と切り分ける。

- generatedAt、sourceCommit、diagnostic版/コードhash/protocolHash、入力seal範囲を明示。
- レース単位: sealed、available、main-scenario-unresolved、invalid理由別。
- ペア単位: 全診断ペア、元pool評価済み/未評価、元選定券、sameZoneのtrue/false/unknown。
- 元選定のskip理由を別に表示する。履歴不足の診断20組を選定20点・購入20点・的中母数へ変換しない。
- race数、boat数、pair数、同じ組の方向付き関係数を合算しない。
- 診断は券を変更しないので、独立した勝率・ROI・改善幅の成績欄は作らない。
  本工程で結果結合も不要。後続の選定候補を作る場合に初めて別方式・別評価計画を固定する。
- 失敗、未収集、未確定主展開、正常な0件を区別する。
  親run成功だけでなく対象step・artifact・main保存まで確認する。

## 実装受入条件

| 観点 | 必須確認 |
|---|---|
| 逃げ・まくり | 各20順序付き組、頭と同艇なし、2/3着同艇なし、両方向を保持 |
| 前付け・配列順 | 艇番と実進入が異なるfixtureで参照先一致。配列添字を艇番として使わない |
| 早期見送り | 有効主展開＋履歴不足で20診断、pool未評価。未確定主展開は0診断かつunavailable |
| 後段見送り | frontier超過のpool20組と元skipを保持。選定券を新設しない |
| 同じzone | 競合可能性trueでもcompatibility=unknown、券・順位・採否に差分なし |
| 方向付き関係 | 主役からのpressure/follows参照を保持。相手ペア間falseを観測なしと混同しない |
| 欠測・不正 | nullとfalseを区別。異なるscenario/hash、欠落参照、重複艇、改ざんをreject |
| 不変性 | deepFreeze入力でも実行可。元selection全体と既存studyの値・hashを保持 |
| 再生・安全 | 同一入力の完全一致、全参照をhash/pointer/value/boat/courseへ解決、安全フラグfalse |
| 旧版互換 | v1〜v7検査・各初回sealが不変、旧版に診断があればreject |
| 新規封印 | v8のみ必須、遅延/誤digest/別run/headをreject、初回保持、invalidを成功にしない |
| 日次集計 | レースとペアの分母、skipped/unknown/invalid、sourceCommitと新着sealの前後を区別 |

新規の意味あるfixtureに加え既存のindependent-autonomous/route-water/partner-selectorテストを使う。
合成テストの成功、PR CI、main反映、新規実レースの締切前v8保存、日次集計保存は別々に報告する。
既視の362Rで係数探索は再開しない。

## 完了判定と次の一手

この文書で診断仕様の設計を完了する。次は純粋診断関数と上表の契約テストを実装し、
既存のcapture/seal/reportへ接続する。実装PRではコードhashを固定し、CIと新規実レース保存を確認する。
診断だけでは券も精度も変わらない。ペアの選定方式、未使用期間での効果比較、本番採用はその後の別工程として残す。
