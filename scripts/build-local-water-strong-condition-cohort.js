"use strict";

const fs = require("node:fs");
const path = require("node:path");
const base = require("./build-local-water-result-breakdown");
const root = path.resolve(__dirname, "..");
const OUT = path.join(root, "data", "stats", "local-water-strong-condition-cohort.json");

function arr(v) { return Array.isArray(v) ? v : []; }
function key(r = {}) { return `${r.date}-${String(r.jcd || "").padStart(2, "0")}-${Number(r.raceNo || 0)}`; }
function load(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(n => /^\d{8}\.json$/.test(n)).sort()
    .map(n => JSON.parse(fs.readFileSync(path.join(dir, n), "utf8")));
}
function predictionRows(docs) {
  const map = new Map();
  for (const doc of docs) for (const name of ["predictions", "verificationPredictions"]) {
    for (const row of arr(doc[name])) {
      const k = key(row);
      if (name === "predictions" || !map.has(k)) map.set(k, row);
    }
  }
  return [...map.values()];
}
function resultMap(docs) {
  const map = new Map();
  for (const doc of docs) for (const race of arr(doc.races)) {
    if (race?.resultAvailable === true && race?.status === "finished") map.set(key(race), race);
  }
  return map;
}
function classify(e = {}) {
  if ((e.wind ?? -1) >= 5 || (e.wave ?? -1) >= 5) return "strong";
  if ((e.wind ?? -1) >= 3 || (e.wave ?? -1) >= 3) return "medium";
  return "calm";
}
function summarize(rows) {
  const out = { settledCount: 0, predictedHeadHitCount: 0, actualHead1Count: 0, actualOutsideHeadCount: 0 };
  for (const row of rows) {
    const actual = base.actualHead(row.result), predicted = base.predictedHead(row.record);
    if (!actual || !predicted) continue;
    out.settledCount++;
    if (actual === predicted) out.predictedHeadHitCount++;
    if (actual === 1) out.actualHead1Count++; else out.actualOutsideHeadCount++;
  }
  return {
    ...out,
    predictedHeadHitRate: out.settledCount ? Math.round(out.predictedHeadHitCount / out.settledCount * 1000) / 10 : null,
    actualHead1Rate: out.settledCount ? Math.round(out.actualHead1Count / out.settledCount * 1000) / 10 : null,
    actualOutsideHeadRate: out.settledCount ? Math.round(out.actualOutsideHeadCount / out.settledCount * 1000) / 10 : null,
  };
}
function build(predDocs, resultDocs) {
  const results = resultMap(resultDocs);
  const settled = predictionRows(predDocs)
    .map(record => ({ record, evidence: base.evidence(record), result: results.get(key(record)) || null }))
    .filter(row => row.evidence.formal && row.result && base.actualHead(row.result) && base.predictedHead(row.record));
  const groups = { calm: [], medium: [], strong: [] };
  for (const row of settled) groups[classify(row.evidence)].push(row);
  const cohorts = Object.fromEntries(Object.entries(groups).map(([name, rows]) => [name, summarize(rows)]));
  const strong = cohorts.strong, calm = cohorts.calm;
  const hitRateGapVsCalm = strong.predictedHeadHitRate != null && calm.predictedHeadHitRate != null
    ? Math.round((strong.predictedHeadHitRate - calm.predictedHeadHitRate) * 10) / 10 : null;
  const outsideHeadRateGapVsCalm = strong.actualOutsideHeadRate != null && calm.actualOutsideHeadRate != null
    ? Math.round((strong.actualOutsideHeadRate - calm.actualOutsideHeadRate) * 10) / 10 : null;
  return {
    schemaVersion: 1,
    version: "local-water-strong-condition-cohort-v1",
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    methodology: "締切前保存済み正式証拠を、強条件=風5m以上または波5cm以上、中条件=風3-4mまたは波3-4cm、平穏=それ未満にレース単位で重複なく分類。公式結果と照合。",
    settledFormalEvidenceRaceCount: settled.length,
    cohorts,
    comparison: { hitRateGapVsCalm, outsideHeadRateGapVsCalm },
    nextStep: strong.settledCount >= 30 && hitRateGapVsCalm <= -5 && outsideHeadRateGapVsCalm >= 10
      ? "eligible-for-shadow-ab-design"
      : "continue-collecting-evidence"
  };
}
function main() {
  const report = build(load(path.join(root, "data", "predictions")), load(path.join(root, "data", "results")));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}
if (require.main === module) main();
module.exports = { classify, summarize, build };
