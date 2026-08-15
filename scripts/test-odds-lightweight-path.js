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
const directApiIndex = html.indexOf('src="js/api.js?v=20260815-odds-immediate1"');
const directPredictionLoaderIndex = html.indexOf('src="js/prediction-runtime-loader.js?v=20260815-odds-consume2"');
const appRuntimeIndex = html.indexOf('src="js/app-runtime-loader.js?v=20260815-odds-immediate1"');
const homeIndex = html.indexOf('src="js/home-dashboard-v2.js');
const todayResultsIndex = html.indexOf('src="js/today-results-home.js');
const oddsFirstIndex = html.indexOf('src="js/odds-first-navigation.js?v=20260815-odds-consume2"');

assert.ok(
  directOddsIndex >= 0 &&
    directOddsIndex < directApiIndex &&
    directApiIndex < directPredictionLoaderIndex &&
    directPredictionLoaderIndex < appRuntimeIndex &&
    appRuntimeIndex < homeIndex &&
    homeIndex < todayResultsIndex &&
    todayResultsIndex < oddsFirstIndex,
  "オッズ共有・レースAPI・軽量予想ローダーをホーム操作前に用意し、最後に引き渡し制御を接続する"
);
assert.equal(
  html.includes("home-recommendation-reliability.js"),
  false,
  "同じ当日要約を監視・定期再取得する重複補強を初期画面から外す"
);
assert.equal(
  appRuntime.includes('"js/odds-fetch-cache.js"') || appRuntime.includes('"js/api.js"'),
  false,
  "直接読込済みのオッズ共有・レースAPIをランタイムで再読込しない"
);
assert.equal(
  appRuntime.includes('const HOME_RACE_SELECTOR = "[data-place][data-race]"') &&
    appRuntime.includes('if (target?.matches(HOME_RACE_SELECTOR)) return "";'),
  true,
  "ホームのレースタップでは重いランタイム先読みを先に始めない"
);
assert.equal(
  oddsFirst.includes("ChappyAPI?.prefetchRace") &&
    oddsFirst.includes("ChappyOddsFetchCache?.fetchData") &&
    oddsFirst.includes('"pointerdown"') &&
    oddsFirst.includes("capture: true"),
  true,
  "ホーム操作直後にレースデータとオッズを先行取得する"
);
assert.equal(
  oddsFirst.includes("__chappyOddsFirstBridge") &&
    oddsFirst.includes("responseFromData(root, data)") &&
    oddsFirst.includes("waitForActiveOdds") &&
    oddsFirst.includes("PREFETCH_RETENTION_MS = 120000"),
  true,
  "先行取得済み120通りを通常予想へ直接返し、重いJS読込中も保持する"
);
assert.equal(
  oddsFirst.includes("prefetchedOddsCount") &&
    oddsFirst.includes("keepPrefetchedStatusVisible") &&
    oddsFirst.includes('attributeFilter: ["data-state"]'),
  true,
  "オッズ取得済み表示をAI解析中の待機表示で上書きしない"
);
assert.equal(
  oddsFirst.includes("navigationPending") &&
    oddsFirst.includes("deferredResultPanel") &&
    oddsFirst.includes("requestIdleCallback"),
  true,
  "結果パネルは予想とオッズの初回表示後まで遅延する"
);

assert.equal(
  flowOdds.includes("new MutationObserver"),
  false,
  "フォーメーションオッズのために画面全体を常時監視しない"
);
assert.equal(
  flowOdds.includes("ChappyOddsFetchCache") && flowOdds.includes("oddsCache.delete(key)"),
  true,
  "共有通信を使い、空結果は固定キャッシュしない"
);
assert.equal(
  formationOdds.includes("ChappyOddsFetchCache") &&
    formationOdds.includes("hydrateFetchedOdds(display, prediction)"),
  true,
  "24点・8点の全点表示は通常取得済みの同一オッズを再利用する"
);
assert.equal(
  formationOdds.includes('["renderAll", "renderPrediction"].forEach'),
  false,
  "同じ予想を二重ラップして再描画しない"
);

assert.equal(
  appRuntime.includes("const PRELOAD_LOOKAHEAD = 2") &&
    !appRuntime.includes("preloadGroup(group);"),
  true,
  "オッズ開始前に親ランタイムを一括先読みしない"
);
const oddsWaitIndex = predictionRuntime.indexOf("await waitForOddsPriority()");
const preloadAllIndex = predictionRuntime.indexOf("preloadScripts(scripts, 0, scripts.length)");
const sequentialLoadIndex = predictionRuntime.indexOf("for (const src of scripts)");
assert.ok(
  oddsWaitIndex >= 0 &&
    oddsWaitIndex < preloadAllIndex &&
    preloadAllIndex < sequentialLoadIndex,
  "オッズ完了または2.5秒待機後に予想JSの通信だけを並行化し、実行順は維持する"
);
assert.equal(
  predictionRuntime.includes("const ODDS_PRIORITY_WAIT_MS = 2500") &&
    predictionRuntime.includes("oddsPrioritized: Boolean(prioritizedOdds)"),
  true,
  "予想ランタイムがオッズ通信を最優先したことを記録する"
);
assert.equal(
  hiyoriRuntime.includes("const PRELOAD_LOOKAHEAD=2") &&
    !hiyoriRuntime.includes("preloadScripts(coreScripts);"),
  true,
  "通常オッズ通信中に補助JSを全件先読みしない"
);

assert.equal(
  predictionRuntime.includes('const VERSION = "20260815-odds-consume2"'),
  true,
  "先行取得済みオッズを使う予想ローダーへ更新する"
);
assert.equal(
  html.includes('js/prediction-runtime-loader.js?v=20260815-odds-consume2') &&
    html.includes('js/odds-first-navigation.js?v=20260815-odds-consume2'),
  true,
  "既存端末へオッズ引き渡し版の起動経路を配信する"
);

console.log("オッズ取得・通常予想引き渡し・高速読込パス検証: 合格");
