# 予想の品質比較と記事表示の改善案

対象main: `54e344d45469f7c8565794dae383d0f927dab1f4`。
今回の依頼は、本命・流し・中心の重複を整理し、蓄積データが予想の改善につながっているか確かめること。

## 確認したデータ

- `data/stats/race-patterns.json`: 161,740R。長期公式結果の集計であり、同数の締切前予想入力があるという意味ではない。
- `data/stats/escape-main-audit.json`: 6,178R。2026-07-22〜2026-11-15の締切前保存予想と公式結果。元監査の除外・出典区分を引き継ぐ。
- 内訳: all-race-note 1,684R、daily-primary 388R、daily-verification 4,106R。note公開receiptがあるレースだけの成績ではない。
- 元監査のSHA256: `e3bbb1da6e1a1ec6ebcf81f776d822f07a19360b0f07822c8b87151d57df852f`。
- 元監査生成時刻: 2026-11-16T01:26:54.257Z。sourceCommit: `7ec79d8fe4133ccdde4a16075214d07918066b17`。
- 元監査上の本命艇: 1=1,841、2=1,527、3=1,571、4=1,185、5=32、6=22。歴代方式全体を「1号艇固定」とする根拠はない。現在の記事表示と最新方式の偏りは別に調べる。

## 同じ点数・同じ予算の定型比較

比較対象は、1号艇頭・2着艇昇順・3着艇昇順の20券を固定順に並べ、各レースの保存予想と同じN点だけ選ぶ診断用ベンチマーク。結果・オッズで券を選ばない。1券100円の仮想成績であり、実購入ではない。

| 対象 | 保存予想 | 定型比較 |
| --- | ---: | ---: |
| 全6,178R・的中率 | 25.82%（1,595R） | 37.25%（2,301R） |
| 全6,178R・回収率 | 78.19% | 71.97% |
| 投資額 | 5,383,200円 | 5,383,200円 |
| 払戻額 | 4,209,010円 | 3,874,230円 |
| 損益 | −1,174,190円 | −1,508,970円 |
| 直近100R・的中率 | 30.00% | 38.00% |
| 直近100R・回収率 | 80.67% | 66.94% |

保存予想だけの的中556R、定型だけの的中1,262R。全体の払戻差は保存予想が+334,780円だが、保存予想の最大1件の払戻は220,490円。大当たり依存と期間差を見ずに改善を断定できない。2026年10月は保存予想68.64%・定型75.30%で逆転する。

本命を1号艇以外へ無理に変えることも、この定型をそのまま採用することも結論にしない。両者とも回収率100%未満で、現状を十分と評価しない。

再現:

```sh
node scripts/build-fixed-head-baseline.cjs data/stats/escape-main-audit.json /tmp/fixed-head-baseline.json
```

結果には方式識別子別・月別・元監査の出典区分別と、軸不足/2着不足/3着不足を保存する。元監査のgenerationにはsourceCommit等を含む場合があり、グループ数を予想方式の数とは解釈しない。

これは既存監査を再利用した過去の診断で、未使用holdout、全原本の再監査、新しい予想方式の改善実証ではない。締切時刻・入力の正当性は元監査の契約に依存し、今回の比較が独立に再認証するものではない。

## 大村11Rの表示案

原本: `data/note-drafts/20261116/20261116-24-11-978627238536aa03c7073ab09bd0c1e0987690f8ce6daa63794837d8fa844e81.json`。
SHA256はファイル名の64桁と一致。取得時刻2026-11-16T10:52:30.391Z。

[本文プレビュー](omura11-reader-preview-20261116.txt)と[照合情報](omura11-reader-preview-20261116.txt.proof.json)を作成。

- 保存済みの厳選7点を冒頭の本命として1回だけ表示。元の本命6点と末尾の中心7点を二重に推奨しない。
- 元の本命・押さえ・流しから、この7点を除いた13点を追加候補へ統合。流し欄と中心欄の重複再掲をなくす。
- 残る穴候補17点・参考4点を保持。穴の名称で万舟のオッズ確認済みと誤認させない。
- 公開対象の和集合37点、参考込み41点、厳選7点、元の区分所属・順序を照合情報に保持。
- 保存された正式展開・本命艇・本命券の1着艇が一致する場合だけ展開名を表示。古い任意の説明文は採用しない。
- 大村11Rはその一致がある。旧説明処理は本命グループに特定の定型文がないため、不一致の定型文を表示していた。新プレビューは構造化された一致を確認できる。

```sh
node scripts/note-reader-preview.cjs data/note-drafts/20261116/20261116-24-11-978627238536aa03c7073ab09bd0c1e0987690f8ce6daa63794837d8fa844e81.json /tmp/omura11-preview.txt
```

このCLIはレビュー用で `previewOnly=true`・`publishable=false`。既存publisher、公開証明、成績台帳へは接続していない。37点を7点へ削減したという意味ではない。買い目を絞る判断には別途、予想側の比較検証が必要。

## 検証と残る作業

- `node --test tests/prediction-quality-review.test.cjs`: 6件合格。
- `node --test scripts/note-free-explanation.test.cjs`: 14件合格。従来形式の互換性を確認。
- `node scripts/check-charter.js`: 合格。
- `git diff --check`: 合格。

次に必要なのは、保存時点の展開・コース・ST・展示・残し/拾いと外れ段階を結び、既存研究の採否を踏まえて改善候補を同じ点数で比較すること。長期統計を使う場合も、予想時点より後の結果を混ぜない。候補設計に使った期間と未使用期間を分け、現在の的中を失う件数と回収率の悪化を確認する。

本番の予想ロジック改善、最新方式だけでの改善実証、公開証明・成績との接続、今後の記事への適用は未完了。この変更を「予想精度改善済み」「note反映済み」と扱わない。

## 共通表示モデルへの分離（継続作業）

`js/forecast-reader-contract.js` をNodeとブラウザの両方で読み込める共通モデルとして追加し、記事プレビューの分類・重複除去・展開名・入力値の説明を接続した。同じ入力をブラウザ相当のVMとNodeで処理し、グループ・点数・説明文の一致を検査する。大村11Rの既存プレビュー本文と照合JSONが変更前と一致することも確認した。曖昧な艇ID・隣コースの重複は説明へ使わない。

追加の9件を含む29件の関連テストが合格。新しい検査は既存のnote-regressionへ組み込み、手動検査だけに依存させない。

この段階で共通モデルへ接続したのは記事プレビュー。アプリの表示所有者・ロード順への接続、ブラウザ実画面の確認、本番noteへの接続は未完了で、アプリ更新済みとは扱わない。アプリ側は表示境界で候補プールを絞る処理があるため、その手前の同一スナップショットと厳選集合を使って共通モデルを作る必要がある。表示済みの区分を再び入力として使うと、note側の原本集合との一致を失うおそれがある。

## Claude Codeの受領と指摘への対応

ローカルClaude Codeセッション `526cec0c-7dee-47f1-a3b7-066e81f530b8` が、初期head `e537ca2ee2ca2c05b2f545dfc36ce268740b4238` の添付コードと仕様を読み、同じPR・保存原本を使う方針を返した。添付の読み取り確認であり、Claude側のファイル照合・テスト実行・Cloud側受領を実証したものではない。

