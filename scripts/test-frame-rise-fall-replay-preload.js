"use strict";

const assert = require("node:assert/strict");
require("../js/frame-rise-fall-replay-preload");
const selector = require("../js/practical-selection");

const prediction = {
  aiCore: {
    version: "test-core",
    analyses: [1, 2, 3, 4, 5, 6].map(boatNo => ({ boatNo, indexes: { total: 60 }, roleScores: {} })),
    raceScenarios: {
      mainScenario: { type: "escape", headBoatNo: 1, score: 70 },
      scenarios: [
        { type: "escape", headBoatNo: 1, score: 70 },
        { type: "sashi", headBoatNo: 2, score: 60 }
      ]
    },
    courseMapping: { formal: true, byBoat: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6 } }
  },
  raceFlow: { title: "1逃げ" },
  mainSheet: { tickets: [] },
  manshuSheet: { tickets: [] }
};

const selection = selector.select(prediction);
assert.ok(selection.frameRiseFallReplayBasis, "select時に同一入力の再生basisを保持する");
assert.equal(selection.frameRiseFallReplayBasis.analyses.length, 6);
assert.equal(selection.frameRiseFallReplayBasis.raceScenarios.mainScenario.type, "escape");
const compact = selector.compactAudit(selection);
assert.ok(compact.frameRiseFallReplayBasis, "compactAudit後も再生basisを保存する");
assert.equal(compact.frameRiseFallReplayBasis.aiCoreVersion, "test-core");
console.log("frame rise fall replay preload tests passed");
