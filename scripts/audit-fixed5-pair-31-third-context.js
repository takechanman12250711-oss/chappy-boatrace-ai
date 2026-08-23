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
  "fixed5-pair-31-third-context.json"
);

function rows(data) {
  return [
    ...(data.predictions || []),
    ...(data.verificationPredictions || []),
  ];
}

function ticket(value) {
  const parts = String(value?.ticket || value || "").match(/[1-6]/g) || [];
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
  const formations = prediction.formations || {};
  return [
    ...(formations.main || []).slice(0, 3),
    ...(formations.safety || []).slice(0, 2),
  ]
    .map(ticket)
    .filter(Boolean);
}

function period() {
  return {
    misses: 0,
    pairCoveredMisses: 0,
    pairUncoveredMisses: 0,
    actualThird: {},
    actualThirdPairCovered: {},
    actualThirdPairUncovered: {},
    heldThird: {},
  };
}

function increment(target, key) {
  target[key] = (target[key] || 0) + 1;
}

const periods = {
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

    try {
      const raceInput = input(row);
      const actual = ticket(
        row?.result?.resultTicket || row?.result?.review?.resultTicket
      );
      if (!raceInput || !actual.startsWith("3-1-")) continue;

      const fixed = fixedFive(core.buildPredictionData(raceInput));
      if (fixed.length !== 5 || fixed.includes(actual)) continue;

      const current =
        periods[date < holdoutStart ? "discovery" : "holdout"];
      const actualThird = actual.split("-")[2];
      const heldPair = fixed.filter((value) => value.startsWith("3-1-"));

      current.misses += 1;
      increment(current.actualThird, actualThird);

      if (heldPair.length === 0) {
        current.pairUncoveredMisses += 1;
        increment(current.actualThirdPairUncovered, actualThird);
        continue;
      }

      current.pairCoveredMisses += 1;
      increment(current.actualThirdPairCovered, actualThird);
      for (const held of heldPair) {
        increment(current.heldThird, held.split("-")[2]);
      }
    } catch {
      // Keep the historical audit behavior: one malformed race cannot stop
      // the complete settled-race scan.
    }
  }
}

const output = {
  schemaVersion: 2,
  holdoutStart,
  periods,
  notes: {
    productionChanged: false,
    oddsUsed: false,
    currentMainRescues: true,
    selectionPeriod: "discovery",
    heldThirdUnit: "tickets",
    goal:
      "separate pair-uncovered 3-1 misses from pair-covered third-place mismatches in current fixed5",
  },
};

const serialized = `${JSON.stringify(output, null, 2)}\n`;
fs.writeFileSync(artifactPath, serialized);
process.stdout.write(serialized);
