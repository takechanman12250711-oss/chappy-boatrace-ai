"use strict";

const fs = require("node:fs");
const path = require("node:path");

function* loadDailyDocuments(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir).filter(name => /^\d{8}\.json$/.test(name)).sort()) {
    yield JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
  }
}

// Calculate each diagnostic from the complete saved record before releasing its
// daily document. Retain only the calculation result, not arbitrary projections
// of evidence that recursive audits might inspect. Keep a null result in the Map:
// an ineligible primary row must still suppress a verification row of that race.
function mapPredictionRows(docs, project) {
  const rows = new Map();
  for (const doc of docs) {
    for (const source of ["predictions", "verificationPredictions"]) {
      for (const row of Array.isArray(doc?.[source]) ? doc[source] : []) {
        const key = `${row.date}-${String(row.jcd || "").padStart(2, "0")}-${Number(row.raceNo || 0)}`;
        if (source === "predictions" || !rows.has(key)) rows.set(key, project(row));
      }
    }
  }
  return [...rows.values()];
}

module.exports = { loadDailyDocuments, mapPredictionRows };