指摘から独立に確認できた2点を修正した。参考予想の元台帳の点数と重複除去後の追加表示点数を明示し、展開名は攻め艇・攻めコース・本命艇の公式進入が一致する場合だけ確認済みにする。進入が入れ替わった場合も艇番とコースを混同しない。欠測・重複進入・矛盾は確認中に戻す。

旧区分名を保持する過去方針と今回の統合案の違いも指摘された。今回の会話で本命・流し・中心の重複整理とnote/アプリ双方への適用を依頼されているが、現在の名称と本命の意味はレビュー用の表示案である。既存の公開形式・成績定義は変更せず、本番adapterへ接続する最終案で、保存厳選を本命として示す意味と追加候補の名称を本人が確認できる形にする。

## アプリ表示への接続（PR内・本番未反映）

共通モデルをアプリの表示境界と既存最終カードへ接続した。候補プールを3/2/2/1点へ切り詰める前に確定選定を読み、本命・追加・穴・別集計の参考へ一度ずつ表示する。旧本命・旧万舟・中心の重複欄と遅延fallbackは、共通カードの表示成功時に停止する。購入見送り・選定0点・選定不能は購入推奨0点を示し、候補から本命を補わない。

明示された現在オッズのマップを古い保存券の値より優先し、現在値が欠測なら未取得を維持する。取得・欠測・100倍の上下だけで区分や券集合を変えない。表示は毎描画の入力から作り直し、所有者の遅延処理に描画世代とDOMの照合を追加した。

派生fixture `scripts/fixtures/reader-presentation.json` は大村11R原本の必要項目を抽出し、元SHAを明記した検査用データで、公開原本そのものではない。同じfixtureを記事プレビューとアプリで読み、本命7・追加13・穴17・参考4、公開37・参考込み41点と説明文の一致を確認した。表示境界の再実行・独立追加・選定0点・欠測・不整合も検査し、関連Node検査35件が合格。

`scripts/test-reader-presentation-browser.cjs` は実際のアセットローダーと最終表示所有者を使い、390px幅のEdge実ブラウザで、描画関数の先行/遅延読込、通常→見送り→空→未取得→別レース→通常、500ms後とvisibility復帰、オッズ競合・未取得、旧表示への復帰を確認した。カードの横はみ出しなし。予想エンジン・公式取得はfixtureで代用しており、公開アプリ全体の実運用や本人iPhone確認を意味しない。既存のmobile CIへ同じ検査をWebKitで追加したが、その実行結果は対象headで別途確認する。

既存の表示・厳選・分類・構造・券圧縮の回帰検査、憲章、共有スキル照合も合格。今後の記事を生成する本番note adapterと新表示の接続、公開証明・成績との整合、予想方式そのものの改善検証・本番反映は残っている。保存厳選を新表示の「本命」と呼ぶため、旧区分別の成績をそのまま新本命の成績として扱わない。

社員の人数上限なし・人格/プロフィール/過去承認画像の追加条件は `docs/ai-staff-operations.md` とCodex/Claude共通スキルへ保存した。今回は既存のコハクによる独立点検を使い、新社員や画像は作成していない。

独立点検で、保存券だけを表示する入力では壁艇の承認済み購入見送りが欠落するケースと、オッズ欄自体がない券行が有効な保存オッズまで欠測として塞ぐケースを再現・修正した。券の再選定はせず既存purchaseDecisionだけを補完し、元の選定がskippedの場合も見送りを維持する。購入方針の計算不能は確認中に戻す。欠測を予約するのは明示された現在オッズマップのキーに限定した。関連Node検査は追加3件を含む38件、ブラウザ検査には実際のpractical-selectionによる壁見送りと保存オッズfallbackを追加した。

## 本番note用の構文・証明モデルの準備（未登録）

`scripts/note-reader-presentation.cjs` に新表示の本文、厳格なパーサー、集計用の分類と本命subset証明を作成した。同じ保存データからアプリと同じグループ・券集合を使い、圧縮後の表示順が元の優先順と異なる場合も、原本の順序と集合は変更しない。参考の元台帳数・重複数・追加表示数を本文で照合する。独立監視記事はv9の本文を保持する。

現在のpublisher/defaultには未登録。次にv9 rendererの凍結・旧claim再現、source payload、receipt proof、公開区分・元台帳の成績、コロがしsubset、無料価格のversion受理まで一緒に接続してから既定形式を切り替える。本文だけ先に差し替えない。新形式の本命は本文中ですでに公開予想へ一度含まれるため、旧末尾appendixの「公開成績には含まれない」という証明属性を流用しない。壁等の保存済み見送りは通常本命へ変換せず、現adapterでは停止する。見送り記事の既存運用との接続も残る。

## 最新方式の外れ段階を絞った診断

ミナトが監査の実装を確認した結果、`escape-main-audit.pool` は `candidate24Tickets` のみであり、main/cover/flow/manshu・独立枝の全和集合ではなかった。「poolに正解なし」を生成候補全体の不足と扱わない。全6,178Rではpool不明3,429R、外れ4,583Rのうち原因のpool判定不能2,583Rを別にする。

Linuxの保存方式指紋 `b36ecb0212d212af85ce977322a0a799774265c4bc6152ef82d4d1123c7586b5` と現在のコードの一致を確認し、同指紋のall-race-note924R（10/28〜11/15）に絞った。265的中・659外れ。外れのうちcandidate24内だが選定外156R、candidate24外503R。前者の頭不足18・2着不足29・3着不足109。全外れの選定券不足段階は頭194・2着269・3着196。candidate24外の選定券を含む606Rと、その券で的中した71Rがあり、候補生成全体の評価には元bundleの全プール照合が必要。

同指紋の11/15 note保存分95Rでは28的中、67外れ。candidate24内だが選定外10、candidate24外57。正式頭は1=26・2=26・3=27・4=14・6=2で、保存券集合74種類。公開receiptを確認した95記事や実購入成績を意味しない。

既存partner-forwardの現指紋は最初の100枠へ到達済み（10/28〜11/1、確定94・返還等6・pending0）。レポートblob `6e72bacac13520d4b379bcb01dfdd08adda19d97`、生成11/16 01:28:57 UTC。保存Aは32的中・回収率99.369%、優先点Bは28・89.190%、1・2着組保護Dは34・100.036%。D対Aは追加5・喪失3、同投資84,000円で払戻差+560円にとどまる。`adoptionGate=null`・`INSUFFICIENT_EVIDENCE`・自動適用なしを維持する。同期間での追加調整や100R再収集へ戻らず、DがBの喪失を防いだ7件とDでも失った3着3件の締切前保存根拠を追う。

## 方式指紋のOS間一致

