"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = file => fs.readFileSync(file, "utf8");
const html = read("index.html");
const race = read("js/script.js");
const home = read("js/home-dashboard-v2.js");
const runtime = read("js/app-runtime-loader.js");
const style = read("style.css");
const mobile = read("css/final-mobile-ui.css");
const reference = read("css/final-reference-layout.css");

assert.doesNotMatch(html, /data-view="home"/, "ホームタブを残さない");
assert.match(
  html,
  /id="raceSection" class="dashboard-section race-select-section">/,
  "起動直後のレース画面をHTMLから表示する"
);
assert.equal(
  (html.match(/class="bottom-nav-item(?: is-active)?"/g) || []).length,
  3,
  "下部ナビはレース・AI予想・成績の3項目にする"
);
assert.match(html, /class="race-mode-actions" role="group"/);
assert.equal(
  (html.match(/data-race-mode="(?:live|review)"/g) || []).length,
  2,
  "開催中と終了レースをタップで選べる"
);
assert.doesNotMatch(html, /role="tab(?:list)?"/, "開催状態をタブUIにしない");
assert.match(html, /class="select-field legacy-race-mode-field" hidden/);
assert.equal(
  (html.match(/<li><b>[1-4]<\/b><span>/g) || []).length,
  4,
  "選択手順を4段階で示す"
);

assert.match(race, /\.race-mode-actions \[data-race-mode\]/);
assert.match(race, /button\.dataset\.raceMode/);
assert.match(race, /modeSelect\.value = nextMode/);
assert.match(race, /aria-pressed/);
assert.match(race, /dateField\.hidden\s*=\s*!isReview/);
assert.match(race, /④ AI予想を見る/);
assert.match(race, /④ 振り返り予想を見る/);
assert.match(runtime, /data-race-mode/);

assert.match(home, /currentView: "race"/);
assert.match(home, /setView\("race"\)/);
assert.match(home, /raceSection\.insertBefore/);
assert.match(home, /ChappyAppRuntime[\s\S]*ensure\?\.\("race"\)/);
assert.match(home, /shell\.hidden = hideRecommendations/);

assert.match(style, /\.race-mode-actions/);
assert.match(style, /\.race-main-action[^{]*\{[^}]*position:\s*fixed/is);
assert.match(style, /official-race-trend[^{]*\{[^}]*display:\s*none\s*!important/is);
assert.match(mobile, /\.race-mode-actions button/);
assert.match(reference, /grid-template-columns:\s*repeat\(3,/);

console.log("tap race flow contract passed");
