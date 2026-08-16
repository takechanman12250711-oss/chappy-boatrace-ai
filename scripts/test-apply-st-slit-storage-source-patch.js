"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { patchText } = require("./apply-st-slit-storage-source-patch");

const sourcePath = path.join(process.cwd(), "scripts", "collect-predictions.js");
const source = fs.readFileSync(sourcePath, "utf8");
const patched = patchText(source);

assert.notEqual(patched, source, "未修正sourceには差分が必要");
assert.match(patched, /slitAdjustment: Number\(value\.slitAdjustment \|\| 0\)/);
assert.match(patched, /slitReasons: Array\.isArray\(value\.slitReasons\)/);
assert.match(patched, /source: String\(aiCore\?\.stSlitTheory\?\.source \|\| ""\)/);
assert.match(patched, /providedScenarios\.map\(\(provided, index\) =>/);
assert.match(patched, /aiCoreEvidence\?\.stSlit\?\.roles \|\| \[\]/);
assert.equal(patchText(patched), patched, "source patchは冪等であること");

console.log("ST/slit storage source patcher test: ok");
