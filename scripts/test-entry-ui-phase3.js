"use strict";
const fs = require("fs");
const assert = require("assert");

const css = fs.readFileSync("css/home-dashboard-v2.css", "utf8");
const render = fs.readFileSync("js/render.js", "utf8");

assert(css.includes("Phase3: 出走表UI"), "Phase3出走表UIを追加する");
assert(css.includes(".v3-entry-grid-table"), "既存出走表を対象にする");
assert(css.includes("grid-template-columns:repeat(2"), "スマホで2列カード表示する");
assert(css.includes("@media(max-width:390px)"), "小型スマホは1列表示にする");
assert(css.includes('content:"ST"'), "平均STラベルを表示する");
assert(css.includes('content:"M"'), "モーターラベルを表示する");
assert(css.includes('content:"当地"'), "当地勝率ラベルを表示する");
assert(render.includes("renderEntryTable(prediction)"), "既存出走表描画を維持する");
assert(!css.includes("buildMarks("), "印ロジックを変更しない");
assert(!css.includes("buildFormations("), "買い目ロジックを変更しない");
console.log("出走表UI Phase3テスト: 合格");
