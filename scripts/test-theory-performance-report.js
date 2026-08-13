"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const api = require("../js/theory-performance-report");
const builder = require("./build-theory-performance-report");
const inputContract = require("./analysis-input-contract");

assert.equal(
  builder.ANALYSIS_INPUT_CONTRACT,
  "official-pre-deadline-cohort-v1"
);

const catalog = [
  ["race-flow", "展開理論"], ["course", "コース理論"], ["start", "ST・スリット理論"],
  ["exhibition", "展示・足理論"], ["remain-pickup", "残し・拾い理論"], ["local-water", "当地・水面理論"],
  ["skill", "技量理論"], ["motor", "モーター理論"], ["wall-boat", "壁艇理論"],
  ["frame-rise-fall", "枠別浮沈率"], ["double-time", "ダブルタイム"], ["new-engine", "新エンジン理論"]
];
function evaluations(usedKey, matched, tickets) { return catalog.map(([theoryKey, label]) => ({ theoryKey, label, status: theoryKey === usedKey ? "evaluated" : "not-used", used: theoryKey === usedKey, matched: theoryKey === usedKey ? matched : null, tickets: theoryKey === usedKey ? tickets : [] })); }

function predictionRecord({
  raceKey,
  raceNo,
  selectedAt = "2026-08-13T00:00:00.000Z",
  deadlineAt = "2026-08-13T01:00:00.000Z",
  practicalTickets = ["1-2-3"],
  theoryTickets = practicalTickets,
  marker,
  embeddedResult = { settled: false, resultTicket: "6-5-4" }
}) {
  return {
    raceKey,
    date: "20260813",
    jcd: "01",
    raceNo,
    selectedAt,
    deadlineAt,
    marker,
    prediction: {
      practicalTickets: practicalTickets.map(ticket => ({ ticket })),
      preRaceConditions: {
        schemaVersion: 4,
        source: "boatrace-official",
        sourceTiming: "pre_deadline",
        officialResultUsed: false,
        sourceFetchedAt: selectedAt,
        boats: Array.from({ length: 6 }, (_, index) => ({
          boatNo: index + 1
        }))
      }
    },
    theoryTagSnapshot: {
      theories: [{
        theoryKey: "flow",
        label: "展開理論",
        tickets: theoryTickets
      }]
    },
    result: embeddedResult
  };
}

function officialResult({
  raceNo,
  ticket,
  payout = 1000,
  source = "boatrace-official"
}) {
  const boats = ticket.split("-").map(Number);
  return {
    source,
    date: "20260813",
    jcd: "01",
    raceNo,
    resultAvailable: true,
    status: "finished",
    winningMethod: "逃げ",
    finishers: boats.map((boat, index) => ({
      rank: index + 1,
      boat
    })),
    trifecta: {
      combination: ticket,
      payout
    }
  };
}

