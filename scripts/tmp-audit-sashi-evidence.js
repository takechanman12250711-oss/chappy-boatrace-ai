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

function stringPaths(value, target, base = "", rows = []) {
  if (rows.length >= 8 || value === null || value === undefined) return rows;
  if (typeof value === "string") {
    if (value.includes(target)) rows.push({ path: base, value });
    return rows;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => stringPaths(item, target, `${base}[${index}]`, rows));
    return rows;
  }
  if (typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => stringPaths(item, target, base ? `${base}.${key}` : key, rows));
  }
  return rows;
}

function mainScenarioOf(record) {
  const prediction = record?.prediction || {};
  const raw = [
    prediction?.aiCore?.raceScenarios?.mainScenario?.type,
    prediction?.raceScenarios?.mainScenario?.type,
    prediction?.mainScenario?.type,
    prediction?.scenarioType,
    prediction?.scenarioLabel,
    prediction?.raceFlow?.scenarioType,
    prediction?.raceFlow?.scenario,
    prediction?.mainSheet?.scenarioType,
    prediction?.mainSheet?.scenario,
    record?.scenarioType,
    record?.scenarioLabel,
    record?.best?.scenarioLabel
  ].find(value => String(value || "").trim());
  const text = String(raw || "");
  if (text === "sashi" || text.includes("2コース差し") || text.includes("2差し")) return "sashi";
  if (text === "escape" || text.includes("1号艇逃げ") || text.includes("1逃げ")) return "escape";
  if (text === "threeAttack" || text.includes("3コース攻め") || text.includes("3攻め")) return "threeAttack";
  if (text === "fourAttack" || text.includes("4カド") || text.includes("4コース攻め")) return "fourAttack";
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
  sashiStringExamples: []
};

for (const name of fs.readdirSync(dir).filter(name => /^\d{8}\.json$/.test(name))) {
  const data = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
  for (const record of rowsOf(data)) {
    if (record?.result?.settled !== true) continue;
    counters.settled += 1;
    const scenario = mainScenarioOf(record);
    counters.scenarioTypes[scenario || "unknown"] = (counters.scenarioTypes[scenario || "unknown"] || 0) + 1;

    if (!scenario && counters.sashiStringExamples.length < 4) {
      const hits = stringPaths(record?.prediction || record, "2コース差し");
      if (hits.length) counters.sashiStringExamples.push({ raceKey: record?.raceKey || record?.key || "", hits });
    }

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
