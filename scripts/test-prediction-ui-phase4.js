"use strict";
const fs = require("fs");
const assert = require("assert");

const source = fs.readFileSync("js/home-dashboard-v2.js", "utf8");

assert(source.includes("prediction-phase4-nav"), "固定ナビを追加する");
assert(source.includes("本命"), "本命タブを持つ");
assert(source.includes("万舟"), "万舟タブを持つ");
assert(source.includes("買い目"), "買い目タブを持つ");
assert(source.includes("AI根拠"), "AI根拠タブを持つ");
assert(source.includes("実戦厳選"), "実戦厳選タブを持つ");
assert(source.includes("IntersectionObserver"), "現在位置をハイライトする");
assert(source.includes("prediction-phase4-collapsible"), "AI根拠を折りたためる");
assert(source.includes("scrollIntoView"), "セクションへ移動できる");
assert(!source.includes("buildMarks("), "印ロジックを変更しない");
assert(!source.includes("buildFormations("), "買い目ロジックを変更しない");
assert(!source.includes("新聞"), "存在しない新聞UIを追加しない");

console.log("Phase4予想画面UIテスト: 合格");
