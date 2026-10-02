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
assert.match(
  patched,
  /const skillHistory =\s+racerSkillStats\?\.racers\?\.\[registerNo\] \|\|\s+null;/,
  "本番履歴contextへ選手コース別ST履歴を載せる"
);
assert.match(
  patched,
  /if \(!stats && !venueStats && !skillHistory\)/,
  "選手ST履歴だけ存在する選手も履歴contextから落とさない"
);
assert.match(
  patched,
  /skillHistory,\s+samples:\s+Number\(\s+stats\?\.starts \?\?\s+skillHistory\?\.windows\?\.all3Years\?\.starts/,
  "ST正式判定用skillHistoryとサンプル数を本番予想へ渡す"
);
assert.equal(patchText(patched), patched, "source patchは冪等であること");

console.log("ST/slit storage source patcher test: ok");