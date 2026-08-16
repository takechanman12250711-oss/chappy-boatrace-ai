"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

const html = read("index.html");
const appRuntime = read("js/app-runtime-loader.js");
const predictionRuntime = read("js/prediction-runtime-loader.js");
const hiyoriRuntime = read("js/hiyori-runtime-loader.js");
const oddsFirst = read("js/odds-first-navigation.js");
const watchdog = read("js/prediction-loading-watchdog.js");

const directScripts = [...html.matchAll(/<script\s+[^>]*src="([^"]+)"[^>]*><\/script>/g)]
  .map(match => match[1].split("?")[0]);

[
  "js/flow-odds-tabs.js",
  "js/formation-odds-display.js",
  "js/manshu-display-reliability.js",
  "js/home-recommendation-reliability.js"
].forEach(file => assert.equal(directScripts.includes(file), false, `${file} を初期同期読込から外す`));

[
  "js/odds-fetch-cache.js",
  "js/api.js",
  "js/prediction-runtime-loader.js",
  "js/app-runtime-loader.js",
  "js/home-dashboard-v2.js",
  "js/odds-first-navigation.js",
  "js/prediction-loading-watchdog.js"
].forEach(file => assert.equal(directScripts.includes(file), true, `${file} をホーム操作経路で読み込む`));

const directOddsIndex = html.indexOf('src="js/odds-fetch-cache.js');
const directApiIndex = html.indexOf('src="js/api.js');
const predictionLoaderIndex = html.indexOf('src="js/prediction-runtime-loader.js?v=20260816-ios-sequential1"');
const appIndex = html.indexOf('src="js/app-runtime-loader.js?v=20260816-stuck-recovery1"');
const homeIndex = html.indexOf('src="js/home-dashboard-v2.js?v=20260816-stuck-recovery1"');
const oddsFirstIndex = html.indexOf('src="js/odds-first-navigation.js?v=20260815-odds-consume2"');
const watchdogIndex = html.indexOf('src="js/prediction-loading-watchdog.js?v=20260816-stuck-recovery1"');
assert.ok(
  directOddsIndex >= 0 && directOddsIndex < directApiIndex &&
  directApiIndex < predictionLoaderIndex && predictionLoaderIndex < appIndex &&
  appIndex < homeIndex && homeIndex < oddsFirstIndex && oddsFirstIndex < watchdogIndex,
  "オッズ先行取得と逐次予想ローダーの後に固着監視を接続する"
);

assert.equal(
  appRuntime.includes('const VERSION = "20260816-stuck-recovery1"') &&
    appRuntime.includes("レース選択モジュールを初期化できませんでした"),
  true,
  "Safariへ現在のレースランタイムを再配信し、初期化欠損を黙って通さない"
);
assert.equal(
  appRuntime.includes("const PRELOAD_LOOKAHEAD = 2") && !appRuntime.includes("preloadGroup(group);"),
  true,
  "親ランタイムの既存先読み制限は維持する"
);
assert.equal(
  predictionRuntime.includes('const VERSION = "20260816-ios-sequential1"') &&
    !predictionRuntime.includes("preloadScripts(scripts, 0, scripts.length)") &&
    predictionRuntime.includes("for (const src of scripts)") &&
    predictionRuntime.includes('loadMode: "sequential"'),
  true,
  "iPhone Safariで25本を一斉先読みせず、同じ実行順のまま逐次ロードする"
);
assert.equal(
  predictionRuntime.includes("const ODDS_PRIORITY_WAIT_MS = 2500") &&
    predictionRuntime.includes("oddsPrioritized: Boolean(prioritizedOdds)"),
  true,
  "オッズ先行取得経路を維持する"
);
assert.equal(
  oddsFirst.includes("waitForActiveOdds") && oddsFirst.includes("PREFETCH_RETENTION_MS = 120000"),
  true,
  "取得済み120通りを通常予想へ引き渡す"
);
assert.equal(
  hiyoriRuntime.includes("const PRELOAD_LOOKAHEAD=2") &&
    hiyoriRuntime.includes("await loadProgressively(coreScripts)"),
  true,
  "補助モジュールの既存軽量化は維持する"
);
assert.equal(
  watchdog.includes("FIRST_TIMEOUT_MS = 20000") &&
    watchdog.includes('ensure?.("race")') &&
    watchdog.includes("showPredictionError"),
  true,
  "永久ローディングを1回の復旧後にfail-closedする"
);

[
  'id="raceSection"', 'id="predictionSection"', 'id="resultSection"',
  'class="bottom-nav"', 'data-view="home"', 'data-view="prediction"', 'data-view="result"'
].forEach(marker => assert.equal(html.includes(marker), true, `UI構造を維持する: ${marker}`));

console.log("アプリ初期表示・UI不変・iOS逐次予想ローダー検証: 合格");
