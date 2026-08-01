"use strict";

const assert = require("assert");
const calibration = require("../js/scenario-likelihood-v5-calibration");

const rows = [];
for (let index = 0; index < 30; index += 1) {
  rows.push({
    comparable: true,
    jcd: "20",
    actualScenario: "course3Attack",
    leaderScenario: "course3Attack",
    ambiguity: "clear",
    leaderLikelihood: 40,
    leaderHit: index < 18,
    topTwoHit: index < 24
  });
}
for (let index = 0; index < 10; index += 1) {
  rows.push({
    comparable: true,
    jcd: "04",
    actualScenario: "inEscape",
    leaderScenario: "inEscape",
    ambiguity: "mixed",
    leaderLikelihood: 55,
    leaderHit: index < 5,
    topTwoHit: index < 8
  });
}

const result = calibration.build(rows, { minimumSamples: 30 });
assert.strictEqual(result.status, "proposal-only");
assert.strictEqual(result.usableForPrediction, false);
assert.strictEqual(result.automaticApplication, false);
assert.strictEqual(result.comparableCount, 40);

const venue20 = result.byVenue.find(row => row.key === "20");
assert.ok(venue20);
assert.strictEqual(venue20.samples, 30);
assert.strictEqual(venue20.status, "review-ready");
assert.strictEqual(venue20.leaderHitRate, 60);
assert.strictEqual(venue20.averageLeaderLikelihood, 40);
assert.strictEqual(venue20.calibrationGap, 20);
assert.strictEqual(venue20.proposal.action, "raise");
assert.strictEqual(venue20.proposal.automaticApplication, false);

const venue04 = result.byVenue.find(row => row.key === "04");
assert.strictEqual(venue04.status, "insufficient-samples");
assert.strictEqual(venue04.proposal, null);

const scenario = result.byScenario.find(row => row.key === "course3Attack");
assert.strictEqual(scenario.samples, 30);
assert.strictEqual(scenario.proposal.action, "raise");

console.log("scenario likelihood v5 calibration tests passed");
