"use strict";

const fs = require("node:fs");
const path = require("node:path");

global.window = global;
require("../js/ai-core");
require("../js/third-six-rescue-fixed5");
const core = global.ChappyAICore;

const PREDICTION_DIR = path.join(process.cwd(), "data", "predictions");
const HOLDOUT_DATE = "20260812";

function rowsOf(doc) {
  return [...(doc.predictions || []), ...(doc.verificationPredictions || [])];
}

function ticketOf(value) {
  const parts = String(value?.ticket || value || "").match(/[1-6]/g) || [];
  return parts.length >= 3 ? parts.slice(0, 3).join("-") : "";
}

function partsOf(value) {
  return ticketOf(value).split("-").map(Number);
}

function boatNoOf(item, index = 0) {
  if (typeof item === "number" || typeof item === "string") {
    const match = String(item).match(/[1-6]/);
    return match ? Number(match[0]) : 0;
  }
  return Number(
    item?.boatNo ??
      item?.boat ??
      item?.no ??
      item?.waku ??
      item?.course ??
      index + 1
  );
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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

function analysesOf(prediction) {
  return (
    prediction?.analyses ||
    prediction?.evaluations ||
    prediction?.boatEvaluation?.evaluations ||
    []
  );
}

function findBoat(analyses, boatNo) {
  return (analyses || []).find((item, index) => boatNoOf(item, index) === boatNo) || null;
}

function metric(item, paths) {
  for (const itemPath of paths) {
    let value = item;
    for (const key of itemPath.split(".")) value = value?.[key];
    const number = toNumber(value);
    if (number !== null) return number;
  }
  return null;
}

function roleFeatures(prediction, boatNo) {
  const boat = findBoat(analysesOf(prediction), boatNo);
  return {
    hold: metric(boat, ["roleScores.hold", "indexes.hold", "hold"]),
    pickup: metric(boat, ["roleScores.pickup", "indexes.pickup", "pickup"])
  };
}

function countPosition(tickets, position) {
  const counts = new Map();
  for (const ticket of tickets) {
    const boatNo = partsOf(ticket)[position];
    if (boatNo >= 1 && boatNo <= 6) {
      counts.set(boatNo, (counts.get(boatNo) || 0) + 1);
    }
  }
  return counts;
}

function positionSet(tickets, position) {
  return [...countPosition(tickets, position).keys()].sort((a, b) => a - b).join(",");
}

function structureOf(main) {
  return {
    heads: positionSet(main, 0),
    seconds: positionSet(main, 1),
    thirds: positionSet(main, 2)
  };
}

function sameStructure(a, b) {
  return a.heads === b.heads && a.seconds === b.seconds && a.thirds === b.thirds;
}

function scoreTicket(prediction, ticket, secondCounts, thirdCounts) {
  const [, second, third] = partsOf(ticket);
  const secondRole = roleFeatures(prediction, second);
  const thirdRole = roleFeatures(prediction, third);
  return {
    score:
      20 * ((secondCounts.get(second) || 0) + (thirdCounts.get(third) || 0)) +
      0.05 * ((secondRole.hold ?? -1) + (thirdRole.pickup ?? -1)),
    secondHold: secondRole.hold,
    thirdPickup: thirdRole.pickup
  };
}

function buildMain3Candidate(prediction, main) {
  if (main.length !== 3) return { applied: false, reason: "main-not-three", main };
  const heads = [...countPosition(main, 0).keys()];
  if (heads.length !== 1) return { applied: false, reason: "main-head-not-single", main };
  const head = heads[0];
  const secondCounts = countPosition(main, 1);
  const thirdCounts = countPosition(main, 2);
  const currentSet = new Set(main);
  const candidates = [];

  for (const second of secondCounts.keys()) {
    for (const third of thirdCounts.keys()) {
      if (second === head || third === head || second === third) continue;
      const ticket = `${head}-${second}-${third}`;
      if (currentSet.has(ticket)) continue;
      const features = scoreTicket(prediction, ticket, secondCounts, thirdCounts);
      candidates.push({ ticket, ...features });
    }
  }

  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      (b.secondHold ?? -1) - (a.secondHold ?? -1) ||
      (b.thirdPickup ?? -1) - (a.thirdPickup ?? -1) ||
      a.ticket.localeCompare(b.ticket)
  );
  const candidate = candidates[0];
  if (!candidate) return { applied: false, reason: "no-missing-cross", main };

  const beforeStructure = structureOf(main);
  const replacements = [];
  for (const index of [2, 1, 0]) {
    const nextMain = main.slice();
    const removed = nextMain[index];
    nextMain[index] = candidate.ticket;
    if (new Set(nextMain).size !== 3) continue;
    const afterStructure = structureOf(nextMain);
    if (!sameStructure(beforeStructure, afterStructure)) continue;
    const removedFeatures = scoreTicket(prediction, removed, secondCounts, thirdCounts);
    replacements.push({
      index,
      removed,
      removedScore: removedFeatures.score,
      nextMain,
      afterStructure
    });
  }

  replacements.sort(
    (a, b) =>
      a.removedScore - b.removedScore ||
      b.index - a.index ||
      a.removed.localeCompare(b.removed)
  );
  const replacement = replacements[0];
  if (!replacement) {
    return { applied: false, reason: "no-structure-preserving-swap", main };
  }
  if (!(candidate.score > replacement.removedScore)) {
    return {
      applied: false,
      reason: "candidate-not-higher-score",
      main,
      candidate,
      replacement
    };
  }

  return {
    applied: true,
    reason: "applied",
    main: replacement.nextMain,
    candidate,
    replacement,
    beforeStructure,
    afterStructure: replacement.afterStructure,
    margin: candidate.score - replacement.removedScore
  };
}

