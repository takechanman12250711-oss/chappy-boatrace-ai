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

function mainScenarioOf(record) {
  const prediction = record?.prediction || {};
  const direct = [
    prediction?.aiCore?.raceScenarios?.mainScenario?.type,
    prediction?.raceScenarios?.mainScenario?.type,
    prediction?.mainScenario?.type,
    prediction?.scenarioType,
    prediction?.scenarioLabel,
    prediction?.raceFlow?.scenarioType,
    prediction?.mainSheet?.scenarioType,
    record?.scenarioType,
    record?.scenarioLabel,
    record?.best?.scenarioLabel
  ].find(value => String(value || "").trim());

  const title = String(prediction?.raceFlow?.scenario?.title || "");
  const summary = String(prediction?.raceFlow?.summary || "");
  const text = [String(direct || ""), title, summary].join(" ");

  if (text === "sashi" || /最有力展開は2コース差し|2コース差し本線|\b2差し\b/.test(text)) return "sashi";
  if (text === "escape" || /最有力展開は1号艇逃げ|1号艇逃げ本線|\b1逃げ\b/.test(text)) return "escape";
  if (text === "threeAttack" || /最有力展開は3コース攻め|3コース攻め本線|\b3攻め\b/.test(text)) return "threeAttack";
  if (text === "fourAttack" || /最有力展開は4カド|4カド本線|4コース攻め本線/.test(text)) return "fourAttack";
  return "";
}

function avgStOf(boat) {
  const value = boat?.avgST ?? boat?.avgSt ?? boat?.averageST ?? boat?.averageSt;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function boatsOf(record) {
  const prediction = record?.prediction || {};
  return [
    prediction?.preRaceConditions?.boats,
    prediction?.conditions?.boats,
    record?.preRaceConditions?.boats,
    record?.conditions?.boats
  ].find(Array.isArray) || [];
}

const counters = {
  settled: 0,
  scenarioTypes: {},
  sashiMain: 0,
  withComparison: 0,
  withoutComparison: 0,
  withoutComparisonMiss: 0,
  withoutComparisonHit: 0,
  withoutComparisonScenarioMiss: 0,
  withoutComparisonScenarioHit: 0,
  missTypes: {},
  missingBoatSnapshotExamples: []
};

for (const name of fs.readdirSync(dir).filter(name => /^\d{8}\.json$/.test(name))) {
  const data = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
  for (const record of rowsOf(data)) {
    if (record?.result?.settled !== true) continue;
    counters.settled += 1;
    const scenario = mainScenarioOf(record);
    counters.scenarioTypes[scenario || "unknown"] = (counters.scenarioTypes[scenario || "unknown"] || 0) + 1;
    if (scenario !== "sashi") continue;
    counters.sashiMain += 1;

    const boats = boatsOf(record);
    const boat1 = boats.find(row => Number(row?.boatNo ?? row?.boat) === 1);
    const boat2 = boats.find(row => Number(row?.boatNo ?? row?.boat) === 2);
    const hasComparison = avgStOf(boat1) !== null && avgStOf(boat2) !== null;

    if (hasComparison) {
      counters.withComparison += 1;
      continue;
    }

    counters.withoutComparison += 1;
    if (counters.missingBoatSnapshotExamples.length < 5) {
      counters.missingBoatSnapshotExamples.push({
        raceKey: record?.raceKey || record?.key || "",
        boatCount: boats.length,
        boat1AvgSt: avgStOf(boat1),
        boat2AvgSt: avgStOf(boat2),
        summary: record?.prediction?.raceFlow?.summary || ""
      });
    }

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
