"use strict";

const assert = require("node:assert/strict");
const grid = require("./build-local-water-outer-head-eligibility-grid");

function formalPrediction(index, actualHead, kind = "none", score = null) {
  const target = actualHead === 6 ? 6 : 5;
  const body = {
    venueWaterSupport: {
      venue: index % 2 ? "三国" : "若松",
      wind: index % 3 === 0 ? 5 : 2,
      wave: 2,
      confirmations: ["締切前の当地・水面特性を補助評価"]
    },
    verificationEvidence: { mainScenario: { headBoatNo: 1 } }
  };
  if (kind === "explicit") {
    body.candidatePool = [{ boatNo: target, role: "alternate-head", eligiblePositions: [1], score: score || 90 }];
  } else if (kind === "support") {
    body.boatEvaluation = {
      evaluations: [{
        boatNo: target,
        roleIntents: ["pickup"],
        eligiblePositions: [3],
        score,
        reason: "展開拾い"
      }]
    };
  } else if (kind === "attack") {
    body.boatEvaluation = {
      evaluations: [{
        boatNo: target,
        roleIntents: ["pickup"],
        eligiblePositions: [3],
        score,
        reason: "外の攻め筋"
      }]
    };
  }
  return {
    date: `2026${String(index + 1).padStart(4, "0")}`,
    jcd: String((index % 24) + 1).padStart(2, "0"),
    raceNo: (index % 12) + 1,
    prediction: body
  };
}

const predictions = [];
const results = [];
for (let index = 0; index < 300; index++) {
  let actualHead = 1;
  let kind = "none";
  let score = null;
  if (index < 30) {
    actualHead = index % 3 === 0 ? 6 : 5;
    if (index < 5) kind = "explicit";
    else if (index < 15) {
      kind = "support";
      score = 80;
    }
  } else if (index < 50) {
    kind = "support";
    score = 80;
  } else if (index < 100) {
    kind = "support";
    score = 68;
  }

  const prediction = formalPrediction(index, actualHead, kind, score);
  predictions.push(prediction);
  results.push({
    date: prediction.date,
    jcd: prediction.jcd,
    raceNo: prediction.raceNo,
    resultAvailable: true,
    status: "finished",
    trifecta: { combination: `${actualHead}-${actualHead === 1 ? 2 : 1}-${actualHead === 3 ? 2 : 3}` }
  });
}

const report = grid.build(
  [{ predictions }],
  [{ races: results }],
  {
    version: "local-water-outer-head-role-qualification-audit-v1",
    nextStep: "build-outer-head-eligibility-counterfactual-grid"
  }
);

assert.equal(report.productionChanged, false);
assert.equal(report.automaticApplication, false);
assert.equal(report.usableForPrediction, false);
assert.equal(report.usesOdds, false);
assert.equal(report.applicable, true);
assert.equal(report.cohortCount, 300);
assert.equal(report.actualOuterHeadCount, 30);
assert.equal(report.baseline.actualOuterWinnerCoveredCount, 5);
assert.equal(report.selectedRule.ruleId, "support-score75");
assert.equal(report.selectedRule.newWinnerCaptureCount, 10);
assert.equal(report.selectedRule.newFalsePromotionCandidateCount, 20);
assert.equal(report.selectedRule.falsePerNewWinner, 2);
assert.equal(report.selectedRule.newPromotionRaceRate, 10);
assert.equal(report.nextStep, "build-outer-head-eligibility-shadow-ab");

const notApplicable = grid.build(
  [{ predictions }],
  [{ races: results }],
  { version: "x", nextStep: "follow-upstream-diagnosis-focus" }
);
assert.equal(notApplicable.applicable, false);
assert.equal(notApplicable.selectedRule, null);
assert.equal(notApplicable.nextStep, "follow-upstream-diagnosis-focus");

const small = grid.build(
  [{ predictions: predictions.slice(0, 299) }],
  [{ races: results.slice(0, 299) }],
  {
    version: "local-water-outer-head-role-qualification-audit-v1",
    nextStep: "build-outer-head-eligibility-counterfactual-grid"
  }
);
assert.equal(small.nextStep, "continue-collecting-outer-head-eligibility-evidence");

const snapshot = {
  explicitHead: false,
  supportVisible: true,
  attackEvidence: false,
  score: 80,
  conditionBand: "calm"
};
assert.equal(grid.ruleEligible(grid.RULES.find((rule) => rule.id === "support-score75"), snapshot), true);
assert.equal(grid.ruleEligible(grid.RULES.find((rule) => rule.id === "support-score85"), snapshot), false);
assert.equal(grid.ruleEligible(grid.RULES.find((rule) => rule.id === "attack-score75"), snapshot), false);

console.log("local water outer head eligibility grid test: ok");
