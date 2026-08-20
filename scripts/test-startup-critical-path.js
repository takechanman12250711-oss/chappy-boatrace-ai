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
  "js/home-recommendation-reliability.js",
  "js/prediction-loading-watchdog.js",
  "js/script.js"
].forEach(file => assert.equal(directScripts.includes(file), false, `${file} を初期同期読込から外す`));

[
  "js/odds-fetch-cache.js",
  "js/api.js",
  "js/prediction-runtime-loader.js",
  "js/app-runtime-loader.js",
  "js/home-dashboard-v2.js",
  "js/odds-first-navigation.js"
].forEach(file => assert.equal(directScripts.includes(file), true, `${file} をホーム操作経路で読み込む`));

assert.equal(
  appRuntime.includes('groups={race:["js/utils.js","js/storage.js","js/prediction-conditions.js","js/prediction-runtime-loader.js","js/script.js","js/hiyori-runtime-loader.js"]'),
  true,
  "script.js はraceグループ経由でのみ読み込む"
);
assert.equal(
  appRuntime.includes('if(group==="race")root.ChappyRaceControls?.initialize?.();'),
  true,
  "raceランタイム読込後にレース操作を初期化する"
);

const directOddsIndex = html.indexOf('src="js/odds-fetch-cache.js');
const directApiIndex = html.indexOf('src="js/api.js');
const predictionLoaderIndex = html.indexOf('src="js/prediction-runtime-loader.js?v=20260820-third-six-fixed5"');
const hiyoriLoaderIndex = html.indexOf('src="js/hiyori-runtime-loader.js?v=20260816-nonblocking-core2"');
const appIndex = html.indexOf('src="js/app-runtime-loader.js');
const homeIndex = html.indexOf('src="js/home-dashboard-v2.js');
const oddsFirstIndex = html.indexOf('src="js/odds-first-navigation.js?v=20260815-odds-consume2"');
assert.ok(
  directOddsIndex >= 0 && directOddsIndex < directApiIndex &&
  directApiIndex < predictionLoaderIndex && predictionLoaderIndex < hiyoriLoaderIndex &&
  hiyoriLoaderIndex < appIndex && appIndex < homeIndex && homeIndex < oddsFirstIndex,
  "オッズ先行取得・予想ランタイム・非同期日和補助を固定順で接続する"
);

assert.equal(
  appRuntime.includes("PRELOAD_LOOKAHEAD=2") &&
    appRuntime.includes('HOME_RACE_SELECTOR="[data-place][data-race]"') &&
    appRuntime.includes('if(target?.matches(HOME_RACE_SELECTOR))return"";'),
  true,
  "ホームraceタップ時に親ランタイムの重複先読みをしない"
);

assert.equal(
  predictionRuntime.includes('const VERSION = "20260820-third-six-fixed5"') &&
    predictionRuntime.includes("const RUNTIME_TOTAL_TIMEOUT_MS = 45000") &&
    predictionRuntime.includes("const PRELOAD_LOOKAHEAD = 2") &&
    predictionRuntime.includes("await withTimeout(") &&
    !predictionRuntime.includes("preloadScripts(scripts,0,scripts.length)"),
  true,
  "予想ランタイムは一斉先読みせず、全体45秒でfail-closedする"
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
  hiyoriRuntime.includes('const VERSION="20260816-nonblocking-core2"') &&
    hiyoriRuntime.includes("function ensureReady()") &&
    hiyoriRuntime.includes("return Promise.resolve(true)") &&
    hiyoriRuntime.includes("predictionBlocking:false") &&
    hiyoriRuntime.includes("scheduleCompatibilitySync"),
  true,
  "日和補助と互換同期は保持したまま初回予想表示を待たせない"
);

[
  'id="raceSection"', 'id="predictionSection"', 'id="resultSection"',
  'class="bottom-nav"', 'data-view="home"', 'data-view="prediction"', 'data-view="result"'
].forEach(marker => assert.equal(html.includes(marker), true, `UI構造を維持する: ${marker}`));

console.log("アプリ初期表示・単一起動経路・UI不変・予想ランタイム上限検証: 合格");
