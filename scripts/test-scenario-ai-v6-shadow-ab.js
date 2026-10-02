"use strict";

const assert = require("node:assert/strict");
const shadowAb = require("../js/scenario-ai-v6-shadow-ab");
const scenarioAiV6 = require("../js/scenario-ai-v6-shadow");
const snapshots = require("./build-scenario-ai-v6-snapshots");
const reproducibilityGate = require("./build-scenario-ai-v6-reproducibility-gate");
const verificationBuilder = require("./build-scenario-ai-v6-verification");
const abReport = require("./build-scenario-ai-v6-ab-report");

const INPUT_SOURCE_KIND = "live-verification-evidence";
const TRAINED_THROUGH = "2026-08-08T00:00:00.000Z";
const CANDIDATE_GENERATED_AT = "2026-08-08T12:00:00.000Z";
const SELECTED_AT = "2026-08-09T00:00:00.000Z";

const snapshot = {
  logicFingerprint: scenarioAiV6.LOGIC_FINGERPRINT,
  inputSourceKind: INPUT_SOURCE_KIND,
  scenarios: [
    { rank: 1, scenarioType: "escape", rawScore: 60, likelihood: 60, finishOrder: [1, 2, 4], representativeTicket: "1-2-4" },
    { rank: 2, scenarioType: "sashi", rawScore: 40, likelihood: 40, finishOrder: [2, 1, 4], representativeTicket: "2-1-4" }
  ]
};

const report = {
  generatedAt: CANDIDATE_GENERATED_AT,
  trainingCohort: {
    fingerprint: "training-cohort-1",
    trainedThrough: TRAINED_THROUGH,
    inputSourceKind: INPUT_SOURCE_KIND
  },
  approvalGate: {
    approvedCandidates: [
      { approved: true, scope: "scenario-type", key: "sashi", adjustment: 2 },
      { approved: true, scope: "venue-scenario-type", key: "20:sashi", adjustment: 2 }
    ]
  }
};

const result = shadowAb.build(snapshot, report, { jcd: "20", selectedAt: SELECTED_AT });
assert.equal(result.status, "shadow-ready");
assert.equal(result.b.scenarios.find(row => row.scenarioType === "sashi").adjustment, 4);
assert.equal(result.distributionChanged, true);
assert.equal(result.decisionChanged, false);
assert.equal(result.changed, true);
assert.equal(result.comparisonReady, false);
assert.equal(result.candidateTemporalEligible, true);
assert.equal(result.candidateSourceEligible, true);
assert.equal(result.candidateGeneratedAt, CANDIDATE_GENERATED_AT);
assert.equal(result.candidateTrainingCutoff, CANDIDATE_GENERATED_AT);
assert.equal(result.usableForPrediction, false);
assert.equal(result.automaticApplication, false);
assert.equal(Math.round(result.b.scenarios.reduce((sum, row) => sum + row.likelihood, 0) * 10) / 10, 100);

const noApproval = shadowAb.build(snapshot, { approvalGate: { approvedCandidates: [] } }, { jcd: "20" });
assert.equal(noApproval.changed, false);
assert.equal(noApproval.status, "candidate-unavailable");

const decisionSnapshot = {
  logicFingerprint: scenarioAiV6.LOGIC_FINGERPRINT,
  inputSourceKind: INPUT_SOURCE_KIND,
  scenarios: [
    { rank: 1, scenarioType: "sashi", rawScore: 53, likelihood: 50.5, finishOrder: [2, 1, 4], representativeTicket: "2-1-4" },
    { rank: 2, scenarioType: "escape", rawScore: 52, likelihood: 49.5, finishOrder: [1, 2, 4], representativeTicket: "1-2-4" }
  ]
};
const lowerSashi = {
  generatedAt: CANDIDATE_GENERATED_AT,
  trainingCohort: {
    fingerprint: "training-cohort-1",
    trainedThrough: TRAINED_THROUGH,
    inputSourceKind: INPUT_SOURCE_KIND
  },
  approvalGate: {
    approvedCandidates: [
      { approved: true, scope: "scenario-type", key: "sashi", adjustment: -2 }
    ]
  }
};
const decisionResult = shadowAb.build(decisionSnapshot, lowerSashi, {
  jcd: "20",
  selectedAt: SELECTED_AT
});
assert.equal(decisionResult.changed, true);
assert.equal(decisionResult.decisionChanged, true);
assert.equal(decisionResult.comparisonReady, true);
assert.equal(decisionResult.a.scenarios[0].scenarioType, "sashi");
assert.equal(decisionResult.b.scenarios[0].scenarioType, "escape");
assert.notEqual(
  decisionResult.a.scenarios[0].representativeTicket,
  decisionResult.b.scenarios[0].representativeTicket
);

const single = shadowAb.build({
  logicFingerprint: scenarioAiV6.LOGIC_FINGERPRINT,
  inputSourceKind: INPUT_SOURCE_KIND,
  scenarios: [{ rank: 1, scenarioType: "sashi", rawScore: 53, likelihood: 100, finishOrder: [2, 1, 4], representativeTicket: "2-1-4" }]
}, lowerSashi, { jcd: "20", selectedAt: SELECTED_AT });
assert.equal(single.status, "alternative-unavailable");
assert.equal(single.comparisonReady, false);
assert.equal(single.distributionChanged, false);

const tooEarly = shadowAb.build(decisionSnapshot, lowerSashi, {
  jcd: "20",
  selectedAt: "2026-08-08T06:00:00.000Z"
});
assert.equal(tooEarly.status, "candidate-not-yet-eligible");
assert.equal(tooEarly.variantEligible, false);
assert.equal(tooEarly.distributionChanged, false);

