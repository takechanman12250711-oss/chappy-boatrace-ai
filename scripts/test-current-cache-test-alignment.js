"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const {
  patchLoad,
  patchStats,
  generationBlock,
  parsedGenerationBlock
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
const previousLoad = load.replaceAll(
  "20261006-adjacent-start-rank1",
  "20260825-mobile-startup-terminal4"
);

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
    "'const VERSION=\"20261006-adjacent-start-rank1\"'"
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
assert.notEqual(
  previousLoad,
  load,
  "変更前の日和キャッシュ世代を再現できる"
);
assert.equal(
  patchLoad(previousLoad),
  patchedLoad,
  "変更前の日和キャッシュ世代から現行世代へ移行できる"
);
assert.equal(
  patchStats(patchedStats),
  patchedStats,
  "現行CSS世代へ再適用しても変更しない"
);


const currentGeneration = parsedGenerationBlock(
  "20260828-ui-audit-display1"
);
assert.equal(patchedLoad.includes(currentGeneration), true,
  "query順に依存しない現在形のgeneration blockを保持する");
const scriptVersionHelper = patchedLoad.match(/^function scriptVersion\(file\) \{[\s\S]*?^\}/m)?.[0];
assert.ok(scriptVersionHelper, "現在形のURL parserを保持する");
for (const query of [
  "v=20260828-ui-audit-display1&reader=20261116-1",
  "reader=20261116-1&v=20260828-ui-audit-display1",
  "reader=20261116-1&extra=1&v=20260828-ui-audit-display1"
]) {
  const version = vm.runInNewContext(scriptVersionHelper + '\nscriptVersion("js/prediction-runtime-loader.js");', {
    URL, html: '<script src="js/prediction-runtime-loader.js?' + query + '"></script>'
  });
  assert.equal(version, "20260828-ui-audit-display1",
    "現在形はvがquery先頭でなくても同じ世代を取得する");
}
const supportedLegacyGenerations = [
  ["20260828-ui-audit-display1", "20261006-adjacent-start-rank1"],
  ["20260828-ui-audit-display1", "20260829-effective-score-contract1"],
  ["20260828-ui-audit-display1", "20260825-mobile-startup-terminal4"],
  ["20260824-readonly-core-fix1", "20260825-mobile-startup-terminal4"],
  ["20260816-runtime-deadline1", "20260825-mobile-startup-terminal4"],
  ["20260820-third-six-fixed5", "20260825-mobile-startup-terminal4"],
  ["20260823-three-course-134-v1", "20260825-mobile-startup-terminal4"],
  ["20260823-local-water-v2-gap3-v1", "20260825-mobile-startup-terminal4"]
];
for (const [version, hiyori] of supportedLegacyGenerations) {
  const legacy = load.replace(currentGeneration, generationBlock(version, hiyori));
  assert.notEqual(legacy, load, "旧generation blockを実際に再現する");
  assert.equal(patchLoad(legacy), patchedLoad, "旧supported generationも現在形へ移行する");
}
const noHelper = load.replace(currentGeneration, generationBlock("20260828-ui-audit-display1"))
  .replace("\n" + scriptVersionHelper, "");
assert.equal(noHelper.includes("function scriptVersion("), false);
assert.equal(patchLoad(noHelper), patchedLoad, "旧本文に未定義のURL parserを残さず追加する");
for (const duplicate of [
  load + "\n" + currentGeneration,
  load + "\n" + generationBlock("20260828-ui-audit-display1"),
  load.replace(currentGeneration, generationBlock("20260828-ui-audit-display1") + "\n" + generationBlock("20260828-ui-audit-display1"))
]) assert.throws(() => patchLoad(duplicate), /runtime generation block: expected exactly one/);
const unsupported = load.replace(
  'scriptVersion("js/prediction-runtime-loader.js") === "20260828-ui-audit-display1"',
  'scriptVersion("js/prediction-runtime-loader.js") === "unreviewed-generation"'
);
assert.throws(() => patchLoad(unsupported), /runtime generation block: expected exactly one/);
assert.throws(() => patchLoad(load.replace(scriptVersionHelper, scriptVersionHelper + "\n" + scriptVersionHelper)),
  /script version helper/);

console.log(
  "current cache test alignment: ok"
);
