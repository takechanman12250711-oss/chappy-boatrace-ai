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

assert.equal(
  directScripts.includes("js/app-runtime-loader.js"),
  true,
  "必要最小限の遅延ローダーは初期表示で読み込む"
);
assert.equal(
  directScripts.includes("js/home-dashboard-v2.js"),
  true,
  "ホーム本体は初期表示で読み込む"
);

assert.equal(
  html.includes('script.src = "js/home-recommendation-reliability.js?v=20260815-startup-light1"') &&
    html.includes("script.async = true") &&
    html.includes('window.addEventListener("load", scheduleHomeRecommendationReliability') &&
    html.includes('"requestIdleCallback" in window'),
  true,
  "おすすめ補強は初期画面表示後のidle時間に非同期読込する"
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

const oddsCacheIndex = appRuntime.indexOf('"js/odds-fetch-cache.js"');
const applicationScriptIndex = appRuntime.indexOf('"js/script.js"');
assert.ok(
  oddsCacheIndex >= 0 && oddsCacheIndex < applicationScriptIndex,
  "通常オッズ取得より前に共有キャッシュを読み込む"
);

assert.equal(
  appRuntime.includes("const PRELOAD_LOOKAHEAD = 2") &&
    appRuntime.includes("preloadGroup(group, index, PRELOAD_LOOKAHEAD)") &&
    appRuntime.includes(".slice(startIndex, startIndex + Math.max(1, count))"),
  true,
  "レース画面の先読みを同時2本までに制限する"
);
assert.equal(
  predictionRuntime.includes("const PRELOAD_LOOKAHEAD = 3") &&
    predictionRuntime.includes("preloadScripts(scripts, index, PRELOAD_LOOKAHEAD)") &&
    predictionRuntime.includes(".slice(startIndex, startIndex + Math.max(1, count))"),
  true,
  "予想モジュールの先読みを同時3本までに制限する"
);
assert.equal(
  hiyoriRuntime.includes("const PRELOAD_LOOKAHEAD=2") &&
    hiyoriRuntime.includes("await loadProgressively(coreScripts)") &&
    hiyoriRuntime.includes("await loadProgressively(backgroundScripts)"),
  true,
  "日和補助モジュールも予想本体の後に少数ずつ読み込む"
);
assert.equal(appRuntime.includes("preloadGroup(group);"), false, "レース画面の全JS一括preloadを禁止する");
assert.equal(predictionRuntime.includes("preloadScripts(scripts);"), false, "予想JSの全件一括preloadを禁止する");
assert.equal(hiyoriRuntime.includes("preloadScripts(coreScripts);"), false, "補助JSの全件一括preloadを禁止する");

[
  appRuntime,
  predictionRuntime,
  hiyoriRuntime
].forEach(source => {
  assert.equal(
    source.includes("20260815-odds-fast1"),
    true,
    "親・予想・補助ローダーのキャッシュ世代を揃える"
  );
});
assert.equal(
  html.includes("js/app-runtime-loader.js?v=20260815-odds-fast1"),
  true,
  "既存端末へオッズ通信優先の軽量ローダーを配信する"
);

console.log("アプリ初期表示・オッズ通信クリティカルパス軽量化テスト: 合格");
