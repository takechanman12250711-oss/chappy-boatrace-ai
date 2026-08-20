"use strict";

const fs = require("node:fs");
const path = require("node:path");

global.window = global;
require("../js/ai-core");
require("../js/third-six-rescue-fixed5");
const core = global.ChappyAICore;

const PREDICTION_DIR = path.join(process.cwd(), "data", "predictions");
const HOLDOUT_START = "20260812";
const RULE = Object.freeze({ holdMin: 72, pickupMin: 65, gapMax: 8 });

function rowsOf(document) {
  return [...(document.predictions || []), ...(document.verificationPredictions || [])];
}

function ticketOf(value) {
  const parts = String(value?.ticket || value || "").match(/[1-6]/g) || [];
  return parts.length >= 3 ? parts.slice(0, 3).join("-") : "";
}

function partsOf(value) {
  return ticketOf(value).split("-").map(Number);
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

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function boatNoOf(value, index = 0) {
  if (typeof value === "number" || typeof value === "string") {
    const match = String(value).match(/[1-6]/);
    return match ? Number(match[0]) : 0;
  }
  return Number(
    value?.boatNo ??
      value?.boat ??
      value?.no ??
      value?.waku ??
      value?.course ??
      index + 1
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

function basicFive(formations) {
  return [
    ...(formations?.main || []).slice(0, 3),
    ...(formations?.safety || []).slice(0, 2)
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

function metric(object, paths) {
  for (const itemPath of paths) {
    let value = object;
    for (const key of itemPath.split(".")) value = value?.[key];
    const number = toNumber(value);
    if (number !== null) return number;
  }
  return null;
}

function counterScenarios(raceScenarios, nextScenario) {
  const outcome = nextScenario?.outcome || {};
  const holdPickupTheory = raceScenarios?.holdPickupTheory || {};

  return {
    ...raceScenarios,
    mainScenario: nextScenario,
    scenarios: [
      nextScenario,
      ...(raceScenarios?.scenarios || []).filter(scenario => scenario !== nextScenario)
    ],
    attacker: scenarioHead(nextScenario),
    blockedBoats: [...(nextScenario?.blockedBoats || [])],
    holdPickupTheory: {
      ...holdPickupTheory,
      secondCandidates: Array.isArray(outcome.secondCandidates)
        ? outcome.secondCandidates
        : holdPickupTheory.secondCandidates,
      thirdCandidates: Array.isArray(outcome.thirdCandidates)
        ? outcome.thirdCandidates
        : holdPickupTheory.thirdCandidates,
      remainers: Array.isArray(outcome.remainers)
        ? outcome.remainers
        : holdPickupTheory.remainers,
      pickupCandidates: Array.isArray(outcome.pickupCandidates)
        ? outcome.pickupCandidates
        : holdPickupTheory.pickupCandidates
    }
  };
}

function buildFrozenCandidate(prediction) {
  const raceScenarios = prediction?.raceScenarios || {};
  const mainScenario = raceScenarios.mainScenario || raceScenarios.scenarios?.[0] || {};
  if (String(mainScenario?.type) !== "escape" || scenarioHead(mainScenario) !== 1) {
    return { qualified: false, reason: "main-not-1-escape" };
  }

  const sashiScenario = (raceScenarios.scenarios || []).find(
    scenario => String(scenario?.type) === "sashi" || scenarioHead(scenario) === 2
  );
  const analyses = analysesOf(prediction);
  if (!sashiScenario || !Array.isArray(analyses)) {
    return { qualified: false, reason: "no-sashi-scenario-or-analyses" };
  }

  const currentFive = basicFive(prediction.formations);
  const existingSecond = new Set(
    (sashiScenario?.outcome?.secondCandidates || []).map((item, index) =>
      boatNoOf(item, index)
    )
  );

  const outerCandidates = [5, 6]
    .filter(boatNo => !existingSecond.has(boatNo))
    .map(boatNo => {
      const boat = findBoat(analyses, boatNo);
      return {
        boatNo,
        hold: metric(boat, ["roleScores.hold", "indexes.hold", "hold"]),
        pickup: metric(boat, ["roleScores.pickup", "indexes.pickup", "pickup"]),
        raceFlow: metric(boat, ["indexes.raceFlow", "raceFlow"]),
        total: metric(boat, ["indexes.total", "total"])
      };
    })
    .sort(
      (a, b) =>
        (b.hold ?? -1) - (a.hold ?? -1) ||
        (b.pickup ?? -1) - (a.pickup ?? -1) ||
        a.boatNo - b.boatNo
    );

  const bestOuter = outerCandidates[0] || null;
  const escapeScore = toNumber(mainScenario?.score);
  const sashiScore = toNumber(sashiScenario?.score);
  const sashiGap =
    escapeScore !== null && sashiScore !== null ? escapeScore - sashiScore : null;

  let extraTicket = null;
  if (bestOuter) {
    const expandedSashi = {
      ...sashiScenario,
      outcome: {
        ...(sashiScenario.outcome || {}),
        secondCandidates: [
          ...(sashiScenario?.outcome?.secondCandidates || []),
          bestOuter.boatNo
        ]
      }
    };
    const counterFormations = core.buildFormations(
      analyses,
      counterScenarios(raceScenarios, expandedSashi)
    );
    extraTicket =
      basicFive(counterFormations).find(
        ticket => ticket.startsWith("2-") && !currentFive.includes(ticket)
      ) || null;
  }

  const qualified = Boolean(
    extraTicket &&
      bestOuter &&
      bestOuter.hold !== null &&
      bestOuter.hold >= RULE.holdMin &&
      bestOuter.pickup !== null &&
      bestOuter.pickup >= RULE.pickupMin &&
      sashiGap !== null &&
      sashiGap <= RULE.gapMax
  );

  return {
    qualified,
    reason: qualified ? "qualified" : "frozen-rule-not-met",
    currentFive,
    bestOuter,
    extraTicket,
    sashiGap
  };
}

function headProfile(tickets) {
  const counts = new Map();
  for (const ticket of tickets) {
    const head = partsOf(ticket)[0];
    counts.set(head, (counts.get(head) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([head, count]) => `${head}:${count}`)
    .join(",");
}

function buildFixedFive(prediction, candidate) {
  const currentFive = candidate.currentFive;
  if (!candidate.qualified) {
    return { applied: false, reason: candidate.reason, nextFive: currentFive };
  }

  const rescueMeta = prediction?.formations?.thirdSixRescueFixed5 || {};
  const rescueApplied = rescueMeta.applied === true;
  const rescueTicket = ticketOf(rescueMeta.ticket);
  let replacementIndex = -1;

  // 本線3点は変更しない。押さえのうち、追加券と同じ2号艇頭だけを交換する。
  for (const index of [4, 3]) {
    const currentTicket = currentFive[index];
    if (!currentTicket) continue;
    if (rescueApplied && currentTicket === rescueTicket) continue;
    if (partsOf(currentTicket)[0] !== 2) continue;
    replacementIndex = index;
    break;
  }

  if (replacementIndex < 0) {
    return {
      applied: false,
      reason: "no-unprotected-2-head-safety",
      nextFive: currentFive,
      rescueApplied,
      rescueTicket
    };
  }

  const nextFive = currentFive.slice();
  const removedTicket = nextFive[replacementIndex];
  nextFive[replacementIndex] = candidate.extraTicket;

  if (new Set(nextFive).size !== 5) {
    return { applied: false, reason: "duplicate-after-replacement", nextFive: currentFive };
  }

  const beforeHeadProfile = headProfile(currentFive);
  const afterHeadProfile = headProfile(nextFive);
  if (beforeHeadProfile !== afterHeadProfile) {
    throw new Error(`head profile changed: ${beforeHeadProfile} -> ${afterHeadProfile}`);
  }
  if (currentFive.slice(0, 3).join("|") !== nextFive.slice(0, 3).join("|")) {
    throw new Error("main three changed");
  }
  if (rescueApplied && rescueTicket && !nextFive.includes(rescueTicket)) {
    throw new Error(`production rescue removed: ${rescueTicket}`);
  }

  return {
    applied: true,
    reason: "applied",
    nextFive,
    replacementIndex,
    removedTicket,
    addedTicket: candidate.extraTicket,
    beforeHeadProfile,
    afterHeadProfile,
    rescueApplied,
    rescueTicket
  };
}

function payoutOf(row) {
  return Number(row?.result?.payoutPer100 || row?.result?.review?.payoutPer100 || 0);
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
  let rescueProtectedSelections = 0;
  const selectedDates = new Set();
  const selectedVenues = new Set();
  const gainDates = new Set();
  const gainVenues = new Set();
  const lossDates = new Set();
  const lossVenues = new Set();
  const removedTickets = {};
  const addedTickets = {};
  const candidateBoats = {};
  const examples = [];

  for (const row of rows) {
    const currentHit = row.currentFive.includes(row.actual);
    const nextHit = row.nextFive.includes(row.actual);

    if (row.applied) {
      selected += 1;
      selectedDates.add(row.date);
      selectedVenues.add(row.jcd);
      increment(removedTickets, row.removedTicket);
      increment(addedTickets, row.addedTicket);
      increment(candidateBoats, String(row.bestOuter?.boatNo || 0));
      if (row.rescueApplied) rescueProtectedSelections += 1;
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
      if (examples.length < 16) {
        examples.push({
          type: "gain",
          date: row.date,
          jcd: row.jcd,
          raceNo: row.raceNo,
          actual: row.actual,
          removedTicket: row.removedTicket,
          addedTicket: row.addedTicket,
          payout: row.payout,
          bestOuter: row.bestOuter,
          sashiGap: row.sashiGap,
          rescueApplied: row.rescueApplied
        });
      }
    }

    if (currentHit && !nextHit) {
      losses += 1;
      lossDates.add(row.date);
      lossVenues.add(row.jcd);
      if (examples.length < 16) {
        examples.push({
          type: "loss",
          date: row.date,
          jcd: row.jcd,
          raceNo: row.raceNo,
          actual: row.actual,
          removedTicket: row.removedTicket,
          addedTicket: row.addedTicket,
          payout: row.payout,
          bestOuter: row.bestOuter,
          sashiGap: row.sashiGap,
          rescueApplied: row.rescueApplied
        });
      }
    }
  }

  return {
    races: rows.length,
    selected,
    selectedDates: selectedDates.size,
    selectedVenues: selectedVenues.size,
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
    rescueProtectedSelections,
    removedTickets,
    addedTickets,
    candidateBoats,
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
  const reasons = {};
  let totalSettledEvaluated = 0;
  let productionThirdSixRescueActivation = 0;
  let headProfileViolations = 0;
  let mainThreeViolations = 0;
  let rescueProtectionViolations = 0;

  for (const filename of fs
    .readdirSync(PREDICTION_DIR)
    .filter(name => /^\d{8}\.json$/.test(name))
    .sort()) {
    const date = filename.slice(0, 8);
    const document = JSON.parse(
      fs.readFileSync(path.join(PREDICTION_DIR, filename), "utf8")
    );

    for (const row of rowsOf(document)) {
      if (row?.result?.settled !== true) continue;
      const raceKey = row.raceKey || `${date}-${row.jcd}-${row.raceNo}`;
      if (seen.has(raceKey)) continue;
      seen.add(raceKey);

      try {
        const input = inputOf(row);
        const actual = ticketOf(
          row?.result?.resultTicket || row?.result?.review?.resultTicket
        );
        if (!input || !actual) continue;

        const prediction = core.buildPredictionData(input);
        const currentFive = basicFive(prediction.formations);
        if (currentFive.length < 5) continue;
        totalSettledEvaluated += 1;

        const rescueApplied =
          prediction?.formations?.thirdSixRescueFixed5?.applied === true;
        if (rescueApplied) productionThirdSixRescueActivation += 1;

        const candidate = buildFrozenCandidate(prediction);
        const fixed = buildFixedFive(prediction, candidate);
        increment(reasons, fixed.reason);

        if (fixed.applied) {
          if (fixed.beforeHeadProfile !== fixed.afterHeadProfile) {
            headProfileViolations += 1;
          }
          if (currentFive.slice(0, 3).join("|") !== fixed.nextFive.slice(0, 3).join("|")) {
            mainThreeViolations += 1;
          }
          if (fixed.rescueApplied && fixed.rescueTicket && !fixed.nextFive.includes(fixed.rescueTicket)) {
            rescueProtectionViolations += 1;
          }
        }

        records.push({
          date,
          jcd: String(row.jcd || "").padStart(2, "0"),
          raceNo: Number(row.raceNo || 0),
          actual,
          payout: payoutOf(row),
          currentFive,
          nextFive: fixed.nextFive,
          applied: fixed.applied,
          removedTicket: fixed.removedTicket || null,
          addedTicket: fixed.addedTicket || null,
          bestOuter: candidate.bestOuter || null,
          sashiGap: candidate.sashiGap ?? null,
          rescueApplied: fixed.rescueApplied === true
        });
      } catch (error) {
        failures.push(`${date}-${row.jcd}-${row.raceNo}:${error?.message || error}`);
      }
    }
  }

  const discovery = summarize(records.filter(row => row.date < HOLDOUT_START));
  const holdout = summarize(records.filter(row => row.date >= HOLDOUT_START));
  const full = summarize(records);
  const gatePassed =
    passesGate(discovery) &&
    passesGate(holdout) &&
    failures.length === 0 &&
    headProfileViolations === 0 &&
    mainThreeViolations === 0 &&
    rescueProtectionViolations === 0;

  console.log(
    JSON.stringify(
      {
        schemaVersion: 1,
        source:
          "latest main replay with production third-six fixed5 module enabled; frozen PR #508 candidate rule",
        holdoutStart: HOLDOUT_START,
        rule: RULE,
        replacementRule: {
          scope: "safety tickets only",
          sameHead: 2,
          order: "safety index 4 then 3",
          mainThreeProtected: true,
          productionThirdSixRescueProtected: true,
          headAllocationPreserved: true,
          tickets: 5
        },
        totalSettledEvaluated,
        productionThirdSixRescueActivation,
        reasons,
        discovery,
        holdout,
        full,
        gatePassed,
        gate:
          "discovery and holdout each require selected>=20, hitDelta>0, gains>=losses, returnDelta>=0, gains on >=3 dates and >=3 venues; stakeDelta=0; all protection violations=0; failures=0",
        headProfileViolations,
        mainThreeViolations,
        rescueProtectionViolations,
        failures,
        decision: gatePassed
          ? "fixed5 replacement passed both periods; present production-change proposal for explicit approval"
          : "do not adopt; fixed5 replacement did not preserve hit and return performance across independent holdout",
        notes: {
          productionChanged: false,
          automaticApplication: false,
          frozenCandidateRuleNoThresholdSearch: true,
          fixedFiveTickets: true,
          actualResultNotUsedForCandidateGenerationOrActivation: true,
          oddsNotUsed: true
        }
      },
      null,
      2
    )
  );
}

main();
