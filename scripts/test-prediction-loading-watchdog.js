"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const watchdog = fs.readFileSync(path.join(__dirname, "..", "js", "prediction-loading-watchdog.js"), "utf8");
const appRuntime = fs.readFileSync(path.join(__dirname, "..", "js", "app-runtime-loader.js"), "utf8");
const homeHotfix = fs.readFileSync(path.join(__dirname, "..", "js", "home-venue-tap-hotfix.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

assert.match(watchdog, /FIRST_TIMEOUT_MS = 20000/);
assert.doesNotMatch(watchdog, /FINAL_TIMEOUT_MS = 15000/);
assert.doesNotMatch(watchdog, /ChappyAppRuntime\?\.ensure\?\.\("race"\)/);
assert.doesNotMatch(watchdog, /fetchRaceBtn/);
assert.doesNotMatch(watchdog, /button\.click\(\)/);
assert.match(watchdog, /selectedMatches/);
assert.match(watchdog, /showPredictionError/);
assert.match(watchdog, /chappy:prediction-rendered/);
assert.match(watchdog, /自動再開始はせず/);

assert.match(appRuntime, /const VERSION = "20260815-odds-immediate1"/);
assert.match(appRuntime, /SCRIPT_LOAD_TIMEOUT_MS=15000/);
assert.match(appRuntime, /PRELOAD_LOOKAHEAD=2/);
assert.match(appRuntime, /prediction-runtime-loader\.js/);
assert.match(appRuntime, /hiyori-runtime-loader\.js/);

assert.match(html, /prediction-runtime-loader\.js\?v=20260823-three-course-134-v1/);
assert.match(html, /hiyori-runtime-loader\.js\?v=20260816-nonblocking-core2/);
assert.match(html, /app-runtime-loader\.js\?v=20260816-static-race1/);
assert.match(html, /home-dashboard-v2\.js\?v=20260816-static-race1/);
assert.match(html, /home-venue-tap-hotfix\.js\?v=20260816-full-entry-restore1/);
assert.doesNotMatch(html, /prediction-loading-watchdog\.js/);
assert.doesNotMatch(homeHotfix, /MutationObserver/);

console.log("restored prediction loading contract passed");
