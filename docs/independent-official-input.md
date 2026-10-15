# 独立原稿の公式原文取得契約 v1

独立本命・万舟の判断に必要な公式原文を、既存 `api/race.js` の取得時点から失わず取り出す準備実装。予想生成、記事保存、公開、研究候補の採用はしない。

## 接続点と境界

`captureIndependentOfficialInput(target)` を `scripts/capture-independent-official-input.cjs` から呼ぶ。targetはJST日付、2桁場コード、1〜12のR、タイムゾーン付き締切。既存API handlerを1回呼び、従来と同じ出走表・直前情報・独自展示取得だけを使う。新しい取得ループ・cron・Work監視・有料AI APIはない。

APIの公開JSONにはHTMLを追加しない。`api/_official-source-capture.js` のWeakMapへ登録した同一リクエストだけを観測する内部接続であり、HTTP query/body/headerから有効にできない。未登録時は従来API経路のまま。原文の記録失敗は独立側で停止し、通常APIの予想材料返却を止めない。

新しいpacketは `independent-official-input-v1`。次を含む。

- `sources`: entry / exhibitionの実際の取得文字列、本文取得完了時刻、公式URL、UTF-8 SHA256。HTMLの空白・改行を正規化せず、解析値から原文を再生成しない。
- 日付・場・R・締切・capture時刻と、既存 `note-exhibition-v1` の6艇展示snapshot。
- 取得済みのentriesとstartExhibition。通常AI評価・候補券・historyContextはコピーしない。
- `automaticReady=false`、`publicationReady=false`。原文の存在やhash一致は予想判断の妥当性を証明しない。

取得前後ともJST当日・締切余裕120秒超を検査する。対象URL、ページ種別、本文hash、実取得時刻、6艇の実進入/ST/展示タイムを検査し、取得失敗・展示未完成・締切不足を別エラーとする。F/Lマーカーはそのまま保持し、素材取得の段階で独立販売用の新しい見送り条件を追加しない。

sourcesは既存 `monitor.sources` と同じ形。ただしpacketをそのまま `save-independent-monitor-note.js` に渡せるわけではない。次にChatが実際の原文を読んで8段階・6艇・採否を記録し、完成した元記事と元買い目を既存 `independent-monitor-note-v1` にまとめて保存監査へ渡す。200円、最大7点、種類別claim、公開URL・receiptの既存条件は変わらない。

## まだ接続していない部分

このPRは取得契約と単体/実handler境界テストまで。live-noteの既存onOfficialRaceへのpacket受渡し、期限内のChat判断実行元、完成原稿の保存接続はまだ追加していない。通常AI前の既存取得1回に接続し、別API取得を並走させないこと。PR #1318のcollector整理や別担当のhandoff保存復旧と重複しないよう、接続変更は別レビューで行う。

公式入力から旧Chat判断を再現する無人本番関数も未完成。既存の研究selector・flowStudy・partnerStudyの採用gateを解除しない。

## 旧Chat原稿から保持する検証例

以下は保存済み原本の参照fixture。過去原本へ構造化判断を後付けせず、結果を使った再生成・前向き成績への算入もしない。基準mainは `f13db4976e74ec3b92b92144dc30a43e03beb5e9`。

1. `data/note-drafts/20261004/20261004-07-10-acced6a60a14937719a73c9abf5c935f59bc6973f51aa4309462efea15373896.json`
   - escape。展示Fを含めて内側の壁と先マイを評価している。新入力契約はFを削除・ゼロ化しない。研究の「F/Lがあれば主展開未確定」を旧Chat運用へ勝手に移植しない。
2. `data/note-drafts/20261004/20261004-06-12-4a2cb84352f03e63402a2b4a94e52ca886d39892a75f8bb396151f07c070acda.json`
   - manshu。実1コースは4号艇で、別の頭も含む複数展開。枠番1を実1コースとせず、単一頭専用研究へ合わせて枝を削らない。
3. `data/note-drafts/20261005/20261005-13-7-aad8496d85ed174f185d0631158f95ed5b9616f4350a25290da8e349671c5dca.json`
   - escape。展示STで後手の3号艇を、足・当地・技量も踏まえて相手本線に評価している。旧文章は段階間の決定関数を記録していないため、機械的なST辞書順と同じだったとは説明しない。

### 判断の未定義項目と次の検証

- 展示F/Lを本番STの優位へ換算するか、未知とするか、その場合に他の根拠で判断を続けられる条件。
- 先マイ・差し・まくり差し等の複数枝を成立させる根拠と、合計7点以内への枝間配分。通常AIからの流用や艇番順切捨てはしない。
- 8段階の各値を6艇の1〜3着役割へ写す規則。当地/技量等が前段の不利を補足できる条件と、比較不能を解消しない条件。
- 同順位・比較不能が7点境界を越えた際の扱い。根拠のない先頭7券やオッズによる絞込みは追加しない。
- 上記を固定した版について、対象/見送りを締切前保存する前向き検証と採用条件の事前登録。既存13原稿の非構造化記録やCI成功だけで販売採用にしない。

保守的な次工程は、旧Chatの8段階を維持して新しい締切前判断にdecisionEvidenceを残し、曖昧な点を具体例で確定すること。限られた旧原稿の文章から数値閾値を創作しない。全体をF/Lなし単一頭方式へ変えることも、この取得改善には含まない。

検査: `node --test scripts/capture-independent-official-input.test.cjs`。synthetic fixture、既存API応答不変、取得回数不変、欠測・不正出典・改変・締切超過を確認。実レース取得、Chat原稿保存、実公開成功はそれぞれ別途確認する。
