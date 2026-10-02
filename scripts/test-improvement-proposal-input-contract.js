"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const improvementEngine = require("../js/improvement-proposal-engine");
const learningGate = require("../js/learning-pipeline-gate");
const phase6Audit = require("../js/phase6-data-audit");
const improvementBuilder = require("./build-improvement-proposal-report");
const learningBuilder = require("./build-learning-pipeline-gate");
const phase6Builder = require("./build-phase6-data-audit");
const theoryPerformance = require("./build-theory-performance-report");

function predictionRecord({
  raceNo,
  marker,
  ticket,
  selectedAt = "2026-08-13T00:00:00.000Z",
  embeddedResult = { settled: false }
}) {
  return {
    raceKey: `20260813-01-${raceNo}`,
    date: "20260813",
    jcd: "01",
    raceNo,
    marker,
    selectedAt,
    deadlineAt: "2026-08-13T01:00:00.000Z",
    prediction: {
      practicalTickets: [{ ticket }],
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
    result: embeddedResult
  };
}

function officialResult({
  raceNo,
  ticket,
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
      payout: 1200
    }
  };
}

const temporaryRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "improvement-input-contract-")
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
  raceNo: 1,
  marker: "primary",
  ticket: "1-2-3"
});
const duplicateVerification = predictionRecord({
  raceNo: 1,
  marker: "verification",
  ticket: "3-2-1"
});
const staleEmbeddedResult = predictionRecord({
  raceNo: 2,
  marker: "official-result-rebuild",
  ticket: "2-1-3",
  embeddedResult: {
    settled: true,
    resultTicket: "6-5-4",
    practicalHit: false,
    review: {
      scenarioMatch: false
    },
    missCauseAnalysis: {
      candidates: [{
        code: "flow-reading-miss"
      }]
    }
  }
});
const afterDeadline = predictionRecord({
  raceNo: 3,
  marker: "after-deadline",
  ticket: "1-3-2",
  selectedAt: "2026-08-13T02:00:00.000Z",
  embeddedResult: {
    settled: true,
    resultTicket: "1-3-2"
  }
});
const unofficialResultOnly = predictionRecord({
  raceNo: 4,
  marker: "unofficial-result",
  ticket: "1-4-2",
  embeddedResult: {
    settled: true,
    resultTicket: "1-4-2"
  }
});

fs.writeFileSync(
  path.join(predictionsDirectory, "20260813.json"),
  JSON.stringify({
    predictions: [primary, staleEmbeddedResult, afterDeadline],
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
      officialResult({ raceNo: 1, ticket: "1-2-3" }),
      officialResult({ raceNo: 2, ticket: "2-1-4" }),
      officialResult({ raceNo: 3, ticket: "1-3-2" }),
      officialResult({
        raceNo: 4,
        ticket: "1-4-2",
        source: "unofficial-copy"
      })
    ]
  })
);

