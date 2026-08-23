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
  "fixed5-pair-15-third-context-restored.json"
);
const expectedSourceParity = Object.freeze({
  discovery: Object.freeze({
    allSettledFixed5: 867,
    basePortfolioHits: 212,
    basePortfolioPayout: 360860,
    misses: 37,
    missPayoutSum: 251310,
  }),
  holdout: Object.freeze({
    allSettledFixed5: 799,
    basePortfolioHits: 196,
    basePortfolioPayout: 487230,
    misses: 32,
    missPayoutSum: 108320,
  }),
});

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

function pair(value) {
  return String(value).split("-").slice(0, 2).join("-");
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

function payout(row) {
  for (const value of [
    row?.result?.payout,
    row?.result?.payoutYen,
    row?.result?.trifectaPayout,
    row?.result?.review?.payout,
    row?.result?.review?.payoutYen,
    row?.result?.review?.trifectaPayout,
  ]) {
    if (value === null || value === undefined || String(value).trim() === "") {
      continue;
    }
    const amount = Number(String(value).replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(amount) && amount > 0) return amount;
  }
  return null;
}

function increment(target, key, amount = 1) {
  target[key] = (target[key] || 0) + amount;
}

function sumValues(target) {
  return Object.values(target).reduce((total, value) => total + value, 0);
}

function ranking(counts, payouts = {}) {
  return Object.entries(counts)
    .map(([key, count]) => ({
      key,
      count,
      payoutSum: payouts[key] || 0,
    }))
    .sort(
      (left, right) =>
        right.count - left.count ||
        right.payoutSum - left.payoutSum ||
        left.key.localeCompare(right.key)
    );
}

const sourceMetadata = Object.freeze([
  ["thirdSixRescueFixed5", "thirdSixRescueFixed5"],
  ["escapeOuterSecondRescueFixed5", "escapeOuterSecondRescueFixed5"],
  ["thirdPlaceRescue14Fixed5", "thirdPlaceRescue14Fixed5"],
  ["thirdPlaceRescue124Fixed5", "thirdPlaceRescue124Fixed5"],
  ["pair31RescueFixed5", "pair31RescueFixed5"],
  ["pair32RescueFixed5", "pair32RescueFixed5"],
]);

function heldTicketSource(prediction, heldTicket) {
  const formations = prediction?.formations || {};
  const matches = sourceMetadata
    .filter(([, metadataKey]) => {
      const metadata = formations[metadataKey];
      return metadata?.applied === true && ticket(metadata.ticket) === heldTicket;
    })
    .map(([source]) => source);
  return {
    source: matches.length === 0 ? "core" : matches.join("+"),
    ambiguous: matches.length > 1,
  };
}

function emptyPeriod() {
  return {
    allSettledFixed5: 0,
    basePortfolioHits: 0,
    basePortfolioPayout: 0,
    actualPairRaces: 0,
    hits: 0,
    hitThird: {},
    misses: 0,
    missPayoutSum: 0,
    pairCoveredMisses: 0,
    pairCoveredPayoutSum: 0,
    pairUncoveredMisses: 0,
    pairUncoveredPayoutSum: 0,
    actualThird: {},
    actualThirdPayout: {},
    actualThirdPairCovered: {},
    actualThirdPairCoveredPayout: {},
    actualThirdPairUncovered: {},
    actualThirdPairUncoveredPayout: {},
    heldThirdPairCovered: {},
    transitionPairCovered: {},
    transitionPairCoveredPayout: {},
    heldPairTicketCountPerRace: {},
    heldPairLocations: {},
    heldPairSources: {},
    heldPairSourceSignatures: {},
    pairUncoveredHeldPairsByTicket: {},
    pairUncoveredHeldPairPresence: {},
    pairUncoveredHeldPairPresencePayout: {},
    pairUncoveredHeldTickets: {},
    pairUncoveredHeldLocations: {},
    pairUncoveredHeldSources: {},
    pairUncoveredHeldPairByLocation: {},
    pairUncoveredHeldPairBySource: {},
    pairUncoveredHeldPairSignatures: {},
    pairUncoveredHeldSourceSignatures: {},
    missingInputRows: 0,
    missingActualRows: 0,
    invalidFixed5Rows: 0,
    invalidFixed5TicketRows: 0,
    duplicateFixed5Rows: 0,
    missingPayoutRows: 0,
    classificationInvariantErrors: 0,
    sourceAmbiguityErrors: 0,
    processingErrors: 0,
    checks: {},
  };
}

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
  const current = periods[periodName];
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
        current.missingInputRows += 1;
        continue;
      }

      const actual = ticket(
        row?.result?.resultTicket || row?.result?.review?.resultTicket
      );
      if (!validTicket(actual)) {
        current.missingActualRows += 1;
        continue;
      }

      const prediction = core.buildPredictionData(raceInput);
      const fixed = fixedFive(prediction);
      if (fixed.length !== 5) {
        current.invalidFixed5Rows += 1;
        continue;
      }

      current.allSettledFixed5 += 1;
      if (!fixed.every(validTicket)) {
        current.invalidFixed5TicketRows += 1;
        continue;
      }
      if (new Set(fixed).size !== 5) {
        current.duplicateFixed5Rows += 1;
        continue;
      }

      const payoutYen = payout(row);
      if (payoutYen === null) {
        current.missingPayoutRows += 1;
        continue;
      }

      const baseHit = fixed.includes(actual);
      if (baseHit) {
        current.basePortfolioHits += 1;
        current.basePortfolioPayout += payoutYen;
      }

      if (pair(actual) !== "1-5") continue;

      const actualThird = actual.split("-")[2];
      current.actualPairRaces += 1;
      if (baseHit) {
        current.hits += 1;
        increment(current.hitThird, actualThird);
        continue;
      }

      current.misses += 1;
      current.missPayoutSum += payoutYen;
      increment(current.actualThird, actualThird);
      increment(current.actualThirdPayout, actualThird, payoutYen);

      const heldPair = fixed
        .map((value, index) => ({ value, index }))
        .filter((entry) => pair(entry.value) === "1-5");

      if (heldPair.length === 0) {
        current.pairUncoveredMisses += 1;
        current.pairUncoveredPayoutSum += payoutYen;
        increment(current.actualThirdPairUncovered, actualThird);
        increment(
          current.actualThirdPairUncoveredPayout,
          actualThird,
          payoutYen
        );

        const pairPresence = new Set();
        const pairSignature = [];
        const sourceSignature = [];
        for (const [index, held] of fixed.entries()) {
          const heldPairKey = pair(held);
          const location =
            index < 3 ? `main:${index}` : `safety:${index - 3}`;
          const sourceResult = heldTicketSource(prediction, held);
          if (sourceResult.ambiguous) current.sourceAmbiguityErrors += 1;

          pairPresence.add(heldPairKey);
          pairSignature.push(heldPairKey);
          sourceSignature.push(sourceResult.source);
          increment(current.pairUncoveredHeldPairsByTicket, heldPairKey);
          increment(current.pairUncoveredHeldTickets, held);
          increment(current.pairUncoveredHeldLocations, location);
          increment(current.pairUncoveredHeldSources, sourceResult.source);
          increment(
            current.pairUncoveredHeldPairByLocation,
            `${heldPairKey}@${location}`
          );
          increment(
            current.pairUncoveredHeldPairBySource,
            `${heldPairKey}@${sourceResult.source}`
          );
        }
        increment(
          current.pairUncoveredHeldPairSignatures,
          pairSignature.sort().join("|")
        );
        increment(
          current.pairUncoveredHeldSourceSignatures,
          sourceSignature.sort().join("|")
        );
        for (const heldPairKey of pairPresence) {
          increment(current.pairUncoveredHeldPairPresence, heldPairKey);
          increment(
            current.pairUncoveredHeldPairPresencePayout,
            heldPairKey,
            payoutYen
          );
        }
        continue;
      }

      if (heldPair.some((entry) => entry.value === actual)) {
        current.classificationInvariantErrors += 1;
        continue;
      }

      current.pairCoveredMisses += 1;
      current.pairCoveredPayoutSum += payoutYen;
      increment(current.actualThirdPairCovered, actualThird);
      increment(
        current.actualThirdPairCoveredPayout,
        actualThird,
        payoutYen
      );
      increment(current.heldPairTicketCountPerRace, String(heldPair.length));

      const sourceSignature = [];
      for (const held of heldPair) {
        const heldThird = held.value.split("-")[2];
        const transition = `${heldThird}->${actualThird}`;
        const location =
          held.index < 3
            ? `main:${held.index}`
            : `safety:${held.index - 3}`;
        const sourceResult = heldTicketSource(prediction, held.value);
        if (sourceResult.ambiguous) current.sourceAmbiguityErrors += 1;
        sourceSignature.push(sourceResult.source);
        increment(current.heldThirdPairCovered, heldThird);
        increment(current.transitionPairCovered, transition);
        increment(current.transitionPairCoveredPayout, transition, payoutYen);
        increment(current.heldPairLocations, location);
        increment(current.heldPairSources, sourceResult.source);
      }
      increment(
        current.heldPairSourceSignatures,
        sourceSignature.sort().join("|")
      );
    } catch {
      current.processingErrors += 1;
    }
  }
}