function buildNext(prediction, current) {
  const main = current.slice(0, 3);
  const result = buildMain3Candidate(prediction, main);
  if (!result.applied) return { ...result, next: current };
  const next = [...result.main, ...current.slice(3)];
  if (new Set(next).size !== next.length) {
    return { applied: false, reason: "duplicate-in-five", next: current };
  }
  return { ...result, next };
}

function payoutOf(row) {
  return Number(row?.result?.payoutPer100 || row?.result?.review?.payoutPer100 || 0);
}

function isCombinationMiss(current, actual) {
  const main = current.slice(0, 3);
  const actualParts = partsOf(actual);
  if (main.includes(actual)) return false;
  const heads = new Set(main.map(ticket => partsOf(ticket)[0]));
  if (!heads.has(actualParts[0])) return false;
  const secondSet = new Set(main.map(ticket => partsOf(ticket)[1]));
  const thirdSet = new Set(main.map(ticket => partsOf(ticket)[2]));
  return secondSet.has(actualParts[1]) && thirdSet.has(actualParts[2]);
}

function increment(object, key) {
  object[key] = (object[key] || 0) + 1;
}

function summarize(rows) {
  let selected = 0;
  let currentHits = 0;
  let nextHits = 0;
  let currentReturn = 0;
  let nextReturn = 0;
  let gains = 0;
  let losses = 0;
  let rescuedCombinationMisses = 0;
  let marginTotal = 0;
  const gainDates = new Set();
  const gainVenues = new Set();
  const lossDates = new Set();
  const lossVenues = new Set();
  const removedTickets = {};
  const addedTickets = {};
  const examples = [];

  for (const row of rows) {
    const currentHit = row.current.includes(row.actual);
    const nextHit = row.next.includes(row.actual);
    if (row.applied) {
      selected += 1;
      marginTotal += row.margin;
      increment(removedTickets, row.replacement.removed);
      increment(addedTickets, row.candidate.ticket);
    }
    if (currentHit) {
      currentHits += 1;
      currentReturn += row.payout;
    }
    if (nextHit) {
      nextHits += 1;
      nextReturn += row.payout;
    }
    if (nextHit && !currentHit) {
      gains += 1;
      gainDates.add(row.date);
      gainVenues.add(row.jcd);
      if (row.combinationMiss) rescuedCombinationMisses += 1;
      if (examples.length < 12) {
        examples.push({
          type: "gain",
          date: row.date,
          jcd: row.jcd,
          raceNo: row.raceNo,
          actual: row.actual,
          removed: row.replacement?.removed,
          added: row.candidate?.ticket,
          margin: row.margin,
          structure: row.beforeStructure
        });
      }
    }
    if (currentHit && !nextHit) {
      losses += 1;
      lossDates.add(row.date);
      lossVenues.add(row.jcd);
      if (examples.length < 12) {
        examples.push({
          type: "loss",
          date: row.date,
          jcd: row.jcd,
          raceNo: row.raceNo,
          actual: row.actual,
          removed: row.replacement?.removed,
          added: row.candidate?.ticket,
          margin: row.margin,
          structure: row.beforeStructure
        });
      }
    }
  }

  return {
    races: rows.length,
    selected,
    currentHits,
    nextHits,
    hitDelta: nextHits - currentHits,
    gains,
    losses,
    currentReturn,
    nextReturn,
    returnDelta: nextReturn - currentReturn,
    gainDates: gainDates.size,
    gainVenues: gainVenues.size,
    lossDates: lossDates.size,
    lossVenues: lossVenues.size,
    rescuedCombinationMisses,
    averageScoreMargin: selected ? marginTotal / selected : 0,
    removedTickets,
    addedTickets,
    stakeDelta: 0,
    examples
  };
}

