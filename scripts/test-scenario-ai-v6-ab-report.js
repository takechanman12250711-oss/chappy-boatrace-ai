"use strict";

const assert = require("node:assert/strict");
const report = require("./build-scenario-ai-v6-ab-report");
const scenarioAiV6 = require("../js/scenario-ai-v6-shadow");
const scenarioAiV6ShadowAb = require("../js/scenario-ai-v6-shadow-ab");

const DEFAULT_SOURCE_KIND = "live-verification-evidence";
const DEFAULT_CANDIDATE = "scenario-type:sashi:-2";
const DEFAULT_TRAINING = "training-cohort-v1";
const DEFAULT_CUTOFF = "2025-12-31T23:59:59.000Z";

function orderOf(ticket) {
  const boats = String(ticket || "").match(/[1-6]/g) || [];
  return boats.length >= 3 ? boats.slice(0, 3).map(Number) : [];
}

function record(
  raceKey,
  aTicket,
  bTicket,
  actual,
  jcd = "20",
  changed = true,
  options = {}
) {
  const candidateSetFingerprint =
    options.candidateSetFingerprint ?? DEFAULT_CANDIDATE;
  const sourceLogicFingerprint =
    options.sourceLogicFingerprint ?? scenarioAiV6.LOGIC_FINGERPRINT;
  const inputSourceKind =
    options.inputSourceKind ?? DEFAULT_SOURCE_KIND;
  const snapshotSourceKind =
    options.snapshotSourceKind ?? inputSourceKind;
  const verificationSourceKind =
    options.verificationSourceKind ?? inputSourceKind;
  const candidateTrainingInputSourceKind =
    options.candidateTrainingInputSourceKind ?? inputSourceKind;
  const candidateTrainingFingerprint =
    options.candidateTrainingFingerprint ?? DEFAULT_TRAINING;
  const candidateTrainingCutoff =
    options.candidateTrainingCutoff ?? DEFAULT_CUTOFF;
  const selectedAt =
    options.selectedAt ?? "2026-01-01T00:00:00.000Z";
  const capturedAt = options.capturedAt ?? selectedAt;
  const aFinishOrder = Object.hasOwn(options, "aFinishOrder")
    ? options.aFinishOrder
    : orderOf(aTicket);
  const bFinishOrder = Object.hasOwn(options, "bFinishOrder")
    ? options.bFinishOrder
    : orderOf(bTicket);
  const comparisonReady = options.comparisonReady ?? changed;
  const decisionChanged = options.decisionChanged ?? changed;
  const variantEligible = options.variantEligible ?? (
    candidateSetFingerprint !== "none" && changed
  );
  const scoreableDecision = options.scoreableDecision ?? changed;
  const cohortKey = options.cohortKey ?? [
    sourceLogicFingerprint || "unknown",
    inputSourceKind || "unknown",
    candidateSetFingerprint,
    candidateTrainingFingerprint
  ].join("|");

  return {
    raceKey,
    date: raceKey.slice(0, 8),
    jcd,
    place: jcd === "20" ? "若松" : "大村",
    selectedAt,
    scenarioAiV6Shadow: {
      version: scenarioAiV6.VERSION,
      logicFingerprint:
        options.snapshotLogicFingerprint ?? scenarioAiV6.LOGIC_FINGERPRINT,
      inputSourceKind: snapshotSourceKind
    },
    scenarioAiV6ShadowAb: {
      changed,
      decisionChanged,
      distributionChanged:
        options.distributionChanged ?? changed,
      comparisonReady,
      variantEligible,
      scoreableDecision,
      logicFingerprint:
        options.abLogicFingerprint ?? scenarioAiV6ShadowAb.LOGIC_FINGERPRINT,
      sourceLogicFingerprint,
      inputSourceKind,
      candidateSetFingerprint,
      candidateTrainingFingerprint,
      candidateTrainingCutoff,
      candidateTrainingInputSourceKind,
      capturedAt,
      cohortKey,
      a: {
        scenarios: [{
          scenarioType: options.aScenarioType ?? "escape",
          finishOrder: aFinishOrder,
          representativeTicket: aTicket
        }]
      },
      b: {
        scenarios: [{
          scenarioType: options.bScenarioType ?? "sashi",
          finishOrder: bFinishOrder,
          representativeTicket: bTicket
        }]
      }
    },
    scenarioAiV6Verification: {
      status: "verified",
      logicFingerprint:
        options.verificationLogicFingerprint ?? scenarioAiV6.LOGIC_FINGERPRINT,
      inputSourceKind: verificationSourceKind,
      actualOrder: orderOf(actual)
    }
  };
}

