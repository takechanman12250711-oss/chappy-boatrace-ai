"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const html = read("index.html");
const appRuntime = read("js/app-runtime-loader.js");
const script = read("js/script.js");
const predictionRuntime = read("js/prediction-runtime-loader.js");
const statsRuntime = read("js/stats-runtime-loader.js");
const todayResultsHome = read("js/today-results-home.js");
const resultVoidCompat = read("js/result-void-compat.js");
const predictionIndexPath = path.join(root, "data", "predictions", "index.json");
const predictionIndexSize = fs.existsSync(predictionIndexPath) ? fs.statSync(predictionIndexPath).size : 0;

assert.equal(html.includes('src="js/app-runtime-loader.js?v=20260808-result-void-compat1"'), true, "通常画面ランタイムを最新キャッシュ世代で配信する");
assert.equal(appRuntime.includes('const VERSION = "20260808-result-void-compat1"'), true, "変更した通常画面モジュールのキャッシュ世代を更新する");
assert.equal(appRuntime.includes('"js/result-void-compat.js"'), true, "不成立結果互換層をレース画面に遅延読込する");
assert.equal(resultVoidCompat.includes('status: "void"') && resultVoidCompat.includes('voidReason: "all-boats-f-l"'), true, "全艇F/Lだけを不成立へ正規化する");

assert.equal(html.includes('style.css?v=20260806-results-ui-phase4-1'), true, "style.css の更新版を既存端末へ配信する");
assert.equal(html.includes('css/home-dashboard-v2.css?v=20260803-entry-odds1'), true, "ホームCSSを既存端末へ配信する");
assert.equal(html.includes('js/home-dashboard-v2.js?v=20260803-ui-fix2'), true, "ホームJSを既存端末へ配信する");

assert.equal(appRuntime.includes('"js/prediction-runtime-loader.js"'), true, "予想ランタイムを必要時まで遅延する");
assert.equal(appRuntime.includes('"js/stats-runtime-loader.js"'), true, "成績分析ランタイムを必要時まで遅延する");
assert.equal(appRuntime.includes("SCRIPT_LOAD_TIMEOUT_MS = 15000"), true, "通常画面モジュール読込を15秒で打ち切る");
assert.equal(appRuntime.includes("script.remove()"), true, "失敗した通常画面モジュールを除去して再試行可能にする");
assert.equal(predictionRuntime.includes("SCRIPT_LOAD_TIMEOUT_MS") || predictionRuntime.includes("15000"), true, "予想モジュールに読込タイムアウトを持たせる");
assert.equal(statsRuntime.includes("SCRIPT_LOAD_TIMEOUT_MS = 15000"), true, "結果分析モジュールを15秒で打ち切る");
assert.equal(todayResultsHome.includes("script.remove()"), true, "結果照合の遅延読込に失敗したscriptを除去して再試行可能にする");
assert.equal(todayResultsHome.includes("return loadPromise"), true, "結果照合の遅延読込完了を会場展開・予想選択から待てるようにする");
assert.equal(todayResultsHome.includes("LOAD_TIMEOUT_MS=15000"), true, "結果照合モジュールの遅延読込を15秒で打ち切る");

assert.equal(
  script.includes("function initializeRaceControls()") &&
    script.includes("document.readyState") &&
    script.includes('window.addEventListener(\n      "DOMContentLoaded",') &&
    script.includes("initializeRaceControls();") &&
    script.includes("chappyRaceControlBound"),
  true,
  "遅延読込したレース操作をDOMContentLoaded後でも一度だけ初期化する"
);
assert.equal(appRuntime.includes("root.ChappyRaceControls") && appRuntime.includes("?.initialize?.()"), true, "レースモジュール読込後に操作を初期化する");
assert.equal(predictionIndexSize < 3000000, true, `予想index raw sizeを3MB未満へ保つ: ${predictionIndexSize}`);

console.log("初期表示パフォーマンス回帰テスト: 合格");
