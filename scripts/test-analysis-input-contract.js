#!/usr/bin/env node
"use strict";

const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const inputContract = require("./analysis-input-contract");
const hiyoriAnalyzer = require("./analyze-hiyori-official-comparison");
const referenceAnalyzer = require("./analyze-reference-tag-effectiveness");

const root = path.resolve(__dirname, "..");

function boatsWithBest(bestBoat) {
  return Array.from({ length: 6 }, (_, index) => {
    const boatNo = index + 1;
    const isBest = boatNo === bestBoat;
    return {
      boatNo,
      exhibitionTime: isBest ? 6.5 : 6.8 + index * 0.02,
      lapTime: isBest ? 36.5 : 37 + index * 0.05,
      currentST: isBest ? 0.01 : 0.1 + index * 0.01,
      localWinRate: isBest ? 9 : 4 + index * 0.2
    };
  });
}

function storedPrediction({
  raceNo,
  marker,
  bestBoat,
  source,
  selectedAt = "2026-08-09T00:30:00Z",
  deadlineAt = "2026-08-09T10:00:00+09:00",
  ticket
}) {
  return {
    raceKey: `20260809-23-${raceNo}`,
    date: "20260809",
    jcd: "23",
    raceNo,
    selectedAt,
    deadlineAt,
    marker,
    source: marker === "primary-official" ? "hiyori" : source,
    prediction: {
      preRaceConditions: {
        sourceTiming: "pre_deadline",
        officialResultUsed: false,
        source,
        boats: boatsWithBest(bestBoat),
        weather: { windSpeed: 5, waveHeight: 5 },
        newEngineMode: false
      },
      practicalTickets: [{ ticket }]
    }
  };
}

const validTimingRecord = storedPrediction({
  raceNo: 1,
  marker: "timing",
  bestBoat: 1,
  source: "BOAT RACE公式",
  ticket: "1-2-3"
});
assert.strictEqual(inputContract.preDeadlineReason(validTimingRecord), "");
assert.strictEqual(
  inputContract.raceKey({
    ...validTimingRecord,
    raceNo: 2
  }),
  "",
  "a direct race key that conflicts with structured race fields must be rejected"
);
assert.strictEqual(
  inputContract.preDeadlineReason({ ...validTimingRecord, selectedAt: "" }),
  "timestamp-missing"
);
assert.strictEqual(
  inputContract.preDeadlineReason({ ...validTimingRecord, selectedAt: "not-a-date" }),
  "timestamp-missing"
);
assert.strictEqual(
  inputContract.preDeadlineReason({
    ...validTimingRecord,
    deadlineAt: "2026-02-30T10:00:00+09:00"
  }),
  "timestamp-missing",
  "impossible calendar dates must not be normalized into valid deadlines"
);
assert.strictEqual(
  inputContract.preDeadlineReason({
    ...validTimingRecord,
    deadlineAt: "2026-08-09T10:00:00"
  }),
  "timestamp-missing",
  "timestamps without an explicit timezone must be rejected"
);
assert.strictEqual(
  inputContract.preDeadlineReason({
    ...validTimingRecord,
    selectedAt: "2026-08-09T01:00:00Z"
  }),
  "captured-at-or-after-deadline"
);
assert.strictEqual(
  inputContract.preDeadlineReason({
    ...validTimingRecord,
    selectedAt: "2026-08-09T01:00:01Z"
  }),
  "captured-at-or-after-deadline"
);
assert.strictEqual(
  inputContract.preDeadlineReason({
    ...validTimingRecord,
    officialResultUsedForPrediction: true
  }),
  "official-result-used"
);

const temporaryRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "chappy-analysis-explicit-input-")
);
try {
  const predictionsFile = path.join(temporaryRoot, "predictions.json");
  const resultsFile = path.join(temporaryRoot, "results.json");
  const referenceOutput = path.join(temporaryRoot, "reference.json");
  const hiyoriOutput = path.join(temporaryRoot, "hiyori.json");

  const verification = storedPrediction({
    raceNo: 1,
    marker: "verification",
    bestBoat: 1,
    source: "hiyori",
    ticket: "1-2-3"
  });
  const primary = {
    ...storedPrediction({
      raceNo: 1,
      marker: "primary",
      bestBoat: 4,
      source: "hiyori",
      ticket: "4-5-6"
    }),
    result: { trifecta: "1-2-3" },
    referenceTags: [
      { key: "result-derived", label: "1号艇 結果後タグ", strength: 3 }
    ]
  };
  const primaryOfficial = storedPrediction({
    raceNo: 2,
    marker: "primary-official",
    bestBoat: 2,
    source: "BOAT RACE公式",
    ticket: "2-1-3"
  });
  const predictionsFixture = {
    verificationPredictions: [verification],
    predictions: [primary, primaryOfficial]
  };
  const resultsFixture = {
    races: [
      {
        resultAvailable: true,
        date: "20260809",
        jcd: "23",
        raceNo: 1,
        trifecta: { combination: "4-5-6" }
      },
      {
        resultAvailable: true,
        date: "20260809",
        jcd: "23",
        raceNo: 2,
        trifecta: { combination: "2-1-3" }
      },
      {
        resultAvailable: true,
        date: "20260809",
        jcd: "23",
        raceNo: 3,
        trifecta: { combination: "3-2-1" }
      }
    ]
  };
  fs.writeFileSync(predictionsFile, JSON.stringify(predictionsFixture), "utf8");
  fs.writeFileSync(resultsFile, JSON.stringify(resultsFixture), "utf8");

  const predictionRows = inputContract.flattenInputRecords(
    predictionsFixture,
    predictionsFile
  );
  const resultRows = inputContract.flattenInputRecords(resultsFixture, resultsFile);
  const explicitCohort = inputContract.buildCohortFromRecords([
    ...resultRows,
    ...predictionRows.slice().reverse()
  ]);
  assert.strictEqual(explicitCohort.diagnostics.canonicalPredictionCount, 2);
  assert.strictEqual(explicitCohort.diagnostics.officialResultCount, 2);
  assert.strictEqual(explicitCohort.records.length, 2);
  assert.strictEqual(
    explicitCohort.records.find(record => record.raceNo === 1).marker,
    "primary",
    "primary predictions must win regardless of explicit input order"
  );
  assert.strictEqual(
    inputContract.actualTicket(
      explicitCohort.records.find(record => record.raceNo === 1)
    ),
    "4-5-6",
    "a result attached to the prediction must not override the official result row"
  );
  const predictionOnly = inputContract.buildCohortFromRecords([primary]);
  assert.strictEqual(
    predictionOnly.records.length,
    0,
    "a prediction's post-race result field is not an official result source"
  );
  const spoofedPrediction = inputContract.flattenInputRecords([{
    ...primary,
    __analysisInputKind: "official-result",
    __officialResult: { trifecta: { combination: "1-2-3" } },
    resultAvailable: true
  }], "spoofed.json");
  assert.strictEqual(
    spoofedPrediction[0].__analysisInputKind,
    "",
    "internal input classifications must not be inherited from JSON content"
  );
  assert.strictEqual(
    inputContract.buildCohortFromRecords(spoofedPrediction).records.length,
    0,
    "raw JSON must not self-declare a prediction as an official result"
  );
  const unavailableResult = inputContract.flattenInputRecords({
    races: [{
      resultAvailable: false,
      date: "20260809",
      jcd: "23",
      raceNo: 1,
      trifecta: { combination: "4-5-6" }
    }]
  }, "unavailable-result.json");
  assert.strictEqual(
    inputContract.buildCohortFromRecords([
      ...inputContract.flattenInputRecords({ predictions: [primary] }, "primary.json"),
      ...unavailableResult
    ]).records.length,
    0,
    "unavailable result rows must not settle an explicit-input cohort"
  );

  childProcess.execFileSync(process.execPath, [
    path.join(root, "scripts", "analyze-reference-tag-effectiveness.js"),
    resultsFile,
    predictionsFile,
    "--output",
    referenceOutput
  ], { cwd: root, stdio: "pipe" });
  const referenceFixtureReport = JSON.parse(
    fs.readFileSync(referenceOutput, "utf8")
  );
  assert.strictEqual(referenceFixtureReport.settledRaceCount, 2);
  assert.strictEqual(referenceFixtureReport.matchedRaceCount, 2);
  assert.strictEqual(referenceFixtureReport.inputDiagnostics.officialResultCount, 2);
  assert.strictEqual(
    referenceFixtureReport.tags.find(tag => tag.key === "exhibition").ticketHits,
    2
  );
  assert.strictEqual(
    referenceFixtureReport.tags.some(tag => tag.key === "result-derived"),
    false
  );

  childProcess.execFileSync(process.execPath, [
    path.join(root, "scripts", "analyze-hiyori-official-comparison.js"),
    resultsFile,
    predictionsFile,
    "--output",
    hiyoriOutput
  ], { cwd: root, stdio: "pipe" });
  const hiyoriFixtureReport = JSON.parse(fs.readFileSync(hiyoriOutput, "utf8"));
  assert.strictEqual(hiyoriFixtureReport.explicitHiyoriRaceCount, 1);
  assert.strictEqual(hiyoriFixtureReport.matchedRaceCount, 1);
  assert.strictEqual(
    hiyoriFixtureReport.metrics.find(metric => metric.key === "exhibition").winnerHits,
    1,
    "strict Hiyori analysis must use the primary frozen entry snapshot"
  );
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}

