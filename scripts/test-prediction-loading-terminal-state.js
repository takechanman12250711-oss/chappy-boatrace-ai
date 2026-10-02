"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const script = fs.readFileSync(
  path.join(__dirname, "..", "js", "script.js"),
  "utf8"
);
const home = fs.readFileSync(
  path.join(__dirname, "..", "js", "home-dashboard-v2.js"),
  "utf8"
);
const runtime = fs.readFileSync(
  path.join(__dirname, "..", "js", "prediction-runtime-loader.js"),
  "utf8"
);

// ホームから予想へ入るときは必ず loading 状態を明示する。
assert.match(home, /resultArea\.dataset\.raceLoading = "true"/);

// エラー時は loading のまま残さず、必ず error 状態へ遷移する。
assert.match(home, /resultArea\.dataset\.raceLoading = "error"/);
assert.match(home, /function showPredictionError\(message\)/);

// 正常描画時は loading フラグを削除し、描画完了イベントを発火する。
assert.match(script, /delete resultArea\.dataset\s*\.raceLoading/);
assert.match(script, /"chappy:prediction-rendered"/);

// fetchAndRenderRace の例外はホーム側エラー表示へ接続し、false で終端する。
assert.match(script, /ChappyHomeDashboardV2\s*\?\.showPredictionError\?\.\(/);
assert.match(script, /❌ fetchAndRenderRace error/);
assert.match(script, /return false;\s*\n\s*}\s*\n\s*}\s*\n\s*\n\s*async function verifyLiveDeadline/);

// 必須予想ランタイムは永久待機せず、全体上限を持つ。
assert.match(runtime, /const RUNTIME_TOTAL_TIMEOUT_MS = 45000/);
assert.match(runtime, /Promise\.race\(\[promise, timeout\]\)/);
assert.match(runtime, /readyPromise = null;/);

console.log("prediction loading terminal-state contract passed");
