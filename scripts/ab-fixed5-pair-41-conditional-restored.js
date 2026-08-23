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
const predictionDirectory = path.join(process.cwd(), "data", "predictions");
const holdoutStart = "20260812";
const artifactPath = path.join(
  process.cwd(),
  "fixed5-pair-41-conditional-restored-ab.json"
);
const signalKeys = ["st", "ex", "flow", "attack", "hold", "pickup"];
const variants = [4, 5, 6];
const thresholds = Object.freeze({
  st: -0.1810457516339869,
  ex: -5.056633986928102,
  flow: -9.793202614379082,
  attack: -0.7529084967320272,
  hold: -10.837777777777777,
  pickup: -3.392287581699347,
});
const expectedSourceParity = Object.freeze({
  discovery: Object.freeze({
    allSettledFixed5: 867,
    eligibleCurrentShape: 829,
    basePortfolioHits: 212,
  }),
  holdout: Object.freeze({
    allSettledFixed5: 799,
    eligibleCurrentShape: 758,
    basePortfolioHits: 196,
  }),
});
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

function validTicket(value) {
  const match = String(value).match(/^([1-6])-([1-6])-([1-6])$/);
  return Boolean(match && new Set(match.slice(1)).size === 3);
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
    if (Number.isFinite(amount) && amount > 0) return amount;
  }
  return null;
}

function bestThird(list) {
  const candidates = (list || [])
    .map((boat, index) => ({
      boat: boatNumber(boat, index),
      pickup: metric(boat, "pickup"),
    }))
    .filter((candidate) => candidate.boat !== 1 && candidate.boat !== 4);

  const uniqueBoats = new Set(candidates.map((candidate) => candidate.boat));
  const candidateBoats = [...uniqueBoats].sort((left, right) => left - right);
  if (
    candidates.length !== 4 ||
    uniqueBoats.size !== 4 ||
    candidateBoats.join(",") !== "2,3,5,6" ||
    candidates.some((candidate) => !Number.isInteger(candidate.boat)) ||
    candidates.some((candidate) => candidate.pickup === null)
  ) {
    return null;
  }

  candidates.sort(
    (left, right) =>
      right.pickup - left.pickup || left.boat - right.boat
  );
  return candidates[0].boat;
}

function emptyVariant() {
  return {
    evaluable: 0,
    triggered: 0,
    changed: 0,
    baseHits: 0,
    bHits: 0,
    hitDelta: 0,
    improved: 0,
    harmed: 0,
    neutralHit: 0,
    neutralMiss: 0,
    basePayout: 0,
    bPayout: 0,
    payoutDelta: 0,
    improvedPayout: 0,
    harmedPayout: 0,
    replacedTickets: {},
    addedTickets: {},
    replacementLocations: {},
    selectedThirdCounts: {},
  };
}

function emptyPeriod() {
  return {
    allSettledFixed5: 0,
    basePortfolioHits: 0,
    basePortfolioPayout: 0,
    eligibleCurrentShape: 0,
    evaluatedCurrentShape: 0,
    scoreHistogram: Object.fromEntries(
      Array.from({ length: 7 }, (_, score) => [score, 0])
    ),
    duplicateFixed5Rows: 0,
    missingInputRows: 0,
    missingActualRows: 0,
    invalidFixed5Rows: 0,
    invalidFixed5TicketRows: 0,
    missingPayoutRows: 0,
    missingSignalRows: 0,
    missingThirdCandidateRows: 0,
    replacementInvariantErrors: 0,
    processingErrors: 0,
    variants: Object.fromEntries(
      variants.map((required) => [required, emptyVariant()])
    ),
    checks: {},
  };
}

function donorIndex(fixed) {
  for (let index = fixed.length - 1; index >= 0; index -= 1) {
    if (fixed[index].startsWith("1-2-")) return index;
  }
  return -1;
}

function incrementCounter(counter, key) {
  counter[key] = (counter[key] || 0) + 1;
}

