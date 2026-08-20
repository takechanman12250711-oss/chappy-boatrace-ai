"use strict";

const fs = require("node:fs");
const path = require("node:path");

global.window = global;
require("../js/ai-core");
require("../js/third-six-rescue-fixed5");
const core = global.ChappyAICore;

const PREDICTION_DIR = path.join(process.cwd(), "data", "predictions");
const HOLDOUT_DATE = "20260812";
const METHODS = ["frequency", "role", "hybrid", "scenario"];
const MIN_SECOND_HOLD = [0, 40, 50, 60, 70];
const MIN_THIRD_PICKUP = [0, 40, 50, 60, 70];
const MIN_THIRD_FLOW = [0, 40, 50, 60];
const MIN_MARGIN = [0, 5, 10, 20];

function rowsOf(doc) {
  return [...(doc.predictions || []), ...(doc.verificationPredictions || [])];
}

function ticketOf(value) {
  const parts = String(value?.ticket || value || "").match(/[1-6]/g) || [];
  return parts.length >= 3 ? parts.slice(0, 3).join("-") : "";
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

function mainScenarioOf(prediction) {
  const scenarios = prediction?.raceScenarios || {};
  return scenarios.mainScenario || scenarios.scenarios?.[0] || {};
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
    pickup: metric(boat, ["roleScores.pickup", "indexes.pickup", "pickup"]),
    raceFlow: metric(boat, ["indexes.raceFlow", "raceFlow"]),
    total: metric(boat, ["indexes.total", "total"])
  };
}

function uniqueBoatNos(values) {
  const source = Array.isArray(values) ? values : [];
  const seen = new Set();
  const result = [];
  source.forEach((item, index) => {
    const boatNo = boatNoOf(item, index);
    if (boatNo >= 1 && boatNo <= 6 && !seen.has(boatNo)) {
      seen.add(boatNo);
      result.push(boatNo);
    }
  });
  return result;
}

function scenarioRanks(scenario) {
  const outcome = scenario?.outcome || {};
  const second = uniqueBoatNos(
    outcome.secondCandidates ||
      scenario?.secondCandidates ||
      outcome.remainers ||
      scenario?.remainers ||
      []
  );
  const third = uniqueBoatNos(
    outcome.thirdCandidates ||
      scenario?.thirdCandidates ||
      outcome.pickupCandidates ||
      scenario?.pickupCandidates ||
      []
  );
  return { second, third };
}

function countPosition(tickets, position) {
  const counts = new Map();
  for (const ticket of tickets) {
    const parts = ticket.split("-").map(Number);
    const boatNo = parts[position];
    counts.set(boatNo, (counts.get(boatNo) || 0) + 1);
  }
  return counts;
}

function rankOf(list, boatNo) {
  const index = list.indexOf(boatNo);
  return index >= 0 ? index + 1 : 9;
}

function scoreCandidate(candidate, method) {
  const secondHold = candidate.secondRole.hold ?? -1;
  const secondFlow = candidate.secondRole.raceFlow ?? -1;
  const thirdPickup = candidate.thirdRole.pickup ?? -1;
  const thirdFlow = candidate.thirdRole.raceFlow ?? -1;

  if (method === "frequency") {
    return (
      20 * (candidate.secondCount + candidate.thirdCount) +
      0.05 * (secondHold + thirdPickup)
    );
  }

  if (method === "role") {
    return secondHold + thirdPickup + 0.25 * (secondFlow + thirdFlow);
  }

  if (method === "scenario") {
    return (
      120 -
      12 * (candidate.secondRank - 1) -
      8 * (candidate.thirdRank - 1) +
      0.2 * (secondHold + thirdPickup)
    );
  }

  return (
    10 * (candidate.secondCount + candidate.thirdCount) +
    0.5 * (secondHold + thirdPickup) +
    0.125 * (secondFlow + thirdFlow) -
    2 * (candidate.secondRank - 1) -
    1.5 * (candidate.thirdRank - 1)
  );
}

