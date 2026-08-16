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
const watchdog = read("js/prediction-loading-watchdog.js");

const directOddsIndex = html.indexOf('src="js/odds-fetch-cache.js?v=20260815-odds-immediate1"');
const directApiIndex = html.indexOf('src="js/api.js?v=20260815-odds-immediate1"');
const directPredictionLoaderIndex = html.indexOf('src="js/prediction-runtime-loader.js?v=20260815-odds-consume2"');
const appRuntimeIndex = html.indexOf('src="js/app-runtime-loader.js?v=20260816-stuck-recovery1"');
const homeIndex = html.indexOf('src="js/home-dashboard-v2.js?v=20260816-stuck-recovery1"');
const todayResultsIndex = html.indexOf('src="js/today-results-home.js');
const oddsFirstIndex = html.indexOf('src="js/odds-first-navigation.js?v=20260815-odds-consume2"');
const watchdogIndex = html.indexOf('src="js/prediction-loading-watchdog.js?v=20260816-stuck-recovery1"');

assert.ok(
  directOddsIndex >= 0 && directOddsIndex < directApiIndex &&
  directApiIndex < directPredictionLoaderIndex && directPredictionLoaderIndex < appRuntimeIndex &&
  appRuntimeIndex < homeIndex && homeIndex < todayResultsIndex &&
  todayResultsIndex < oddsFirstIndex && oddsFirstIndex < watchdogIndex,
  "オッズ共有・レースAPI・安定版予想ローダー・固着監視を順番どおり接続する"
);
assert.equal(html.includes("home-recommendation-reliability.js"), false, "重複ホーム補強を初期画面から外す");
assert.equal(
  appRuntime.includes('"js/odds-fetch-cache.js"') || appRuntime.includes('"js/api.js"'),
  false,
  "直接読込済みAPIをランタイムで再読込しない"
);
assert.equal(
  appRuntime.includes('const HOME_RACE_SELECTOR = "[data-place][data-race]"') &&
    appRuntime.includes('if (target?.matches(HOME_RACE_SELECTOR)) return "";'),
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
  appRuntime.includes("const PRELOAD_LOOKAHEAD = 2") && !appRuntime.includes("preloadGroup(group);"),
  true,
  "親ランタイムの既存先読み制限を維持する"
);
assert.equal(
  predictionRuntime.includes('const VERSION = "20260815-odds-consume2"') &&
    predictionRuntime.includes("preloadScripts(scripts, 0, scripts.length)") &&
    predictionRuntime.includes("for (const src of scripts)"),
  true,
  "ロールバック済み安定版の予想実行順は変更しない"
);
assert.equal(
  predictionRuntime.includes("const ODDS_PRIORITY_WAIT_MS = 2500") &&
    predictionRuntime.includes("oddsPrioritized: Boolean(prioritizedOdds)"),
  true,
  "オッズ優先経路を維持する"
);
assert.equal(
  hiyoriRuntime.includes("const PRELOAD_LOOKAHEAD=2") && !hiyoriRuntime.includes("preloadScripts(coreScripts);"),
  true,
  "補助JSの既存軽量化を維持する"
);
assert.equal(
  appRuntime.includes('const VERSION = "20260816-stuck-recovery1"') &&
    appRuntime.includes("レース選択モジュールを初期化できませんでした") &&
    watchdog.includes("showPredictionError"),
  true,
  "Safariの新旧JS混在を避け、永久ローディングをfail-closedする"
);

console.log("オッズ取得・通常予想引き渡し・Safari固着復旧パス検証: 合格");
