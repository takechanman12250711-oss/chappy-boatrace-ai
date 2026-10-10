# Frame shadow → negative clip の保存順序

通常の自動経路は automatic predictions → frame shadow → negative clip の2段階の `workflow_run` 連鎖とする。negative clip の計算は共通 writer queue の外に置き、保存だけ従来の queue と stale-source guard を使う。他の予想・結果 writer による変更の拒否は引き続き必要。

## 自動開始の証拠

- negative clip は成功した frame shadow の completed / main / 同一 repository / event=workflow_run だけを受け入れる。frame の PR と手動実行は連鎖させない。正当な bot actor は除外しない。
- frame は処理日を実行時の JST で1度固定し、復元・生成・保存に同じ日を渡す。保存成功（変更不要を含む）の後だけ、run ID / attempt ごとの3日保持 artifact を出す。
- receipt は run / attempt / workflow SHA、日付固定時刻、保存完了時刻、capture / saved commit、raw・gzip・meta、コード・config・候補入力・frame archive の Git object を保持する。計算開始から rebase 後までにコードや候補入力が変わった場合は receipt を発行しない。
- negative clip は当該 run / attempt の artifact が一意で、ID・run head・期限・SHA256 digest が正しいことを検証する。saved commit の実 object、現在 checkout の object とも照合する。raw に frame field が存在するだけでは通さず、個別行の frame 適用可否も開始条件に追加しない。
- 不成功、PR/手動由来、原本なし、当日不一致、原本/世代の変更は summary に見送り理由を記録する。artifact 欠損・破損・証拠不一致は失敗させ、生成と公開へ進まない。
- `run_started_at` は処理日の根拠にしない。JST 日付をまたいだ receipt は自動補完せず見送る。negative 自身の PR 検査、明示的な手動日付経路は従来どおり。

## 不変条件と残る限界

この変更は保存順序と処理完了の証拠だけを追加する。研究計算、対象資格、候補・買い目、過去原本、集計母数を変更しない。既存 snapshot の保持と同一 candidate の再実行時の再利用を維持する。receipt の再読は read-only であり、重複イベントに対する新たな恒久 claim は設けない。既存 publisher の no-op / already-persisted と競合拒否を維持する。

現行 frame / negative の新規 snapshot 生成器が検査する時刻は、元予想の `selectedAt` と候補採用 cutoff の大小関係である。新規 shadow の実生成時刻がレース締切前であることを検査する guard は確認できない。receipt の frozenAt / savedAt は処理・保存時刻であり、元予想 selectedAt と異なる。今回の順序保証を「締切前の新規 shadow 保存の保証」や「前向き比較成立」と扱わない。締切後の新規行除外は研究資格・母数の変更になるため、本変更では追加していない。

frame の writer queue 待ちは10分の job timeoutでは制限されない。処理遅延がある場合も、旧日の復元や失敗した生成物の再生成で追いつかせない。後続の別 writer との全競合を解消する変更ではない。

## 検証

- `node tests/frame-shadow-save-handoff.test.cjs`
- `node scripts/test-phase3-refresh-contract.js`
- 既存 frame / negative snapshot・archive・checkpoint・writer queue の回帰テスト
- 反映前に独立 review と exact-head Node 20 CI を確認する。本番の手動 rerun / dispatch はこの変更の検証に含めない。

GitHub の根拠: [workflow_run の3段上限とイベント・branch条件](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)、[artifact REST API](https://docs.github.com/en/rest/actions/artifacts)。
