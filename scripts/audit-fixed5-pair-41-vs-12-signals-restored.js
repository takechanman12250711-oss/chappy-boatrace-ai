"use strict";

const fs = require("node:fs");
const path = require("node:path");

global.window = global;
require("../js/ai-core");
require("../js/third-six-rescue-fixed5");
require("../js/escape-outer-second-rescue-fixed5");
require("../js/third-place-rescue-14-fixed5");
require("../js/third-place-rescue-12-4-fixed5");
require("../js/pair-31-rescue-fixed5");
require("../js/pair-32-rescue-fixed5");

const core = global.ChappyAICore;
const predictionDir = path.join(process.cwd(), "data", "predictions");
const holdoutStart = "20260812";
const artifactPath = path.join(
  process.cwd(),
  "fixed5-pair-41-vs-12-signals-restored.json"
);
const signalKeys = ["st", "ex", "flow", "attack", "hold", "pickup"];
const metricPaths = {
  st: ["indexes.st", "stIndex", "st"],
  ex: ["indexes.exhibition", "indexes.ex", "exhibition", "ex"],
  flow: ["indexes.raceFlow", "raceFlow"],
  attack: ["roleScores.attack", "attack"],
  hold: ["roleScores.hold", "hold"],
  pickup: ["roleScores.pickup", "pickup"],
};

function rows(data) {
  return [
    ...(data.predictions || []),
    ...(data.verificationPredictions || []),
  ];
}

function ticket(value) {
  const raw = value?.ticket ?? value;
  const parts = String(raw ?? "").match(/[1-6]/g) || [];
  return parts.length >= 3 ? parts.slice(0, 3).join("-") : "";
}

function input(row) {
  const source =
    row?.prediction?.preRaceConditions || row?.preRaceConditions;
  if (!source || !Array.isArray(source.boats) || source.boats.length < 6) {
    return null;
  }
  return {
    ...source,
    entries: source.boats,
    boats: source.boats,
    jcd: row.jcd,
    stadiumCode: row.jcd,
    venueCode: row.jcd,
    place: row.place,
    placeName: row.place,
    venueName: row.place,
    raceNo: row.raceNo,
    rno: row.raceNo,
    weather: source.weather || {},
  };
}

function fixedFive(prediction) {
  const formations = prediction?.formations || {};
  return [
    ...(formations.main || []).slice(0, 3),
    ...(formations.safety || []).slice(0, 2),
  ]
    .map(ticket)
    .filter(Boolean);
}

function analyses(prediction) {
  return (
    prediction?.analyses ||
    prediction?.evaluations ||
    prediction?.boatEvaluation?.evaluations ||
    []
  );
}

function boatNumber(boat, index) {
  return Number(boat?.boatNo ?? boat?.boat ?? boat?.no ?? index + 1);
}

function findBoat(list, number) {
  return (
    (list || []).find(
      (boat, index) => boatNumber(boat, index) === number
    ) || null
  );
}

