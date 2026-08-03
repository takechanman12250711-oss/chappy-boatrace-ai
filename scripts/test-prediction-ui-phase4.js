"use strict";
const fs = require("fs");
const assert = require("assert");

const runtime = fs.readFileSync("js/prediction-runtime-loader.js", "utf8");
const home = fs.readFileSync("js/home-dashboard-v2.js", "utf8");

assert(!runtime.includes('"js/prediction-ui-phase4.js"'), "壊れた重複ナビを予想画面へ読み込まない");
assert(!home.includes("ChappyPredictionPhase4"), "画面切替時に重複ナビを再生成しない");
assert(!runtime.includes("void ensureOptionalReady()"), "予想後に任意診断を自動起動しない");

console.log("AI予想重複ナビ削除 回帰テスト: 合格");