try {
  const collected = improvementBuilder.collectAnalysis({
    root: temporaryRoot
  });
  assert.equal(
    improvementBuilder.ANALYSIS_INPUT_CONTRACT,
    theoryPerformance.ANALYSIS_INPUT_CONTRACT
  );
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
  assert.equal(collected.records.length, 2);

  const primaryResult = collected.records.find(row =>
    row.raceKey === "20260813-01-1"
  );
  assert.equal(primaryResult.marker, "primary");
  assert.equal(primaryResult.result.practicalHit, true);
  assert.equal(
    primaryResult.result.missCauseAnalysis.status,
    "hit-no-miss-analysis"
  );

  const rebuilt = collected.records.find(row =>
    row.raceKey === "20260813-01-2"
  );
  assert.equal(rebuilt.result.resultTicket, "2-1-4");
  assert.equal(rebuilt.result.review.missType, "相手抜け");
  assert.equal(rebuilt.result.review.scenarioMatch, null);
  assert.equal(
    rebuilt.result.missCauseAnalysis.candidates.some(row =>
      row.code === "ticket-coverage-insufficient"
    ),
    true
  );
  assert.equal(
    rebuilt.result.missCauseAnalysis.candidates.some(row =>
      row.code === "flow-reading-miss"
    ),
    false,
    "a stale embedded scenario miss must not survive official re-verification"
  );

  const learningInput = learningBuilder.collectAnalysis({
    root: temporaryRoot
  });
  const phase6Input = phase6Builder.collectAnalysis({
    root: temporaryRoot
  });
  for (const input of [learningInput, phase6Input]) {
    assert.deepEqual(input.diagnostics, collected.diagnostics);
    assert.deepEqual(
      input.records.map(row => row.raceKey),
      collected.records.map(row => row.raceKey)
    );
  }

  const proposal = improvementEngine.build(collected.records);
  assert.equal(proposal.settledRaceCount, 2);
  const gate = learningGate.build(collected.records, proposal);
  assert.equal(gate.settledRaceCount, 2);
  assert.equal(gate.pipelineCoverage.theoryEvaluation, 100);
  assert.equal(gate.pipelineCoverage.missCauseAnalysis, 100);
  const audit = phase6Audit.build(collected.records, {
    improvement: proposal,
    adoption: {
      humanApprovalRequired: true,
      automaticApplication: false,
      usableForPrediction: false,
      theories: []
    },
    pipeline: gate
  });
  assert.equal(audit.settledRaceCount, 2);
  assert.equal(audit.status, "healthy");
} finally {
  fs.rmSync(temporaryRoot, {
    recursive: true,
    force: true
  });
}

const root = path.resolve(__dirname, "..");
const statsDirectory = path.join(root, "data", "stats");
const readReport = name => JSON.parse(
  fs.readFileSync(path.join(statsDirectory, name), "utf8")
);
const reportSemantics = report => {
  const {
    generatedAt: _generatedAt,
    analysisInputDiagnostics: _diagnostics,
    ...semantic
  } = report;
  return semantic;
};
const current = improvementBuilder.collectAnalysis({ root });
const improvementReport = readReport(
  "improvement-proposal-phase3.json"
);
assert.equal(
  improvementReport.analysisInputDiagnostics.settledJoinCount,
  current.records.length
);
assert.deepEqual(reportSemantics(improvementReport), {
  source:
    "data/predictions/YYYYMMDD.json + data/results/YYYYMMDD.json",
  analysisInputContract:
    improvementBuilder.ANALYSIS_INPUT_CONTRACT,
  deduplication:
    "predictions-preferred-over-verificationPredictions",
  ...improvementEngine.build(current.records)
});

const learningReport = readReport(
  "learning-pipeline-gate-phase4.json"
);
assert.equal(
  learningReport.analysisInputDiagnostics.settledJoinCount,
  current.records.length
);
assert.deepEqual(reportSemantics(learningReport), {
  source:
    "data/predictions/YYYYMMDD.json + data/results/YYYYMMDD.json + improvement-proposal-phase3.json",
  analysisInputContract:
    improvementBuilder.ANALYSIS_INPUT_CONTRACT,
  deduplication:
    "predictions-preferred-over-verificationPredictions",
  ...learningGate.build(current.records, improvementReport)
});

const phase6Report = readReport("phase6-data-audit.json");
assert.equal(
  phase6Report.analysisInputDiagnostics.settledJoinCount,
  current.records.length
);
assert.deepEqual(reportSemantics(phase6Report), {
  source:
    "data/predictions/YYYYMMDD.json + data/results/YYYYMMDD.json",
  analysisInputContract:
    improvementBuilder.ANALYSIS_INPUT_CONTRACT,
  deduplication:
    "predictions-preferred-over-verificationPredictions",
  ...phase6Audit.build(current.records, {
    improvement: improvementReport,
    adoption: readReport("theory-adoption-phase5.json"),
    pipeline: learningReport
  })
});

console.log("improvement proposal input contract: passed");
