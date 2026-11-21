# 頭役割priorityによる候補補完の前向き比較 v1

候補補完の順位に、2着・3着役割の高いpriorityが影響している。1着役割のpriorityだけで補完順を決める案Bを、保存された現行案Aと同点数・同賭金で比較する。頭役割priorityは確率ではない。この研究の対象は候補補完であり、通常coverと固定救済を含む全体の1号艇偏重の解消を意味しない。

## 固定する契約

正本は `config/promotion-head-priority-forward-v1.json`。方式は `50b3ddcc4406fd549d0bd6016b41a8afa7c7714265a93e2845f2ccdfea7d0e11`、実キュー観測組は `12c4a1b75ab69be37a063c6893898c711308d9c83ae3c27cd3d6e74c568bc11c`。比較コード組は比較器、役割値resolver、forward、既存execution検査helperの4pathを順にpath・NUL・bytes・NULでSHA256化し、configへ固定する。protocolHashはconfig原文bytesのSHA256。

対象期間は2026-11-19 00:00 JST以上、2026-12-03 00:00 JST未満（11月19日〜12月2日の14日間）。開始前にGitHub artifactの作成と確認を完了した登録receiptが必要。開始後の登録欠測はblockedとし、期間を自動で延長しない。旧B/D・旧100枠とは別の研究群とする。

## AとBの作り方

Aは締切前に保存した実厳選の原順を保持する。実補完queueを同じ順で再現し、保存処置・補完後・selector最終・保存Aが原順まで一致してからBを計算する。Bの順序は1着の保存役割枝priority降順、同点は実queueIndex順。元の90ゲートは位置別最大priorityに掛けたまま、前選定・used・最大10点・実1/3コースの購入条件を保持する。

実validationRefから、同scenario/source/kindの1〜3着の保存役割枝を一意に参照する。比較器は保存値を照合し、候補生成や役割の再資格判定を行わない。Bのコースは保存された公式6艇・6コースの一意mapを使う。Aで評価済みの行は同mapとの一致を確認し、Aで満枠未評価の行はそのまま残す。Bで計算した処置は別のbCourseTraceへ記録する。

欠測・曖昧・混合根拠・不正参照・非公式map・重複券・元priority不一致・A再現不一致・点数差はレース全体でB=A。後段trim/置換/救済があるレースも今回は非適用としてAを維持する。不正なAはineligible、A/Bはnull。unknown・非適用を有効な封印Aの母数から除外しない。

## 原本照合と締切前封印

純粋比較器のsourceRefはshape確認だけなのでsourceReferenceVerified=falseを保持する。外側のforwardが不変note-draft-bundleの実byte SHA、filename、race/time、展示/audit、方式、A三者の原順・重複なしを照合し、sourceBytesVerified=trueのenvelopeを作る。元ファイルは更新しない。

既存live-noteの公開引き継ぎ後にcapture→GitHub artifact→remote metadata確認→不変保存を行う。事前登録receiptはregistrations/<protocolHash>-<receiptSHA>.json、レースreceiptはYYYYMMDD/<raceKey>-<receiptSHA>.json。source全文は複製せず原本path/SHAと比較出力を保持する。artifactのid/digest/name/run/headを一致させ、HTTP Dateの秒精度の上限も考慮して、登録は開始前・レースは締切前の確認を必須にする。

capture時に全snapshot原文bytesのSHAとファイル名の一意なソート集合をcanonical manifestとし、そのSHAをartifact名末尾へ固定する。sealでは全集合を再計算してAPI取得名と一致させ、receiptとreportでも全manifestのdigest・個別snapshotのmembershipを検査する。追加・削除・置換・部分集合への差し替えを拒否する。これは締切前の内容決定を示す遠隔hash commitmentであり、ZIP内の実体包含をダウンロード確認したものとは区別する。SHA256の衝突・第二原像耐性と、artifact IDに結び付く公開APIの名前を前提にする。

[公式upload-artifact v4 README](https://github.com/actions/upload-artifact/blob/v4/README.md)はartifactをimmutableとし、削除・再作成は新IDになると説明する。[REST artifact API](https://docs.github.com/en/rest/actions/artifacts)の公開操作にrename/updateは見当たらない。未公開APIまで変更不能と確認した意味ではない。

同run内は最新selectedAt、同時刻はsourceSHA順。同じレースは最初の有効remote confirmed sealを採用し、同点はcapturedAt、sourceSHA順。以後の保存で都合のよいsnapshotへ入れ替えない。

## 集計と判断

期間終了前のreportは進行状況だけを示し、結果を結合しない。終了後に共通の公式結果契約で、1点100円の仮想投資としてA/Bの的中、追加的中・消失的中、投資・払戻・回収率・差額、日別、最大払戻への依存、unknown理由を照合する。結果待ち・返還等を的中や外れへ置き換えない。実購入成績と区別する。

母数は全封印・有効A（unknown/非適用を含む）。capture/sealのinvalid・lateなどは各runの原因countsに残る。未封印や全開催coverageの全run累計はこのreportで集約していないため、不明を0件と表示せず、全開催・全公開記事の成績とも扱わない。

採用gateはnull、予想利用と自動適用はfalse。比較成功・正の回収差だけを本番採用と扱わない。期間や順位を結果に合わせて修正せず、得られた改善要素と失う的中を確認して次の採否を別に判断する。

## 接続と確認の範囲

実装は純粋比較器と外側の登録/封印/reportを分ける。既存note・購入判断・旧研究会計を保持し、研究出力は別pathへ保存する。main反映、開始前登録成功、実レース封印成功、終了後集計、本番採用はそれぞれ別の確認段階として報告する。
