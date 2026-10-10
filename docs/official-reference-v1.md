# 公式参考資料の日次更新

2026-10-11のユーザー依頼「参考データをいろいろな所から集めて随時更新」に対応する研究用資料。予想方式・買い目・点数・note・既存研究原本には接続しない。

## 更新範囲

既存 `collect-external-three-source-reference.yml` の `official-reference` jobが動く。新しいcron、ChatGPT/Work監視、有料APIは追加しない。既存の毎時・上流完了起動を使い、ソースごとにJSTの1日1回だけ取得する。失敗も当日の試行として残し、次のJST日で再試行する。定刻保証ではなく、既存workflowが実行された時点で更新する。

- BOAT RACE公式24場の直近3か月コース別1〜6着率・決まり手率。6コース完全性、集計期間、0〜100を検査。母数は公開表にないのでnull。
- 多摩川公式のモーター全基：使用開始日・集計日・各着回数・出走数・2連対率・勝率。
- 浜名湖公式のモーター全基：使用開始日・集計日・2連対率・勝率。出走母数は未取得なのでnull。
- 浜名湖公式の中間整備PDF：整備日・モーター番号・使用開始日・交換部品と個数。PDF本文を転載せず必要項目だけ保存。

日付・内容の元URLは各snapshotへ保存。モーター使用開始を新型導入と同一視しない。浜名湖ランキングと整備表の使用開始日が違う場合、両値を保持して `use_start_date_conflict` を出す。

## 保存・鮮度・失敗

`scripts/collect-official-reference.py` が `data/official-reference/<sourceId>/<contentSha256>.json` に初回観測時刻・取得原文SHA256・抽出内容・出典を保存する。内容hashは取得時刻やHTML広告等を除く構造化情報から計算し、同内容の再取得でsnapshotやレース母数を増やさない。過去snapshotは上書きしない。

`data/stats/official-reference-v1.json` にソースごとの試行日、成功日、status、エラー、最新正常snapshot、元資料の日付・経過日数・行数を保存。取得失敗では前回正常snapshotとその成功時刻を保持し、更新済みや0件へ置換しない。sourceDateとlastSuccessAtは別物。四半期の場統計や非開催のモーターは更新日が古いこと自体を通信失敗としない。集計期間を確認して研究に使う。

失敗reportをGitHubへ保存後にjobをfailureにする。親workflow successだけで確認せず、当該jobとmainに保存されたreportのrunId/sourceCommitを照合する。日次上限内のskipは新しい取得成功ではない。

## 使用境界と未接続

全snapshot/reportは productionChanged=false / automaticApplication=false / usableForPrediction=false。取得時点より前の予想へ後付けしない。場率は個人確率でも因果効果でもなく、モーター成績も使用選手・コースの影響を含む。場ごとの行数やモーター基数を検証レース数に足さない。

今回の自動接続は上記27ソース。参考資料で読んだ選手コメント、レーサー期別LZH全件、気象庁の地点別潮位、展示解説の差分監視は対象外。日和・マクールは従来の別jobを維持し、その反復capture数と異なるraceKey数は区別する。既存外部成績reportの重複集計修正はこの変更には含めない。

## 検証

`python3 scripts/test-official-reference.py`。欠損・重複・異常値の拒否、PDF複数行、日次制限、同内容の不変保存、失敗時保持と翌日復旧、未来日付拒否を確認する。実サイトの取得結果、CI、main保存は別々に報告する。