const cohort = inputContract.buildDefaultCohort();
assert.ok(cohort.diagnostics.canonicalPredictionCount > 0);
assert.ok(cohort.diagnostics.preDeadlinePredictionCount > 0);
assert.ok(cohort.diagnostics.officialResultCount > 0);
assert.ok(cohort.diagnostics.settledJoinCount > 0);
assert.strictEqual(cohort.records.length, cohort.diagnostics.settledJoinCount);
assert.strictEqual(
  new Set(cohort.records.map(record => record.__analysisRaceKey)).size,
  cohort.records.length,
  "analysis cohort must contain one row per race"
);
assert.ok(cohort.records.every(record => !inputContract.preDeadlineReason(record)));
assert.ok(cohort.records.every(record => inputContract.actualTicket(record)));

const referenceReport = referenceAnalyzer.analyze(cohort.records, {
  inputDiagnostics: cohort.diagnostics,
  strictFrozenInputs: true
});
assert.ok(referenceReport.settledRaceCount > 0);
assert.ok(referenceReport.matchedRaceCount > 0);
assert.ok(referenceReport.tagCount > 0);
assert.strictEqual(referenceReport.sourceStatus, "ready");
assert.strictEqual(referenceReport.causalClaim, false);

const hiyoriReport = hiyoriAnalyzer.analyze(cohort.records, {
  inputDiagnostics: cohort.diagnostics,
  strictFrozenInputs: true
});
assert.strictEqual(
  hiyoriReport.explicitHiyoriRaceCount,
  cohort.records.filter(record =>
    hiyoriAnalyzer.hasHiyori(record, { strictFrozenInputs: true })
  ).length
);
assert.strictEqual(
  hiyoriReport.sourceStatus,
  hiyoriReport.explicitHiyoriRaceCount ? "ready" : "source_data_unavailable"
);
if (!hiyoriReport.explicitHiyoriRaceCount) {
  assert.strictEqual(hiyoriReport.matchedRaceCount, 0);
  assert.match(hiyoriReport.note, /代用しない/);
}

console.log(
  `analysis input contract: ${cohort.records.length} settled / ` +
  `${referenceReport.matchedRaceCount} tagged / ` +
  `${hiyoriReport.explicitHiyoriRaceCount} explicit Hiyori`
);
