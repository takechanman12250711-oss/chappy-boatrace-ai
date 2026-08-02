"use strict";
const fs = require("fs");
const assert = require("assert");

const html = fs.readFileSync("index.html", "utf8");
const js = fs.readFileSync("js/home-dashboard-v2.js", "utf8");
const css = fs.readFileSync("css/home-dashboard-v2.css", "utf8");

assert(html.includes("css/home-dashboard-v2.css"), "ホームCSSを読み込む");
assert(html.includes("js/home-dashboard-v2.js"), "ホームJSを読み込む");
assert(js.includes("今日のおすすめレース"), "今日のおすすめを表示する");
assert(js.includes("slice(0,3)"), "おすすめを3件に絞る");
assert(js.includes("モーニング"), "開催区分フィルターを持つ");
assert(js.includes("syncAndOpen"), "既存レース選択へ同期する");
assert(js.includes("btn.click()"), "レース選択後に既存取得処理を自動実行する");
assert(js.includes("repeat(5") || css.includes("repeat(5"), "下部ナビを5項目にする");
assert(css.includes("home-v2-recommend-list"), "おすすめカード表示を持つ");
assert(css.includes("home-v2-venue"), "開催場を横一列で表示する");
assert(css.includes("is-skip"), "見送り色分けを持つ");
assert(!js.includes("buildMarks("), "印ロジックを変更しない");
assert(!js.includes("buildFormations("), "買い目ロジックを変更しない");
console.log("承認済みホーム画面 回帰テスト: 合格");