function selectedAt(index, base = Date.parse("2026-01-01T00:00:00.000Z")) {
  return new Date(base + index * 60 * 60 * 1000).toISOString();
}

const finishOrderPriority = report.scoreScenario({
  finishOrder: [2, 1, 3],
  representativeTicket: "1-2-3"
}, [2, 1, 3]);
assert.equal(finishOrderPriority.scoreSource, "finish-order");
assert.deepEqual(finishOrderPriority.predictedOrder, [2, 1, 3]);
assert.equal(finishOrderPriority.exact, true, "finishOrderを旧ticketより優先する");

const legacyTicket = report.scoreScenario({
  representativeTicket: "2-1-3"
}, [2, 1, 3]);
assert.equal(legacyTicket.scoreSource, "legacy-ticket");
assert.equal(legacyTicket.exact, true, "finishOrderのない旧保存だけticketへフォールバックする");

const blankTicketRecord = record(
  "20260101-20-1",
  "",
  "",
  "2-1-3",
  "20",
  true,
  {
    aFinishOrder: [1, 2, 3],
    bFinishOrder: [2, 1, 3]
  }
);
const blankTicketComparison = report.compareRecord(blankTicketRecord);
assert.equal(blankTicketComparison.a.scoreSource, "finish-order");
assert.equal(blankTicketComparison.b.scoreSource, "finish-order");
assert.equal(blankTicketComparison.winner, "B");
assert.equal(blankTicketComparison.productionComparisonEligible, true);

const strictShadow = report.buildReport([{
  verificationPredictions: [record(
    "20260101-20-2",
    "1-2-3",
    "2-1-3",
    "2-1-3",
    "20",
    true,
    { comparisonReady: false }
  )]
}]);
assert.equal(strictShadow.overall.comparableCount, 0, "shadow.comparisonReady=falseを推測で復活させない");

const sameDecision = report.buildReport([{
  verificationPredictions: [record(
    "20260101-20-3",
    "1-2-3",
    "2-1-3",
    "1-2-3",
    "20",
    true,
    {
      aFinishOrder: [1, 2, 3],
      bFinishOrder: [1, 2, 3]
    }
  )]
}]);
assert.equal(sameDecision.overall.comparableCount, 0, "同じ上位finishOrderを比較へ数えない");
assert.equal(sameDecision.observation.topFinishOrderDecisionDisagreementCount, 0);

const legacyOnly = report.buildReport([{
  verificationPredictions: [record(
    "20260101-20-4",
    "1-2-3",
    "2-1-3",
    "2-1-3",
    "20",
    true,
    { aFinishOrder: [], bFinishOrder: [] }
  )]
}]);
assert.equal(legacyOnly.observation.legacyTicketFallbackCount, 1);
assert.equal(legacyOnly.overall.comparableCount, 0, "旧ticket比較を本番候補母集団へ混ぜない");

const rows = [];
for (let index = 0; index < 120; index += 1) {
  const bWin = index % 3 !== 0;
  rows.push(record(
    `20260101-20-${index + 10}`,
    bWin ? "1-2-3" : "2-1-3",
    bWin ? "2-1-3" : "1-2-3",
    "2-1-3",
    "20",
    true,
    { selectedAt: selectedAt(index) }
  ));
}
const built = report.buildReport([{ verificationPredictions: rows }]);
assert.equal(built.overall.comparableCount, 120);
assert.equal(built.observation.activeCohortObservedCount, 120);
assert.equal(built.observation.productionComparisonEligibleCount, 120);
assert.ok(built.overall.bWins > built.overall.aWins);
assert.equal(built.productionGate.productionCandidate, true);
assert.equal(
  built.productionGate.evaluationPopulation,
  "top-finish-order-decision-disagreement-only"
);
assert.equal(built.productionGate.legacyTicketFallbackEligible, false);
assert.equal(built.usableForPrediction, false);
assert.equal(built.automaticApplication, false);

