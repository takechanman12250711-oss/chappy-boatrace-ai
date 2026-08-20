"use strict";

const fs = require("node:fs");
const path = require("node:path");

global.window = global;
require("../js/ai-core");
const baselineCore = global.ChappyAICore;
require("../js/third-six-rescue-fixed5");
const currentCore = global.ChappyAICore;

const PREDICTION_DIR = path.join(process.cwd(), "data", "predictions");
const HOLDOUT_DATE = "20260812";

function rowsOf(doc) {
  return [...(doc.predictions || []), ...(doc.verificationPredictions || [])];
}

function ticketOf(value) {
  const parts = String(value?.ticket || value || "").match(/[1-6]/g) || [];
  return parts.length >= 3 ? parts.slice(0, 3).join("-") : "";
}

function scenarioHead(scenario) {
  return Number(
    scenario?.headBoatNo ||
      scenario?.attackerBoatNo ||
      scenario?.attacker ||
      scenario?.outcome?.firstCandidates?.[0]?.boatNo ||
      scenario?.outcome?.firstCandidates?.[0] ||
      0
  );
}

function inputOf(row) {
  const snapshot = row?.prediction?.preRaceConditions || row?.preRaceConditions;
  if (!snapshot || !Array.isArray(snapshot.boats) || snapshot.boats.length < 6) return null;
  return {
    ...snapshot,
    entries: snapshot.boats,
    boats: snapshot.boats,
    jcd: row.jcd,
    stadiumCode: row.jcd,
    venueCode: row.jcd,
    place: row.place,
    placeName: row.place,
    venueName: row.place,
    raceNo: row.raceNo,
    rno: row.raceNo,
    weather: snapshot.weather || {}
  };
}

function basicFive(prediction) {
  const formations = prediction?.formations || {};
  return [
    ...(formations.main || []).slice(0, 3),
    ...(formations.safety || []).slice(0, 2)
  ]
    .map(ticketOf)
    .filter(Boolean);
}

function payoutOf(row) {
  return Number(row?.result?.payoutPer100 || row?.result?.review?.payoutPer100 || 0);
}

function newCounter(key) {
  return { key, n: 0, payout: 0, dates: new Set(), venues: new Set(), examples: [] };
}

function addCounter(map, key, row) {
  const item = map.get(key) || newCounter(key);
  item.n += 1;
  item.payout += row.payout;
  item.dates.add(row.date);
  item.venues.add(row.jcd);
  if (item.examples.length < 8) {
    item.examples.push({ date: row.date, jcd: row.jcd, raceNo: row.raceNo, actual: row.actual });
  }
  map.set(key, item);
}

function finishCounters(map) {
  return [...map.values()]
    .map(item => ({
      ...item,
      dates: item.dates.size,
      venues: item.venues.size
    }))
    .sort((a, b) => b.n - a.n || b.payout - a.payout);
}

function summarizeAb(rows) {
  let baselineHits = 0;
  let currentHits = 0;
  let baselineReturn = 0;
  let currentReturn = 0;
  let gains = 0;
  let losses = 0;
  const gainDates = new Set();
  const gainVenues = new Set();
  const lossDates = new Set();
  const lossVenues = new Set();

  for (const row of rows) {
    const baselineHit = row.baseline.includes(row.actual);
    const currentHit = row.current.includes(row.actual);
    if (baselineHit) {
      baselineHits += 1;
      baselineReturn += row.payout;
    }
    if (currentHit) {
      currentHits += 1;
      currentReturn += row.payout;
    }
    if (currentHit && !baselineHit) {
      gains += 1;
      gainDates.add(row.date);
      gainVenues.add(row.jcd);
    }
    if (baselineHit && !currentHit) {
      losses += 1;
      lossDates.add(row.date);
      lossVenues.add(row.jcd);
    }
  }

  return {
    races: rows.length,
    baselineHits,
    currentHits,
    hitDelta: currentHits - baselineHits,
    gains,
    losses,
    baselineReturn,
    currentReturn,
    returnDelta: currentReturn - baselineReturn,
    gainDates: gainDates.size,
    gainVenues: gainVenues.size,
    lossDates: lossDates.size,
    lossVenues: lossVenues.size,
    stakeDelta: 0
  };
}