function replacementIsValid(base, alternative, index, replacement) {
  if (
    index < 0 ||
    alternative.length !== 5 ||
    !base.every(validTicket) ||
    !alternative.every(validTicket) ||
    new Set(alternative).size !== 5 ||
    base.some((value) => value.startsWith("4-1-")) ||
    alternative.filter((value) => value.startsWith("4-1-")).length !== 1 ||
    alternative[index] !== replacement ||
    !/^4-1-[2356]$/.test(replacement)
  ) {
    return false;
  }

  let differences = 0;
  for (let position = 0; position < 5; position += 1) {
    if (base[position] !== alternative[position]) differences += 1;
  }
  return differences === 1;
}

const donorSelectorFixturePassed =
  donorIndex(["1-2-3", "2-3-4", "1-2-4", "3-4-5", "1-2-5"]) ===
    4 &&
  donorIndex(["1-2-3", "2-3-4", "1-2-4", "3-4-5", "5-6-1"]) ===
    2;

const periods = {
  discovery: emptyPeriod(),
  holdout: emptyPeriod(),
};
const seen = new Set();

for (const fileName of fs
  .readdirSync(predictionDirectory)
  .filter((name) => /^\d{8}\.json$/.test(name))
  .sort()) {
  const date = fileName.slice(0, 8);
  const periodName = date < holdoutStart ? "discovery" : "holdout";
  const period = periods[periodName];
  const data = JSON.parse(
    fs.readFileSync(path.join(predictionDirectory, fileName), "utf8")
  );

  for (const row of rows(data)) {
    if (row?.result?.settled !== true) continue;

    const raceKey = row.raceKey || `${date}-${row.jcd}-${row.raceNo}`;
    if (seen.has(raceKey)) continue;
    seen.add(raceKey);

    try {
      const raceInput = input(row);
      if (!raceInput) {
        period.missingInputRows += 1;
        continue;
      }
      const actual = ticket(
        row?.result?.resultTicket || row?.result?.review?.resultTicket
      );
      if (!validTicket(actual)) {
        period.missingActualRows += 1;
        continue;
      }

      const prediction = core.buildPredictionData(raceInput);
      const base = fixedFive(prediction);
      if (base.length !== 5) {
        period.invalidFixed5Rows += 1;
        continue;
      }

      period.allSettledFixed5 += 1;
      const has12 = base.some((value) => value.startsWith("1-2-"));
      const has41 = base.some((value) => value.startsWith("4-1-"));
      if (has12 && !has41) period.eligibleCurrentShape += 1;

      if (new Set(base).size !== 5) {
        period.duplicateFixed5Rows += 1;
        continue;
      }
      if (!base.every(validTicket)) {
        period.invalidFixed5TicketRows += 1;
        continue;
      }

      const payoutYen = payout(row);
      if (payoutYen === null) {
        period.missingPayoutRows += 1;
        continue;
      }

      const baseHit = base.includes(actual);
      if (baseHit) {
        period.basePortfolioHits += 1;
        period.basePortfolioPayout += payoutYen;
      }

      if (!has12 || has41) continue;

      const evaluation = analyses(prediction);
      const boat1 = findBoat(evaluation, 1);
      const boat4 = findBoat(evaluation, 4);
      if (!boat1 || !boat4) {
        period.missingSignalRows += 1;
        continue;
      }

      const differences = {};
      let signalComplete = true;
      for (const key of signalKeys) {
        const boat1Value = metric(boat1, key);
        const boat4Value = metric(boat4, key);
        if (boat1Value === null || boat4Value === null) {
          signalComplete = false;
          break;
        }
        differences[key] = boat4Value - boat1Value;
      }
      if (!signalComplete) {
        period.missingSignalRows += 1;
        continue;
      }

      const third = bestThird(evaluation);
      if (third === null) {
        period.missingThirdCandidateRows += 1;
        continue;
      }

      const index = donorIndex(base);
      const replacement = `4-1-${third}`;
      const alternative = base.slice();
      if (index >= 0) alternative[index] = replacement;
      if (!replacementIsValid(base, alternative, index, replacement)) {
        period.replacementInvariantErrors += 1;
        continue;
      }

      const score = signalKeys.reduce(
        (total, key) =>
          total + (differences[key] >= thresholds[key] ? 1 : 0),
        0
      );
      period.scoreHistogram[score] += 1;
      period.evaluatedCurrentShape += 1;

      for (const required of variants) {
        const current = period.variants[required];
        current.evaluable += 1;
        if (score < required) continue;

        const bHit = alternative.includes(actual);
        const location = index < 3 ? `main:${index}` : `safety:${index - 3}`;
        current.triggered += 1;
        current.changed += 1;
        current.baseHits += baseHit ? 1 : 0;
        current.bHits += bHit ? 1 : 0;
        current.hitDelta += Number(bHit) - Number(baseHit);
        if (!baseHit && bHit) {
          current.improved += 1;
          current.improvedPayout += payoutYen;
        } else if (baseHit && !bHit) {
          current.harmed += 1;
          current.harmedPayout += payoutYen;
        } else if (baseHit && bHit) {
          current.neutralHit += 1;
        } else {
          current.neutralMiss += 1;
        }
        current.basePayout += baseHit ? payoutYen : 0;
        current.bPayout += bHit ? payoutYen : 0;
        current.payoutDelta +=
          (bHit ? payoutYen : 0) - (baseHit ? payoutYen : 0);
        incrementCounter(current.replacedTickets, base[index]);
        incrementCounter(current.addedTickets, replacement);
        incrementCounter(current.replacementLocations, location);
        incrementCounter(current.selectedThirdCounts, String(third));
      }
    } catch {
      period.processingErrors += 1;
    }
  }
}