const regressionRows = [];
for (let index = 0; index < 20; index += 1) {
  regressionRows.push(record(
    `20260201-24-${index + 1}`,
    "1-2-3",
    "2-1-3",
    "1-2-3",
    "24",
    true,
    { selectedAt: selectedAt(200 + index) }
  ));
}
const regression = report.buildReport([{
  verificationPredictions: [...rows, ...regressionRows]
}]);
assert.ok(regression.majorVenueRegression.length >= 1);
assert.equal(regression.productionGate.productionCandidate, false);

const olderDuplicate = record(
  "20260301-20-1",
  "2-1-3",
  "1-2-3",
  "2-1-3",
  "20",
  true,
  { selectedAt: "2026-03-01T00:30:00.000Z" }
);
const newerDuplicate = record(
  "20260301-20-1",
  "1-2-3",
  "2-1-3",
  "2-1-3",
  "20",
  true,
  { selectedAt: "2026-03-01T01:00:00.000Z" }
);
const deduplicated = report.buildReport([
  { verificationPredictions: [olderDuplicate] },
  { verificationPredictions: [newerDuplicate] }
]);
assert.equal(deduplicated.observation.rawResultMatchedCount, 2);
assert.equal(deduplicated.observation.resultMatchedCount, 1);
assert.equal(deduplicated.observation.duplicateRaceKeyExcludedCount, 1);
assert.equal(deduplicated.overall.comparableCount, 1, "同一raceKeyを二重集計しない");
assert.equal(deduplicated.overall.bWins, 1, "同一raceKeyは新しいselectedAtを残す");

const candidateBeforeRevocation = record(
  "20260302-20-1",
  "1-2-3",
  "2-1-3",
  "2-1-3",
  "20",
  true,
  { selectedAt: "2026-03-02T01:00:00.000Z" }
);
const candidateNone = record(
  "20260302-20-2",
  "1-2-3",
  "1-2-3",
  "1-2-3",
  "20",
  false,
  {
    candidateSetFingerprint: "none",
    selectedAt: "2026-03-02T02:00:00.000Z",
    comparisonReady: false,
    decisionChanged: false,
    variantEligible: false,
    scoreableDecision: false
  }
);
const revoked = report.buildReport([{
  verificationPredictions: [candidateBeforeRevocation, candidateNone]
}]);
assert.equal(revoked.activeCandidateSetFingerprint, "none");
assert.ok(revoked.activeCohortKey.includes("|none|"));
assert.equal(revoked.observation.activeCohortObservedCount, 1);
assert.equal(revoked.observation.candidateUnavailableCount, 1);
assert.equal(revoked.observation.excludedOtherCohortCount, 1);
assert.equal(revoked.overall.comparableCount, 0, "最新candidate none時に旧候補をactive表示しない");

const candidateA = record(
  "20260303-20-1",
  "1-2-3",
  "2-1-3",
  "2-1-3",
  "20",
  true,
  {
    candidateSetFingerprint: "candidate-a",
    selectedAt: "2026-03-03T01:00:00.000Z"
  }
);
const candidateB1 = record(
  "20260303-20-2",
  "1-2-3",
  "2-1-3",
  "2-1-3",
  "20",
  true,
  {
    candidateSetFingerprint: "candidate-b",
    selectedAt: "2026-03-03T02:00:00.000Z"
  }
);
const candidateB2 = record(
  "20260303-20-3",
  "1-2-3",
  "2-1-3",
  "2-1-3",
  "20",
  true,
  {
    candidateSetFingerprint: "candidate-b",
    selectedAt: "2026-03-03T03:00:00.000Z"
  }
);
const separatedCohorts = report.buildReport([{
  verificationPredictions: [candidateA, candidateB1, candidateB2]
}]);
assert.equal(separatedCohorts.activeCandidateSetFingerprint, "candidate-b");
assert.equal(separatedCohorts.observation.activeCohortObservedCount, 2);
assert.equal(separatedCohorts.observation.excludedOtherCohortCount, 1);
assert.equal(separatedCohorts.overall.comparableCount, 2);

const beforeTrainingCutoff = record(
  "20260304-20-1",
  "1-2-3",
  "2-1-3",
  "2-1-3",
  "20",
  true,
  {
    candidateTrainingCutoff: "2026-03-04T02:00:00.000Z",
    selectedAt: "2026-03-04T01:00:00.000Z"
  }
);
const temporal = report.buildReport([{
  verificationPredictions: [beforeTrainingCutoff]
}]);
assert.equal(temporal.observation.activeCohortObservedCount, 1);
assert.equal(temporal.observation.excludedTemporalCount, 1);
assert.equal(temporal.overall.comparableCount, 0, "学習cutoff以前のレースを同候補評価へ流用しない");

