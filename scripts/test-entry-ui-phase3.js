"use strict";
const fs = require("fs");
const assert = require("assert");

const css = fs.readFileSync("css/home-dashboard-v2.css", "utf8");
const render = fs.readFileSync("js/render.js", "utf8");

assert(css.includes("Phase3 entry cards are preserved"), "出走表カードUIを維持する");
assert(css.includes(".v3-entry-grid-table"), "既存出走表を対象にする");
assert(css.includes("grid-template-columns:repeat(2"), "スマホで2列カード表示する");
assert(css.includes("@media(max-width:390px)"), "小型スマホは1列表示にする");
assert(css.includes(".v3-entry-player"), "選手情報をカード内に表示する");
assert(css.includes(".v3-entry-num"), "ST・モーター・当地数値を維持する");
assert(render.includes("renderEntryTable(prediction)"), "既存出走表描画を維持する");
assert(!css.includes("buildMarks("), "印ロジックを変更しない");
assert(!css.includes("buildFormations("), "買い目ロジックを変更しない");
console.log("出走表UI Phase3回帰テスト: 合格");
