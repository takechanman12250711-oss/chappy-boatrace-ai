"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = file => fs.readFileSync(file, "utf8");
const aiCore = read("js/ai-core.js");
const stats = read("js/stats.js");
const home = read("js/home-dashboard-v2.js");
const raceFlow = read("js/race-flow-result-panel.js");
const predictionLoader = read("js/prediction-runtime-loader.js");
const statsLoader = read("js/stats-runtime-loader.js");
const appLoader = read("js/app-runtime-loader.js");
const mobileTerminal = read("js/mobile-prediction-startup-terminal.js");
const todayLoader = read("js/today-results-home.js");
const html = read("index.html");

assert.match(
  aiCore,
  /`実進入・位置関係\$\{components\.positionRelation\}\/25`/,
  "拾い候補の位置関係は実配点上限25点で説明する"
);
assert.doesNotMatch(
  aiCore,
  /`実進入・位置関係\$\{components\.positionRelation\}\/15`/,
  "実配点と異なる15点上限を表示しない"
);

assert.match(
  stats,
  /ROLE_TICKETS_NOT_STORED = "分類別データ未保存"/,
  "分類別の保存がない履歴を『なし』と誤表示しない"
);
assert.match(
  stats,
  /predictionTickets\.length === 0[\s\S]*item\.practicalTickets\.length > 0[\s\S]*return ROLE_TICKETS_NOT_STORED/,
  "実戦厳選だけ保存された履歴は分類別データ未保存と表示する"
);

assert.match(home, /return deadlineClass\(value\) === "is-finished" \? `終了 \$\{time\}` : time/);
assert.match(home, /aria-label="\$\{esc\(place\)\} \$\{num\(race\.raceNo\)\}R \$\{esc\(deadlineLabel\)\}"/);
assert.match(raceFlow, /return isFinished\(race\) \? `終了 \$\{time\}` : time/);
assert.match(raceFlow, /aria-label="\$\{escapeHtml\(place\)\} \$\{race\.raceNo\}R \$\{escapeHtml\(deadlineLabel\)\}"/);

[
  predictionLoader,
  statsLoader,
  appLoader,
  mobileTerminal,
  todayLoader,
  html
].forEach(source => {
  assert.ok(
    source.includes("20260828-ui-audit-display1"),
    "修正版キャッシュ世代を配信する"
  );
});

console.log("UI audit display contract: passed");
