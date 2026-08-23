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

function period() {
  return {
    allSettledFixed5: 0,
    actualRaces: 0,
    hits: 0,
    misses: 0,
    pairCoveredMisses: 0,
    pairUncoveredMisses: 0,
    payoutSum: 0,
    pairCoveredPayoutSum: 0,
    pairUncoveredPayoutSum: 0,
    actualThird: {},
    actualThirdPayout: {},
    actualThirdPairCovered: {},
    actualThirdPairCoveredPayout: {},
    actualThirdPairUncovered: {},
    actualThirdPairUncoveredPayout: {},
    heldThird: {},
    transitions: {},
    pairCoveredSource: {
      pair31Rescue: 0,
      existingPair: 0,
    },
    processingErrors: 0,
    checks: {},
  };
}

function add(target, key, amount = 1) {
  target[key] = (target[key] || 0) + amount;
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

    const current =
      periods[date < holdoutStart ? "discovery" : "holdout"];

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
      if (!actual.startsWith("3-1-")) continue;

      current.actualRaces += 1;
      if (fixed.includes(actual)) {
        current.hits += 1;
        continue;
      }

      const actualThird = actual.split("-")[2];
      const payoutYen = payout(row);
      const heldPair = [
        ...new Set(fixed.filter((value) => value.startsWith("3-1-"))),
      ];

      current.misses += 1;
      current.payoutSum += payoutYen;
      add(current.actualThird, actualThird);
      add(current.actualThirdPayout, actualThird, payoutYen);

      if (heldPair.length === 0) {
        current.pairUncoveredMisses += 1;
        current.pairUncoveredPayoutSum += payoutYen;
        add(current.actualThirdPairUncovered, actualThird);
        add(
          current.actualThirdPairUncoveredPayout,
          actualThird,
          payoutYen
        );
        continue;
      }

      current.pairCoveredMisses += 1;
      current.pairCoveredPayoutSum += payoutYen;
      add(current.actualThirdPairCovered, actualThird);
      add(current.actualThirdPairCoveredPayout, actualThird, payoutYen);
      add(
        current.pairCoveredSource,
        prediction?.formations?.pair31RescueFixed5?.applied === true
          ? "pair31Rescue"
          : "existingPair"
      );

      for (const held of heldPair) {
        const heldThird = held.split("-")[2];
        add(current.heldThird, heldThird);
        add(current.transitions, `${heldThird}->${actualThird}`);
      }
    } catch {
      current.processingErrors += 1;
    }
  }
}

for (const current of Object.values(periods)) {
  current.checks = {
    actualRaceSplit:
      current.actualRaces === current.hits + current.misses,
    missCoverageSplit:
      current.misses ===
      current.pairCoveredMisses + current.pairUncoveredMisses,
    coveredSourceSplit:
      current.pairCoveredMisses ===
      current.pairCoveredSource.pair31Rescue +
        current.pairCoveredSource.existingPair,
    noProcessingErrors: current.processingErrors === 0,
  };

  if (!Object.values(current.checks).every(Boolean)) {
    throw new Error("3-1 third-context audit invariant failed");
  }
}

const output = {
  schemaVersion: 4,
  holdoutStart,
  periods,
  notes: {
    productionChanged: false,
    oddsUsed: false,
    currentMainRescues: true,
    selectionPeriod: "discovery",
    heldThirdUnit: "unique tickets per race",
    transitionFormat: "heldThird->actualThird",
    goal:
      "separate pair-uncovered 3-1 misses from pair-covered third-place mismatches in current fixed5",
  },
};

const serialized = `${JSON.stringify(output, null, 2)}\n`;
fs.writeFileSync(artifactPath, serialized);
process.stdout.write(serialized);
