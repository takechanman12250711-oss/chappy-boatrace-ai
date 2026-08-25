"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = file => fs.readFileSync(file, "utf8");
const html = read("index.html");
const appRuntime = read("js/app-runtime-loader.js");
const predictionRuntime = read("js/prediction-runtime-loader.js");
const hiyoriRuntime = read("js/hiyori-runtime-loader.js");
const oddsFirst = read("js/odds-first-navigation.js");
const flowOdds = read("js/flow-odds-tabs.js");
const formationOdds = read("js/formation-odds-display.js");

const directOddsIndex = html.indexOf('src="js/odds-fetch-cache.js?v=20260815-odds-immediate1"');
const directApiIndex = html.indexOf('src="js/api.js?v=20260825-mobile-startup-terminal4&app=20260825-mobile-startup-terminal4"');
const directPredictionLoaderIndex = html.indexOf('src="js/prediction-runtime-loader.js?v=20260824-readonly-core-fix1&feature=four-kado-124-v1&app=20260825-mobile-startup-terminal4"');
const hiyoriIndex = html.indexOf('src="js/hiyori-runtime-loader.js?v=20260825-mobile-startup-terminal4"');
const appRuntimeIndex = html.indexOf('src="js/app-runtime-loader.js');
const homeIndex = html.indexOf('src="js/home-dashboard-v2.js');
const todayResultsIndex = html.indexOf('src="js/today-results-home.js');
const oddsFirstIndex = html.indexOf('src="js/odds-first-navigation.js?v=20260815-odds-consume2"');

assert.ok(
  directOddsIndex >= 0 && directOddsIndex < directApiIndex &&
  directApiIndex < directPredictionLoaderIndex && directPredictionLoaderIndex < hiyoriIndex &&
  hiyoriIndex < appRuntimeIndex && appRuntimeIndex < homeIndex && homeIndex < todayResultsIndex &&
  todayResultsIndex < oddsFirstIndex,
  "オッズ共有・レースAPI・予想ランタイム・非同期日和補助を順番どおり接続する"
);
assert.equal(html.includes("home-recommendation-reliability.js"), false, "重複ホーム補強を初期画面から外す");
assert.equal(html.includes("prediction-loading-watchdog.js"), false, "旧watchdogを初期画面へ戻さない");
assert.equal(
  appRuntime.includes('"js/odds-fetch-cache.js"') || appRuntime.includes('"js/api.js"'),
  false,
  "直接読込済みAPIをランタイムで再読込しない"
);
assert.equal(
  appRuntime.includes('HOME_RACE_SELECTOR="[data-place][data-race]"') &&
    appRuntime.includes('if(target?.matches(HOME_RACE_SELECTOR))return"";'),
  true,
  "ホームraceタップでは親ランタイムをpointerdown先読みしない"
);
assert.equal(
  oddsFirst.includes("ChappyAPI?.prefetchRace") &&
    oddsFirst.includes("ChappyOddsFetchCache?.fetchData") &&
    oddsFirst.includes("__chappyOddsFirstBridge") &&
    oddsFirst.includes("waitForActiveOdds"),
  true,
  "レースとオッズを先行取得し通常予想へ同じ応答を渡す"
);
assert.equal(
  oddsFirst.includes("PREFETCH_RETENTION_MS = 120000") && oddsFirst.includes("keepPrefetchedStatusVisible"),
  true,
  "取得済みオッズをAI解析中も保持する"
);
assert.equal(flowOdds.includes("new MutationObserver"), false, "オッズ表示で画面全体を常時監視しない");
assert.equal(
  flowOdds.includes("ChappyOddsFetchCache") && flowOdds.includes("oddsCache.delete(key)"),
  true,
  "共有オッズ通信を維持する"
);
assert.equal(
  formationOdds.includes("ChappyOddsFetchCache") && formationOdds.includes("hydrateFetchedOdds(display, prediction)"),
  true,
  "フォーメーション全点表示は同一取得オッズを使う"
);
assert.equal(
  appRuntime.includes("PRELOAD_LOOKAHEAD=2") && !appRuntime.includes("preloadGroup(group);"),
  true,
  "親ランタイムの先読み制限を維持する"
);
assert.equal(
  predictionRuntime.includes('const VERSION = "20260824-readonly-core-fix1"') &&
    predictionRuntime.includes("const PRELOAD_LOOKAHEAD = 2") &&
    predictionRuntime.includes("const RUNTIME_TOTAL_TIMEOUT_MS = 45000") &&
    predictionRuntime.includes("await withTimeout(") &&
    !predictionRuntime.includes("preloadScripts(scripts,0,scripts.length)"),
  true,
  "iPhone Safari向けに一斉先読みを避け、予想ランタイム全体を45秒で打ち切る"
);
assert.equal(
  predictionRuntime.includes("const ODDS_PRIORITY_WAIT_MS = 2500") &&
    predictionRuntime.includes("oddsPrioritized: Boolean(prioritizedOdds)"),
  true,
  "オッズ優先経路を維持する"
);
assert.equal(
  hiyoriRuntime.includes("PRELOAD_LOOKAHEAD=2") &&
    hiyoriRuntime.includes("predictionBlocking:false") &&
    hiyoriRuntime.includes("return Promise.resolve(true)") &&
    hiyoriRuntime.includes("scheduleCompatibilitySync"),
  true,
  "日和補助と互換同期を残しつつ初回予想表示を待たせない"
);

console.log("オッズ取得・予想ロード上限・Safari固着防止パス検証: 合格");
