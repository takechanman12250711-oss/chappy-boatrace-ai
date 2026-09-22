# 壁成立・2号艇攻めの購入見送り

ユーザーの「壁艇の方を反映させて。」を採用承認として、100Rの事前登録条件を満たした `wall-established-attacker2-skip-b-v1` を接続する。承認証跡・当時の集計は `config/wall-purchase-approval.json`。250Rの最終評価は未到達であり、将来利益の保証ではない。

正式な壁成立、主攻め艇2号艇、適用開始より後の締切だけを対象とする。進入2コースへ条件を読み替えない。欠損・過去振り返り・結果使用予想には新しい見送り判断を付けない。オッズは条件に使わない。

予想の `practicalSelection.tickets` は元の比較用Aを保持し、購入判断は `practicalSelection.purchaseDecision` へ別保存する。対象の `recommendedTickets=[]`、`recommendedStakeYen=0`、`createPurchaseSelection()` は空配列。元の券を削除したり、参考予想を実購入と呼んだりしない。実際のユーザー購入履歴は変更しない。

自動V2の購入対象選定から対象を外すが、展示後の全レース予想収集と不変証拠保存は継続する。画面とnoteの無料側・有料側に購入見送りを明記し、予想券は参考扱いで残す。既存noteの公開監査条件は変更しない。

100Rの承認時点はA回収率68.6%、見送り損失回避28,530円、見逃す的中27回・払戻62,470円。将来分も旧Aを保存して既存壁艇collectorの比較を継続する。`productionChanged=false` は研究builder自体が本番設定を書き換えない意味で、採用状態はphase7/8の `productionAdoptionStatus` と承認ファイルで確認する。判定用の過去コホートや事前登録条件は変更しない。