function buildCrossCandidates(prediction, current, head) {
  const sameHead = current.filter(ticket => Number(ticket.split("-")[0]) === head);
  if (sameHead.length < 2) return [];

  const secondCounts = countPosition(sameHead, 1);
  const thirdCounts = countPosition(sameHead, 2);
  const ranks = scenarioRanks(mainScenarioOf(prediction));
  const currentSet = new Set(current);
  const candidates = [];

  for (const [second, secondCount] of secondCounts.entries()) {
    for (const [third, thirdCount] of thirdCounts.entries()) {
      if (second === head || third === head || second === third) continue;
      const ticket = `${head}-${second}-${third}`;
      if (currentSet.has(ticket)) continue;
      candidates.push({
        ticket,
        second,
        third,
        secondCount,
        thirdCount,
        secondRank: rankOf(ranks.second, second),
        thirdRank: rankOf(ranks.third, third),
        secondRole: roleFeatures(prediction, second),
        thirdRole: roleFeatures(prediction, third)
      });
    }
  }

  return candidates;
}

function replacementIndex(prediction, current) {
  if (current.length < 5) return -1;
  const rescueTicket = ticketOf(prediction?.formations?.thirdSixRescueFixed5?.ticket);
  if (rescueTicket && current[4] === rescueTicket) return 3;
  return 4;
}

