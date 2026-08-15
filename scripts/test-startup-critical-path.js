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

const directScripts = [...html.matchAll(/<script\s+[^>]*src="([^"]+)"[^>]*><\/script>/g)]
  .map(match => match[1].split("?")[0]);

[
  "js/flow-odds-tabs.js",
  "js/formation-odds-display.js",
  "js/manshu-display-reliability.js",
  "js/home-recommendation-reliability.js"
].forEach(file => {
  assert.equal(
    directScripts.includes(file),
    false,
    `${file} をアプリ初期表示の同期読込から外す`
  );
});

[
  "js/odds-fetch-cache.js",
  "js/api.js",
  "js/prediction-runtime-loader.js",
  "js/app-runtime-loader.js",
  "js/home-dashboard-v2.js",
  "js/odds-first-navigation.js"
].forEach(file => {
  assert.equal(
    directScripts.includes(file),
    true,
    `${file} を軽量なホーム操作経路で読み込む`
  );
});

const directOddsIndex = html.indexOf('src="js/odds-fetch-cache.js');
const directApiIndex = html.indexOf('src="js/api.js');
const predictionLoaderIndex = html.indexOf('src="js/prediction-runtime-loader.js?v=20260816-bounded-preload1"');
const appIndex = html.indexOf('src="js/app-runtime-loader.js?v=20260815-odds-immediate1"');
const homeIndex = html.indexOf('src="js/home-dashboard-v2.js');
const oddsFirstIndex = html.indexOf('src="js/odds-first-navigation.js?v=20260815-odds-consume2"');
assert.ok(
  directOddsIndex >= 0 &&
    directOddsIndex < directApiIndex &&
    directApiIndex < predictionLoaderIndex &&
    predictionLoaderIndex < appIndex &&
    appIndex < homeIndex &&
    homeIndex < oddsFirstIndex,
  "オッズ・レースAPI・軽量予想ローダーをホーム操作より先に準備する"
);
assert.equal(
  html.includes("home-recommendation-reliability.js"),
  false,
  "ホーム要約の常時監視・定期再取得を起動しない"
);

const moduleOrder = [
  "js/render.js",
  "js/main-cover-display-boundary.js",
  "js/flow-odds-tabs.js",
  "js/formation-odds-display.js",
  "js/manshu-display-reliability.js"
].map(file => predictionRuntime.indexOf(`"${file}"`));

assert.ok(
  moduleOrder.every(index => index >= 0),
  "予想専用表示モジュールを予想ランタイムへ登録する"
);
assert.ok(
  moduleOrder.every((index, position) => position === 0 || moduleOrder[position - 1] < index),
  "描画本体・表示境界・オッズ・万舟の順で遅延読込する"
);

assert.equal(
  appRuntime.includes('"js/odds-fetch-cache.js"') ||
    appRuntime.includes('"js/api.js"'),
  false,
  "直接読込済みのオッズ・レースAPIを親ランタイムで二重取得しない"
);
assert.equal(
  appRuntime.includes('const HOME_RACE_SELECTOR = "[data-place][data-race]"') &&
    appRuntime.includes('if (target?.matches(HOME_RACE_SELECTOR)) return "";'),
  true,
  "ホームレースのpointerdownでは重いJSを先に動かさない"
);
assert.equal(
  oddsFirst.includes("ChappyAPI?.prefetchRace") &&
    oddsFirst.includes("ChappyOddsFetchCache?.fetchData") &&
    oddsFirst.includes("__chappyOddsFirstBridge"),
  true,
  "ホームタップ直後にレースとオッズを先行取得し、通常予想へ同じ応答を返す"
);
assert.equal(
  oddsFirst.includes("waitForActiveOdds") &&
    oddsFirst.includes("PREFETCH_RETENTION_MS = 120000") &&
    oddsFirst.includes("keepPrefetchedStatusVisible"),
  true,
  "重い予想JS読込中も取得済みオッズと表示状態を保持する"
);
assert.equal(
  oddsFirst.includes("requestIdleCallback") &&
    oddsFirst.includes("deferredResultPanel"),
  true,
  "結果補助は初回予想・オッズ表示後へ遅延する"
);

assert.equal(
  appRuntime.includes("const PRELOAD_LOOKAHEAD = 2") &&
    appRuntime.includes("preloadGroup(group, index, PRELOAD_LOOKAHEAD)") &&
    appRuntime.includes(".slice(startIndex, startIndex + Math.max(1, count))"),
  true,
  "親ランタイムの先読みを同時2本までに制限する"
);
const waitIndex = predictionRuntime.indexOf("await waitForOddsPriority()");
const progressivePreloadIndex = predictionRuntime.indexOf("preloadScripts(scripts, index, PRELOAD_LOOKAHEAD)");
const progressiveExecuteIndex = predictionRuntime.indexOf("await loadScript(scripts[index])");
assert.ok(
  waitIndex >= 0 &&
    waitIndex < progressivePreloadIndex &&
    progressivePreloadIndex < progressiveExecuteIndex,
  "オッズ完了または2.5秒後に予想JSを3本ずつ先読みし、実行順を維持する"
);
assert.equal(
  predictionRuntime.includes("const PRELOAD_LOOKAHEAD = 3") &&
    predictionRuntime.includes(".slice(startIndex, startIndex + Math.max(1, count))") &&
    !predictionRuntime.includes("preloadScripts(scripts, 0, scripts.length)"),
  true,
  "予想ランタイム25本の全件同時preloadを禁止する"
);
assert.equal(
  predictionRuntime.includes("const ODDS_PRIORITY_WAIT_MS = 2500") &&
    predictionRuntime.includes("oddsPrioritized: Boolean(prioritizedOdds)"),
  true,
  "予想ランタイムのオッズ優先経路を固定する"
);
assert.equal(
  hiyoriRuntime.includes("const PRELOAD_LOOKAHEAD=2") &&
    hiyoriRuntime.includes("await loadProgressively(coreScripts)") &&
    hiyoriRuntime.includes("await loadProgressively(backgroundScripts)"),
  true,
  "日和補助モジュールは予想本体の後に少数ずつ読み込む"
);
assert.equal(appRuntime.includes("preloadGroup(group);"), false, "親ランタイムの全JS一括preloadを禁止する");
assert.equal(hiyoriRuntime.includes("preloadScripts(coreScripts);"), false, "補助JSの全件一括preloadを禁止する");

assert.equal(
  predictionRuntime.includes('const VERSION = "20260816-bounded-preload1"'),
  true,
  "予想ローダーをUI不変の先読み制限世代へ更新する"
);
assert.equal(
  html.includes("js/prediction-runtime-loader.js?v=20260816-bounded-preload1") &&
    html.includes("js/odds-first-navigation.js?v=20260815-odds-consume2"),
  true,
  "既存端末へ先読み制限版を配信し、オッズ引き渡し世代は維持する"
);

const structuralUiMarkers = [
  'id="raceSection"',
  'id="predictionSection"',
  'id="resultSection"',
  'class="bottom-nav"',
  'data-view="home"',
  'data-view="prediction"',
  'data-view="result"'
];
structuralUiMarkers.forEach(marker => {
  assert.equal(html.includes(marker), true, `UI構造を維持する: ${marker}`);
});

console.log("アプリ初期表示・UI不変・予想先読み制限クリティカルパステスト: 合格");
