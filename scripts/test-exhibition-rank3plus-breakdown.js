"use strict";

const assert = require("node:assert/strict");
const engine = require("./build-exhibition-rank3plus-breakdown");

const rows = Array.from({ length: 12 }, (_, index) => ({
  date: "20260930",
  jcd: "01",
  raceNo: index + 1,
  unusedPayload: { rows: Array(100).fill("discard") },
  prediction: {
    unusedPayload: { rows: Array(100).fill("discard") },
    practicalTickets: [{ ticket: "1-2-3" }],
    verificationEvidence: {
      exhibitionFoot: {
        formal: true,
        attackBoatNo: (index % 3) + 2,
        exhibitionRank: 3 + (index % 3),
        exhibitionCoverage: 6,
        statements: [index % 2 === 0 ? "展示下位で警戒" : "展示気配良く補強"],
        alert: index % 2 === 0,
        confirm: index % 2 === 1,
      },
    },
  },
}));

const results = {
  races: rows.map((row, index) => ({
    date: row.date,
    jcd: row.jcd,
    raceNo: row.raceNo,
    resultAvailable: true,
    status: "finished",
    trifecta: {
      combination: index % 3 === 0 ? "1-2-3" : "2-1-3",
      payout: index % 3 === 0 ? 1200 : 0,
    },
    unusedPayload: { rows: Array(100).fill("discard") },
  })),
};

const compactPredictions = engine.compactPredictionDoc({
  predictions: rows,
  verificationPredictions: [],
});
const compactResults = engine.compactResultDoc(results);

assert.equal(compactPredictions.predictions[0].unusedPayload, undefined);
assert.equal(compactPredictions.predictions[0].prediction.unusedPayload, undefined);
assert.equal(compactResults.races[0].unusedPayload, undefined);

const raw = engine.build(
  [{ predictions: rows, verificationPredictions: [] }],
  [results],
);
const compact = engine.build([compactPredictions], [compactResults]);

assert.deepEqual(compact.summary, raw.summary);
assert.deepEqual(compact.dimensions, raw.dimensions);
assert.deepEqual(compact.rankings, raw.rankings);
assert.deepEqual(compact.weakestEligibleBranches, raw.weakestEligibleBranches);

console.log("exhibition rank3plus compaction test: ok");