for (const [periodName, period] of Object.entries(periods)) {
  const expected = expectedSourceParity[periodName];
  const histogramTotal = Object.values(period.scoreHistogram).reduce(
    (total, count) => total + count,
    0
  );
  const triggerCountsMatchHistogram = variants.every((required) => {
    const expectedTriggered = Object.entries(period.scoreHistogram)
      .filter(([score]) => Number(score) >= required)
      .reduce((total, [, count]) => total + count, 0);
    return period.variants[required].triggered === expectedTriggered;
  });
  const variantArithmeticIsValid = variants.every((required) => {
    const current = period.variants[required];
    return (
      current.evaluable === period.evaluatedCurrentShape &&
      current.changed === current.triggered &&
      current.triggered ===
        current.improved +
          current.harmed +
          current.neutralHit +
          current.neutralMiss &&
      current.baseHits === current.harmed + current.neutralHit &&
      current.bHits === current.improved + current.neutralHit &&
      current.hitDelta === current.bHits - current.baseHits &&
      current.hitDelta === current.improved - current.harmed &&
      current.payoutDelta === current.bPayout - current.basePayout &&
      current.payoutDelta ===
        current.improvedPayout - current.harmedPayout &&
      Object.values(current.replacedTickets).reduce(
        (total, count) => total + count,
        0
      ) === current.triggered &&
      Object.values(current.addedTickets).reduce(
        (total, count) => total + count,
        0
      ) === current.triggered &&
      Object.values(current.replacementLocations).reduce(
        (total, count) => total + count,
        0
      ) === current.triggered &&
      Object.values(current.selectedThirdCounts).reduce(
        (total, count) => total + count,
        0
      ) === current.triggered &&
      period.basePortfolioHits + current.hitDelta >= 0 &&
      period.basePortfolioPayout + current.payoutDelta >= 0
    );
  });

  period.checks = {
    sourceParityWithPR593:
      period.allSettledFixed5 === expected.allSettledFixed5 &&
      period.eligibleCurrentShape === expected.eligibleCurrentShape &&
      period.basePortfolioHits === expected.basePortfolioHits,
    allEligibleRowsEvaluated:
      period.evaluatedCurrentShape === period.eligibleCurrentShape,
    scoreHistogramComplete: histogramTotal === period.evaluatedCurrentShape,
    triggerCountsMatchHistogram,
    triggerSetsNested:
      period.variants[4].triggered >= period.variants[5].triggered &&
      period.variants[5].triggered >= period.variants[6].triggered,
    variantArithmeticIsValid,
    donorSelectorFixturePassed,
    noMissingInputs: period.missingInputRows === 0,
    noMissingActuals: period.missingActualRows === 0,
    noInvalidFixed5Rows: period.invalidFixed5Rows === 0,
    noInvalidFixed5Tickets: period.invalidFixed5TicketRows === 0,
    noDuplicateFixed5: period.duplicateFixed5Rows === 0,
    noMissingPayouts: period.missingPayoutRows === 0,
    noMissingSignals: period.missingSignalRows === 0,
    noMissingThirdCandidates: period.missingThirdCandidateRows === 0,
    noReplacementInvariantErrors: period.replacementInvariantErrors === 0,
    noProcessingErrors: period.processingErrors === 0,
  };
}

