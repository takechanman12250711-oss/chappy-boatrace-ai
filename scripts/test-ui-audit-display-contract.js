"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const read = file => fs.readFileSync(file, "utf8");
const aiCore = read("js/ai-core.js");
const render = read("js/render.js");
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
  /`実進入・位置関係\$\{components\.positionRelation\}\/15`/,
  "予想ロジック側の監査文字列は変更しない"
);
assert.match(
  render,
  /\.replace\(\/実進入・位置関係\(\\d\+\)\\\/15\/g, "実進入・位置関係\$1\/25"\)/,
  "描画直前だけ実配点上限25点へ補正する"
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

assert.match(home, /home-v2-recommend-card/);
const homeShell = home.slice(home.indexOf("function ensureShell"), home.indexOf("function renderRecommendations"));
assert.doesNotMatch(homeShell, /home-v2-schedule|data-home-venues/);
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
assert.ok(
  predictionLoader.includes('"js/render.js"'),
  "表示補正を含むrender.jsを修正版キャッシュ世代で読み込む"
);

function functionSource(name) {
  const start = render.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} が存在する`);
  const open = render.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < render.length; index += 1) {
    if (render[index] === "{") depth += 1;
    if (render[index] === "}") depth -= 1;
    if (depth === 0) return render.slice(start, index + 1);
  }
  throw new Error(`${name} の終端が見つからない`);
}

const renderSandbox = {
  safeText(value, fallback = "-") {
    return value === null || value === undefined || value === ""
      ? fallback
      : String(value);
  },
  escapeHtml(value) {
    return String(value ?? "");
  },
  section(title, body) {
    return `<section data-title="${title}">${body}</section>`;
  }
};
vm.runInNewContext(
  `${functionSource("renderFinalComment")}\n${functionSource("renderFinalBlock")}\nthis.renderFinalComment = renderFinalComment;`,
  renderSandbox
);

const repeatedComment = "3コース攻めを軸に、イン残しと外の拾いを評価する。";
const repeatedHtml = renderSandbox.renderFinalComment({
  simpleEvaluation: { mainComment: repeatedComment },
  raceFlow: { comment: repeatedComment },
  finalComment: repeatedComment,
  finalAi: {
    target: repeatedComment,
    summary: repeatedComment,
    final: repeatedComment
  }
});
assert.equal(repeatedHtml, "", "AI総合と同じ最終コメントを繰り返さない");

const distinctHtml = renderSandbox.renderFinalComment({
  simpleEvaluation: { mainComment: repeatedComment },
  raceFlow: { comment: repeatedComment },
  finalAi: {
    target: "3号艇の1着固定を狙う。",
    final: "3号艇の1着固定を狙う。",
    risk: "展示気配の変化に注意する。"
  }
});
assert.equal((distinctHtml.match(/3号艇の1着固定を狙う。/g) || []).length, 1);
assert.match(distinctHtml, /展示気配の変化に注意する。/);

console.log("UI audit display contract: passed");
