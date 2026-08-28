"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const {
  patchLoad,
  patchStats
} = require(
  "./apply-current-cache-test-alignment"
);

const load = fs.readFileSync(
  "scripts/test-load-performance.js",
  "utf8"
);
const stats = fs.readFileSync(
  "scripts/test-auto-stats.js",
  "utf8"
);
const patchedLoad = patchLoad(load);
const patchedStats = patchStats(stats);

assert.equal(
  patchedLoad.includes(
    '"js/app-runtime-loader.js?v=20260816-static-race1"'
  ),
  true
);
assert.equal(
  patchedLoad.includes(
    '"js/home-dashboard-v2.js?v=20260816-static-race1"'
  ),
  true
);
assert.equal(
  patchedLoad.includes(
    "'const VERSION = \"20260828-ui-audit-display1\"'"
  ),
  true
);
assert.equal(
  patchedLoad.includes(
    "'const VERSION = \"20260828-ui-audit-display1\"'"
  ),
  true
);
assert.equal(
  patchedLoad.includes(
    "'const VERSION=\"20260825-mobile-startup-terminal4\"'"
  ),
  true
);
assert.equal(
  patchedLoad.includes(
    'predictionRuntime.includes("SCRIPT_LOAD_TIMEOUT_MS = 12000")'
  ),
  true
);
assert.equal(
  patchedLoad.includes(
    'hiyoriLoader.includes("SCRIPT_LOAD_TIMEOUT_MS=12000")'
  ),
  true
);
assert.equal(
  patchedStats.includes(
    "/style\\.css\\?v=20260828-ui-audit-display1/"
  ),
  true
);
assert.equal(
  patchLoad(patchedLoad),
  patchedLoad,
  "現行キャッシュ世代へ再適用しても変更しない"
);
assert.equal(
  patchStats(patchedStats),
  patchedStats,
  "現行CSS世代へ再適用しても変更しない"
);

console.log(
  "current cache test alignment: ok"
);