for (const [periodName, current] of Object.entries(periods)) {
  const expected = expectedSourceParity[periodName];
  const heldTicketTotal = Object.entries(
    current.heldPairTicketCountPerRace
  ).reduce(
    (total, [ticketCount, raceCount]) =>
      total + Number(ticketCount) * raceCount,
    0
  );
  const uncoveredHeldTicketTotal =
    current.pairUncoveredMisses * 5;

  current.transitionPairCoveredRanking = ranking(
    current.transitionPairCovered,
    current.transitionPairCoveredPayout
  );
  current.pairUncoveredHeldPairPresenceRanking = ranking(
    current.pairUncoveredHeldPairPresence,
    current.pairUncoveredHeldPairPresencePayout
  );

  current.checks = {
    sourceParityWithPR591AndPR594:
      current.allSettledFixed5 === expected.allSettledFixed5 &&
      current.basePortfolioHits === expected.basePortfolioHits &&
      current.basePortfolioPayout === expected.basePortfolioPayout &&
      current.misses === expected.misses &&
      current.missPayoutSum === expected.missPayoutSum,
    actualRaceSplit:
      current.actualPairRaces === current.hits + current.misses,
    hitThirdComplete: sumValues(current.hitThird) === current.hits,
    missCoverageSplit:
      current.misses ===
      current.pairCoveredMisses + current.pairUncoveredMisses,
    missPayoutSplit:
      current.missPayoutSum ===
      current.pairCoveredPayoutSum + current.pairUncoveredPayoutSum,
    actualThirdComplete: sumValues(current.actualThird) === current.misses,
    actualThirdPayoutComplete:
      sumValues(current.actualThirdPayout) === current.missPayoutSum,
    coveredActualThirdComplete:
      sumValues(current.actualThirdPairCovered) ===
      current.pairCoveredMisses,
    coveredActualThirdPayoutComplete:
      sumValues(current.actualThirdPairCoveredPayout) ===
      current.pairCoveredPayoutSum,
    uncoveredActualThirdComplete:
      sumValues(current.actualThirdPairUncovered) ===
      current.pairUncoveredMisses,
    uncoveredActualThirdPayoutComplete:
      sumValues(current.actualThirdPairUncoveredPayout) ===
      current.pairUncoveredPayoutSum,
    coveredRaceTicketCountsComplete:
      sumValues(current.heldPairTicketCountPerRace) ===
      current.pairCoveredMisses,
    heldThirdTicketCountComplete:
      sumValues(current.heldThirdPairCovered) === heldTicketTotal,
    transitionTicketCountComplete:
      sumValues(current.transitionPairCovered) === heldTicketTotal,
    heldPairLocationCountComplete:
      sumValues(current.heldPairLocations) === heldTicketTotal,
    heldPairSourceCountComplete:
      sumValues(current.heldPairSources) === heldTicketTotal,
    heldPairSourceSignatureComplete:
      sumValues(current.heldPairSourceSignatures) ===
      current.pairCoveredMisses,
    coveredThirdMismatchOnly: Object.keys(
      current.transitionPairCovered
    ).every((value) => {
      const [heldThird, actualThird] = value.split("->");
      return heldThird !== actualThird;
    }),
    uncoveredHeldPairTicketCountComplete:
      sumValues(current.pairUncoveredHeldPairsByTicket) ===
      uncoveredHeldTicketTotal,
    uncoveredHeldTicketCountComplete:
      sumValues(current.pairUncoveredHeldTickets) ===
      uncoveredHeldTicketTotal,
    uncoveredHeldLocationCountComplete:
      sumValues(current.pairUncoveredHeldLocations) ===
      uncoveredHeldTicketTotal,
    uncoveredHeldSourceCountComplete:
      sumValues(current.pairUncoveredHeldSources) ===
      uncoveredHeldTicketTotal,
    uncoveredHeldPairByLocationComplete:
      sumValues(current.pairUncoveredHeldPairByLocation) ===
      uncoveredHeldTicketTotal,
    uncoveredHeldPairBySourceComplete:
      sumValues(current.pairUncoveredHeldPairBySource) ===
      uncoveredHeldTicketTotal,
    uncoveredHeldPairSignatureComplete:
      sumValues(current.pairUncoveredHeldPairSignatures) ===
      current.pairUncoveredMisses,
    uncoveredHeldSourceSignatureComplete:
      sumValues(current.pairUncoveredHeldSourceSignatures) ===
      current.pairUncoveredMisses,
    uncoveredPairPresenceWithinRaceBounds: Object.entries(
      current.pairUncoveredHeldPairPresence
    ).every(
      ([heldPairKey, raceCount]) =>
        raceCount <= current.pairUncoveredMisses &&
        raceCount <=
          (current.pairUncoveredHeldPairsByTicket[heldPairKey] || 0)
    ),
    pair15AbsentFromUncoveredTickets:
      !Object.hasOwn(current.pairUncoveredHeldPairsByTicket, "1-5") &&
      !Object.hasOwn(current.pairUncoveredHeldPairPresence, "1-5"),
    noMissingInputs: current.missingInputRows === 0,
    noMissingActuals: current.missingActualRows === 0,
    noInvalidFixed5Rows: current.invalidFixed5Rows === 0,
    noInvalidFixed5Tickets: current.invalidFixed5TicketRows === 0,
    noDuplicateFixed5: current.duplicateFixed5Rows === 0,
    noMissingPayouts: current.missingPayoutRows === 0,
    noClassificationInvariantErrors:
      current.classificationInvariantErrors === 0,
    noSourceAmbiguityErrors: current.sourceAmbiguityErrors === 0,
    noProcessingErrors: current.processingErrors === 0,
  };
}

