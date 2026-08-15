"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = file => fs.readFileSync(file, "utf8");
const html = read("index.html");
const appRuntime = read("js/app-runtime-loader.js");
const predictionRuntime = read("js/prediction-runtime-loader.js");
const hiyoriRuntime = read("js/hiyori-runtime-loader.js");
const flowOdds = read("js/flow-odds-tabs.js");
const formationOdds = read("js/formation-odds-display.js");

const cacheIndex = appRuntime.indexOf('"js/odds-fetch-cache.js"');
const scriptIndex = appRuntime.indexOf('"js/script.js"');
assert.ok(cacheIndex >= 0 && cacheIndex < scriptIndex, "オッズ共有層を通常オッズ取得より先に読み込む");

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
  html.includes('js/app-runtime-loader.js?v=20260815-odds-fast1'),
  true,
  "既存端末へオッズ通信優先の軽量ローダーを配信する"
);

console.log("オッズ取得軽量化パス検証: 合格");