const sourceMismatch = shadowAb.build(
  { ...decisionSnapshot, inputSourceKind: "stored-v5-pre-race" },
  lowerSashi,
  { jcd: "20", selectedAt: SELECTED_AT }
);
assert.equal(sourceMismatch.status, "candidate-source-mismatch");
assert.equal(sourceMismatch.comparisonReady, false);

const nonMatchingVenue = shadowAb.build(decisionSnapshot, {
  ...lowerSashi,
  approvalGate: {
    approvedCandidates: [
      { approved: true, scope: "venue-scenario-type", key: "05:sashi", adjustment: -2 }
    ]
  }
}, { jcd: "20", selectedAt: SELECTED_AT });
assert.equal(nonMatchingVenue.status, "candidate-not-applicable");
assert.equal(nonMatchingVenue.variantEligible, false);
assert.equal(nonMatchingVenue.comparisonReady, false);

const attached = snapshots.attachSnapshots(
  { verificationPredictions: [{ jcd: "20", selectedAt: SELECTED_AT, prediction: { verificationEvidence: {} } }] },
  () => decisionSnapshot,
  shadowAb.build,
  lowerSashi
);
assert.equal(attached.verificationPredictions.length, 1);
assert.ok(attached.verificationPredictions[0].scenarioAiV6ShadowAb);
assert.equal(attached.scenarioAiV6ShadowAb.usableForPrediction, false);
assert.equal(attached.scenarioAiV6ShadowAb.automaticApplication, false);
assert.equal(attached.scenarioAiV6ShadowAb.changedCount, 1);
assert.equal(attached.scenarioAiV6ShadowAb.distributionChangedCount, 1);
assert.equal(attached.scenarioAiV6ShadowAb.decisionChangedCount, 1);

const trainingRecords = Array.from({ length: 60 }, (_, index) => {
  const selectedAt = new Date(Date.parse("2026-01-01T00:00:00.000Z") + index * 3600000).toISOString();
  return {
    raceKey: `20260101-01-${index + 1}`,
    date: "20260101",
    selectedAt,
    jcd: "01",
    place: "桐生",
    scenarioAiV6Shadow: {
      logicFingerprint: scenarioAiV6.LOGIC_FINGERPRINT,
      inputSourceKind: "stored-v5-pre-race"
    },
    scenarioAiV6ShadowAb: { candidateSetFingerprint: "none" },
    scenarioAiV6Verification: {
      status: "verified",
      logicFingerprint: scenarioAiV6.LOGIC_FINGERPRINT,
      inputSourceKind: "stored-v5-pre-race",
      scenarios: [{
        rank: 1,
        scenarioType: "sashi",
        likelihood: 60,
        exact: false,
        firstHit: false,
        top2Hit: false,
        winningMethodMatch: false,
        breakReasons: ["差し想定不成立"]
      }]
    }
  };
});
const learnedGate = reproducibilityGate.buildReport([{
  date: "20260101",
  verificationPredictions: trainingRecords
}]);
learnedGate.generatedAt = "2026-08-08T12:00:00.000Z";
assert.ok(learnedGate.approvalGate.approvedCandidates.some(row =>
  row.scope === "scenario-type" &&
  row.key === "sashi" &&
  row.adjustment === -2
));

const futureSnapshot = snapshots.attachSnapshots({
  date: "20260809",
  verificationPredictions: [{
    raceKey: "20260809-20-1",
    date: "20260809",
    selectedAt: "2026-08-09T00:00:00.000Z",
    jcd: "20",
    place: "若松",
    scenarioLikelihoodV5: {
      scenarios: [
        { key: "sashi", label: "2差し", score: 53 },
        { key: "escape", label: "1逃げ", score: 55 },
        { key: "threeAttack", label: "3攻め", score: 20 },
        { key: "fourAttack", label: "4攻め", score: 15 }
      ]
    },
    prediction: {
      verificationEvidence: {
        mainScenario: { type: "sashi", label: "2差し", headBoatNo: 2 }
      },
      mainSheet: {
        honmei: { boatNo: 1 },
        taikou: { boatNo: 2 },
        ana: { boatNo: 4 }
      }
    }
  }]
}, scenarioAiV6.build, shadowAb.build, learnedGate);
const futureRecord = futureSnapshot.verificationPredictions[0];
assert.equal(futureRecord.scenarioAiV6Shadow.scenarios.length, 4);
assert.equal(futureRecord.scenarioAiV6ShadowAb.comparisonReady, true);
assert.equal(futureRecord.scenarioAiV6ShadowAb.a.scenarios[0].scenarioType, "sashi");
assert.equal(futureRecord.scenarioAiV6ShadowAb.b.scenarios[0].scenarioType, "escape");

const verifiedFuture = verificationBuilder.build(futureSnapshot, {
  date: "20260809",
  races: [{
    jcd: "20",
    raceNo: 1,
    resultAvailable: true,
    trifecta: { combination: "1-2-4" },
    winningMethod: "逃げ"
  }]
}).data;
const integratedReport = abReport.buildReport([verifiedFuture]);
assert.equal(integratedReport.overall.comparableCount, 1);
assert.equal(integratedReport.overall.bWins, 1);
assert.equal(integratedReport.activeCandidateTrainingFingerprint, learnedGate.trainingCohort.fingerprint);

console.log("展開AI v6シャドーA/Bテスト成功");