function rankCandidates(row, method) {
  return row.candidates
    .map(candidate => ({ ...candidate, score: scoreCandidate(candidate, method) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.secondRole.hold ?? -1) - (a.secondRole.hold ?? -1) ||
        (b.thirdRole.pickup ?? -1) - (a.thirdRole.pickup ?? -1) ||
        a.second - b.second ||
        a.third - b.third
    );
}

function applySpec(row, spec) {
  const ranked = rankCandidates(row, spec.method);
  const candidate = ranked[0];
  if (!candidate) return null;

  const secondHold = candidate.secondRole.hold ?? -1;
  const thirdPickup = candidate.thirdRole.pickup ?? -1;
  const thirdFlow = candidate.thirdRole.raceFlow ?? -1;
  const margin = candidate.score - (ranked[1]?.score ?? candidate.score);

  if (secondHold < spec.minSecondHold) return null;
  if (thirdPickup < spec.minThirdPickup) return null;
  if (thirdFlow < spec.minThirdFlow) return null;
  if (margin < spec.minMargin) return null;

  const next = row.current.slice();
  next[row.replaceIndex] = candidate.ticket;
  if (new Set(next).size !== next.length) return null;

  return { candidate, next, margin };
}

function payoutOf(row) {
  return Number(row?.result?.payoutPer100 || row?.result?.review?.payoutPer100 || 0);
}

function summarize(rows, spec) {
  let selected = 0;
  let currentHits = 0;
  let nextHits = 0;
  let currentReturn = 0;
  let nextReturn = 0;
  let gains = 0;
  let losses = 0;
  let rescuedCombinationMisses = 0;
  const gainDates = new Set();
  const gainVenues = new Set();
  const lossDates = new Set();
  const lossVenues = new Set();
  const examples = [];

  for (const row of rows) {
    const applied = applySpec(row, spec);
    if (!applied) continue;
    selected += 1;

    const currentHit = row.current.includes(row.actual);
    const nextHit = applied.next.includes(row.actual);
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
      if (examples.length < 8) {
        examples.push({
          type: "gain",
          date: row.date,
          jcd: row.jcd,
          raceNo: row.raceNo,
          actual: row.actual,
          replaced: row.current[row.replaceIndex],
          added: applied.candidate.ticket
        });
      }
    }
    if (currentHit && !nextHit) {
      losses += 1;
      lossDates.add(row.date);
      lossVenues.add(row.jcd);
      if (examples.length < 8) {
        examples.push({
          type: "loss",
          date: row.date,
          jcd: row.jcd,
          raceNo: row.raceNo,
          actual: row.actual,
          replaced: row.current[row.replaceIndex],
          added: applied.candidate.ticket
        });
      }
    }
  }

  return {
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

function specs() {
  const result = [];
  for (const method of METHODS) {
    for (const minSecondHold of MIN_SECOND_HOLD) {
      for (const minThirdPickup of MIN_THIRD_PICKUP) {
        for (const minThirdFlow of MIN_THIRD_FLOW) {
          for (const minMargin of MIN_MARGIN) {
            result.push({
              method,
              minSecondHold,
              minThirdPickup,
              minThirdFlow,
              minMargin
            });
          }
        }
      }
    }
  }
  return result;
}

function main() {
  const seen = new Set();
  const records = [];
  const failures = [];
  let totalSettledEvaluated = 0;
  let combinationMisses = 0;
  let combinationMissPayout = 0;
  let rescueActivation = 0;

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
        totalSettledEvaluated += 1;
        if (prediction?.formations?.thirdSixRescueFixed5?.applied === true) rescueActivation += 1;

        const scenario = mainScenarioOf(prediction);
        const head = scenarioHead(scenario);
        if (head < 1 || head > 6) continue;

        const sameHead = current.filter(ticket => Number(ticket.split("-")[0]) === head);
        const actualParts = actual.split("-").map(Number);
        const secondSet = new Set(sameHead.map(ticket => Number(ticket.split("-")[1])));
        const thirdSet = new Set(sameHead.map(ticket => Number(ticket.split("-")[2])));
        const combinationMiss =
          actualParts[0] === head &&
          !current.includes(actual) &&
          secondSet.has(actualParts[1]) &&
          thirdSet.has(actualParts[2]);

        if (combinationMiss) {
          combinationMisses += 1;
          combinationMissPayout += payoutOf(row);
        }

        const candidates = buildCrossCandidates(prediction, current, head);
        const replaceIndex = replacementIndex(prediction, current);
        if (!candidates.length || replaceIndex < 3) continue;

        records.push({
          date,
          jcd: String(row.jcd || "").padStart(2, "0"),
          raceNo: Number(row.raceNo || 0),
          actual,
          payout: payoutOf(row),
          current,
          candidates,
          replaceIndex,
          combinationMiss,
          rescueProtected:
            prediction?.formations?.thirdSixRescueFixed5?.applied === true && replaceIndex === 3
        });
      } catch (error) {
        failures.push(`${date}-${row.jcd}-${row.raceNo}:${error?.message || error}`);
      }
    }
  }

  const discoveryRows = records.filter(row => row.date < HOLDOUT_DATE);
  const holdoutRows = records.filter(row => row.date >= HOLDOUT_DATE);
  const searched = specs();
  const discoveryResults = searched.map(spec => ({
    spec,
    discovery: summarize(discoveryRows, spec)
  }));

  const discoveryPassed = discoveryResults
    .filter(item => passesGate(item.discovery))
    .sort(
      (a, b) =>
        b.discovery.returnDelta - a.discovery.returnDelta ||
        b.discovery.hitDelta - a.discovery.hitDelta ||
        a.discovery.losses - b.discovery.losses ||
        b.discovery.selected - a.discovery.selected
    );

  const winner = discoveryPassed[0] || null;
  const holdout = winner ? summarize(holdoutRows, winner.spec) : null;
  const full = winner ? summarize(records, winner.spec) : null;
  const gatePassed = Boolean(winner && holdout && passesGate(holdout));

  console.log(
    JSON.stringify(
      {
        schemaVersion: 1,
        source: "latest main with production third-six rescue enabled",
        holdoutDate: HOLDOUT_DATE,
        totalSettledEvaluated,
        rescueActivation,
        crossCandidatePopulation: {
          full: records.length,
          discovery: discoveryRows.length,
          holdout: holdoutRows.length,
          rescueProtectedRows: records.filter(row => row.rescueProtected).length
        },
        residualCombinationAudit: {
          misses: combinationMisses,
          payout: combinationMissPayout
        },
        search: {
          methods: METHODS,
          specsEvaluated: searched.length,
          discoveryPassed: discoveryPassed.length,
          topDiscovery: discoveryPassed.slice(0, 20)
        },
        frozenWinner: winner,
        holdout,
        full,
        gatePassed,
        gate:
          "spec fixed only from discovery; discovery and holdout each require selected>=20, hitDelta>0, gains>=losses, returnDelta>=0, gains on >=3 dates and >=3 venues; stakeDelta=0",
        failures,
        notes: {
          productionChanged: false,
          automaticApplication: false,
          fixedFiveTickets: true,
          mainThreeProtected: true,
          productionThirdSixTicketProtected: true,
          actualResultNotUsedForCandidateGenerationOrActivation: true,
          candidateUsesOnlyExistingSecondAndThirdPositionBoats: true
        }
      },
      null,
      2
    )
  );
}

main();