`race-review-evidence.js` の依存解決がOS標準pathとPOSIX用の対象判定を混ぜていたため、Windowsで相対require依存が指紋から抜けることを再現した。リポジトリ内の名前解決をpath.posixへ揃え、Windowsでも上記のLinux保存指紋と一致することを確認した。推移的なconfig変更が両OSで同じ指紋変化となる2件の検査も合格。Linux本番の指紋・予想方式は変わらず、過去のWindows保存指紋を新方式や自動移行として扱わない。

## 明示版v10の公開区分・会計検査と、既定切替の確認待ち

ワカバがv10を明示指定した場合の公開区分・receipt proof・別集計参考・本命subset・無料0円を接続した。参考の元台帳/重複/追加表示を別々に保持し、完全重複で参考欄が0点になっても元台帳数を失わない。新しい本命欄にある券が旧flow由来なら、その由来を旧mainへ付け替えない。独立記事のproofはv9から版名だけ変わる一致を検査した。新規8件と既存47件が合格。

旧v9 rendererを上書き不能な新規ファイルへ凍結し、固定head df385b65の15依存のhashを登録した。既定はv9のまま。区分readerだけの互換更新では同じrendererでも依存hashが変わるため、復元はrenderer名だけでなく全依存の既知の組を照合する。旧v9・現v9の両方を再現し、両者の依存を混ぜたclaimは拒否する36件の復元検査が合格。リモートコードは読む/hash化するだけで評価しない。

自動承認レビューが「v10をnoteの既定publisherへ昇格する変更は、区分名と本命の意味を変える本人の明示確認がない」として拒否したため、その切替は実行していない。旧v9の既定とpublisher/source gateは保持している。本人には「本命＝保存厳選・追加候補・穴候補・参考予想」へ統一するか、旧名称を残すかを質問中。無回答を承認とは扱わない。回答後に既定renderer/sourcePayload/復元のcurrent版を接続し、本文・証明・成績をまとめて再検査する。

CIで見つかった起動順の1件は、query文字列の順序に依存した旧検査が新cacheパラメータを認識できない原因だった。ファイルパスの順序を照合し、共通モデルの先行読込と初期1回だけの読込を追加確認する検査へ修正。起動経路とモバイル起動検査が合格。関連57件と復元36件、憲章・13共有スキル一致・差分検査が合格。本番反映・note既定変更・予想精度改善は未完了。

コハクの独立点検で、v10候補側が保存selectionの矛盾・空・購入方針の確認不能を停止しない場合を再現した。note側でも共通contract.fromPredictionがselectedで、baselineの元順と一致することを確認するよう修正。3状態を追加検査し、アプリとnoteの停止条件を揃えた。旧v9既定への影響なし。v9のテスト用コードは既存の大きい歴史fixtureを変えず、新しい `scripts/fixtures/note-recovery-v9-code.json` へ分離して保持する。

## Dの10件追跡と画面切替の修正

[現方式partner-forwardの原本追跡](partner-forward-current-case-audit-20261116.md)へ、DがBの喪失を防いだ7件・Dでも失った3件のレポート位置と代表3原本のSHA/保存理由を記録した。研究B/Dは本番v1.3と異なり、本線・流し・123/124の保護と全3位置の根拠条件を維持していない。Dでの3件の喪失を本番保護の不具合と扱わず、研究Dをそのまま採用しない。

CIの旧DOM fixtureを新しい描画root照合へ合わせた際、旧レースの予約済み描画frameが新レースの更新予約も抑止し、旧frameを破棄した後に新レースのオッズ更新が残らないケースを再現した。予約frameの世代が古ければ現在のrootが有効なときだけ更新を次frameへ渡すよう修正し、古い値を描かず新しい値を反映する回帰検査を追加した。共通表示の旧/現状態、起動順、券理由・非同期オッズ、Edge実ブラウザearly/lateも合格。アセットcache版を上げた。本人の区分選択は未回答のまま、note既定v9は保持。

## 正式な頭と、保存厳選に含まれる頭を分けて再集計

現指紋のall-race-note924R（10/28〜11/15、元監査SHAは同じ）で、**全924Rに1号艇頭の券が含まれていた**。1頭のみ110R、他の頭と混合814R。正式頭1は260Rで、正式頭が2〜6の664Rにもすべて1頭券がある。正式な主展開の頭の件数だけでは、保存厳選の偏りを評価できなかった。

保存8,262券のうち1頭は3,681券。123は786R、124は751R、両方は669Rに含まれていた（この段落のみ123=1-2-3と略記）。正式頭が厳選から消えたレースは0R。公開receiptを確認した924記事や実購入の推奨924件を意味しない。

1券100円の仮想配分を、保存券の頭で分解した。新しい選定や買い目の削除・補充はしていない。

| 保存券の頭 | 点数 | 仮想投資 | 払戻 | 回収率 | 最大1件払戻 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1号艇 | 3,681 | 368,100円 | 260,780円 | 70.84% | 7,760円 |
| 2〜6号艇 | 4,581 | 458,100円 | 479,230円 | 104.61% | 83,710円 |
| 全体 | 8,262 | 826,200円 | 740,010円 | 89.57% | 83,710円 |

2〜6頭の損益+21,130円より最大1件払戻83,710円が大きい。異なる投資配分の記述統計であり、同予算の代替選定・未使用期間での改善実証・今後の利益の根拠にはしない。

再現のため固定ベンチマークCLIへ、正式頭を示すmainHeadsの意味、selectedHeadCoverage/selectedHeadAllocation、generationとsourceを同時に分ける集計を追加した。全券・投資・払戻・的中の保存則と、未知の正式頭・壊れた配分証拠の拒否を検査した。作業artifactは `../artifacts/fixed-head-baseline-head-allocation-20261116.json`。予想コードと元監査は不変。

### 入力側から選んだ代表1件

結果を見ずにescape.scoreが最も低い保存例を選んだ。20261101-02-2（戸田2R）、selectedAt `2026-11-01T02:04:43.623Z`、sourceSHA `0cff0b53175acfe1544d86d36817007dd8e97991d90b55de0fc6228288251a40`、blob `8abe908c245e6ae86ed5bfa306de03d886db9a28`。ミナトが本文SHA・時刻・sourceCommitを照合し、もう1候補の本文は取得していない。

正式頭/mainSheet頭は3、threeAttackスコア90.2。escapeは頭1・スコア37.2。内部評価点を的中確率と扱わない。保存10券は3頭が315/325/316/321/326、1頭が123/124/125/126/134（この段落のみ3桁略記）。

- 123/124は元coverの通常押さえ枠。
- 125/126は元coverの候補補完。priority95は2号艇hold枝95の最高点から来ており、1号艇alternate-head枝は77。125のpickup枝92、126のpickup枝83。priority95を逃げの強さと解釈しない。
- 134は3コース攻め時の固定救済。最終index9で312を1対1置換し、3頭6＋1頭4から3頭5＋1頭5になった。実コードは点数維持で作用し、名前にfixed5があっても5点専用条件を持たない。

確認できた経路は、主展開の2着候補から対抗を選ぶ→対抗1を押さえの頭へ展開→本線3/押さえ2確保→役割最高点・全3位置の候補補完→展開名に応じた固定救済。escape.scoreとは別の条件が重なって1頭が増えている。最終134の枝・役割配列は空で、採用の保存証拠は救済metadata。旧134候補の部分根拠を全3位置の根拠に読み替えない。37.2等を新しい閾値にせず、採用・本番変更は行わない。