function metric(boat, key) {
  for (const metricPath of metricPaths[key]) {
    let value = boat;
    for (const part of metricPath.split(".")) value = value?.[part];
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function payout(row) {
  for (const value of [
    row?.result?.payout,
    row?.result?.payoutYen,
    row?.result?.trifectaPayout,
    row?.result?.review?.payout,
    row?.result?.review?.payoutYen,
    row?.result?.review?.trifectaPayout,
  ]) {
    const amount = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(amount) && amount >= 0) return amount;
  }
  return 0;
}

function group() {
  return {
    n: 0,
    payoutSum: 0,
    sums: Object.fromEntries(signalKeys.map((key) => [key, 0])),
  };
}

function period() {
  return {
    allSettledFixed5: 0,
    eligibleCurrentShape: 0,
    candidatePairRaces: 0,
    otherActualPairRaces: 0,
    missingMetricRows: 0,
    processingErrors: 0,
    keep12: group(),
    shift41: group(),
    checks: {},
  };
}

function addRecord(target, record, payoutYen) {
  target.n += 1;
  target.payoutSum += payoutYen;
  for (const key of signalKeys) target.sums[key] += record[key];
}

function summarize(target) {
  const averages = {};
  for (const key of signalKeys) {
    averages[key] = target.n ? target.sums[key] / target.n : 0;
  }
  return {
    n: target.n,
    payoutSum: target.payoutSum,
    averages,
  };
}

const rawPeriods = {
  discovery: period(),
  holdout: period(),
};
const seen = new Set();

for (const fileName of fs
  .readdirSync(predictionDir)
  .filter((name) => /^\d{8}\.json$/.test(name))
  .sort()) {
  const date = fileName.slice(0, 8);
  const data = JSON.parse(
    fs.readFileSync(path.join(predictionDir, fileName), "utf8")
  );

  for (const row of rows(data)) {
    if (row?.result?.settled !== true) continue;

    const raceKey =
      row.raceKey || `${date}-${row.jcd}-${row.raceNo}`;
    if (seen.has(raceKey)) continue;
    seen.add(raceKey);

    const current =
      rawPeriods[date < holdoutStart ? "discovery" : "holdout"];

    try {
      const raceInput = input(row);
      const actual = ticket(
        row?.result?.resultTicket || row?.result?.review?.resultTicket
      );
      if (!raceInput || !actual) continue;

      const prediction = core.buildPredictionData(raceInput);
      const fixed = fixedFive(prediction);
      if (fixed.length !== 5) continue;

      current.allSettledFixed5 += 1;
      const has12 = fixed.some((value) => value.startsWith("1-2-"));
      const has41 = fixed.some((value) => value.startsWith("4-1-"));
      if (!has12 || has41) continue;

      current.eligibleCurrentShape += 1;
      const actualPair = actual.split("-").slice(0, 2).join("-");
      if (actualPair !== "1-2" && actualPair !== "4-1") {
        current.otherActualPairRaces += 1;
        continue;
      }

      current.candidatePairRaces += 1;
      const evaluation = analyses(prediction);
      const boat1 = findBoat(evaluation, 1);
      const boat4 = findBoat(evaluation, 4);
      if (!boat1 || !boat4) {
        current.missingMetricRows += 1;
        continue;
      }

      const record = {};
      let complete = true;
      for (const key of signalKeys) {
        const boat1Value = metric(boat1, key);
        const boat4Value = metric(boat4, key);
        if (boat1Value === null || boat4Value === null) {
          complete = false;
          break;
        }
        record[key] = boat4Value - boat1Value;
      }
      if (!complete) {
        current.missingMetricRows += 1;
        continue;
      }

      addRecord(
        actualPair === "4-1" ? current.shift41 : current.keep12,
        record,
        payout(row)
      );
    } catch {
      current.processingErrors += 1;
    }
  }
}

const periods = {};
for (const [name, current] of Object.entries(rawPeriods)) {
  current.checks = {
    eligibleShapeSplit:
      current.eligibleCurrentShape ===
      current.candidatePairRaces + current.otherActualPairRaces,
    candidateRowsSplit:
      current.candidatePairRaces ===
      current.keep12.n + current.shift41.n + current.missingMetricRows,
    noMissingMetrics: current.missingMetricRows === 0,
    noProcessingErrors: current.processingErrors === 0,
  };
  if (!Object.values(current.checks).every(Boolean)) {
    throw new Error(`${name}: 4-1 vs 1-2 audit invariant failed`);
  }

  periods[name] = {
    allSettledFixed5: current.allSettledFixed5,
    eligibleCurrentShape: current.eligibleCurrentShape,
    candidatePairRaces: current.candidatePairRaces,
    otherActualPairRaces: current.otherActualPairRaces,
    missingMetricRows: current.missingMetricRows,
    processingErrors: current.processingErrors,
    keep12: summarize(current.keep12),
    shift41: summarize(current.shift41),
    checks: current.checks,
  };
}

const signals = {};
for (const key of signalKeys) {
  const discovery =
    periods.discovery.shift41.averages[key] -
    periods.discovery.keep12.averages[key];
  const holdout =
    periods.holdout.shift41.averages[key] -
    periods.holdout.keep12.averages[key];
  signals[key] = {
    discovery,
    holdout,
    sameDirection:
      discovery !== 0 &&
      holdout !== 0 &&
      Math.sign(discovery) === Math.sign(holdout),
  };
}

const sampleGate = {
  minimumDiscovery: 30,
  minimumHoldout: 20,
  discoveryKeepPassed: periods.discovery.keep12.n >= 30,
  discoveryShiftPassed: periods.discovery.shift41.n >= 30,
  holdoutKeepPassed: periods.holdout.keep12.n >= 20,
  holdoutShiftPassed: periods.holdout.shift41.n >= 20,
};
sampleGate.passed =
  sampleGate.discoveryKeepPassed &&
  sampleGate.discoveryShiftPassed &&
  sampleGate.holdoutKeepPassed &&
  sampleGate.holdoutShiftPassed;

const allSignalsSameDirection = signalKeys.every(
  (key) => signals[key].sameDirection
);

const output = {
  schemaVersion: 2,
  holdoutStart,
  target:
    "current fixed5 has 1-2 and no 4-1; actual pair 1-2 vs 4-1",
  metricDefinition: "boat4 - boat1",
  periods,
  signals,
  sampleGate,
  allSignalsSameDirection,
  eligibleForAB: sampleGate.passed && allSignalsSameDirection,
  previousPR575: {
    sourceRestored: false,
    discovery: { keep12: 153, shift41: 30 },
    holdout: { keep12: 53, shift41: 10 },
  },
  notes: {
    productionChanged: false,
    oddsUsed: false,
    allPairPatterns: true,
    currentMainRescues: true,
    sourceRestoredByWorkflow: true,
    selectionPeriod: "discovery",
    goal:
      "recheck reproducible pre-race signals for retaining 1-2 vs reallocating one 1-2 slot to 4-1 with complete canonical data",
  },
};

const serialized = `${JSON.stringify(output, null, 2)}\n`;
fs.writeFileSync(artifactPath, serialized);
process.stdout.write(serialized);
