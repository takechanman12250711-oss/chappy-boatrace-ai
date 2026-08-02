"use strict";
const fs = require("fs");
const assert = require("assert");

const loader = fs.readFileSync("js/stats-runtime-loader.js", "utf8");
const ui = fs.readFileSync("js/result-ui-phase5.js", "utf8");

assert(loader.includes("js/result-ui-phase5.js"), "結果分析UIモジュールを遅延読込する");
assert(ui.includes("result-phase5-nav"), "結果分析内ナビを追加する");
assert(ui.includes("IntersectionObserver"), "現在位置をハイライトする");
assert(ui.includes("result-phase5-collapsible"), "詳細を折りたためる");
assert(ui.includes("MutationObserver"), "遅延描画後に表示を整理する");
assert(ui.includes("#statsArea table"), "スマホの表を横スクロール可能にする");
assert(!ui.includes("saveResult("), "結果保存ロジックを変更しない");
assert(!ui.includes("buildStats("), "集計ロジックを変更しない");
assert(!ui.includes("buildMarks("), "予想ロジックを変更しない");
console.log("Phase5 結果分析UIテスト: 合格");
