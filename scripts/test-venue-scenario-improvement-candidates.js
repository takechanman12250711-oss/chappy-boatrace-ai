"use strict";

const assert = require("node:assert/strict");
const report = require("../js/venue-scenario-improvement-candidates");

function driver(scenarioKey, theoryKey, recoveryRate, profit) {
  return {
    scenarioKey,
    scenarioLabel: scenarioKey === "sashi" ? "2コース差し" : "3コース攻め",
    theoryKey,
    label: theoryKey,
    evaluatedCount: 24,
    practicalHitRate: 20,
    recoveryRate,
    profit,
    classification: profit < 0 ? "WEAK" : "STRONG"
  };
}

const profile = {
  generatedAt: "2026-09-20T00:00:00.000Z",
  analysisInputContract: "official-pre-deadline-cohort-v1",
  venues: [
    {
      jcd: "01",
      place: "桐生",
      eligibleTheoryCount: 8,
      strongTheories: [],
      watchTheories: [],
      weakTheories: [{ theoryKey: "wall-boat" }],
      strongestTheory: null,
      weakestTheory: { theoryKey: "wall-boat" },
      lossDrivers: [
        driver("sashi", "race-flow", 8, -18000),
        driver("sashi", "remain-pickup", 9, -16000),
        driver("sashi", "wall-boat", 10, -14000)
      ],
      profitDrivers: []
    },
    {
      jcd: "20",
      place: "若松",
      eligibleTheoryCount: 9,
      strongTheories: [{ theoryKey: "race-flow" }],
      watchTheories: [],
      weakTheories: [],
      strongestTheory: { theoryKey: "wall-boat" },
      weakestTheory: { theoryKey: "skill" },
      lossDrivers: [],
      profitDrivers: [
        driver("threeAttack", "race-flow", 290, 41000),
        driver("threeAttack", "remain-pickup", 260, 33000),
        driver("threeAttack", "wall-boat", 346, 36000)
      ]
    }
  ]
};

const existing = {
  version: "race-flow-2course-sashi-skip-ab-v1-prospective",
  generatedAt: "2026-09-20T00:00:00.000Z",
  targetLabel: "2コース差し",
  cohort: { targetSettledCount: 284 },
  delta: { recoveryRate: 1.9, hitRate: 0.7 },
  interpretation: {
    adoptionDecisionReady: true,
    usableForPrediction: false
  }
};

const built = report.build(profile, { twoCourseSashiSkip: existing });
assert.equal(built.productionChanged, false);
assert.equal(built.automaticProductionChange, false);
assert.equal(built.usableForPrediction, false);
assert.equal(built.discoveryPolicy.heuristicIsValidationGate, false);
assert.equal(built.lossClusters.length, 1);
assert.equal(built.positiveControls.length, 1);
assert.equal(built.lossClusters[0].place, "桐生");
assert.equal(built.positiveControls[0].place, "若松");
assert.equal(built.discoveryCandidates.length, 1);
assert.equal(built.discoveryCandidates[0].phase8Eligibility.state, "INSUFFICIENT_EVIDENCE");
assert.equal(built.discoveryCandidates[0].phase8Eligibility.eligibleForValidation, false);
assert.equal(built.discoveryCandidates[0].phase8Eligibility.nextAction, "PREREGISTER_VENUE_SCOPED_PROSPECTIVE_SHADOW");
assert.equal(built.discoveryCandidates[0].existingFixedCounterfactual.targetSettledCount, 284);
assert.equal(built.phase8HandoffSummary.eligibleForValidation, 0);
assert.equal(built.focusVenues.length, 5);
assert.equal(built.focusVenues.find(row => row.jcd === "01").present, true);
assert.equal(built.focusVenues.find(row => row.jcd === "18").present, false);
assert.match(built.discoveryCandidates[0].candidateFingerprint, /^[a-f0-9]{64}$/);

const noEvidence = report.build(profile, {});
assert.equal(noEvidence.discoveryCandidates[0].phase8Eligibility.state, "NO_CANDIDATE");
assert.equal(noEvidence.discoveryCandidates[0].existingFixedCounterfactual, null);

console.log("venue scenario improvement candidate tests passed");
