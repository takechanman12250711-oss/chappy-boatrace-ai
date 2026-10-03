"use strict";

const fs = require("node:fs");
const assert = require("node:assert/strict");
const analyzer = require("./build-remain-pickup-hold3-shadow-ab");
const sourceReport = require("./build-frame-rise-fall-shadow-result-report");

const record = {
  date: "20260817",
  jcd: "05",
  raceNo: 1,
  selectedAt: "2026-08-17T10:31:00Z",
  unusedPayload: "drop-record-field",
  prediction: {
    practicalTickets: ["1-2-3", "1-3-2"],
    unusedPayload: "drop-prediction-field",
    verificationEvidence: {
      tickets: [{
        ticket: "1-2-3",
        unusedPayload: "drop-ticket-field",
        roleClaims: [{
          boatNo: 3,
          role: "hold",
          expectedPositions: [3],
          unusedPayload: "drop-claim-field"
        }]
      }]
    }
  }
};
const result = {
  date: "20260817",
  jcd: "05",
  raceNo: 1,
  resultAvailable: true,
  status: "finished",
  unusedPayload: "drop-result-field",
  trifecta: { combination: "1-2-3", payout: 900 }
};

const hold = analyzer.hold3Tickets(record);
assert.ok(hold.has("1-2-3"));
assert.ok(!hold.has("1-3-2"));

const rawPredictionDocs = [{ predictions: [record] }];
const rawResultDocs = [{ races: [result] }];
const compactPredictionDocs = rawPredictionDocs.map(analyzer.compactPredictionDoc);
const compactResultDocs = rawResultDocs.map(sourceReport.compactResultDoc);
assert.equal(
  Object.hasOwn(compactPredictionDocs[0].predictions[0], "unusedPayload"),
  false
);
assert.equal(
  Object.hasOwn(compactPredictionDocs[0].predictions[0].prediction, "unusedPayload"),
  false
);

const report = analyzer.build(rawPredictionDocs, rawResultDocs);
const compactReport = analyzer.build(compactPredictionDocs, compactResultDocs);
assert.deepEqual(compactReport.A, report.A);
assert.deepEqual(compactReport.B, report.B);
assert.equal(report.A.hitCount, 1);
assert.equal(report.B.hitCount, 0);
assert.equal(report.A.affectedRaceCount, 1);
assert.equal(report.productionAUnchanged, true);
assert.equal(report.automaticApplication, false);

const workflow = fs.readFileSync(
  ".github/workflows/check-remain-pickup-hold3-shadow-ab.yml",
  "utf8"
);
assert.ok(!workflow.includes("\n  workflow_run:"));
assert.ok(!workflow.includes("\n  push:"));
assert.match(workflow, /workflow_dispatch:/);
console.log("hold3 shadow AB test: ok");
