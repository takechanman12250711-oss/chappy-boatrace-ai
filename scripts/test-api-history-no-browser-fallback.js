"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.resolve(__dirname, "../js/script.js"),
  "utf8"
);
const start = source.indexOf("async function prepareRaceDataForTheories");
const end = source.indexOf("async function fetchAndRenderRace", start);
const flow = source.slice(start, end);

assert.ok(start >= 0 && end > start, "履歴入力の準備処理が存在する");
assert.match(
  flow,
  /hasOwnProperty\.call\([\s\S]*"historyContext"/,
  "APIが明示した履歴状態をready値にかかわらず尊重する"
);
assert.match(
  flow,
  /window\.CHAPPY_LEGACY_HISTORY_FALLBACK === true/,
  "旧14MB履歴は開発用フラグを明示した時だけ許可する"
);
assert.ok(
  flow.indexOf("ChappyRaceHistory\n          ?.load") >
    flow.indexOf("allowLegacyHistoryFallback"),
  "通常予想でブラウザ履歴JSONを自動取得しない"
);
assert.match(
  flow,
  /delivery: "api-history-missing"[\s\S]*基礎データで予想します/,
  "API障害時もフリーズせず警告付き基礎予想へ戻す"
);

console.log("API小型履歴優先・ブラウザ14MB自動取得停止 回帰テスト: 合格");
