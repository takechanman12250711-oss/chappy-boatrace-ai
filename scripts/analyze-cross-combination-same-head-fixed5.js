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

function mainScenarioOf(prediction) {
  const raceScenarios = prediction?.raceScenarios || {};
  return raceScenarios.mainScenario || raceScenarios.scenarios?.[0] || {};
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

function headProfile(tickets) {
  return [...countPosition(tickets, 0).entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([head, count]) => `${head}:${count}`)
    .join(",");
}

function buildFrequencyCrossCandidate(prediction, current, head) {
  const sameHead = current.filter(ticket => partsOf(ticket)[0] === head);
  if (sameHead.length < 2) return null;

  const secondCounts = countPosition(sameHead, 1);
  const thirdCounts = countPosition(sameHead, 2);
  const currentSet = new Set(current);
  const candidates = [];

  for (const [second, secondCount] of secondCounts.entries()) {
    for (const [third, thirdCount] of thirdCounts.entries()) {
      if (second === head || third === head || second === third) continue;
      const ticket = `${head}-${second}-${third}`;
      if (currentSet.has(ticket)) continue;

      const secondRole = roleFeatures(prediction, second);
      const thirdRole = roleFeatures(prediction, third);
      const score =
        20 * (secondCount + thirdCount) +
        0.05 * ((secondRole.hold ?? -1) + (thirdRole.pickup ?? -1));

      candidates.push({
        ticket,
        second,
        third,
        secondCount,
        thirdCount,
        secondHold: secondRole.hold,
        thirdPickup: thirdRole.pickup,
        score
      });
    }
  }

  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      (b.secondHold ?? -1) - (a.secondHold ?? -1) ||
      (b.thirdPickup ?? -1) - (a.thirdPickup ?? -1) ||
      a.second - b.second ||
      a.third - b.third
  );
  return candidates[0] || null;
}

function rescueIndexOf(prediction, current) {
  const rescueTicket = ticketOf(prediction?.formations?.thirdSixRescueFixed5?.ticket);
  if (!rescueTicket) return -1;
  return current.findIndex(ticket => ticket === rescueTicket);
}

function findSameHeadReplacement(prediction, current, candidateHead) {
  const rescueIndex = rescueIndexOf(prediction, current);

  // 本線3点は固定。押さえ2点のうち、候補券と同じ1着艇の券だけを交換する。
  for (const index of [4, 3]) {
    if (index === rescueIndex) continue;
    const removedHead = partsOf(current[index])[0];
    if (removedHead !== candidateHead) continue;
    return { index, removedHead, rescueIndex };
  }
  return null;
}

function buildNext(prediction, current) {
  const head = scenarioHead(mainScenarioOf(prediction));
  if (head < 1 || head > 6) return { applied: false, reason: "no-main-head", next: current };

  const candidate = buildFrequencyCrossCandidate(prediction, current, head);
  if (!candidate) return { applied: false, reason: "no-cross-candidate", next: current };

  const replacement = findSameHeadReplacement(prediction, current, head);
  if (!replacement) {
    return { applied: false, reason: "no-same-head-unprotected-safety", next: current };
  }

  const next = current.slice();
  const removed = next[replacement.index];
  next[replacement.index] = candidate.ticket;

  if (new Set(next).size !== next.length) {
    return { applied: false, reason: "duplicate-after-replacement", next: current };
  }

  const beforeProfile = headProfile(current);
  const afterProfile = headProfile(next);
  if (beforeProfile !== afterProfile) {
    throw new Error(`head profile changed: ${beforeProfile} -> ${afterProfile}`);
  }

  return {
    applied: true,
    reason: "applied",
    next,
    candidate,
    replacement: { ...replacement, removed },
    beforeProfile,
    afterProfile
  };
}

function payoutOf(row) {
  return Number(row?.result?.payoutPer100 || row?.result?.review?.payoutPer100 || 0);
}

function isCombinationMiss(current, actual, predictedHead) {
  const actualParts = partsOf(actual);
  if (actualParts[0] !== predictedHead || current.includes(actual)) return false;
  const sameHead = current.filter(ticket => partsOf(ticket)[0] === predictedHead);
  const secondSet = new Set(sameHead.map(ticket => partsOf(ticket)[1]));
  const thirdSet = new Set(sameHead.map(ticket => partsOf(ticket)[2]));
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
  const gainDates = new Set();
  const gainVenues = new Set();
  const lossDates = new Set();
  const lossVenues = new Set();
  const heads = {};
  const examples = [];

  for (const row of rows) {
    const currentHit = row.current.includes(row.actual);
    const nextHit = row.next.includes(row.actual);

    if (row.applied) {
      selected += 1;
      increment(heads, String(partsOf(row.candidate.ticket)[0]));
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
      if (examples.length < 10) {
        examples.push({
          type: "gain",
          date: row.date,
          jcd: row.jcd,
          raceNo: row.raceNo,
          actual: row.actual,
          removed: row.replacement?.removed,
          added: row.candidate?.ticket,
          headProfile: row.beforeProfile
        });
      }
    }
    if (currentHit && !nextHit) {
      losses += 1;
      lossDates.add(row.date);
      lossVenues.add(row.jcd);
      if (examples.length < 10) {
        examples.push({
          type: "loss",
          date: row.date,
          jcd: row.jcd,
          raceNo: row.raceNo,
          actual: row.actual,
          removed: row.replacement?.removed,
          added: row.candidate?.ticket,
          headProfile: row.beforeProfile
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
    appliedHeads: heads,
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
  let residualCombinationMisses = 0;
  let residualCombinationPayout = 0;
  let headProfileViolations = 0;

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

        const predictedHead = scenarioHead(mainScenarioOf(prediction));
        const combinationMiss = isCombinationMiss(current, actual, predictedHead);
        if (combinationMiss) {
          residualCombinationMisses += 1;
          residualCombinationPayout += payoutOf(row);
        }

        const result = buildNext(prediction, current);
        increment(skipReasons, result.reason);
        if (result.applied && result.beforeProfile !== result.afterProfile) {
          headProfileViolations += 1;
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
          beforeProfile: result.beforeProfile || headProfile(current),
          afterProfile: result.afterProfile || headProfile(current),
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
    headProfileViolations === 0;

  console.log(
    JSON.stringify(
      {
        schemaVersion: 1,
        source: "latest main with production third-six rescue enabled",
        holdoutDate: HOLDOUT_DATE,
        rule: {
          candidate: "highest-frequency missing cross of existing second/third boats under main scenario head",
          replacement: "only an unprotected safety ticket with the identical first-place boat",
          headAllocation: "first-place boat counts must be identical before and after replacement",
          thresholds: "none; rule fixed before holdout",
          tickets: 5
        },
        totalSettledEvaluated: records.length,
        rescueActivation,
        residualCombinationAudit: {
          misses: residualCombinationMisses,
          payout: residualCombinationPayout
        },
        skipReasons,
        discovery,
        holdout,
        full,
        gatePassed,
        gate:
          "discovery and holdout each require selected>=20, hitDelta>0, gains>=losses, returnDelta>=0, gains on >=3 dates and >=3 venues; failures=0; headProfileViolations=0; stakeDelta=0",
        headProfileViolations,
        failures,
        notes: {
          productionChanged: false,
          automaticApplication: false,
          fixedFiveTickets: true,
          mainThreeProtected: true,
          productionThirdSixTicketProtected: true,
          firstPlaceAllocationPreservedExactly: true,
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
