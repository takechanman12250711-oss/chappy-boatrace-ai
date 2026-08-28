"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const core = require(path.join(root, "js/race-flow-result-panel.js"));
const panelSource = fs.readFileSync(path.join(root, "js/race-flow-result-panel.js"), "utf8");
const homeSource = fs.readFileSync(path.join(root, "js/home-dashboard-v2.js"), "utf8");
const scriptSource = fs.readFileSync(path.join(root, "js/script.js"), "utf8");
const indexSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
const todayLoaderSource = fs.readFileSync(path.join(root, "js/today-results-home.js"), "utf8");

assert.equal(core.normalizeJcd("1"), "01", "場コードを2桁へ正規化する");
assert.equal(core.normalizeJcd("", "江戸川"), "03", "場名から正式な場コードを得る");
assert.equal(
  core.buildRaceKey({ date: "2026-08-02", place: "江戸川", raceNo: 1 }),
  "20260802-03-1",
  "日付・場コード・レース番号から正式なraceKeyを作る"
);

const closedRace = {
  raceNo: 1,
  status: "closed",
  selectable: false,
  deadlineAt: "2026-08-02T10:00:00+09:00"
};
const liveRace = {
  raceNo: 2,
  status: "before_deadline",
  selectable: true,
  deadlineAt: "2026-08-02T12:00:00+09:00"
};
const beforeDeadline = Date.parse("2026-08-02T11:00:00+09:00");

assert.equal(core.createStatus({ race: liveRace, nowMs: beforeDeadline }).key, "waiting");
assert.equal(core.createStatus({ race: closedRace, result: null }).key, "checking");

const officialResult = {
  resultAvailable: true,
  trifecta: { combination: "3-2-5", payout: 12340 }
};

assert.equal(
  core.createStatus({ race: closedRace, result: officialResult, purchases: [] }).key,
  "not-purchased",
  "購入記録がなければ購入していないと表示する"
);
assert.equal(
  core.createStatus({
    race: closedRace,
    result: officialResult,
    purchases: [{ raceKey: "20260802-01-1", ticket: "3-2-5", amount: 500 }]
  }).key,
  "hit",
  "正式な実購入買い目が公式結果と一致すれば的中と表示する"
);
assert.equal(
  core.createStatus({
    race: closedRace,
    result: officialResult,
    purchases: [{ raceKey: "20260802-01-1", ticket: "1-2-3", amount: 500 }]
  }).key,
  "miss",
  "購入済みで公式結果と不一致なら不的中と表示する"
);

