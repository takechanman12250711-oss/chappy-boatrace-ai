# AI予想 永久ローディング調査 2026-08-16

## 確認順

1. AI main
2. API main
3. GitHub Pages
4. Vercel API Production
5. 当日 schedule 実レスポンス
6. 当日 race 実レスポンス
7. ホーム選択から予想描画までのコード経路

## 確認結果

- AI main: `c89f5084f47670a3675941a0e680b4f31673de65`
- API main: `70204970b95896314a8365e3649183c6ea82dd1f`
- Vercel API ProductionはAPI main `70204970...` のREADY deployment。
- `GET /api/schedule?date=20260816` は200 / `ok:true`。
- `GET /api/race?jcd=19&rno=4&date=20260816` は200 / `ok:true`。entries 6艇、beforeInfo、startExhibition、weather、historyContextを返却。
- `prediction-runtime-loader.js` は必須予想ランタイムに45秒の全体上限、各script 12秒上限を持つ。
- `home-dashboard-v2.js` は予想開始時 `raceLoading=true`、エラー時 `raceLoading=error` へ遷移する。
- `script.js` は正常描画時に `raceLoading` を削除して `chappy:prediction-rendered` を発火し、例外時は `showPredictionError()` へ接続する。

## 今回の追加確認

上記の終端条件を `scripts/test-prediction-loading-terminal-state.js` で固定し、home CIから直接実行する。

この変更では予想ロジック、買い目、UI、配点、本番ランタイムを変更しない。
