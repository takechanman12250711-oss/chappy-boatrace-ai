"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const html = read("index.html");
const appRuntime = read("js/app-runtime-loader.js");
const statsRuntime = read("js/stats-runtime-loader.js");

assert.equal(
  html.includes('const BUILD="20260828-ui-audit-display1"') &&
    html.includes('root.CHAPPY_APP_BUILD="20260828-ui-audit-display1"'),
  true,
  "予想・通常画面の全体ビルド契約は変更しない"
);
assert.equal(
  html.includes('root.CHAPPY_STATS_BUILD="20260831-outer-attack-central-report1"'),
  true,
  "成績分析だけに中央レポート用の配信世代を設定する"
);
assert.equal(
  html.includes(
    "js/app-runtime-loader.js?v=20260816-static-race1&app=20260828-ui-audit-display1&stats=20260831-outer-attack-central-report1"
  ),
  true,
  "既存端末でも個別配信世代を理解する親ローダーを再取得する"
);
assert.equal(
  appRuntime.includes("const STATS_VERSION = root.CHAPPY_STATS_BUILD || ACTIVE_VERSION;") &&
    appRuntime.includes('function assetVersion(clean){return clean==="js/stats-runtime-loader.js"?STATS_VERSION:ACTIVE_VERSION;}') &&
    appRuntime.includes("script.src=`${clean}?v=${assetVersion(clean)}`") &&
    appRuntime.includes("link.href=`${clean}?v=${assetVersion(clean)}`"),
  true,
  "成績分析ローダーの通常取得・先読みだけに個別世代を使う"
);
assert.equal(
  appRuntime.includes('const groups={race:["js/utils.js","js/storage.js","js/prediction-conditions.js","js/prediction-runtime-loader.js","js/script.js","js/hiyori-runtime-loader.js"]'),
  true,
  "予想開始の必須race groupを変更しない"
);
assert.equal(
  statsRuntime.includes('const VERSION = "20260828-ui-audit-display1" + "-outer-attack-central-report1";') &&
    statsRuntime.includes('"js/outer-attack-ticket-central-report-loader.js"'),
  true,
  "取得した成績分析ローダーが中央レポート用モジュールを新世代で読む"
);
assert.equal(
  appRuntime.includes("statsVersion:STATS_VERSION"),
  true,
  "配信中の成績分析世代を診断可能にする"
);

console.log("outer attack central cache delivery tests passed");
