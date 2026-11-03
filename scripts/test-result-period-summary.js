"use strict";
// 成績タブ「期間別のまとめ」の契約検査。
const fs = require("fs");
const assert = require("assert");
const js = fs.readFileSync("js/stats.js", "utf8");
const css = fs.readFileSync("css/bright-mobile-layout.css", "utf8");

assert(js.includes("data-result-period-summary"), "期間別のまとめを表示する");
assert(/periodCellHtml\("直近7日", periodHeadline\(7\)\)/.test(js), "直近7日");
assert(/periodCellHtml\("直近30日", periodHeadline\(30\)\)/.test(js), "直近30日");
assert(/periodCellHtml\("表示中の全体", periodHeadline\(0\)\)/.test(js), "表示中の全体");
const helper = js.slice(js.indexOf("const periodHeadline"), js.indexOf("const periodCellHtml"));
assert(helper.includes("realSettledRows.filter"), "成績の要点と同じ確定済みの行を使う");
assert(helper.includes("V.buildSummary") && helper.includes("A.buildResultHeadline"), "成績の要点と同じ集計方法を使う");
assert(!helper.includes("shadowSettledRows"), "シャドー予想を混ぜない");
assert(js.includes("※表示中の範囲まで"), "表示件数の上限で期間が欠ける場合は明示する");
assert(js.indexOf("${periodSummaryHtml}") < js.indexOf('<div class="result-kpi-grid result-kpi-grid-five">'), "要点の数字の前に置く");
assert(css.includes(".result-period-summary{display:grid;grid-template-columns:repeat(3"), "3列で並べる");
console.log("ok result period summary");
