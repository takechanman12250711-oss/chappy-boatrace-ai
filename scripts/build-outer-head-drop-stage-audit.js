"use strict";

const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const OUT = path.join(root, "data", "stats", "outer-head-drop-stage-audit.json");

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function load(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => /^\d{8}\.json$/.test(name))
    .sort()
    .map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")));
}

function rows(docs) {
  const map = new Map();
  for (const doc of docs) {
    for (const name of ["predictions", "verificationPredictions"]) {
      for (const row of arr(doc[name])) {
        const key = `${row.date}-${String(row.jcd || "").padStart(2, "0")}-${Number(row.raceNo || 0)}`;
        if (name === "predictions" || !map.has(key)) map.set(key, row);
      }
    }
  }
  return [...map.values()];
}

function semanticStage(key) {
  const name = String(key || "");
  if (/(candidate|preserved|evaluation|attack|mark)/i.test(name)) return "candidate";
  if (/scenario/i.test(name)) return "scenario";
  if (/alternate/i.test(name)) return "candidate";
  return null;
}

function walk(value, currentPath = "", out = []) {
  if (value == null) return out;
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${currentPath}[${index}]`, out));
    return out;
  }
  if (typeof value !== "object") return out;

  for (const [key, child] of Object.entries(value)) {
    const childPath = currentPath ? `${currentPath}.${key}` : key;
    const stage = semanticStage(key);
    if (stage) out.push({ path: childPath, value: child, stage });
    walk(child, childPath, out);
  }
  return out;
}

function addStringBoats(text, target) {
  const value = String(text || "");
  for (const match of value.matchAll(/(?:^|[^0-9])([1-6])号艇/g)) target.add(Number(match[1]));
  if (/^[1-6](?:-[1-6]){1,2}$/.test(value.trim())) {
    value.trim().split("-").map(Number).forEach((number) => target.add(number));
  }
}

function numsForStage(value, stage) {
  const boats = new Set();

  function visit(node) {
    if (node == null) return;
    if (typeof node === "number") {
      if (node >= 1 && node <= 6) boats.add(node);
      return;
    }
    if (typeof node === "string") {
      addStringBoats(node, boats);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node !== "object") return;

    for (const [key, child] of Object.entries(node)) {
      const childStage = semanticStage(key);
      if (childStage && childStage !== stage) continue;

      if (/boatNo|number|waku|boat|headBoatNo/i.test(key)) {
        const number = Number(child);
        if (number >= 1 && number <= 6) boats.add(number);
      }
      visit(child);
    }
  }

  visit(value);
  return [...boats];
}

function nums(value) {
  return [...new Set([
    ...numsForStage(value, "candidate"),
    ...numsForStage(value, "scenario")
  ])];
}

function mainHead(record = {}) {
  const prediction = record.prediction || {};
  return Number(
    prediction?.verificationEvidence?.mainScenario?.headBoatNo ??
    prediction?.aiCore?.raceScenarios?.mainScenario?.headBoatNo ??
    prediction?.raceFlow?.scenario?.headBoatNo ??
    0
  ) || null;
}

function inspect(record) {
  const hits = walk(record.prediction || {})
    .map((hit) => ({ ...hit, boats: numsForStage(hit.value, hit.stage) }))
    .filter((hit) => hit.boats.some((number) => number === 5 || number === 6));
  const candidate = hits.filter((hit) => hit.stage === "candidate");
  const scenario = hits.filter((hit) => hit.stage === "scenario");
  return {
    candidate56: candidate.length > 0,
    scenario56: scenario.length > 0,
    paths: [...new Set(hits.map((hit) => hit.path))].slice(0, 50)
  };
}

function build(docs) {
  const predictionRows = rows(docs);
  let final56 = 0;
  let candidate56 = 0;
  let scenario56 = 0;
  let none56 = 0;
  const pathCounts = new Map();

  for (const record of predictionRows) {
    const head = mainHead(record);
    if (head === 5 || head === 6) final56++;

    const inspection = inspect(record);
    if (inspection.candidate56) candidate56++;
    if (inspection.scenario56) scenario56++;
    if (!inspection.candidate56 && !inspection.scenario56) none56++;
    for (const savedPath of inspection.paths) {
      pathCounts.set(savedPath, (pathCounts.get(savedPath) || 0) + 1);
    }
  }

  const topPaths = [...pathCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([savedPath, count]) => ({ path: savedPath, count }));

  let dropStage = "undetermined";
  if (final56 > 0) dropStage = "final-head-can-select-5-6";
  else if (scenario56 > 0) dropStage = "drops-between-scenario-and-main-head";
  else if (candidate56 > 0) dropStage = "drops-between-candidate-and-scenario";
  else dropStage = "drops-before-saved-candidate-stage";

  return {
    schemaVersion: 2,
    version: "outer-head-drop-stage-audit-v2",
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    methodology: "Semantic stage boundaries stop candidate values from leaking into scenario counts (and vice versa).",
    settledPredictionCount: predictionRows.length,
    finalHead56Count: final56,
    candidateStage56RaceCount: candidate56,
    scenarioStage56RaceCount: scenario56,
    noSaved56CandidateRaceCount: none56,
    dropStage,
    topSaved56Paths: topPaths
  };
}

function main() {
  const report = build(load(path.join(root, "data", "predictions")));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) main();
module.exports = { semanticStage, walk, nums, numsForStage, mainHead, inspect, build };