const variantResults = {};
for (const required of variants) {
  const key = `${required}/6`;
  const result = {};
  for (const periodName of ["discovery", "holdout"]) {
    const period = periods[periodName];
    const current = period.variants[required];
    result[periodName] = {
      ...current,
      sampleGatePassed:
        current.triggered >= (periodName === "discovery" ? 30 : 20),
      portfolioA: {
        races: period.allSettledFixed5,
        hits: period.basePortfolioHits,
        payoutSum: period.basePortfolioPayout,
      },
      portfolioB: {
        races: period.allSettledFixed5,
        hits: period.basePortfolioHits + current.hitDelta,
        payoutSum: period.basePortfolioPayout + current.payoutDelta,
      },
    };
  }
  result.stablePositive =
    result.discovery.sampleGatePassed &&
    result.holdout.sampleGatePassed &&
    result.discovery.hitDelta > 0 &&
    result.holdout.hitDelta > 0 &&
    result.discovery.payoutDelta >= 0 &&
    result.holdout.payoutDelta >= 0;
  variantResults[key] = result;
}

const adoptionCandidates = Object.entries(variantResults)
  .filter(([, result]) => result.stablePositive)
  .map(([key]) => key);
const allChecksPassed = Object.values(periods).every((period) =>
  Object.values(period.checks).every(Boolean)
);
const selectedCandidate = allChecksPassed
  ? adoptionCandidates[0] || null
  : null;

const output = {
  schemaVersion: 2,
  holdoutStart,
  target:
    "current fixed5 has at least one 1-2 ticket and no 4-1 ticket; all actual outcomes",
  replacement:
    "replace the last 1-2 ticket in fixed5 order with 4-1 and the highest pre-race pickup third boat excluding boats 1 and 4",
  thresholds,
  thresholdSource: {
    pullRequest: 593,
    period: "discovery",
    method: "midpoint of keep12 and shift41 means",
    holdoutUsedForThresholdValues: false,
    holdoutUsedForSignalSelection: true,
  },
  expectedSourceParity,
  periods,
  adoptionGate: {
    minimumTriggeredDiscovery: 30,
    minimumTriggeredHoldout: 20,
    discoveryHitDelta: "> 0",
    holdoutHitDelta: "> 0",
    discoveryPayoutDelta: ">= 0",
    holdoutPayoutDelta: ">= 0",
  },
  variants: variantResults,
  adoptionCandidates,
  selectionRule:
    "if multiple predeclared variants pass, select the least restrictive passing variant in 4/6, 5/6, 6/6 order to retain the larger replicated sample",
  selectedCandidate,
  eligibleUnderHistoricalAdoptionGate:
    allChecksPassed && adoptionCandidates.length > 0,
  allChecksPassed,
  notes: {
    productionChanged: false,
    oddsUsed: false,
    fixed5Maintained: true,
    allPairPatterns: true,
    currentMainRescuesAppliedOnceInProductionOrder: true,
    sourceRestoredByWorkflow: true,
    resultUsedOnlyForScoring: true,
    thresholdsAdjustedAfterHoldout: false,
    statisticalScope:
      "retrospective candidate selection under the project's predeclared historical adoption gate",
  },
};

const serialized = `${JSON.stringify(output, null, 2)}\n`;
fs.writeFileSync(artifactPath, serialized);
process.stdout.write(serialized);

if (!allChecksPassed) process.exitCode = 1;