assert.match(panelSource, /schedule\?date=.*&jcd=/s, "表示対象場ごとに12R詳細を取得する");
assert.match(panelSource, /\/result\?date=/, "終了レースは公式結果APIで照合する");
assert.ok(panelSource.includes("findActualPurchasesByRaceKey"), "正式な実購入保存APIを使う");
assert.ok(panelSource.includes("flowSignature"), "同じDOMを繰り返し書き換えない");
assert.ok(panelSource.includes('return isFinished(race) ? `終了 ${time}` : time'), "終了レースは終了状態と時刻を表示する");
assert.ok(panelSource.includes('${race.raceNo}R ${escapeHtml(deadlineLabel)}'), "終了状態を読み上げ名にも含める");
assert.ok(panelSource.includes("MAX_DETAIL_REQUESTS = 3"), "場別詳細取得を3並列に制限する");
assert.ok(panelSource.includes('event.target.closest("[data-open-venue]")'), "押した開催場だけ12R詳細を取得する");
assert.ok(panelSource.includes("expandVenue"), "開催場の矢印は予想開始と分離して12Rを展開する");
assert.ok(panelSource.includes("currentSchedule.length"), "遅延初期化時はホーム取得済みの開催一覧を再取得しない");
assert.ok(panelSource.includes("card.isConnected"), "初期化中に一覧が更新されても最新の会場カードへ12Rを描画する");
const decorateStart = panelSource.indexOf("function decorateVisibleVenues");
const decorateBody = panelSource.slice(decorateStart, panelSource.indexOf("function expandVenue", decorateStart));
assert.equal(decorateBody.includes("loadVenueDetail("), false, "ホーム表示だけで全会場詳細を先読みしない");
assert.ok(panelSource.includes("RESULT_MAX_RETRIES"), "未確定結果のバックグラウンド再取得を有限回にする");
assert.ok(panelSource.includes("REQUEST_TIMEOUT_MS = 30000"), "開催詳細と公式結果を無期限待機させない");
assert.ok(todayLoaderSource.includes("LOAD_TIMEOUT_MS=15000"), "結果照合モジュールの読込を無期限待機させない");
assert.ok(panelSource.includes("!area?.dataset?.raceLoading"), "次レース読込中は前レース結果の再取得を止める");
assert.ok(panelSource.includes("if (area.dataset.raceLoading)"), "次レース読込中は前レース結果カードを再表示しない");
assert.ok(panelSource.includes("pendingOpen"), "連打時は最後に選んだレースを処理する");
assert.ok(panelSource.includes("overviewVersion"), "ホーム強制更新を二重適用しない");
assert.ok(panelSource.includes('root.addEventListener("chappy:prediction-rendered"'), "別導線の予想でも結果対象を同期する");
assert.ok(panelSource.includes("controlRaceKey !== state.current.raceKey"), "選択中レースと異なる結果カードを表示しない");
assert.ok(panelSource.includes("ChappyStartupGate?.activateRace"), "ホームの捕捉クリックでもレース画面を先に初期化する");
assert.ok(scriptSource.includes("raceSelectionGeneration"), "非同期の場・レース選択を世代管理する");
assert.ok(scriptSource.includes("explicitSelectionGeneration"), "複数導線のレース選択を共通世代で管理する");
assert.ok(scriptSource.includes("predictionGeneration"), "古い予想取得結果で新しい予想を上書きしない");
assert.match(scriptSource, /async function refreshOddsOnly[\s\S]*?requestGeneration[\s\S]*?isCurrentRequest/, "古いオッズ更新結果も表示へ反映しない");
assert.ok(scriptSource.includes("!isCurrentRaceSelection("), "古い選択リクエストの反映を止める");
assert.ok(scriptSource.includes("window.ChappyRaceSelection"), "ホーム導線が完了を待てるレース選択APIを公開する");
assert.ok(panelSource.includes("scheduleData: detail"), "ホームで取得した同じ場の開催詳細を選択処理へ引き継ぐ");
assert.ok(scriptSource.includes("primeScheduleCache("), "引き継いだ開催詳細で同じAPIの再取得を防ぐ");
assert.ok(scriptSource.includes("restoreRaceSelection"), "レース選択失敗時に元のフォーム状態へ戻す");
assert.ok(homeSource.includes('root.ChappyHomeDashboardV2 = Object.freeze'), "ホーム状態を統合フローへ公開する");
assert.ok(homeSource.includes('root.dispatchEvent(new CustomEvent("chappy:home-schedule"'), "ホーム取得結果を統合フローへ通知する");
assert.ok(homeSource.includes("pendingSelection"), "ホームの連打でも最後の選択を失わない");
assert.ok(panelSource.includes("state.resultPromises.has(current.raceKey)"), "同じ公式結果の進行中通信をタブ連打でも共有する");
assert.ok(panelSource.includes("if (cached?.resultAvailable)"), "取得済みの公式結果をタブ再表示で再取得しない");
assert.ok(panelSource.includes("const summaryRace = racesOf(summary).find"), "概要にある対象レースは開催詳細を再取得せず結果対象へ同期する");
assert.ok(panelSource.includes("numberOf(summary?.currentRaceNo) === raceNo"), "概要APIの現在Rだけでも裏の開催詳細通信を起こさない");
assert.ok(!homeSource.includes('racesOf(venue).some(row => row.selectable !== false) &&'), "終了した開催場を一覧から消さない");
assert.ok(
  indexSource.includes("js/today-results-home.js?v=20260828-ui-audit-display1"),
  "結果照合ローダーのキャッシュ世代を更新する"
);
assert.ok(
  todayLoaderSource.includes("js/race-flow-result-panel.js?v=20260828-ui-audit-display1"),
  "結果照合本体のキャッシュ世代を更新する"
);

console.log("開催場→予想→公式結果・実購入照合 回帰テスト: 合格");
