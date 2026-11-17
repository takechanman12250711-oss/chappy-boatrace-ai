"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const watchdog = fs.readFileSync(path.join(__dirname, "..", "js", "prediction-loading-watchdog.js"), "utf8");
const appRuntime = fs.readFileSync(path.join(__dirname, "..", "js", "app-runtime-loader.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
function scriptVersion(file) {
  const src = [...html.matchAll(/<script\s+[^>]*src="([^"]+)"/g)].map(m => m[1]);
  const url = src.map(src => new URL(src, "https://fixture.invalid/")).find(url => url.pathname === "/" + file);
  return url ? url.searchParams.get("v") : null;
}

assert.match(watchdog, /FIRST_TIMEOUT_MS = 20000/);
assert.doesNotMatch(watchdog, /FINAL_TIMEOUT_MS = 15000/);
assert.doesNotMatch(watchdog, /ChappyAppRuntime\?\.ensure\?\.\("race"\)/);
assert.doesNotMatch(watchdog, /fetchRaceBtn/);
assert.doesNotMatch(watchdog, /button\.click\(\)/);
assert.match(watchdog, /selectedMatches/);
assert.match(watchdog, /showPredictionError/);
assert.match(watchdog, /chappy:prediction-rendered/);
assert.match(watchdog, /自動再開始はせず/);

assert.match(appRuntime, /const VERSION = "20260828-ui-audit-display1"/);
assert.match(appRuntime, /SCRIPT_LOAD_TIMEOUT_MS=15000/);
assert.match(appRuntime, /PRELOAD_LOOKAHEAD=2/);
assert.match(appRuntime, /prediction-runtime-loader\.js/);
assert.match(appRuntime, /hiyori-runtime-loader\.js/);

assert.equal(scriptVersion("js/prediction-runtime-loader.js"), "20260828-ui-audit-display1");
assert.equal(scriptVersion("js/hiyori-runtime-loader.js"), "20261006-adjacent-start-rank1");
assert.equal(scriptVersion("js/app-runtime-loader.js"), "20260816-static-race1");
assert.equal(scriptVersion("js/home-dashboard-v2.js"), "20260816-static-race1");
assert.doesNotMatch(html, /home-venue-tap-hotfix\.js|outer-attack-ticket-shadow-guard\.js/);
assert.doesNotMatch(html, /prediction-loading-watchdog\.js/);

console.log("restored prediction loading contract passed");