const records = [
  { raceKey: "20260802-20-8", jcd: "20", place: "若松", prediction: { skipAiDisplay: { decision: "bet-candidate" } }, theoryEvaluationSnapshot: { evaluations: evaluations("wall-boat", true, ["1-4-3", "1-2-4"]) }, result: { settled: true, resultTicket: "1-4-3", payout: 1240, practicalHit: true, verification: { scenarioHit: true } } },
  { raceKey: "20260802-20-9", jcd: "20", place: "若松", prediction: { skipAiDisplay: { decision: "skip" } }, theoryEvaluationSnapshot: { evaluations: evaluations("wall-boat", false, ["1-3-4"]) }, result: { settled: true, resultTicket: "2-1-4", payout: 3000, practicalHit: false, verification: { scenarioHit: false } } },
  { raceKey: "20260802-20-10", jcd: "20", place: "若松", prediction: { skipAiDisplay: { decision: "caution" } }, theoryEvaluationSnapshot: { evaluations: evaluations("wall-boat", false, ["1-3-4"]) }, result: { settled: true, resultTicket: "3-1-4", payout: 900, review: { practicalHit: false }, verification: { scenarioHit: false } } }
];
const result = api.build(records);
assert.equal(result.version, "3.4.0");
assert.equal(result.theoryCount, 12);
assert.equal(result.byTheory.length, 12);
assert.equal(result.sampleCount, 36);
const wall = result.byTheory.find(row => row.theoryKey === "wall-boat");
assert.equal(wall.raceCount, 3); assert.equal(wall.useCount, 3); assert.equal(wall.evaluatedCount, 3); assert.equal(wall.hitCount, 1); assert.equal(wall.hitRate, 33.3); assert.equal(wall.practicalEvaluatedCount, 3); assert.equal(wall.practicalHitCount, 1); assert.equal(wall.practicalHitRate, 33.3); assert.equal(wall.skipEvaluatedCount, 2); assert.equal(wall.skipCorrectCount, 2); assert.equal(wall.skipDecisionAccuracy, 100); assert.equal(wall.stake, 400); assert.equal(wall.return, 1240); assert.equal(wall.recoveryRate, 310);
const course = result.byTheory.find(row => row.theoryKey === "course");
assert.equal(course.useCount, 0); assert.equal(course.evaluatedCount, 0); assert.equal(course.hitRate, null); assert.equal(course.recoveryRate, null); assert.equal(course.practicalHitRate, null); assert.equal(course.skipDecisionAccuracy, null);
assert.equal(result.usableForPrediction, false); assert.equal(result.automaticApplication, false);
assert.equal(result.theoryActionRanking.length, 12);
assert.equal(result.theoryActionRanking.find(row => row.theoryKey === "wall-boat").action, "collect-more");
assert.equal(api.actionOf({ evaluatedCount: 53, practicalHitRate: 25, recoveryRate: 110 }).action, "strengthen-candidate");
assert.equal(api.actionOf({ evaluatedCount: 30, practicalHitRate: 18, recoveryRate: 75 }).action, "maintain");
assert.equal(api.actionOf({ evaluatedCount: 50, practicalHitRate: 17, recoveryRate: 40 }).action, "weaken-candidate");
assert.equal(api.actionOf({ evaluatedCount: 19, practicalHitRate: 40, recoveryRate: 200 }).action, "collect-more");
assert.equal(api.skipDecisionCorrect("skip", false), true); assert.equal(api.skipDecisionCorrect("skip", true), false); assert.equal(api.skipDecisionCorrect("bet-candidate", true), true); assert.equal(api.skipDecisionCorrect("caution", true), null);
assert.equal(api.skipDecisionOf({ prediction: { selectionScore: 78, evidenceCompleteness: 90, scenarioAiV6Shadow: { scenarios: [{ likelihood: 62 }, { likelihood: 22 }, { likelihood: 16 }] } } }), "bet-candidate");
assert.equal(api.skipDecisionOf({ prediction: { selectionScore: 58, evidenceCompleteness: 90, scenarioAiV6Shadow: { scenarios: [{ likelihood: 39 }, { likelihood: 36 }, { likelihood: 25 }] } } }), "skip");
assert.equal(api.skipDecisionOf({ prediction: { selectionScore: 78, evidenceCompleteness: 90, verificationEvidence: { scenarios: [{ type: "escape", score: 62 }, { type: "sashi", score: 22 }, { type: "makuri", score: 16 }] } } }), "bet-candidate");
assert.equal(api.skipDecisionOf({ selectionScore: 78, evidenceCompleteness: 90, verificationEvidence: { scenarios: [{ type: "escape", score: 62 }, { type: "sashi", score: 22 }, { type: "makuri", score: 16 }] } }), "bet-candidate");
assert.equal(api.predictionOf({ confidence: 71 }).confidence, 71);
const temporaryRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "theory-performance-cohort-")
);
const predictionsDirectory = path.join(
  temporaryRoot,
  "data",
  "predictions"
);
const resultsDirectory = path.join(
  temporaryRoot,
  "data",
  "results"
);
fs.mkdirSync(predictionsDirectory, { recursive: true });
fs.mkdirSync(resultsDirectory, { recursive: true });

