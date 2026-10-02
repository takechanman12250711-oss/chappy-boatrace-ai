"use strict";

const fs = require("node:fs");
const path = require("node:path");
const localWater = require("./build-local-water-result-breakdown");
const outerHead = require("./build-outer-head-drop-stage-audit");
const root = path.resolve(__dirname, "..");
const OUT = path.join(root, "data", "stats", "local-water-outer-head-stage-audit.json");

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function key(record = {}) {
  return `${record.date}-${String(record.jcd || "").padStart(2, "0")}-${Number(record.raceNo || 0)}`;
}

function load(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => /^\d{8}\.json$/.test(name))
    .sort()
    .map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")));
}

function predictionRows(docs) {
  const map = new Map();
  for (const doc of docs) {
    for (const name of ["predictions", "verificationPredictions"]) {
      for (const row of arr(doc[name])) {
        const raceKey = key(row);
        if (name === "predictions" || !map.has(raceKey)) map.set(raceKey, row);
      }
    }
  }
  return [...map.values()];
}

function resultMap(docs) {
  const map = new Map();
  for (const doc of docs) {
    for (const race of arr(doc.races)) {
      if (race?.resultAvailable === true && race?.status === "finished") {
        map.set(key(race), race);
      }
    }
  }
  return map;
}

function pct(numerator, denominator) {
  return denominator ? Math.round(numerator / denominator * 1000) / 10 : null;
}

function decide(metrics) {
  if (metrics.actualHead56Count < 20) return "continue-collecting-local-water-5-6-outcomes";
  if (metrics.actualHead56CandidateCoverageRate < 50) return "audit-local-water-candidate-generation";
  if (
    metrics.actualHead56ScenarioCoverageRate != null &&
    metrics.actualHead56CandidateCoverageRate - metrics.actualHead56ScenarioCoverageRate >= 10
  ) return "audit-local-water-candidate-to-scenario-selection";
  if (
    metrics.actualHead56FinalAnyCoverageRate != null &&
    metrics.actualHead56ScenarioCoverageRate - metrics.actualHead56FinalAnyCoverageRate >= 10
  ) return "audit-local-water-scenario-to-main-head-selection";
  if (metrics.actualHead56FinalCorrectRate < 20) return "audit-local-water-outer-head-ranking";
  return "no-local-water-outer-head-structural-gap";
}

function build(predDocs, resultDocs) {
  const results = resultMap(resultDocs);
  const settled = predictionRows(predDocs)
    .map((record) => ({
      record,
      evidence: localWater.evidence(record),
      result: results.get(key(record)) || null
    }))
    .filter((row) => row.evidence.formal && row.result && localWater.actualHead(row.result));

  let candidate56Count = 0;
  let scenario56Count = 0;
  let finalHead56Count = 0;
  let actualHead56Count = 0;
  let actualHead56CandidateCount = 0;
  let actualHead56ScenarioCount = 0;
  let actualHead56FinalAnyCount = 0;
  let actualHead56FinalCorrectCount = 0;
  const actualHead56ByBoat = { "5": 0, "6": 0 };
  const predictedHead56ByBoat = { "5": 0, "6": 0 };
  const actualHead56PathCounts = new Map();

  for (const row of settled) {
    const inspection = outerHead.inspect(row.record);
    const predicted = outerHead.mainHead(row.record);
    const actual = localWater.actualHead(row.result);

    if (inspection.candidate56) candidate56Count++;
    if (inspection.scenario56) scenario56Count++;
    if (predicted === 5 || predicted === 6) {
      finalHead56Count++;
      predictedHead56ByBoat[String(predicted)]++;
    }

    if (actual !== 5 && actual !== 6) continue;
    actualHead56Count++;
    actualHead56ByBoat[String(actual)]++;
    if (inspection.candidate56) actualHead56CandidateCount++;
    if (inspection.scenario56) actualHead56ScenarioCount++;
    if (predicted === 5 || predicted === 6) actualHead56FinalAnyCount++;
    if (predicted === actual) actualHead56FinalCorrectCount++;
    for (const savedPath of inspection.paths) {
      actualHead56PathCounts.set(savedPath, (actualHead56PathCounts.get(savedPath) || 0) + 1);
    }
  }

  const metrics = {
    settledFormalEvidenceRaceCount: settled.length,
    candidateStage56RaceCount: candidate56Count,
    scenarioStage56RaceCount: scenario56Count,
    finalHead56Count,
    actualHead56Count,
    actualHead56CandidateCount,
    actualHead56ScenarioCount,
    actualHead56FinalAnyCount,
    actualHead56FinalCorrectCount,
    candidateStage56Rate: pct(candidate56Count, settled.length),
    scenarioStage56Rate: pct(scenario56Count, settled.length),
    finalHead56Rate: pct(finalHead56Count, settled.length),
    actualHead56Rate: pct(actualHead56Count, settled.length),
    actualHead56CandidateCoverageRate: pct(actualHead56CandidateCount, actualHead56Count),
    actualHead56ScenarioCoverageRate: pct(actualHead56ScenarioCount, actualHead56Count),
    actualHead56FinalAnyCoverageRate: pct(actualHead56FinalAnyCount, actualHead56Count),
    actualHead56FinalCorrectRate: pct(actualHead56FinalCorrectCount, actualHead56Count)
  };

  const topActualHead56Paths = [...actualHead56PathCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([savedPath, count]) => ({ path: savedPath, count }));

  return {
    schemaVersion: 1,
    version: "local-water-outer-head-stage-audit-v1",
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    methodology: "The same settled formal local-water cohort is traced through saved candidate, scenario, and final main-head stages. No post-result feature creation.",
    ...metrics,
    actualHead56ByBoat,
    predictedHead56ByBoat,
    topActualHead56Paths,
    nextStep: decide(metrics)
  };
}

function main() {
  const report = build(
    load(path.join(root, "data", "predictions")),
    load(path.join(root, "data", "results"))
  );
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) main();
module.exports = { key, predictionRows, resultMap, pct, decide, build };