const captureMismatch = record(
  "20260304-20-2",
  "1-2-3",
  "2-1-3",
  "2-1-3",
  "20",
  true,
  {
    selectedAt: "2026-03-04T03:00:00.000Z",
    capturedAt: "2026-03-04T03:01:00.000Z"
  }
);
const mismatchedTime = report.buildReport([{
  verificationPredictions: [captureMismatch]
}]);
assert.equal(mismatchedTime.observation.excludedTemporalCount, 1);
assert.equal(mismatchedTime.overall.comparableCount, 0);

const sourceMismatch = record(
  "20260305-20-1",
  "1-2-3",
  "2-1-3",
  "2-1-3",
  "20",
  true,
  {
    inputSourceKind: "live-verification-evidence",
    snapshotSourceKind: "stored-v5-pre-race",
    selectedAt: "2026-03-05T01:00:00.000Z"
  }
);
const wrongSource = report.buildReport([{
  verificationPredictions: [sourceMismatch]
}]);
assert.equal(wrongSource.observation.excludedSourceKindMismatchCount, 1);
assert.equal(wrongSource.overall.comparableCount, 0, "異なる入力source kindを同一比較へ混ぜない");

const verificationSourceMismatch = record(
  "20260305-20-2",
  "1-2-3",
  "2-1-3",
  "2-1-3",
  "20",
  true,
  {
    verificationSourceKind: "stored-v5-pre-race",
    selectedAt: "2026-03-05T02:00:00.000Z"
  }
);
const wrongVerificationSource = report.buildReport([{
  verificationPredictions: [verificationSourceMismatch]
}]);
assert.equal(wrongVerificationSource.observation.excludedSourceKindMismatchCount, 1);
assert.equal(wrongVerificationSource.overall.comparableCount, 0);

const trainingSourceMismatch = record(
  "20260305-20-3",
  "1-2-3",
  "2-1-3",
  "2-1-3",
  "20",
  true,
  {
    candidateTrainingInputSourceKind: "stored-v5-pre-race",
    selectedAt: "2026-03-05T03:00:00.000Z"
  }
);
const wrongTrainingSource = report.buildReport([{
  verificationPredictions: [trainingSourceMismatch]
}]);
assert.equal(wrongTrainingSource.observation.excludedSourceKindMismatchCount, 1);
assert.equal(wrongTrainingSource.overall.comparableCount, 0);

const validBeforeMalformed = record(
  "20260305-20-4",
  "1-2-3",
  "2-1-3",
  "2-1-3",
  "20",
  true,
  { selectedAt: "2026-03-05T04:00:00.000Z" }
);
const latestMalformedCohort = record(
  "20260305-20-5",
  "1-2-3",
  "2-1-3",
  "2-1-3",
  "20",
  true,
  {
    cohortKey: "malformed-current-cohort",
    selectedAt: "2026-03-05T05:00:00.000Z"
  }
);
const malformedLatest = report.buildReport([{
  verificationPredictions: [validBeforeMalformed, latestMalformedCohort]
}]);
assert.equal(malformedLatest.activeCohortKey, "malformed-current-cohort");
assert.equal(malformedLatest.activeMetadataReady, false);
assert.equal(malformedLatest.observation.excludedCohortMetadataMismatchCount, 1);
assert.equal(malformedLatest.observation.excludedOtherCohortCount, 1);
assert.equal(
  malformedLatest.overall.comparableCount,
  0,
  "最新現行行のmetadata不正時に旧cohortへフォールバックしない"
);

const oldGeneration = record(
  "20260306-20-1",
  "1-2-3",
  "2-1-3",
  "2-1-3",
  "20",
  true,
  {
    sourceLogicFingerprint: "legacy-v6",
    snapshotLogicFingerprint: "legacy-v6",
    verificationLogicFingerprint: "legacy-v6",
    selectedAt: "2026-03-06T01:00:00.000Z"
  }
);
const old = report.buildReport([{
  verificationPredictions: [oldGeneration]
}]);
assert.equal(old.observation.excludedOldGenerationCount, 1);
assert.equal(old.overall.comparableCount, 0);

console.log("scenario AI v6 A/B report tests passed");
