"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const root = path.resolve(__dirname, "..");
const read = file =>
  fs.readFileSync(path.join(root, file), "utf8");

const html = read("index.html");
const script = read("js/script.js");
const stats = read("js/stats.js");
const autoSelection = read("js/auto-selection.js");
const api = read("js/api.js");
const hiyoriLoader = read("js/hiyori-runtime-loader.js");
const render = read("js/render.js");
const predictionRuntime = read(
  "js/prediction-runtime-loader.js"
);
const calibrationModulePath = path.join(
  root,
  "js",
  "prediction-calibration.js"
);
const calibrationDataPath = path.join(
  root,
  "data",
  "predictions",
  "calibration.json"
);
const calibrationModule =
  fs.readFileSync(
    calibrationModulePath
  );

assert.ok(
  calibrationModule.length <
    35000,
  "校正モジュールのrawサイズを35KB未満にする"
);
assert.ok(
  zlib.gzipSync(
    calibrationModule,
    { level: 9 }
  ).length < 8000,
  "校正モジュールのgzip配信量を8KB未満にする"
);
assert.ok(
  fs.statSync(calibrationDataPath).size <
    10000,
  "画面が読む校正JSONを10KB未満にする"
);
assert.equal(
  html.includes(
    'src="js/prediction-calibration.js'
  ),
  false,
  "校正モジュールとJSONを初期表示で取得しない"
);
assert.equal(
  predictionRuntime.includes(
    '"js/prediction-calibration.js"'
  ),
  true,
  "校正モジュールは予想開始時だけ遅延読込する"
);

[
  "venue-frame-reference.js",
  "venue-frame-reference-highlights.js",
  "venue-frame-reference-summary.js",
  "venue-frame-flow-comment.js",
  "reference-tag-report.js",
  "frame-rise-sink-report.js",
  "hiyori-operations-compact.js"
].forEach(file => {
  assert.equal(
    html.includes(file),
    false,
    `${file} を初期表示で読み込まない`
  );
});

const loadVenueChoicesBody = script.slice(
  script.indexOf("async function loadVenueChoices"),
  script.indexOf("function updateRaceInfo")
);
assert.equal(
  loadVenueChoicesBody.includes("selectBestLiveRace("),
  false,
  "初期表示で全場のレースAPIを走査しない"
);
assert.equal(
  loadVenueChoicesBody.includes("loadStoredLiveSelection("),
  true,
  "軽量な保存済み選定結果を使う"
);
assert.equal(
  script.includes(
    "await Promise.all(["
  ),
  true,
  "レースAPI取得と予想エンジン読込を並行する"
);
assert.equal(
  script.includes("prefetchRace?.({"),
  true,
  "選択中の1レースだけを裏で先読みする"
);
assert.equal(
  api.includes("RACE_CACHE_MS = 15000"),
  true,
  "先読み結果を短時間だけ再利用する"
);
assert.equal(
  autoSelection.includes("SUMMARY_ROOT"),
  true,
  "自動選定は軽量要約を優先する"
);
const loadDateDataBody = autoSelection.slice(
  autoSelection.indexOf("function loadDateData"),
  autoSelection.indexOf("function ticketLabel")
);
assert.equal(
  loadDateDataBody.includes("Date.now()"),
  false,
  "初期表示の予想取得でキャッシュを毎回破棄しない"
);
assert.equal(
  stats.includes("function setupLazyStats()"),
  true,
  "結果データは遅延読み込みにする"
);
assert.equal(
  stats.includes("成績の要点"),
  true
);
assert.equal(
  stats.includes("直近の結果"),
  true
);
assert.equal(
  hiyoriLoader.includes("ensureReady:installCore"),
  true,
  "予想開始時は必須モジュールだけ待つ"
);
assert.equal(
  html.includes(
    "js/prediction-runtime-loader.js"
  ),
  true,
  "予想エンジンの遅延ローダーを読み込む"
);
[
  "js/ai-core.js",
  "js/prediction.js",
  "js/render.js",
  "js/race-history.js"
].forEach(file => {
  assert.equal(
    html.includes(`src="${file}`),
    false,
    `${file} は予想開始まで直接読み込まない`
  );
  assert.equal(
    predictionRuntime.includes(`"${file}"`),
    true,
    `${file} を遅延ローダーへ登録する`
  );
});
assert.equal(
  hiyoriLoader.includes(
    'window.addEventListener("load",scheduleInstall'
  ),
  false,
  "裏側の学習診断を初期表示直後に起動しない"
);
assert.equal(
  predictionRuntime.includes(
    '"js/history-insights-base.js"'
  ),
  true,
  "履歴本体を遅延ローダーから直接読み込む"
);
assert.equal(
  predictionRuntime.includes(
    '"js/motor-maintenance-insights.js"'
  ),
  true,
  "モーター理論を遅延ローダーから直接読み込む"
);
assert.equal(
  predictionRuntime.includes(
    '"js/history-insights.js"'
  ),
  false,
  "document.writeを使う互換ローダーは遅延読込しない"
);
[
  'renderNewspaperSheet(prediction, "main")',
  'renderNewspaperSheet(prediction, "manshu")',
  "renderPracticalSelection(prediction)",
  "renderTicketRanking(prediction)"
].forEach(sectionCall => {
  assert.equal(
    render.includes(sectionCall),
    true,
    `${sectionCall} を予想画面に残す`
  );
});

const statsUi = stats.slice(
  stats.indexOf('U.setHtml("statsArea", `'),
  stats.indexOf("function initStatsEvents()")
);
[
  "成績の要点",
  "直近の結果",
  "厳選的中率",
  "回収率",
  "検証収支"
].forEach(label => {
  assert.equal(
    statsUi.includes(label),
    true,
    `${label} を結果画面に表示する`
  );
});
[
  "完全データ500Rの進捗",
  "点数帯別",
  "改善候補",
  "場別比較",
  "品質診断",
  "復旧診断",
  "展開一致率",
  "シャドー"
].forEach(label => {
  assert.equal(
    statsUi.includes(label),
    false,
    `${label} をユーザー向け結果画面に表示しない`
  );
});
assert.equal(
  (statsUi.match(/renderMetricCard\(\{/g) || []).length,
  3,
  "結果画面の指標は3項目に絞る"
);
assert.equal(
  stats.includes(
    "realSettledRows.slice(0, 5)"
  ),
  true,
  "直近結果はシャドーを除いた最大5Rにする"
);
assert.equal(
  stats.includes(
    "A.buildResultHeadline(\n          userVerificationSummary"
  ),
  true,
  "ユーザー向けKPIへシャドー集計を混ぜない"
);

const summaryDirectory = path.join(
  root,
  "data",
  "predictions",
  "summaries"
);
for (const name of fs.readdirSync(summaryDirectory)) {
  if (!/^\d{8}\.json$/.test(name)) continue;
  const bytes = fs.statSync(
    path.join(summaryDirectory, name)
  ).size;
  assert.ok(
    bytes < 20000,
    `${name} は20KB未満 (${bytes} bytes)`
  );
}

console.log("初期表示パフォーマンス回帰テスト: 合格");
