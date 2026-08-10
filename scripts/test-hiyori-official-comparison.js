#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const inputContract = require("./analysis-input-contract");
const {
  analyze,
  bestBoat,
  entriesOf,
  finishOrder,
  flattenRecords,
  hasHiyori
} = require("./analyze-hiyori-official-comparison.js");

const entries = [
  { boatNo: 1, exhibitionTime: 6.90, lapTime: 37.20, currentST: 0.16, localRate: 6.20 },
  { boatNo: 2, exhibitionTime: 6.82, lapTime: 37.05, currentST: 0.11, localRate: 7.10 },
  { boatNo: 3, exhibitionTime: 6.95, lapTime: 37.40, currentST: 0.19, localRate: 5.80 }
];

assert.deepStrictEqual(finishOrder({ result: { trifecta: "2-1-3" } }), [2, 1, 3]);
assert.deepStrictEqual(
  finishOrder({ result: { resultTicket: "2-1-3" } }),
  [2, 1, 3]
);
assert.deepStrictEqual(
  finishOrder({ trifecta: { combination: "2-1-3" } }),
  [2, 1, 3]
);
assert.deepStrictEqual(
  finishOrder({
    finishers: [
      { rank: 3, boat: 3 },
      { rank: 1, boat: 2 },
      { rank: 2, boat: 1 }
    ]
  }),
  [2, 1, 3]
);
assert.strictEqual(hasHiyori({ externalData: { source: "ボートレース日和" } }), true);
assert.strictEqual(hasHiyori({ source: "hiyori-compatible" }), false);
assert.strictEqual(hasHiyori({ source: "BOAT RACE公式" }), false);
assert.strictEqual(bestBoat(entries, ["exhibitionTime"], true).boat, 2);
assert.strictEqual(bestBoat(entries, ["localRate"], false).boat, 2);

const report = analyze([
  {
    externalData: { source: "hiyori" },
    entries,
    result: { order: [2, 1, 3] }
  },
  {
    externalData: { source: "official" },
    entries,
    result: { order: [2, 1, 3] }
  }
]);

assert.strictEqual(report.matchedRaceCount, 1);
for (const metric of report.metrics) {
  assert.strictEqual(metric.samples, 1);
  assert.strictEqual(metric.winnerHits, 1);
  assert.strictEqual(metric.top3Hits, 1);
  assert.strictEqual(metric.winnerRate, 100);
  assert.strictEqual(metric.top3Rate, 100);
  assert.strictEqual(metric.status, "データ不足");
}

const productionRecord = {
  raceKey: "20260809-23-1",
  source: "hiyori",
  prediction: {
    preRaceConditions: {
      sourceTiming: "pre_deadline",
      officialResultUsed: false,
      source: "hiyori",
      boats: entries,
      weather: { windSpeed: 2, waveHeight: 1 }
    }
  },
  __officialResult: {
    trifecta: { combination: "2-1-3", boats: [2, 1, 3] }
  }
};
assert.strictEqual(entriesOf(productionRecord).length, 3);
assert.deepStrictEqual(finishOrder(productionRecord), [2, 1, 3]);
assert.strictEqual(analyze([productionRecord]).matchedRaceCount, 1);
assert.strictEqual(
  hasHiyori({
    source: "hiyori",
    prediction: {
      preRaceConditions: {
        source: "BOAT RACE公式"
      }
    }
  }, { strictFrozenInputs: true }),
  false,
  "strict analysis must not fall back to a post-snapshot source"
);
assert.strictEqual(
  entriesOf({ entries }, { strictFrozenInputs: true }).length,
  0,
  "strict analysis must not fall back to top-level entries"
);
assert.strictEqual(flattenRecords({
  predictions: [],
  verificationPredictions: [productionRecord]
}, "daily.json").length, 1);
const strictProductionReport = analyze([{
  ...productionRecord,
  entries: entries.map((entry, index) => ({
    ...entry,
    exhibitionTime: 6.7 + index * 0.1,
    lapTime: 36.7 + index * 0.1,
    currentST: 0.05 + index * 0.1,
    localRate: 9 - index
  }))
}], { strictFrozenInputs: true });
for (const metric of strictProductionReport.metrics) {
  assert.strictEqual(metric.winnerHits, 1);
}

const unavailable = analyze([
  {
    ...productionRecord,
    source: "BOAT RACE公式",
    prediction: {
      ...productionRecord.prediction,
      preRaceConditions: {
        ...productionRecord.prediction.preRaceConditions,
        source: "BOAT RACE公式"
      }
    }
  }
], {
  inputDiagnostics: { settledJoinCount: 1 }
});
assert.strictEqual(unavailable.matchedRaceCount, 0);
assert.strictEqual(unavailable.sourceStatus, "source_data_unavailable");
assert.strictEqual(unavailable.inputDiagnostics.settledJoinCount, 1);
assert.match(unavailable.note, /代用しない/);

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "chappy-analysis-contract-"));
const predictionsDir = path.join(temporaryRoot, "data", "predictions");
const resultsDir = path.join(temporaryRoot, "data", "results");
fs.mkdirSync(predictionsDir, { recursive: true });
fs.mkdirSync(resultsDir, { recursive: true });

function storedRecord(raceNo, selectedAt, marker) {
  return {
    raceKey: `20260809-23-${raceNo}`,
    date: "20260809",
    jcd: "23",
    raceNo,
    selectedAt,
    deadlineAt: "2026-08-09T10:00:00+09:00",
    marker,
    prediction: {
      predictionMode: "server_pre_deadline_shadow",
      preRaceConditions: {
        sourceTiming: "pre_deadline",
        officialResultUsed: false,
        boats: entries
      }
    }
  };
}

fs.writeFileSync(path.join(predictionsDir, "20260809.json"), JSON.stringify({
  predictions: [storedRecord(1, "2026-08-09T00:30:00Z", "primary")],
  verificationPredictions: [
    storedRecord(1, "2026-08-09T00:20:00Z", "verification"),
    storedRecord(2, "2026-08-09T01:00:00Z", "at-deadline")
  ]
}));
fs.writeFileSync(path.join(predictionsDir, "index.json"), JSON.stringify({
  verificationPredictions: [storedRecord(3, "2026-08-09T00:20:00Z", "derived")]
}));
fs.writeFileSync(path.join(resultsDir, "20260809.json"), JSON.stringify({
  date: "20260809",
  races: [1, 2].map(raceNo => ({
    resultAvailable: true,
    date: "20260809",
    jcd: "23",
    raceNo,
    trifecta: { combination: "2-1-3" }
  }))
}));

const canonical = inputContract.collectCanonicalPredictions(predictionsDir);
assert.strictEqual(canonical.length, 2);
assert.strictEqual(canonical.find(row => row.raceNo === 1).marker, "primary");
const cohort = inputContract.buildDefaultCohort({ predictionsDir, resultsDir });
assert.strictEqual(cohort.diagnostics.canonicalPredictionCount, 2);
assert.strictEqual(cohort.diagnostics.excludedPredictionCount, 1);
assert.strictEqual(
  cohort.diagnostics.excludedReasons["captured-at-or-after-deadline"],
  1
);
assert.strictEqual(cohort.records.length, 1);
assert.strictEqual(cohort.records[0].__analysisRaceKey, "20260809-23-1");
fs.rmSync(temporaryRoot, { recursive: true, force: true });

console.log("hiyori official comparison tests passed");