6艇の公式進入と平均ST/展示ST/展示タイムは保存されていた。展示は3=F0.02、4=F0.03、5=F0.01、6=F0.06。別系統の一周・回り足・直線は未取得で、他場名を持つunsupported素材はSOURCE_METADATA_UNAVAILABLE/unknown/affectsPrediction=falseとして隔離されている。公式の足根拠へ使わず、通常6艇展示まで別場だったと断定しない。

## 展示F/Lを落とさない共通説明

上記原本の確認から、共通説明が展示STの数値だけを整形してF0.02を0.02と表示する経路を見つけ、修正した。保存済みexhibitionStartMarkerとstartExhibition.markerの一致を確認し、F/L付きのまま表示する。記号の欠測・矛盾・未知値や、二重保存STの不一致は数値をきれいなSTとして表示しない。値不明を0.00に変換しない。平均STは独立して保持する。

元の大村派生fixtureでも正本から記号・startExhibitionを復元し、5/6号艇のFを保持した。元原稿は変更していない。Node/ブラウザVM一致、戸田の最小投影、欠測・矛盾・L・符号の検査と、Edgeの実カードでF/Lが消えず券集合も変わらない検査が合格。Fなら主展開未確定とする独立研究の規則を通常AIへ移植せず、予想・score・採用条件は変更していない。

## CI実行環境とキャッシュ照合