const primary = predictionRecord({
  raceKey: "20260813-01-1",
  raceNo: 1,
  marker: "primary",
  practicalTickets: ["1-2-3"],
  theoryTickets: ["1-2-3"]
});
const duplicateVerification = predictionRecord({
  raceKey: "20260813-01-1",
  raceNo: 1,
  marker: "verification",
  practicalTickets: ["3-2-1"],
  theoryTickets: ["3-2-1"]
});
const staleEmbeddedResult = predictionRecord({
  raceKey: "20260813-01-2",
  raceNo: 2,
  marker: "official-result-rebuild",
  practicalTickets: ["2-1-3"],
  theoryTickets: ["2-1-3"],
  embeddedResult: {
    settled: false,
    resultTicket: "6-5-4",
    payout: 99999,
    practicalHit: false
  }
});
const afterDeadline = predictionRecord({
  raceKey: "20260813-01-3",
  raceNo: 3,
  selectedAt: "2026-08-13T02:00:00.000Z",
  deadlineAt: "2026-08-13T01:00:00.000Z"
});
const unofficialResultOnly = predictionRecord({
  raceKey: "20260813-01-4",
  raceNo: 4
});

const normalizationInput = {
  ...staleEmbeddedResult,
  __officialResult: officialResult({
    raceNo: 2,
    ticket: "2-1-3",
    payout: 1200
  })
};
const frozenPrediction =
  JSON.stringify(normalizationInput.prediction);
const normalizedDirect =
  builder.normalizeCohortRecord(normalizationInput);
assert.equal(
  normalizedDirect.prediction,
  normalizationInput.prediction
);
assert.equal(
  JSON.stringify(normalizationInput.prediction),
  frozenPrediction
);
assert.equal(normalizedDirect.result.resultTicket, "2-1-3");
assert.equal(normalizedDirect.result.payout, 1200);
assert.equal(normalizedDirect.result.winningMethod, "逃げ");

fs.writeFileSync(
  path.join(predictionsDirectory, "20260813.json"),
  JSON.stringify({
    predictions: [
      primary,
      staleEmbeddedResult,
      afterDeadline
    ],
    verificationPredictions: [
      duplicateVerification,
      unofficialResultOnly
    ]
  })
);
fs.writeFileSync(
  path.join(resultsDirectory, "20260813.json"),
  JSON.stringify({
    races: [
      officialResult({
        raceNo: 1,
        ticket: "1-2-3",
        payout: 900
      }),
      officialResult({
        raceNo: 2,
        ticket: "2-1-3",
        payout: 1200
      }),
      officialResult({
        raceNo: 3,
        ticket: "1-3-2",
        payout: 1300
      }),
      officialResult({
        raceNo: 4,
        ticket: "1-4-2",
        source: "unofficial-copy"
      })
    ]
  })
);

try {
  const collected = builder.collect({
    root: temporaryRoot
  });
  assert.deepEqual(collected.diagnostics, {
    canonicalPredictionCount: 4,
    preDeadlinePredictionCount: 3,
    excludedPredictionCount: 1,
    excludedReasons: {
      "source-fetched-at-or-after-deadline": 1
    },
    officialResultCount: 2,
    settledJoinCount: 2,
    deduplication:
      "predictions-preferred-over-verificationPredictions",
    sourceFiles:
      "data/predictions/YYYYMMDD.json + data/results/YYYYMMDD.json"
  });
  assert.equal(
    collected.records.length,
    collected.diagnostics.settledJoinCount
  );
  assert.ok(
    collected.records.every(row =>
      inputContract.preDeadlineReason(row) === "" &&
      row.result.officialSource === "boatrace-official"
    )
  );

  const primaryResult = collected.records.find(row =>
    row.raceKey === "20260813-01-1"
  );
  assert.equal(primaryResult.marker, "primary");
  assert.equal(primaryResult.result.resultTicket, "1-2-3");
  assert.equal(primaryResult.result.practicalHit, true);

  const rebuilt = collected.records.find(row =>
    row.raceKey === "20260813-01-2"
  );
  assert.equal(rebuilt.result.settled, true);
  assert.equal(rebuilt.result.resultTicket, "2-1-3");
  assert.equal(rebuilt.result.payout, 1200);
  assert.equal(rebuilt.result.practicalHit, true);
  const flowEvaluation =
    rebuilt.theoryEvaluationSnapshot.evaluations.find(row =>
      row.theoryKey === "race-flow"
    );
  assert.equal(flowEvaluation.status, "evaluated");
  assert.equal(flowEvaluation.matched, true);
  assert.equal(flowEvaluation.actualTicket, "2-1-3");
} finally {
  fs.rmSync(temporaryRoot, {
    recursive: true,
    force: true
  });
}
console.log("theory performance report tests passed");
