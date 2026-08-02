"use strict";
const fs = require("fs");
const assert = require("assert");

const html = fs.readFileSync("index.html", "utf8");
const js = fs.readFileSync("js/home-dashboard-v2.js", "utf8");
const css = fs.readFileSync("css/home-dashboard-v2.css", "utf8");

assert(html.includes("css/home-dashboard-v2.css"), "ホームv2 CSSを読み込む");
assert(html.includes("js/home-dashboard-v2.js"), "ホームv2 JSを読み込む");
assert(js.includes("TODAY'S PICKS"), "今日のおすすめを表示する");
assert(js.includes("モーニング"), "開催区分フィルターを持つ");
assert(js.includes("syncAndOpen"), "既存レース選択へ同期する");
assert(js.includes("fetchButton?.click()"), "レース選択後に既存取得処理を自動実行する");
assert(css.includes("home-v2-recommend-list"), "おすすめカードのスマホ表示を持つ");
assert(css.includes("is-deadline-red"), "締切色分けを持つ");
assert(!js.includes("buildMarks("), "印ロジックを変更しない");
assert(!js.includes("buildFormations("), "買い目ロジックを変更しない");
console.log("ホーム画面v2 Phase1テスト: 合格");
