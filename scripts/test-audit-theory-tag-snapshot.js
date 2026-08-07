"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { auditPredictionFile } = require("./audit-theory-tag-snapshot");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "theory-snapshot-audit-"));
const file = path.join(dir, "predictions.json");
fs.writeFileSync(file, JSON.stringify({
  predictions: [
    { theoryTagSnapshot: { theories: [{ theoryKey: "course", tickets: ["1-2-3"] }] } },
    { theoryTagSnapshot: { theories: [] } }
  ],
  verificationPredictions: [
    { theoryTagSnapshot: { theories: [{ theoryKey: "start", tickets: ["2-1-3"] }] } }
  ]
}));

const result = auditPredictionFile(file);
assert.equal(result.totalRows, 3);
assert.equal(result.theoryTagSnapshotRows, 3);
assert.equal(result.nonEmptyTheoryTagSnapshotRows, 2);
assert.equal(result.allRowsHaveTheoryTagSnapshot, true);
assert.equal(result.allRowsHaveNonEmptyTheoryTagSnapshot, false);

fs.rmSync(dir, { recursive: true, force: true });
console.log("theory tag snapshot audit test: ok");
