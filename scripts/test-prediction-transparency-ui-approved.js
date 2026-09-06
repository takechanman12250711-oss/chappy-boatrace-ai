"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

// Keep the entire historical transparency regression test, but replace only
// the obsolete formation-display assertion that predates the approved
// PR #374 contract. The old assertion is fingerprinted below so this bridge
// fails closed if that source changes unexpectedly.
const originalPath = path.resolve(__dirname, "test-prediction-transparency-ui.js");
const source = fs.readFileSync(originalPath, "utf8");
const startMarker = "const exactFlowRows =";
const endMarker = "assert.equal(\n  html.split(flowCommonReason).length - 1,";
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);

assert.notEqual(start, -1, "legacy transparency formation block start is missing");
assert.notEqual(end, -1, "legacy transparency formation block end is missing");
assert.ok(end > start, "legacy transparency formation block boundaries are invalid");

const legacyBlock = source.slice(start, end);
[
  "通常欄のフォーメーションはformal selectionのexact 2券だけを表示する",
  "同じ1-3軸のフォーメーション2券を選定順で表示する",
  "formationの物理4点でなくformal selectionの2点をsummaryへ表示する",
  "通常欄へ候補formationの全流しを戻さない",
  "'data-flow-notation=\"1-3-4\"'",
  "'data-flow-notation=\"1-3-5\"'"
].forEach(fingerprint => {
  assert.ok(
    legacyBlock.includes(fingerprint),
    `legacy transparency formation fingerprint changed: ${fingerprint}`
  );
});

const approvedBlock = `const exactFlowRows =\n  html.match(\n    /data-flow-notation=\"[^\"]+\"/g\n  ) || [];\nassert.equal(\n  exactFlowRows.length,\n  1,\n  \"通常欄のフォーメーションは承認済みの全点表示を1組で表示する\"\n);\nassert.deepEqual(\n  exactFlowRows,\n  [\n    'data-flow-notation=\"1-3-全\"'\n  ],\n  \"候補formationの全点表示を承認済み表記のまま維持する\"\n);\nassert.match(\n  html,\n  /v3-ticket-accordion-flow[\\s\\S]{0,400}4点/,\n  \"1-3-全の物理4点をsummaryへ表示する\"\n);\nassert.match(\n  html,\n  /data-flow-notation=\"1-3-全\"|1\\s*→\\s*3\\s*→\\s*全/,\n  \"候補formationの全流し表示を維持する\"\n);\n`;

const transformed = source.slice(0, start) + approvedBlock + source.slice(end);
assert.equal(
  transformed.split("通常欄のフォーメーションは承認済みの全点表示を1組で表示する").length - 1,
  1,
  "approved transparency formation block must be injected exactly once"
);

// Execute every other historical transparency assertion unchanged.
const testModule = new Module(originalPath, module);
testModule.filename = originalPath;
testModule.paths = Module._nodeModulePaths(path.dirname(originalPath));
testModule._compile(transformed, originalPath);

// Also lock the display/purchase separation at the single-owner boundary:
// 12-345-全=24, 4-23-全=8, while practical purchases remain exact tickets.
require("./test-final-display-semantics.js");

console.log("prediction transparency approved formation bridge: ok");
