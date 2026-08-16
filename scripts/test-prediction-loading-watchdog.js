"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const watchdog = fs.readFileSync(path.join(__dirname, "..", "js", "prediction-loading-watchdog.js"), "utf8");
const appRuntime = fs.readFileSync(path.join(__dirname, "..", "js", "app-runtime-loader.js"), "utf8");
const homeHotfix = fs.readFileSync(path.join(__dirname, "..", "js", "home-venue-tap-hotfix.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

assert.match(watchdog, /FIRST_TIMEOUT_MS = 20000/);
assert.match(watchdog, /FINAL_TIMEOUT_MS = 15000/);
assert.match(watchdog, /ChappyAppRuntime\?\.ensure\?\.\("race"\)/);
assert.match(watchdog, /ChappyRaceSelection\?\.select/);
assert.match(watchdog, /selectedMatches/);
assert.match(watchdog, /fetchRaceBtn/);
assert.match(watchdog, /showPredictionError/);
assert.match(watchdog, /chappy:prediction-rendered/);
assert.match(appRuntime, /const VERSION = "20260816-stuck-recovery1"/);
assert.match(appRuntime, /レース選択モジュールを初期化できませんでした/);
assert.match(html, /app-runtime-loader\.js\?v=20260816-stuck-recovery1/);
assert.match(html, /home-dashboard-v2\.js\?v=20260816-stuck-recovery1/);
assert.match(html, /home-venue-tap-hotfix\.js\?v=20260816-stuck-recovery1/);
assert.match(html, /prediction-loading-watchdog\.js\?v=20260816-stuck-recovery1/);
assert.doesNotMatch(homeHotfix, /MutationObserver/);

console.log("prediction loading freeze recovery contract passed");