const sampleGate = {
  minimumDiscovery: 30,
  minimumHoldout: 20,
  branches: {
    pairCoveredThirdMismatch: {
      discovery: periods.discovery.pairCoveredMisses,
      holdout: periods.holdout.pairCoveredMisses,
    },
    pairUncovered: {
      discovery: periods.discovery.pairUncoveredMisses,
      holdout: periods.holdout.pairUncoveredMisses,
    },
  },
};

for (const branch of Object.values(sampleGate.branches)) {
  branch.passed =
    branch.discovery >= sampleGate.minimumDiscovery &&
    branch.holdout >= sampleGate.minimumHoldout;
}

const eligibleBranches = Object.entries(sampleGate.branches)
  .filter(([, branch]) => branch.passed)
  .map(([name]) => name);

const excludedPriorRejectedDonors = Object.freeze(["1-4"]);
const selectedCoveredTransition =
  periods.discovery.transitionPairCoveredRanking[0] || null;
const selectedUncoveredDonor =
  periods.discovery.pairUncoveredHeldPairPresenceRanking.find(
    (entry) => !excludedPriorRejectedDonors.includes(entry.key)
  ) || null;

function candidateGate(selected, discoveryRanking, holdoutRanking) {
  if (!selected) {
    return {
      selectedFrom: "discovery",
      key: null,
      discovery: 0,
      holdout: 0,
      passed: false,
    };
  }
  const discovery =
    discoveryRanking.find((entry) => entry.key === selected.key)?.count || 0;
  const holdout =
    holdoutRanking.find((entry) => entry.key === selected.key)?.count || 0;
  return {
    selectedFrom: "discovery",
    key: selected.key,
    discovery,
    holdout,
    passed:
      discovery >= sampleGate.minimumDiscovery &&
      holdout >= sampleGate.minimumHoldout,
  };
}

