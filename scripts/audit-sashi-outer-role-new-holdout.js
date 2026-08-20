"use strict";

const fs = require("node:fs");
const path = require("node:path");

global.window = global;
require("../js/ai-core");
require("../js/third-six-rescue-fixed5");
const core = global.ChappyAICore;

const PREDICTION_DIR = path.join(process.cwd(), "data", "predictions");
const LEGACY_HOLDOUT_START = "20260805";
const NEW_HOLDOUT_START = "20260812";
const RULE = Object.freeze({ holdMin: 72, pickupMin: 65, gapMax: 8 });

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
    return { eligibleRace: false, reason: "main-not-1-escape" };
  }

  const sashiScenario = (raceScenarios.scenarios || []).find(
    scenario => String(scenario?.type) === "sashi" || scenarioHead(scenario) === 2
  );
  const analyses = analysesOf(prediction);
  if (!sashiScenario || !Array.isArray(analyses)) {
    return { eligibleRace: false, reason: "no-sashi-scenario-or-analyses" };
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
    eligibleRace: true,
    reason: qualified ? "qualified" : "frozen-rule-not-met",
    currentFive,
    bestOuter,
    extraTicket,
    sashiGap,
    qualified
  };
}

function payoutOf(row) {
  return Number(row?.result?.payoutPer100 || row?.result?.review?.payoutPer100 || 0);
}

function increment(object, key) {
  object[key] = (object[key] || 0) + 1;
}

function summarize(rows) {
  const selectedRows = rows.filter(row => row.qualified);
  const gains = selectedRows.filter(row => !row.currentHit && row.extraTicket === row.actual);
  const currentHits = rows.filter(row => row.currentHit).length;
  const augmentedHits = rows.filter(
    row => row.currentHit || (row.qualified && row.extraTicket === row.actual)
  ).length;
  const candidateBoats = {};
  const extraThirdBoats = {};
  const selectedDates = new Set();
  const selectedVenues = new Set();

  for (const row of selectedRows) {
    increment(candidateBoats, String(row.bestOuter?.boatNo || 0));
    const parts = String(row.extraTicket || "").split("-");
    increment(extraThirdBoats, String(parts[2] || 0));
    selectedDates.add(row.date);
    selectedVenues.add(row.jcd);
  }

  const extraStake = selectedRows.length * 100;
  const extraReturn = gains.reduce((sum, row) => sum + row.payout, 0);

  return {
    races: rows.length,
    selected: selectedRows.length,
    selectedDates: selectedDates.size,
    selectedVenues: selectedVenues.size,
    currentHits,
    augmentedHits,
    hitDelta: augmentedHits - currentHits,
    gains: gains.length,
    falsePositives: selectedRows.length - gains.length,
    extraStake,
    extraReturn,
    extraProfit: extraReturn - extraStake,
    incrementalRoi: extraStake ? extraReturn / extraStake : null,
    distinctGainDates: new Set(gains.map(row => row.date)).size,
    distinctGainVenues: new Set(gains.map(row => row.jcd)).size,
    candidateBoats,
    extraThirdBoats,
    gainDetails: gains.map(row => ({
      date: row.date,
      jcd: row.jcd,
      raceNo: row.raceNo,
      actual: row.actual,
      extraTicket: row.extraTicket,
      payout: row.payout,
      bestOuter: row.bestOuter,
      sashiGap: row.sashiGap,
      productionThirdSixRescueApplied: row.productionThirdSixRescueApplied
    }))
  };
}

function periodOf(date) {
  if (date < LEGACY_HOLDOUT_START) return "legacyDiscovery";
  if (date < NEW_HOLDOUT_START) return "legacyHoldout";
  return "newHoldout";
}

function main() {
  const seen = new Set();
  const records = [];
  const failures = [];
  const reasons = {};
  let totalSettledEvaluated = 0;
  let productionThirdSixRescueActivation = 0;

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

        const productionRescueApplied =
          prediction?.formations?.thirdSixRescueFixed5?.applied === true;
        if (productionRescueApplied) productionThirdSixRescueActivation += 1;

        const candidate = buildFrozenCandidate(prediction);
        increment(reasons, candidate.reason);
        if (!candidate.eligibleRace) continue;

        records.push({
          date,
          period: periodOf(date),
          jcd: String(row.jcd || "").padStart(2, "0"),
          raceNo: Number(row.raceNo || 0),
          actual,
          payout: payoutOf(row),
          currentFive,
          currentHit: currentFive.includes(actual),
          bestOuter: candidate.bestOuter,
          extraTicket: candidate.extraTicket,
          sashiGap: candidate.sashiGap,
          qualified: candidate.qualified,
          productionThirdSixRescueApplied: productionRescueApplied
        });
      } catch (error) {
        failures.push(`${date}-${row.jcd}-${row.raceNo}:${error?.message || error}`);
      }
    }
  }

  const legacyDiscovery = summarize(
    records.filter(row => row.period === "legacyDiscovery")
  );
  const legacyHoldout = summarize(
    records.filter(row => row.period === "legacyHoldout")
  );
  const newHoldout = summarize(records.filter(row => row.period === "newHoldout"));
  const full = summarize(records);

  const gate = {
    legacyHoldoutProfitPositive: legacyHoldout.extraProfit > 0,
    legacyHoldoutHitDeltaPositive: legacyHoldout.hitDelta > 0,
    newHoldoutSelectedAtLeast20: newHoldout.selected >= 20,
    newHoldoutProfitPositive: newHoldout.extraProfit > 0,
    newHoldoutHitDeltaPositive: newHoldout.hitDelta > 0,
    newHoldoutGainDatesAtLeast3: newHoldout.distinctGainDates >= 3,
    newHoldoutGainVenuesAtLeast3: newHoldout.distinctGainVenues >= 3,
    noFailures: failures.length === 0
  };
  const gatePassed = Object.values(gate).every(Boolean);

  console.log(
    JSON.stringify(
      {
        schemaVersion: 1,
        source:
          "latest main replay with production third-six fixed5 module enabled; frozen PR #484 rule",
        rule: RULE,
        periods: {
          legacyDiscovery: `<${LEGACY_HOLDOUT_START}`,
          legacyHoldout: `${LEGACY_HOLDOUT_START}..${NEW_HOLDOUT_START}-1`,
          newHoldout: `>=${NEW_HOLDOUT_START}`
        },
        totalSettledEvaluated,
        eligibleEscapeMainRaces: records.length,
        productionThirdSixRescueActivation,
        reasons,
        legacyDiscovery,
        legacyHoldout,
        newHoldout,
        full,
        gate,
        gatePassed,
        decision: gatePassed
          ? "new holdout supports the frozen additive hypothesis; fixed5 replacement must still be tested before any production proposal"
          : "do not adopt; frozen hypothesis did not pass independent holdout and robustness requirements",
        failures,
        notes: {
          productionChanged: false,
          automaticApplication: false,
          frozenRuleNoThresholdSearch: true,
          additiveSixthTicketOnly: true,
          extraStakePerActivation: 100,
          currentProductionFiveIncludesThirdSixRescue: true,
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
