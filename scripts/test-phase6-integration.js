"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

const html = read("index.html");
const home = read("js/home-dashboard-v2.js");
const predictionRuntime = read("js/prediction-runtime-loader.js");
const statsRuntime = read("js/stats-runtime-loader.js");
const render = read("js/render.js");
const resultUi = read("js/result-ui-phase5.js");

["home-dashboard-v2.js","prediction-runtime-loader.js","stats-runtime-loader.js"]
  .forEach(asset => assert.equal(html.includes(asset), true, `${asset} を初期導線へ接続する`));

assert.equal(home.includes("syncAndOpen"), true, "ホームから場・レース選択へ接続する");
assert.equal(home.includes("btn.click()"), true, "レース選択後に既存取得処理を自動実行する");
assert.equal(home.includes('setView("prediction")'), true, "取得後にAI予想画面へ移動する");
assert.equal(home.includes('data-view="result"'), true, "下部ナビから成績分析へ移動できる");

["js/ai-core.js","js/prediction.js","js/render.js","js/practical-selection.js"]
  .forEach(file => assert.equal(predictionRuntime.includes(`\"${file}\"`), true, `${file} を予想開始時に読み込む`));

assert.equal(render.includes("renderPracticalSelection(prediction)"), true, "実戦厳選表示を維持する");
assert.equal(render.includes("renderTicketRanking(prediction)"), true, "買い目ランキングを維持する");

["js/stats.js","js/result-ui-phase5.js"]
  .forEach(file => assert.equal(statsRuntime.includes(`\"${file}\"`), true, `${file} を結果画面で遅延読込する`));

assert.equal(resultUi.includes("statsArea"), true, "結果分析描画先へPhase5表示を接続する");
assert.equal(resultUi.includes("MutationObserver"), true, "結果再描画後も表示整理を維持する");
assert.equal(html.includes('href="#predictionSection"'), true, "AI予想アンカーを維持する");
assert.equal(html.includes('href="#resultSection"'), true, "結果分析アンカーを維持する");
assert.equal(predictionRuntime.includes('const VERSION = "20260801-boat-identity1"'), true, "予想ローダーのキャッシュ世代を維持する");

console.log("Phase6 全体統合テスト: 合格");