const candidateGates = {
  pairCoveredTransition: candidateGate(
    selectedCoveredTransition,
    periods.discovery.transitionPairCoveredRanking,
    periods.holdout.transitionPairCoveredRanking
  ),
  pairUncoveredDonor: candidateGate(
    selectedUncoveredDonor,
    periods.discovery.pairUncoveredHeldPairPresenceRanking,
    periods.holdout.pairUncoveredHeldPairPresenceRanking
  ),
};
candidateGates.pairCoveredTransition.branchPassed =
  sampleGate.branches.pairCoveredThirdMismatch.passed;
candidateGates.pairCoveredTransition.eligible =
  candidateGates.pairCoveredTransition.branchPassed &&
  candidateGates.pairCoveredTransition.passed;
candidateGates.pairUncoveredDonor.branchPassed =
  sampleGate.branches.pairUncovered.passed;
candidateGates.pairUncoveredDonor.eligible =
  candidateGates.pairUncoveredDonor.branchPassed &&
  candidateGates.pairUncoveredDonor.passed;

const allChecksPassed = Object.values(periods).every((current) =>
  Object.values(current.checks).every(Boolean)
);
const eligibleNextAudits = Object.entries(candidateGates)
  .filter(([, gate]) => gate.eligible)
  .map(([name]) => name);