function passesGate(stat) {
  return (
    stat.selected >= 20 &&
    stat.hitDelta > 0 &&
    stat.gains >= stat.losses &&
    stat.returnDelta >= 0 &&
    stat.gainDates >= 3 &&
    stat.gainVenues >= 3
  );
}

function main() {
  const seen = new Set();
  const records = [];
  const failures = [];
  const skipReasons = {};
  let rescueActivation = 0;
  let mainCombinationMisses = 0;
  let mainCombinationPayout = 0;
  let structureViolations = 0;

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

        const prediction = core.buildPredictionData(input);
        const current = basicFive(prediction);
        if (current.length < 5) continue;
        if (prediction?.formations?.thirdSixRescueFixed5?.applied === true) {
          rescueActivation += 1;
        }

        const combinationMiss = isCombinationMiss(current, actual);
        if (combinationMiss) {
          mainCombinationMisses += 1;
          mainCombinationPayout += payoutOf(row);
        }

        const result = buildNext(prediction, current);
        increment(skipReasons, result.reason);
        if (
          result.applied &&
          !sameStructure(result.beforeStructure, result.afterStructure)
        ) {
          structureViolations += 1;
        }

        records.push({
          date,
          jcd: String(row.jcd || "").padStart(2, "0"),
          raceNo: Number(row.raceNo || 0),
          actual,
          payout: payoutOf(row),
          current,
          next: result.next,
          applied: result.applied,
          candidate: result.candidate || null,
          replacement: result.replacement || null,
          margin: result.margin || 0,
          beforeStructure: result.beforeStructure || structureOf(current.slice(0, 3)),
          afterStructure: result.afterStructure || structureOf(current.slice(0, 3)),
          combinationMiss
        });
      } catch (error) {
        failures.push(`${date}-${row.jcd}-${row.raceNo}:${error?.message || error}`);
      }
    }
  }

  const discovery = summarize(records.filter(row => row.date < HOLDOUT_DATE));
  const holdout = summarize(records.filter(row => row.date >= HOLDOUT_DATE));
  const full = summarize(records);
  const gatePassed =
    passesGate(discovery) &&
    passesGate(holdout) &&
    failures.length === 0 &&
    structureViolations === 0;

  console.log(
    JSON.stringify(
      {
        schemaVersion: 1,
        source: "latest main with production third-six rescue enabled",
        holdoutDate: HOLDOUT_DATE,
        rule: {
          scope: "main three tickets only; safety and production rescue untouched",
          candidate: "highest-frequency missing cross made only from existing main-second and main-third boats",
          replacement: "lowest-scored main ticket whose swap keeps head, second-candidate set and third-candidate set identical",
          activation: "candidate score must be strictly higher than removed ticket score",
          thresholds: "no searched threshold; rule fixed before holdout",
          tickets: 5
        },
        totalSettledEvaluated: records.length,
        rescueActivation,
        mainCombinationAudit: {
          misses: mainCombinationMisses,
          payout: mainCombinationPayout
        },
        skipReasons,
        discovery,
        holdout,
        full,
        gatePassed,
        gate:
          "discovery and holdout each require selected>=20, hitDelta>0, gains>=losses, returnDelta>=0, gains on >=3 dates and >=3 venues; failures=0; structureViolations=0; stakeDelta=0",
        structureViolations,
        failures,
        notes: {
          productionChanged: false,
          automaticApplication: false,
          fixedFiveTickets: true,
          safetyTicketsUnchanged: true,
          productionThirdSixTicketProtected: true,
          mainHeadAndPositionCandidateSetsPreservedExactly: true,
          actualResultNotUsedForCandidateGenerationOrActivation: true
        }
      },
      null,
      2
    )
  );
}

main();
