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
const appRuntimeIndex = html.indexOf('src="js/app-runtime-loader.js?v=20260815-odds-immediate1"');
const homeIndex = html.indexOf('src="js/home-dashboard-v2.js');
const todayResultsIndex = html.indexOf('src="js/today-results-home.js');
const oddsFirstIndex = html.indexOf('src="js/odds-first-navigation.js?v=20260815-odds-immediate1"');

assert.ok(
  directOddsIndex >= 0 &&
    directOddsIndex < directApiIndex &&
    directApiIndex < appRuntimeIndex &&
    appRuntimeIndex < homeIndex &&
    homeIndex < todayResultsIndex &&
    todayResultsIndex < oddsFirstIndex,
  "オッズ共有・レースAPIをホーム操作前に用意し、結果補助の後で先行取得制御を接続する"
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
  "通常オッズ通信と競合するレースJSの一括先読みを止める"
);
assert.equal(
  predictionRuntime.includes("const PRELOAD_LOOKAHEAD = 3") &&
    !predictionRuntime.includes("preloadScripts(scripts);"),
  true,
  "通常オッズ通信と競合する予想JSの一括先読みを止める"
);
assert.equal(
  hiyoriRuntime.includes("const PRELOAD_LOOKAHEAD=2") &&
    !hiyoriRuntime.includes("preloadScripts(coreScripts);"),
  true,
  "通常オッズ通信中に補助JSを全件先読みしない"
);

assert.equal(
  appRuntime.includes("20260815-odds-immediate1"),
  true,
  "親ローダーをオッズ先行取得世代へ更新する"
);
assert.equal(
  predictionRuntime.includes("20260815-odds-fast1") &&
    hiyoriRuntime.includes("20260815-odds-fast1"),
  true,
  "変更していない大型予想モジュールは既存キャッシュを再利用する"
);
assert.equal(
  html.includes('js/app-runtime-loader.js?v=20260815-odds-immediate1') &&
    html.includes('js/odds-first-navigation.js?v=20260815-odds-immediate1'),
  true,
  "既存端末へオッズ先行取得の新しい起動経路を配信する"
);

console.log("オッズ取得軽量化・先行取得パス検証: 合格");
