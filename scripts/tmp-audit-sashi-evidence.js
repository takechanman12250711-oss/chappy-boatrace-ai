"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dir = path.join(root, "data", "predictions");

function rowsOf(data) {
  return [
    ...(Array.isArray(data?.predictions) ? data.predictions : []),
    ...(Array.isArray(data?.verificationPredictions) ? data.verificationPredictions : [])
  ];
}

function mainScenarioOf(prediction) {
  return String(
    prediction?.aiCore?.raceScenarios?.mainScenario?.type ||
    prediction?.raceScenarios?.mainScenario?.type ||
    prediction?.mainScenario?.type ||
    ""
  );
}

function avgStOf(boat) {
  const value = boat?.avgST ?? boat?.avgSt ?? boat?.averageST ?? boat?.averageSt;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const counters = {
  settled: 0,
  sashiMain: 0,
  withComparison: 0,
  withoutComparison: 0,
  withoutComparisonMiss: 0,
  withoutComparisonHit: 0,
  withoutComparisonScenarioMiss: 0,
  withoutComparisonScenarioHit: 0,
  missTypes: {}
};

for (const name of fs.readdirSync(dir).filter(name => /^\d{8}\.json$/.test(name))) {
  const data = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
  for (const record of rowsOf(data)) {
    if (record?.result?.settled !== true) continue;
    counters.settled += 1;
    const prediction = record?.prediction || {};
    if (mainScenarioOf(prediction) !== "sashi") continue;
    counters.sashiMain += 1;

    const boats = Array.isArray(prediction?.preRaceConditions?.boats)
      ? prediction.preRaceConditions.boats
      : [];
    const boat1 = boats.find(row => Number(row?.boatNo ?? row?.boat) === 1);
    const boat2 = boats.find(row => Number(row?.boatNo ?? row?.boat) === 2);
    const hasComparison = avgStOf(boat1) !== null && avgStOf(boat2) !== null;

    if (hasComparison) {
      counters.withComparison += 1;
      continue;
    }

    counters.withoutComparison += 1;
    const review = record?.result?.review || {};
    const hit = record?.result?.practicalHit === true || review?.practicalHit === true;
    if (hit) counters.withoutComparisonHit += 1;
    else counters.withoutComparisonMiss += 1;

    if (review?.scenarioMatch === true) counters.withoutComparisonScenarioHit += 1;
    if (review?.scenarioMatch === false) counters.withoutComparisonScenarioMiss += 1;

    const missType = String(review?.missType || "unknown");
    counters.missTypes[missType] = (counters.missTypes[missType] || 0) + 1;
  }
}

console.log(JSON.stringify(counters, null, 2));
