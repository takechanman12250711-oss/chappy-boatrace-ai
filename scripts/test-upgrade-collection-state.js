"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const text = fs.readFileSync(path.join(__dirname, "..", "docs", "upgrade-collection-state.md"), "utf8");
for (const key of ["scenarioLikelihoodV5Calibration", "scenarioLikelihoodV5Ab", "scenarioAiV6", "theoryEvaluation", "theoryShadowAb", "practicalPriorityShadow", "frameRiseFallShadow"]) {
  assert.match(text, new RegExp(`${key}: collect`));
}
assert.match(text, /収集システムは継続/);
console.log("upgrade collection state tests passed");