旧head052100fのmobile CIは、ubuntu-latestが26.04へ移った環境で、固定したPlaywright1.55.0のWebKit依存を入れられず停止した。同版の[公式nativeDeps定義](https://github.com/microsoft/playwright/blob/v1.55.0/packages/playwright-core/src/server/registry/nativeDeps.ts)でUbuntu24.04の対応を確認し、このjobをubuntu-24.04へ固定した。ブラウザ検査を削除・skipしていない。

同headのcharter jobは、load-performance内のprediction-runtime URL文字列がvパラメータ先頭を前提としていたため停止した。実際のscript要素のvをURLで読むようにし、readerキャッシュパラメータの順序と独立して世代を検査する。構文と実indexを使う当該cache照合はローカルで合格。履歴データを必要とするload-performance全体とUbuntu/WebKitの実実行は新head CIで確認する。


## 本命の見直しに対する本人承認とv10接続

本人が「本命は変えていい！」と明示承認したため、上記の区分選択待ちを解消した。新規記事のv10既定、source本文照合、公開proofと成績元分類、旧v9復旧を接続する。通常AIは保存厳選を本命として一度だけ示し、アプリと共通contractを使う。独立記事は旧本文を保持する。過去原本・元券・成績台帳は不変。予想ロジック改善の実証、本番反映、最終headでのClaude Code受領は別に確認する。

独立レビューで2点を追加修正した。参考元台帳と本文が異なる場合は、アプリと記事の全区分・券集合・参考元数/重複数/公開数/全体数を照合して停止する。旧v9に加え、PR中に互換検証したv9の完全な15依存組も固定し、旧/互換v9とv10は復旧可能、組を跨ぐ混在は拒否する。大村11Rの実原本SHA978627238536aa03c7073ab09bd0c1e0987690f8ce6daa63794837d8fa844e81を元監査へ通したプレビュー（`omura11-readable-v10-preview-20261116.txt`）は本命7・追加13・穴17・参考4点で、全区分がアプリと一致した。未公開の確認例であり、当時の予想・原稿は変更していない。

Claude Codeはhead890b9a0と本人承認を実受領し、同じPR/contractを使い別実装を作らないと返答した。その読取確認点に対応し、保存済み購入判断がない場合も既存selectorのpurchaseDecisionだけを読み、アプリと同じ壁の購入見送りを補完する。券の再選定はしない。旧UMDのglobal登録は元の属性状態まで復元し、初回/キャッシュ済み/未定義/明示undefined/window環境を検査。current v10の復旧依存にその既存policyコード指紋を追加した。価格はすでにv10=0円で、公開元テストも確認済み。最終変更headの追補共有とCIは別に記録する。

保存済みの未知purchase statusも、再計算せずアプリ・記事の共通contractで確認中へ停止する。default source gateの実壁条件、初回/キャッシュimportと元globalの復元、既存判断の再計算禁止、current policy依存の改竄拒否を含む93検査・起動3検査が合格。共有cacheを20261116-3へ更新し、実Edgeの390px・early/late描画も合格。大村実原本の7/13/17/4点は追加照合後も同じ。選定ロジックとcore予想は変更していない。


## 候補補完の位置別priority診断（選定不変）

`scripts/promotion-role-priority-diagnostic.cjs` と既存 `practical-selection-evidence.capture()` を接続した。最終AのcandidatePromotion行について、保存された単一のselection観測と値が一致し、同じscenario/source/kindのqualifiedな役割枝が1・2・3着へ一意に対応する場合だけ、各枝のpriorityを診断する。記録されたpriorityと位置最大値は別に示す。branch priorityは逃げ確率やrole.scoreではなく、これを頭優先・最小値優先などの新順位へ変換しない。

最終行のbranchIdsはenrich時のvalidBranchIdsと照合し、元のinputBranchIdsと同じだとは仮定しない。観測の重複除去はstageをkeyに含まないため、値の一致は、昇格時に消費した観測IDや昇格時刻の証明ではない。通常のphysicalCoverageはevaluationId/boatNo/position/roleの4fieldで、保存されていないscore/branchIdを補完しない。存在する値の矛盾・複数対応はunknown。

baseline・最終selection・validationの原順が異なる場合、invalid経路、曖昧な観測、欠測、複数役割を分離できない枝、救済前snapshotはunknown。旧snapshotをunwrapして最終Aの完全根拠へ昇格しない。出力はKEEP_A・alternativeTickets:null・rankingProposed/usableForPrediction/automaticApplication=false。診断の例外・誤用途・JSON循環はcapture-errorへ分離し、元予想の保存を止めない。過去原本のbackfillは行わない。

新sidecar `promotionRolePriorityDiagnostic` のdiagnosticCodeSha256は診断moduleとcapture投影コードの組を指紋化する。予想方式の指紋は引き続きb36ecb0212d212af85ce977322a0a799774265c4bc6152ef82d4d1123c7586b5で不変。専用17件＋保存接続4件が合格し、既存の34種類の合成fixtureで選定全体が旧moduleと不変、既存の全レース収集fixtureも合格した。

これは診断の実装とfixture検証まで。新規実レースでのbound/unknown比率、未使用期間の順位比較、精度改善、本番稼働は未確認。次は、同じ締切前原本から何件の位置根拠を一意に読めるかを確認し、不足する保存契約を明らかにする。100Rの収集自体を目標にせず、過去の結果に合わせた閾値や重みの調整はしない。

独立レビューで、旧projectionがdiagnostic属性を落とすと新診断の救済前マーカー拒否が無効になる例を再現・修正した。旧証拠の形は変えず、新sidecarへ渡すguard用の存在情報だけを保持する。元Aと旧投影が同じでも診断はunknownに止まる統合検査を追加した。


## a15f2ec3の後発CI不備への対応

a15f2ec3のCIは58件中49成功・6失敗・3取消で終了した。失敗6件の原因は4種類で、cache alignmentの同じ原因が3jobに現れた。formation-displayのindex照合はquery順に依存していたため、実URLのpath/vを検査するよう修正し、保存fixtureを使う検査全体も合格。cache-test-alignmentは旧literal generation blockだけを認識し、現在のscriptVersion版を未対応としていたため、旧8世代の移行と現在版の再実行不変・重複拒否を保って対応した。

成績画面の2つの404は、JST日付が翌日に変わってまだ存在しない20261117要約を要求していた。統計応答やアプリは変更せず、実保存要約と結果の共通日付へブラウザDateだけを固定し、その実結果ファイルをCI sparse checkoutへ追加する。console errorを無視しない。[固定版PlaywrightのClock.setFixedTime](https://github.com/microsoft/playwright/blob/v1.55.0/docs/src/api/class-clock.md)はDateを固定してタイマーを進行させるAPIで、待機・watchdogの検査を残す。

同じ成績harnessと改変していないHEADの実データをEdgeで実行し、43採用/40詳細の照合、初回/再入/連打/遅延cold navigation、390px幅、console errorなし・404なしが合格。local artifactは ../artifacts/stats-mobile-edge-1794844563039（元reportの固定WebKitラベルを実WebKit確認へ転用しない。edge-run-metadata.jsonでEdge置換と元report SHAを明記）。Linux/WebKit全体は新CIで別確認する。


post-predictionの実画面検査では、旧bright organizerが共通カードの本命点数を全券数で上書きし、空の旧区分を追加していた。共通markerのあるカードではこの3つの旧変換だけを止め、markerなしの旧表示は維持した。導入文も共通contractの確認済み説明を使い、未確認時に古い展開文へ戻さない。bright assetのreader cacheを20261117-1へ更新した。

実bright JS/CSSを読み込むNode DOM統合とEdge early/lateが合格。本命7・追加13・穴17・参考4の全区分、本命見出し7点、外来区分0、原順/原本不変、開閉維持、見送り/空/確認中を検査した。WebKit診断は既存の厳密な本命点数検査を残し、外来区分0も必須にした。コハクが診断/captureとCI修正、bright関連5ファイルを独立点検し、指摘修正後の重大指摘なしを確認した。4種類の原因への修正はローカル検査までで、次の固定headのCI成功、Linux/WebKit、本番確認には転用しない。


## 保存原本の可読性とCI取得範囲の追加確認

元の大村11R原本SHA978627...を変更せず読み、純粋診断を実行した。候補補完1-3-2はselection観測index4に一意に一致し、1/2/3着priority94/74/87、最大は1着だった。戸田の2着最大の例をすべての1頭補完へ一般化しない。結果・払戻・候補再生成・select/capture再実行は使わず、元JSONと券は不変。作業artifactは ../artifacts/promotion-role-priority-saved-read-omura11-20261117.json。過去原本へ新sidecarを追記したものではない。

10/28〜11/16のnote原本2455blobを、暗黙fetchを無効にしたローカル在庫で確認したところ、本文があるのはこの1blobだけだった。2455件の本文を検証した意味でも、全体のbound率でもない。原本の不足を再生成で埋めず、今後の比較で必要な候補母集団と保存契約を先に確定する。

e32f9a44のCIでは4jobがテスト前のcheckoutで10/12分の上限に達した。3jobは全blobのfetch、1jobは18447ファイルの展開42%で停止。対象はformation display、final display activation、third-place 1-2-4 rescue、mobile startup terminal。タイムアウトを伸ばしたり検査を外したりせず、それぞれの実依存を含むsparse checkoutへ限定する。[actions/checkout v4公式実装](https://github.com/actions/checkout/blob/v4/src/git-source-provider.ts)はsparseCheckout指定時にblob:noneでfetchするため、データ全量の取得と展開を避けられる。新固定headでのCI完了は別に確認する。


実Gitのsparse check-rulesでHEADの18443 tracked pathsを検査し、formationは全non-data1926＋指定2file、他3workflowは全non-data1926だけになることを確認。省略dataへのFSアクセスを禁止した状態で、4workflowの既存Node構文/検査47コマンドが合格した。追加checkout設定以外のtrigger/run/timeout/failure artifactは元と同じ。コハクも4検査と差分を独立確認し重大指摘なし。専用YAML parserとGitHub上のfresh checkout時間は未確認で、新CIを省略しない。


## 補完順位の比較だけでは解消しない制約

現行candidate-only補完は、実キューをpriority降順→券文字列の同点順に並べた後、頭の実コースが2または4〜6なら購入対象外へ除外する（`js/practical-selection.js` のcandidateOnlyPromotionPool処理、理由code SECOND_COURSE_HEAD_CANDIDATE_PROMOTION_PRUNED / OUTER_HEAD_CANDIDATE_PROMOTION_PRUNED）。この補完経路で残れる頭は実1/3コースであり、通常の本線・独立展開まで2/4〜6頭をすべて排除する意味ではない。実コース欠測時の艇番fallbackも現行処理として区別する。

従って、補完の位置別priorityだけを並べ替えても、通常cover123/124・固定救済134・このコース除外は残る。全記事の1頭偏重を解消したとは言えず、現行保護を勝手に消す変更もしない。将来の改善案は、通常押さえ・補完・固定救済の効果を分け、頭の根拠を評価する比較条件を結果を見る前に決める必要がある。

ミナトの契約点検では、最終selected-only保存から非採用券との交換可能性や当時の同点順を確定できなかった。将来の補完直前に、選定原順/used/残枠、実キュー順/sourceCategory/priority/実コース/単一validation参照、採用/除外/満枠の処置、最終券へ至る後段変換を観測する最小snapshotが必要になる。既存役割枝/coverageを参照し、候補を再生成・再検証しない。仕様・期間・同点/未知時処理・比較コードSHAを先に固定し、未知はレース全体でA維持、比較不能も全対象へ数える。順位規則は未決定でA/Bは未開始。selector内の観測保存でも方式指紋が変わるため、旧b36群へ混ぜず、新指紋の将来A/Bとして遠隔封印と結果の事後結合を分ける。旧100枠は増補しない。これは設計条件の確定であり、snapshot実装・順位変更・採用ではない。


## 後発の同一取得原因をまとめて解消

e32f9a44ではさらにpair31/pair32/third-place14の3jobも検査前のfetch・展開中に10分で中断した。別の5つのsource/browser jobもcheckoutに10分以上滞留していたため、実際の読取依存を調べて取得範囲を合わせる。UI audit/theory adoptionは保存data不要。theory weightは20260807〜10の4予想JSONと、module初期化で読むracer-skill-patterns.jsonを保持する。WebKit2本は外部の歴史レース入力だけでなく、app起動時の当日/過去7日summariesと条件付き当日resultsも必要なため、summariesとJST当日/翌日の結果を保持する。翌日は日付跨ぎ用で、実在しない結果は元と同じ404のまま扱う。

全履歴を実際に読むcandidate24-report/improvement-proposalの取得対象は狭めない。テストに必要なdataを合成して成功へ置き換えず、workflowの判定や時間上限も維持する。新headでの実取得時間・WebKit全体は別確認とする。


固定remote0c2の実原本4日JSON・skill・既存parserを、HEADのGit blob一致で照合してローカルへ復元し、残っていたtheory integrationとcandidate90 regressionも合格した。後者341Rは既存の固定回帰fixtureであり、今回の新方式・未使用期間の改善実証とはしない。原本を生成し直したり、異なる既存内容を上書きしたりしていない。

旧e32のreview WebKitは実API→選定→描画まで進んだが、旧visual helperの区分数4固定が0区分へ一致せず失敗した。CI画像は「買い目を確認中・購入推奨0点・保存買い目の整合性確認中」で、購入見送りと断定しない。新検査は描画イベントの完全な入力から共通modelを凍結し、status/reason/error・全区分/券集合/本命数・0点状態を照合する。modelの整合エラーが出れば、その原因は表示の旧前提と別に追跡する。


実API＋実appのEdge再現（../artifacts/review-real-edge-1794848572426、engine置換だけのmetadata付き）では表示検査が完了したが、modelはunavailable / reader_contract_center_membership_missingだった。原因は保存厳選9券の末尾1-2-4が、既存four-kado救済で2-1-5と1対1置換された正規券なのに、新共通表示がpool外の独立展開以外を拒否するため。0点画面の検査成功を、有効な買い目が出た成功としない。元の救済仕様・選定券は変更せず、その既存変換を厳密に照合して表示できる接続を修正対象にする。

対照として戸田2Rの既知原本も、固定SHA0cff0b...一致で ../artifacts/toda2-immutable-source-0cff0b.json へ別保存して確認した。record側の候補検証証拠はinvalid-or-unavailableだが、既存diagnostic wrapperに置換前snapshot・単一変換metadata・置換後の原順がすべて保存されている。これを最終券の全3着資格証拠へ昇格させず、既存の明示1対1変換を表示するprovenanceだけに使う。原本側へ新しいsidecarや欠けたmetaを後付けしない。


0c2cb90aではlive race selectionのfetch時間切れとreadonly assignmentの取得＋検査時間切れも実ログで確認した。前者は全non-dataのみ、後者はload-performanceが全予想archiveを照合するため全data/predictions/を保持し、その他dataを除外する。ref/fetch-depth0/既存hotfix条件/時間上限/判定は維持。省略data禁止付き既存23コマンド完了後、Git一覧の出力バッファだけを拡張して選択照合を完了した（実行済み検査は繰り返していない）。tracked18443のうちlive1926・readonly2330＝non-data1926＋予想data404。load-performance全体は新CIで確認する。


戸田の134は元4pool内にも存在し、旧v9のsourceSubsetでも従来どおり受理されることを確認した。従って戸田を旧拒否の実例とはしない。新off-pool guardの実例は上記review入力の124で、戸田は保存wrapper/metaと元10券保持を検証する対照例として区別する。


救済表示の接続後、実API Edgeで元9券（末尾124）・追加12・穴15が320/390/1024px、開閉/keyboard/Back/6艇色まで復旧した。off-poolだけに追加proofを限定し、旧in-pool134はsidecar欠測でも従来受理を保持する。保存proofはrecord側の方式/事前mode/結果未使用の一致も確認する。独立レビューで、旧off-pool独立展開のコピー間family矛盾が通る退行を再現して修正し、別頭/残しの一致正例と3コピー個別の不一致負例で停止を確認した。元v1〜9・selector・元監査・原本は変更していない。


最終コード指紋を含む実API Edge再確認は ../artifacts/review-real-edge-1794850121332。元9券・追加12・穴15でselected、全幅/開閉/Back等が完了、pageErrors0。存在しない当日summaryへの404は従来どおり2件で、Linux/WebKitや本人iPhoneの確認とは分ける。artifact内のreader/note/index/loader/診断helper指紋は最終内容と一致した。関連60契約検査と旧/現復旧37件、憲章と13共有スキル一致も合格。実大村原本は元監査contentReady=true/canPublish=falseのまま7/13/17/4、実戸田原本もcontentReady=true/canPublish=falseで10/6/16、両原本不変・未公開。予想method指紋b36ecb...は不変。新固定headの全CI・本番・実iPhoneは未確認。


## 実appとnoteの展開説明を同じ公式入力へ接続

実APIのnormalized raceにはpreRaceConditionsがなく、practical-selectionのverification projectionにはattackerCourseが残らないため、同じ9券を表示できてもappの説明だけ中立文になっていた。既存prediction-conditions.captureと、同一APIにある公式6艇の進入・ST/marker・展示タイム、既存mainScenarioの明示attackerCourseを表示copyだけへ渡す。normalized entryのboatは統計objectなので、既存captureへは同じ入力のraw APIを渡し、normalized側とrace/艇/公式course/明示値の一致を先に検査する。capture本体・selector・collector・元保存原本は変更しない。

main-cover boundaryは先に元入力そのものをresolveSelection/purchaseDecisionへ渡し、表示copyへprojectionを適用する。元policyの再計算や表示fieldの選定への逆流を防ぐ。元preRaceConditions/scenarioの明示null/undefinedを上書きせず、raw/normalizedの不一致、未明示marker、不正数値・courseは説明だけ中立へ止める。空白・bool・nullを0へ変換しない一方、明示0や正当な数値文字列、F/Lは保持する。歴史reviewのcopyにpre_deadline・sourceTiming・結果未使用の新しいclaimは追加しない。

ワカバが共通projectionとfixtureを担当し、コハクが独立レビュー。raw明示ST0とnormalized false/空白/nullの数値同値化も再現して修正し、capture呼出0・中立・入力不変を確認した。最終shared SHA6a8f15985c040be070677606aa369177dce7dd64703f9e1a506853dfe3d45b72、boundary SHAd2111bff9cd28b83238e138106b8268ea7431c20df4cb70ff3c5f745a78e2920。関連6fileの117検査、13共有skill一致、憲章が合格。予想method指紋はb36ecb0212d212af85ce977322a0a799774265c4bc6152ef82d4d1123c7586b5のまま。

最終コード指紋と一致する実API Edgeは ../artifacts/review-real-edge-1794853852331。元の本命9・追加12・穴15、説明verified=trueで4カド攻め/平均ST0.12/展示F0.02/展示6.76秒/隣5号艇0.01を同じ共通modelから表示し、320/390/1024px・開閉・keyboard・6艇色・Backを完了。390px画像も確認。pageErrors0、未作成の当日summaryへの404は従来の2件。Edge確認をLinux/WebKit・実iPhone・本番反映へ読み替えない。

1cdcのCIは61件中57成功・1失敗・2取消・1skip。WebKitのBack失敗はrace画面の非同期reset前に予想tabへ戻り、既存intent guardがresetを中断したため。app本体を変えず、race画面で旧card消去・loading終了・選択済race・fetch可能を待ってから戻る。既存の0card/status/overflow/focus検査は保持し、上記実Edgeで完了。readonly assignmentの取消は全履歴fetch中の10分経過だったため、同じ必要prediction全archiveを残し、event固定head・depth1へ変更する。対象検査に履歴依存がないことを独立確認した。candidate24 reportの取消は全必要原本のcheckout中15分経過で、検査未実行。必要原本を減らさず、新固定headの取得・全CIを確認する。

これは説明と検査導線の不具合修正であり、本命偏重の解消・精度向上・公開完了ではない。次は確定済みの最小promotion実キューsnapshotを実装し、過去原本へ後付けせず、同点数で順位候補を比較できる将来証拠を保存する。順位・閾値・採用は未変更。共有dev skillの両版へ表示projectionの再発防止手順を追加し、個人版更新とは区別する。


## 補完の実行時snapshotを原本へ別保存

selectorの実candidate-only loopでcandidatePromotionExecutionを観測し、既存captureがcandidatePromotionExecutionEvidenceとして不変note/source原本へ別保存する。補完直前selected原順/used/残枠、重複を保ったqueueIndexと元candidateIndex、元priority/sourceCategory、実際に消費したvalidationの完成observations参照、採用/コース除外/満枠の実処置、補完後からselector finalへの実変換と既存参照を保存する。stageを除くdedupを考慮し、WeakMapの消費参照を完成配列へ解決して値を照合する。役割/coverageは既存参照を使い、複製や再資格判定はしない。

満枠判定はコース判定より先なのでcourseEvaluated=falseのまま。評価した場合だけformal/mapped/lookup/effective/艇番fallbackを区別する。selector後の既存救済は、厳密mismatchDiagnosticで認定済みの1対1変換参照だけを付け、元validationを最終券の資格へ昇格させない。日次compact・review縮約はこのqueueを保持しないため、将来比較はSHA固定の不変note/source原本を正本とする。

コハク独立レビューの2件と親の1件を修正。helperのthrow/不正戻り値/循環/toJSON差替えはwrapper内のflag/shape検査とJSON cloneでunknownへ隔離し、A保存を止めない。weakTwoHeadTrimは既存candidateDecisionsのselected=false WEAK_TWO_HEAD_INDEPENDENT除去集合と原順削除結果を照合する。追加course/Map読取も観測try内へ移し、元courseOf/ORの判定は維持。KEEP_A/alternativeTickets:null/rankingProposed・usableForPrediction・automaticApplication=falseを固定し、旧原本に観測を後付けしない。

親担当の最終関連統合153件と、旧selector429663f3に対する既存34fixture全戻り値比較（追加sidecarだけ除外）が合格。旧候補validation形も保持した。専用fixtureは既存outer-attack-live-source/note-draft-bundleの保存・同じ原本pathへの再保存一致を含む。4行queueはselector metadata2504B/保存sidecar2803B/record純増2842B、6行queueは3276B/3647B/純増3686B。これらはfixture計測で実運用の母数・bound率ではない。日次候補検査はローカルapi/schedule.js欠測、保存shell検査はbash欠測で開始不可のため、新CIの成功へ置き換えない。

新method指紋は50b3ddcc4406fd549d0bd6016b41a8afa7c7714265a93e2845f2ccdfea7d0e11。券の選定が不変でもselectorコード観測の追加で旧b36ecb群とは分ける。snapshot組の識別SHAは12c4a1b75ab69be37a063c6893898c711308d9c83ae3c27cd3d6e74c568bc11c。新しい順位・閾値・比較候補・前向き封印・採用は未開始で、旧partner-forward B/Dの完了100枠へ足さない。次は候補比較規則と未使用期間/同点/未知処理を先に固定し、同点数の将来比較を行う。通常cover123/124・固定134救済はこの観測追加で変わらない。

## 実WebKit確認と原本二重取得の削減

aafaec078a2e68a15d78de5fadd8bc37e0aec105の実Linux/WebKit run43930331278/job133520711376が成功。artifact14258182307のZIP SHA9d72c786d6db542172088f35266c8798f14c0e79241548ff06d232d70ec42fd9を照合し、reportの同head、本命9/追加12/穴15・説明verified=true・pageErrors0・Back後旧card0を確認した。これは当該headの証拠で、新しいselector観測差分のCIへ転用しない。既存collectorのcapture+compactVerificationEvidence/mergeCompactScenarioを実入力へ読取VMで適用してもapp/noteの説明は完全一致・原本不変だった。Claudeの説明差確認点はこの保存経路で解決し、旧原本への補完はしない。

aafaのreadonlyはdepth1 fetch自体は約0.5秒で完了したがcheckoutに10分かかり取消。GitHubのHEAD tree metadataで予想data404blob計8,492,253,825B、日次raw109件7,632,968,117B、archive/meta84組846,782,139Bだった。load検査は全archiveを既存処理で容量/SHA/JSON検査してrawへ復元してからindexを組むため、archive-backed84日のrawを先に二重取得する必要はない。全archive/meta/派生を残し、非archive25日のHEAD rawだけを追加sparse取得する。必要な元109日の集合と検査/timeoutを維持し、8,492,253,825→1,537,668,088Bへ取得対象を減らす。archiveの片割れ・破損は従来のrestoreで失敗する。

実Git check-rulesでtracked18445からselected2248、全非data・全archives・25直接原本保持、109=84復元+25直接の集合一致を確認。tinyGit fixture ci-sparse-fixture-1794855102433でworkflow内の同じNodeを実行し、2段階のsparse追加、非archive原本/片割れ保持、archive保持、二重raw不取得を確認した。ミナトも2workflow差分と依存を独立確認し指摘なし。candidate24はPRだけに適用し、mainの保存/rebase/元取得経路は維持する。実全loadとfresh checkout時間は新CIで別確認する。

同headの成績WebKitは43採用/40詳細・表示/再入まで完了したが、2件のHTTP500によるconsole errorで失敗した。取得先が旧diagnosticsへ残らなかったため、response URL/statusとconsole locationだけを追加記録する。元のconsole error 0条件は緩めず、HTTP500を成功へ読み替えない。実appの表示API修正とは別に次CIで発生先を確認する。

コハクが上記3点を最終SHAで独立再確認し、専用17件と既存capture検査に合格、重大指摘なしを返却した。循環戻り値と偽weak trimの独立再現も解消。これは診断の隔離・参照一致の確認であり、新順位や本番採用の承認ではない。


## 旧研究referenceテストを現在コードから分離

deeの新CIは旧head-coverage traceの13件中7件がFrozen candidate fingerprint mismatchで停止した。reference環境が現行selectorをコピーして旧固定fingerprintを宣言するため、観測metadata追加で不一致になっていた。旧candidate/config/report/指紋を現在版へ更新せず、ec7dea6bの実旧selector blob a9fc452ddc68317c92036e642575b25939885afa、151950B/SHA25090fb7546020fd5e5a40477755363d12cefb69334e8587212d0045346dd0abを完全一致のテスト専用fixtureとして固定し、reference環境の生成とsource manifestだけに使用する。現行sourceを使うobserverテストは既定入力のまま、改竄拒否・unknown分母・原順mismatch・全出力非干渉の条件を維持する。

ワカバ実装後、コハクが旧blobとの全byte一致と現行/凍結の分離を独立確認し重大指摘なし。親も13/13・skip0を確認した。fixture変更が既存2workflowを起動するpathだけ追加し、テスト/閾値を変えない。本番selector/capture/helper・method50b3は変更せず、旧研究の成績再評価や新順位採用ではない。新headの全CIは別確認とする。


## B1の比較条件・開始前登録・締切前commitmentを実装

候補補完のpriorityに1着以外の高値が影響する仮説を分離するため、B1を1着の保存役割枝priority降順、同点は実queueIndex順へ固定した。元90ゲートは位置別最大priorityのまま、前選定/used/最大10点/実1・3コース購入条件を保持する。役割抽出は実validationRefを直接読む共通resolverを追加し、selected-only診断へ偽の昇格行を渡さない。Aの実処置と原順再現、全6艇公式map、全queueの同scenario/source/kindで一意な3位置枝・元priority最大一致を前提とする。欠測/曖昧/重複/不一致は全レースB=A、後段transformは非適用、不正Aはineligible。通常coverと固定救済は変更しない。

純粋比較器と外側の原本byte照合/登録/封印/終了後reportを分離した。sourceReferenceVerified=falseの比較器を、原本SHA/filename/identity/展示/audit/方式/A原順三者を照合したenvelopeのsourceBytesVerified=trueと区別する。新protocolHash a1058b95a4d93b7dec2ce30952b2b5ca92e2bc9d284bd8d0cbae8903591822d7、比較4path組de600cb18dc106cdbfff4babbad12a3f3ac1efa0c1f6b2f0cf15e1a7691b7716へ固定。method50b3と実観測組12c4は不変。新resolver追加により診断moduleの組SHAは変わるが、既存診断本体と意味は維持する。

期間は未使用の2026-11-19 00:00〜2026-12-03 00:00 JST。開始前remote登録の存在を必要とし、登録欠測ならblockedで期間を延長しない。レースはsourceSHA付きA/Bを締切前に封印し、最初の有効remote confirmed sealを採用する。期間終了前のreportはresultsLoaderを呼ばず進行のみ。終了後だけ公式結果で同点数・1点100円の仮想投資を集計し、追加/消失的中・日別・最大払戻依存・unknown/返還/結果待ちを区別する。母数は全封印・有効A（unknown/非適用含む）。非封印や全開催coverage、全runのinvalid/late累計は未集約をnullで示す。adoptionGate null/予想利用・自動適用falseのまま、新順位の本番採用や精度向上の実証ではない。

コハクはremote artifact metadataだけではlocal snapshotをアップロード後に差し替えられる重大例を再現した。全snapshot原文SHA/nameのcanonical sortedunique manifestをartifact immutable nameのSHA末尾へcommitし、sealのGET前後で全out集合を再計算、receipt/validSeal/reportでも全manifesthash・個別membershipを検査するよう修正。登録とrace双方で置換・追加・削除・改名・改行byte変化・部分集合・重複を拒否する。ZIP包含を確認したとは称さずarchiveContentsVerified=false/remote-hash-commitmentを明示。公式仕様の根拠と前提は専用protocol文書に記載した。コハクが旧B差替えを独立再現しartifact_identity_mismatch/封印0へ停止、15専用検査と固定hash一致、重大指摘なしを確認。

親の最終関連統合64/64・skip0、通常note UI引き継ぎ33件、憲章/13共有skill一致が合格。source writerは新race/registration pathだけ許可し、既存の同時更新・元byte一致・無関係path拒否を保った。Windowsの一時worktree改行変換で初回byte不一致になったため、process限定core.autocrlf=falseで厳密条件を維持して再実行し合格（global設定なし）。workflow保存回帰はsandboxのMSYS起動を許可した再実行後にbash未検出で停止したため、ローカル未完了として新CIで確認する。

接続の独立レビューでは、live-noteのsparseにtestsが欠け新検査前失敗となる点と、新研究failureが既存研究をskipする点を修正した。testsを取得し、新saveはid/continue-on-errorを持たせ、新failure報告を既存全証拠保存後のjob末尾へ移動。実tinyGitのconeで17dirs/必要8pathを確認し、無関係data省略・公開handoff先行・旧証拠保存後の新failureを検査。コハクも2点解消・重大残件なし。既存cron/通常記事/旧台帳/既存研究規則を変更せず、報告は別statsへ保存する。実CI・開始前登録・実レース遠隔封印・本番/iPhoneは未確認。


## 全原稿保持による集計OOMを解消

7fのcandidate24 run43936962639/job133556759601は、取得削減・非archive25日追加・3既存検査・全84archive復元・最大24点reportを完了したが、build-race-review-progress.jsでNode既定約2GB heapのOOMになった。mainが全note recordの巨大predictionをbundles配列に保持し、日付抽出と集計でassessを重複実行していた。対象レース・元原本・メモリ上限を変えず、1原本ずつassessして最新の集計用rowと除外数だけを保持するprepare/buildPreparedへ分離した。

public buildProgress、assess本文、元cohort会計・出力body、最新/同時刻tie、generatedAt評価時点、結果/ledger処理は維持。日付集合は有効race identityにより同じになる。旧関数全文をhash固定したoracle（Git履歴fetch不要）で全report一致、108原本226855956Bを64MiB child Nodeで全走査してcaptured24/audit除外12、出力全bytes一致・全原本SHA不変・再実行generatedAt維持を確認した。コハクも旧関数との一致・3file・workflow追加を独立確認し重大残件なし。新memory検査を既存candidate24のpath2/run1へ追加し、元の全量検査・時間上限・判定は保持する。実長期原本でのOOM解消は新固定head CIで別確認する。

当初PATH上のbash未検出で未完了だった保存検査は、同梱Gitのsh.exeがGNU Bash5.3.15本体であることをversion確認し、テストprocess内でbashの実行先だけそのbinary/argv0=bashへ向けて完了した。scheduled analysis regressionとreview-report-saveが合格し、実Bashで元shell/判定をそのまま実行した。global設定や本番コード、検査assertは変更していない。ログは ../artifacts/head-priority-scheduled-workflows-bundled-bash-20261117.log と head-priority-review-report-save-bundled-bash-20261117.log。ローカルapi/schedule欠測の既知日次検査は未確認として区別する。

今回のB1比較器/forwardと集計修正は本番の券・順位・購入判断を変更せず、method50b3/観測12c4/比較組de600cb/protocolHash a1058b95を保持する。共有分析skillの両版を更新し、個人版更新とは区別。新headの全CI、開始前remote登録成功、実レース封印、期間後の比較成績、本番採用は未確認で、全体改善完了とは扱わない。
