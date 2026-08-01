"use strict";

const assert = require("node:assert/strict");
const verification = require("../js/scenario-likelihood-v5-ab-verification");

const KEY_BY_LABEL = {
  "1逃げ": "inEscape",
  "2差し": "course2Sashi",
  "3攻め": "course3Attack",
  "4カド": "course4Kado"
};

function variant(leader, runnerUp, actualLikelihood) {
  return {
    leader: { key: KEY_BY_LABEL[leader], label: leader },
    runnerUp: { key: KEY_BY_LABEL[runnerUp], label: runnerUp },
    ambiguity: "lean",
    scenarios: Object.entries(KEY_BY_LABEL).map(([label, key]) => ({
      key,
      label,
      relativeLikelihood: label === leader ? 55 : actualLikelihood
    }))
  };
}

{
  const snapshot = {
    changed: true,
    a: variant("1逃げ", "2差し", 20),
    b: variant("2差し", "1逃げ", 55)
  };
  const result = {
    resultAvailable: true,
    trifecta: { combination: "2-1-3" },
    winningMethod: "差し"
  };
  const row = verification.verify(snapshot, result);
  assert.equal(row.comparable, true);
  assert.equal(row.actualScenario, "2差し");
  assert.equal(row.winner, "b");
  assert.equal(row.a.leaderHit, false);
  assert.equal(row.b.leaderHit, true);
}

{
  const rows = Array.from({ length: 100 }, (_, index) => ({
    comparable: true,
    changed: true,
    winner: index === 0 ? "a" : index < 40 ? "b" : "tie",
    jcd: "20",
    actualScenario: "3攻め",
    a: { leaderHit: index < 50, topTwoHit: index < 80 },
    b: { leaderHit: index < 54, topTwoHit: index < 82 }
  }));
  const summary = verification.buildSummary(rows);
  assert.equal(summary.overall.samples, 100);
  assert.equal(summary.overall.leaderHitImprovement, 4);
  assert.equal(summary.overall.degradationRate, 1);
  assert.equal(summary.overall.productionCandidate, true);
  assert.equal(summary.usableForPrediction, false);
  assert.equal(summary.automaticApplication, false);
}

console.log("scenario likelihood v5 A/B verification tests passed");
