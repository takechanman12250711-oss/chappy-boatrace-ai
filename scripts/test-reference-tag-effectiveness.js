#!/usr/bin/env node
"use strict";

const assert = require("assert");
const inputContract = require("./analysis-input-contract");
const {
  analyze,
  actualTicket,
  extractTags,
  flattenRecords,
  predictedTickets,
  sourceKind
} = require("./analyze-reference-tag-effectiveness");

const records = [
  {
    date: "20260724",
    place: "大村",
    raceNo: 7,
    referenceTags: [
      { key: "exhibition", label: "⚪1号艇 展示タイム上位", strength: 3 },
      { key: "wind", label: "向かい風5m注意", strength: 2 }
    ],
    practicalSelection: ["1-2-3", "1-3-2"],
    result: { trifecta: "1-2-3" }
  },
  {
    date: "20260724",
    place: "多摩川",
    raceNo: 8,
    tags: [
      { key: "lap", label: "🔵4号艇 一周タイム上位", strength: 2 },
      { key: "exhibition", label: "⚫2号艇 展示タイム上位", strength: 1 }
    ],
    tickets: [{ ticket: "4-1-2" }],
    officialResult: { order: [4, 1, 2] }
  }
];

assert.strictEqual(actualTicket(records[0]), "1-2-3");
assert.strictEqual(actualTicket(records[1]), "4-1-2");
assert.strictEqual(extractTags(records[0]).length, 2);
assert.deepStrictEqual(predictedTickets(records[1]), ["4-1-2"]);

const report = analyze(records);
assert.strictEqual(report.matchedRaceCount, 2);
assert.strictEqual(report.settledRaceCount, 2);
assert.strictEqual(report.tagCount, 3);

const exhibition = report.tags.find(tag => tag.key === "exhibition");
assert(exhibition);
assert.strictEqual(exhibition.samples, 2);
assert.strictEqual(exhibition.winnerHits, 1);
assert.strictEqual(exhibition.top3Hits, 2);
assert.strictEqual(exhibition.ticketHits, 2);
assert.strictEqual(exhibition.winnerRate, 50);
assert.strictEqual(exhibition.top3Rate, 100);
assert.strictEqual(exhibition.status, "データ不足");

const lap = report.tags.find(tag => tag.key === "lap");
assert(lap);
assert.strictEqual(lap.winnerHits, 1);
assert.strictEqual(lap.top3Hits, 1);

const productionBoats = Array.from({ length: 6 }, (_, index) => ({
  boatNo: index + 1,
  exhibitionTime: 6.9 - index * 0.04,
  currentST: 0.18 - index * 0.03,
  localWinRate: 5.1 + index * 0.5
}));
const productionRecord = {
  raceKey: "20260809-23-1",
  prediction: {
    preRaceConditions: {
      sourceTiming: "pre_deadline",
      officialResultUsed: false,
      boats: productionBoats,
      weather: { windSpeed: 5, waveHeight: 5 },
      newEngineMode: false
    },
    practicalTickets: [
      { ticket: "3-2-1", category: "本線" },
      { ticket: "1-2-3", category: "押さえ" }
    ]
  },
  __officialResult: {
    trifecta: { combination: "3-2-1", boats: [3, 2, 1] }
  }
};
assert.strictEqual(flattenRecords({
  predictions: [],
  verificationPredictions: [productionRecord]
}, "daily.json").length, 1);

assert.strictEqual(actualTicket(productionRecord), "3-2-1");
assert.deepStrictEqual(predictedTickets(productionRecord), ["3-2-1", "1-2-3"]);
assert.ok(extractTags(productionRecord).length >= 5);

const productionReport = analyze([productionRecord], {
  inputDiagnostics: { settledJoinCount: 1 },
  strictFrozenInputs: true
});
assert.strictEqual(productionReport.settledRaceCount, 1);
assert.strictEqual(productionReport.matchedRaceCount, 1);
assert.strictEqual(productionReport.sourceStatus, "ready");
assert.strictEqual(productionReport.dataSource, "boatrace-official");
assert.strictEqual(productionReport.compatibilityProfile, "hiyori-compatible");
assert.strictEqual(productionReport.directHiyoriDataUsed, false);
assert.strictEqual(productionReport.sourceBreakdown.legacyUnlabeledRaceCount, 1);
assert.match(productionReport.note, /日和サイトの直接取得は使わず/);
assert.strictEqual(productionReport.inputDiagnostics.settledJoinCount, 1);
assert.strictEqual(productionReport.causalClaim, false);
const productionStart = productionReport.tags.find(tag => tag.key === "start");
assert.strictEqual(productionStart.label, "ST上位艇");
assert.strictEqual(productionStart.ticketHits, 1);
const productionWind = productionReport.tags.find(tag => tag.key === "wind");
assert.strictEqual(productionWind.targetSamples, 0);
assert.strictEqual(Object.hasOwn(productionWind, "winnerRate"), false);
assert.strictEqual(productionWind.status, "データ不足");

