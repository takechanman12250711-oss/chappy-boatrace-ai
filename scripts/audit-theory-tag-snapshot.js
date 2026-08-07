"use strict";

const fs = require("node:fs");
const path = require("node:path");

function auditPredictionFile(file) {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const predictions = Array.isArray(data?.predictions) ? data.predictions : [];
  const verificationPredictions = Array.isArray(data?.verificationPredictions)
    ? data.verificationPredictions
    : [];
  const rows = [...predictions, ...verificationPredictions];
  const snapshotRows = rows.filter(record =>
    Array.isArray(record?.theoryTagSnapshot?.theories)
  );
  const nonEmptySnapshotRows = snapshotRows.filter(record =>
    record.theoryTagSnapshot.theories.length > 0
  );

  return {
    predictionFileExists: true,
    predictionBytes: fs.statSync(file).size,
    predictionRows: predictions.length,
    verificationPredictionRows: verificationPredictions.length,
    totalRows: rows.length,
    theoryTagSnapshotRows: snapshotRows.length,
    nonEmptyTheoryTagSnapshotRows: nonEmptySnapshotRows.length,
    allRowsHaveTheoryTagSnapshot:
      rows.length > 0 && snapshotRows.length === rows.length,
    allRowsHaveNonEmptyTheoryTagSnapshot:
      rows.length > 0 && nonEmptySnapshotRows.length === rows.length
  };
}

function main() {
  const date = String(process.env.PREDICT_DATE || process.argv[2] || "")
    .replaceAll("-", "")
    .trim();
  if (!/^\d{8}$/.test(date)) {
    throw new Error("PREDICT_DATE または引数に YYYYMMDD を指定してください");
  }

  const file = path.join(process.cwd(), "data", "predictions", `${date}.json`);
  const stats = fs.existsSync(file)
    ? auditPredictionFile(file)
    : {
        predictionFileExists: false,
        predictionBytes: 0,
        predictionRows: 0,
        verificationPredictionRows: 0,
        totalRows: 0,
        theoryTagSnapshotRows: 0,
        nonEmptyTheoryTagSnapshotRows: 0,
        allRowsHaveTheoryTagSnapshot: false,
        allRowsHaveNonEmptyTheoryTagSnapshot: false
      };

  process.stdout.write(JSON.stringify({
    schemaVersion: 1,
    date,
    generatedAt: new Date().toISOString(),
    ...stats
  }, null, 2) + "\n");
}

if (require.main === module) main();
module.exports = { auditPredictionFile };