function main() {
  const seen = new Set();
  const evaluated = [];
  const failures = [];

  for (const filename of fs
    .readdirSync(PREDICTION_DIR)
    .filter(name => /^\d{8}\.json$/.test(name))
    .sort()) {
    const date = filename.slice(0, 8);
    const doc = JSON.parse(fs.readFileSync(path.join(PREDICTION_DIR, filename), "utf8"));

    for (const row of rowsOf(doc)) {
      if (row?.result?.settled !== true) continue;
      const raceKey = row.raceKey || `${date}-${row.jcd}-${row.raceNo}`;
      if (seen.has(raceKey)) continue;
      seen.add(raceKey);

      try {
        const input = inputOf(row);
        const actual = ticketOf(row?.result?.resultTicket || row?.result?.review?.resultTicket);
        if (!input || !actual) continue;

        const baselinePrediction = baselineCore.buildPredictionData(input);
        const currentPrediction = currentCore.buildPredictionData(input);
        const currentScenarios = currentPrediction?.raceScenarios || {};
        const mainScenario = currentScenarios.mainScenario || currentScenarios.scenarios?.[0] || {};

        evaluated.push({
          date,
          jcd: String(row.jcd || "").padStart(2, "0"),
          raceNo: Number(row.raceNo || 0),
          actual,
          payout: payoutOf(row),
          predictedHead: scenarioHead(mainScenario),
          actualHead: Number(actual.split("-")[0]),
          baseline: basicFive(baselinePrediction),
          current: basicFive(currentPrediction),
          rescueApplied: currentPrediction?.formations?.thirdSixRescueFixed5?.applied === true
        });
      } catch (error) {
        failures.push(`${date}-${row.jcd}-${row.raceNo}:${error?.message || error}`);
      }
    }
  }

  const ab = {
    discovery: summarizeAb(evaluated.filter(row => row.date < HOLDOUT_DATE)),
    holdout: summarizeAb(evaluated.filter(row => row.date >= HOLDOUT_DATE)),
    full: summarizeAb(evaluated)
  };

  const residualMisses = evaluated.filter(row => !row.current.includes(row.actual));
  const highLevel = new Map();
  const headTransitions = new Map();
  const placeMissTypes = new Map();
  const missingBoats = new Map();

  for (const row of residualMisses) {
    if (row.predictedHead !== row.actualHead) {
      addCounter(highLevel, "head_wrong", row);
      addCounter(headTransitions, `${row.predictedHead}>${row.actualHead}`, row);
      continue;
    }

    addCounter(highLevel, "head_correct_place_miss", row);
    const actualParts = row.actual.split("-").map(Number);
    const sameHead = row.current
      .map(ticket => ticket.split("-").map(Number))
      .filter(parts => parts[0] === row.actualHead);
    const seconds = new Set(sameHead.map(parts => parts[1]));
    const thirds = new Set(sameHead.map(parts => parts[2]));
    const secondMissing = !seconds.has(actualParts[1]);
    const thirdMissing = !thirds.has(actualParts[2]);
    const missType =
      secondMissing && thirdMissing
        ? "both"
        : secondMissing
          ? "second"
          : thirdMissing
            ? "third"
            : "combination";

    addCounter(placeMissTypes, missType, row);
    if (secondMissing) addCounter(missingBoats, `second:${actualParts[1]}`, row);
    if (thirdMissing) addCounter(missingBoats, `third:${actualParts[2]}`, row);
  }

  const rescueRows = evaluated.filter(row => row.rescueApplied);
  const highLevelRanking = finishCounters(highLevel);
  const placeRanking = finishCounters(placeMissTypes);
  const transitionRanking = finishCounters(headTransitions);
  const missingBoatRanking = finishCounters(missingBoats);

  const nextTarget = (() => {
    const candidates = [
      ...placeRanking.map(item => ({ family: "head_correct_place_miss", ...item })),
      ...transitionRanking.map(item => ({ family: "head_transition", ...item }))
    ].sort((a, b) => b.n - a.n || b.payout - a.payout);
    return candidates[0] || null;
  })();

  console.log(
    JSON.stringify(
      {
        schemaVersion: 1,
        source: "latest main replay with production third-six fixed5 module enabled",
        totalSettledEvaluated: evaluated.length,
        rescueActivation: {
          races: rescueRows.length,
          dates: new Set(rescueRows.map(row => row.date)).size,
          venues: new Set(rescueRows.map(row => row.jcd)).size
        },
        productionAb: ab,
        residual: {
          misses: residualMisses.length,
          highLevelRanking,
          headCorrectPlaceMissRanking: placeRanking,
          headTransitionRanking: transitionRanking,
          missingBoatRanking,
          nextTarget
        },
        failures,
        notes: {
          productionChanged: false,
          automaticApplication: false,
          currentFiveTicketsOnly: true,
          latestThirdSixRescueIncluded: true,
          stakeDeltaFixedAtZero: true
        }
      },
      null,
      2
    )
  );
}

main();