const taintedReport = analyze([{
  ...productionRecord,
  source: "ボートレース日和",
  referenceTags: [
    { key: "result-derived", label: "3号艇 結果後タグ", strength: 3 }
  ],
  prediction: {
    ...productionRecord.prediction,
    weather: { windSpeed: 99, waveHeight: 99 }
  }
}], { strictFrozenInputs: true });
assert.strictEqual(
  taintedReport.tags.some(tag => tag.key === "result-derived"),
  false,
  "strict analysis must ignore tags attached after the frozen snapshot"
);
assert.strictEqual(
  taintedReport.tags.find(tag => tag.key === "wind").averageStrength,
  2,
  "strict analysis must use frozen weather instead of top-level weather"
);
assert.strictEqual(
  taintedReport.sourceBreakdown.legacyUnlabeledRaceCount,
  1,
  "strict analysis must ignore a source label attached after the frozen snapshot"
);

assert.strictEqual(sourceKind({
  prediction: {
    preRaceConditions: {
      source: "boatrace-official",
      analysisProfile: "hiyori-compatible"
    }
  }
}, { strictFrozenInputs: true }), "official-labeled");
assert.strictEqual(sourceKind({
  prediction: {
    preRaceConditions: {
      schemaVersion: 4,
      source: "",
      analysisProfile: ""
    }
  }
}, { strictFrozenInputs: true }), "other-source");
for (const source of [
  "fake-boatrace-official-proxy",
  "untrusted BOAT RACE公式 mirror"
]) {
  assert.strictEqual(sourceKind({
    prediction: {
      preRaceConditions: {
        schemaVersion: 4,
        source,
        analysisProfile: "hiyori-compatible"
      }
    }
  }, { strictFrozenInputs: true }), "other-source");
}
assert.strictEqual(sourceKind({
  prediction: {
    preRaceConditions: {
      schemaVersion: 4,
      source: "some-third-party",
      analysisProfile: "hiyori-compatible"
    }
  }
}, { strictFrozenInputs: true }), "other-source");
assert.strictEqual(sourceKind({
  prediction: {
    preRaceConditions: {
      schemaVersion: 3,
      source: "hiyori-compatible"
    }
  }
}, { strictFrozenInputs: true }), "official-compatible");
const directHiyoriReport = analyze([{
  ...productionRecord,
  prediction: {
    ...productionRecord.prediction,
    preRaceConditions: {
      ...productionRecord.prediction.preRaceConditions,
      source: "ボートレース日和"
    }
  }
}], { strictFrozenInputs: true });
assert.strictEqual(directHiyoriReport.settledRaceCount, 0);
assert.strictEqual(directHiyoriReport.matchedRaceCount, 0);
assert.strictEqual(
  directHiyoriReport.sourceBreakdown.rejectedDirectHiyoriRaceCount,
  1
);

const lateCohort = inputContract.buildCohortFromRecords([{
  ...productionRecord,
  date: "20260809",
  jcd: "23",
  raceNo: 1,
  selectedAt: "2026-08-09T01:00:00Z",
  deadlineAt: "2026-08-09T10:00:00+09:00"
}]);
assert.strictEqual(lateCohort.records.length, 0);
assert.strictEqual(
  lateCohort.diagnostics.excludedReasons["captured-at-or-after-deadline"],
  1
);

assert.strictEqual(
  actualTicket({ trifecta: { boats: [4, 1, 2] } }),
  "4-1-2"
);
assert.strictEqual(
  actualTicket({
    finishers: [
      { rank: 2, boat: 1 },
      { rank: 3, boat: 2 },
      { rank: 1, boat: 4 }
    ]
  }),
  "4-1-2"
);

console.log("reference tag effectiveness tests passed");
