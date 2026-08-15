"use strict";
const assert = require("node:assert/strict");
const config = require("../config/upgrade-collection-systems.json");
const required = [
  "scenarioLikelihoodV5Calibration",
  "scenarioLikelihoodV5Ab",
  "scenarioAiV6",
  "theoryEvaluation",
  "theoryShadowAb",
  "practicalPriorityShadow",
  "frameRiseFallShadow"
];
required.forEach(key => assert.equal(config.systems[key], "collect", `${key} collection must remain active`));
console.log("upgrade system collection contract tests passed");