const output = {
  schemaVersion: 2,
  holdoutStart,
  target:
    "actual 1-5 pair races missed by current fixed5, split into pair-covered third mismatch and pair-uncovered miss",
  expectedSourceParity,
  periods,
  sampleGate,
  excludedPriorRejectedDonors,
  eligibleBranches: allChecksPassed ? eligibleBranches : [],
  candidateGates,
  eligibleNextAudits: allChecksPassed ? eligibleNextAudits : [],
  allChecksPassed,
  notes: {
    productionChanged: false,
    oddsUsed: false,
    currentMainRescuesAppliedOnceInProductionOrder: true,
    sourceRestoredByWorkflow: true,
    resultUsedOnlyForClassificationAndScoring: true,
    selectionPeriod: "discovery",
    gateUnit: "races",
    transitionUnit: "unique held 1-5 tickets per race",
    transitionFormat: "heldThird->actualThird",
    donorSlotUnit: "all five current fixed5 tickets per pair-uncovered race",
    donorPresenceUnit: "each held pair at most once per race",
    transitionPayoutAdditiveAcrossTransitions: false,
    donorPresencePayoutAdditiveAcrossPairs: false,
    heldTicketSourceRule:
      "exact final ticket match against applied production rescue metadata; otherwise core",
    repeatedBranchExcluded:
      "1-4 to 1-5 pair reallocation from PRs #562/#563",
  },
};

const serialized = `${JSON.stringify(output, null, 2)}\n`;
fs.writeFileSync(artifactPath, serialized);
process.stdout.write(serialized);

if (!allChecksPassed) process.exitCode = 1;
