"use strict";

const VERSION = "frame-rise-fall-shadow-result-report-v1";
const FIXED_COMPARABLE_RACES = 100;
const STAKE_PER_TICKET = 100;
const BOOTSTRAP_SAMPLES = 10000;

function pct(numerator, denominator) {
  return denominator ? Math.round(numerator / denominator * 1000) / 10 : null;
}

function ticket(value) {
  const match = String(value || "").trim().match(/^([1-6])-([1-6])-([1-6])$/);
  if (!match || new Set(match.slice(1)).size !== 3) return "";
  return match.slice(1).join("-");
}

function tickets(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(row => ticket(row?.ticket || row)).filter(Boolean))];
}

function raceKeyOf(record = {}) {
  return String(record?.raceKey || "");
}

function selectedEpoch(record = {}) {
  const value = Date.parse(String(record?.selectedAt || ""));
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function resultKey(result = {}) {
  return `${String(result?.date || "")}-${String(result?.jcd || "").padStart(2, "0")}-${Number(result?.raceNo || 0)}`;
}

function resultMap(documents = []) {
  const map = new Map();
  documents.forEach(doc => (Array.isArray(doc?.races) ? doc.races : []).forEach(result => {
    const key = resultKey(result);
    if (key && !key.endsWith("-0")) map.set(key, result);
  }));
  return map;
}

function cohortKey(row = {}) {
  return [
    String(row.candidateId || ""),
    String(row.candidateSpecFingerprint || ""),
    String(row.implementationFingerprint || ""),
    String(row.cutoffSelectedAt || ""),
    String(row.cutoffSourceCommit || ""),
    String(row.cutoffLogicFingerprint || "")
  ].join("|");
}

function comparableRows(predictionDocuments = []) {
  const byCohortRaceKey = new Map();
  predictionDocuments.forEach(doc => (Array.isArray(doc?.verificationPredictions) ? doc.verificationPredictions : []).forEach(record => {
    const snapshot = record?.frameRiseFallShadowAb || null;
    const replay = snapshot?.downstreamReplay || null;
    if (snapshot?.comparisonContract?.comparableForFixed100 !== true || replay?.status !== "replay-ready") return;
    const key = raceKeyOf(record);
    if (!key) return;
    const cutoff = snapshot?.cutoff || {};
    const row = {
      raceKey: key,
      date: String(record?.date || key.slice(0, 8)),
      jcd: String(record?.jcd || key.split("-")[1] || "").padStart(2, "0"),
      raceNo: Number(record?.raceNo || key.split("-")[2] || 0),
      place: String(record?.place || ""),
      selectedAt: String(record?.selectedAt || ""),
      selectedEpoch: selectedEpoch(record),
      candidateId: String(snapshot?.candidateId || ""),
      candidateSpecFingerprint: String(snapshot?.candidateSpecFingerprint || ""),
      implementationFingerprint: String(snapshot?.implementationFingerprint || ""),
      cutoffSelectedAt: String(cutoff?.selectedAtExclusiveLowerBound || ""),
      cutoffSourceCommit: String(cutoff?.sourceCommit || ""),
      cutoffLogicFingerprint: String(cutoff?.logicFingerprint || ""),
      ticketContractViolations: Number(snapshot?.comparisonContract?.ticketContractViolations || 0),
      a: replay.a || {},
      b: replay.b || {}
    };
    row.cohortKey = cohortKey(row);
    const dedupeKey = `${row.cohortKey}|${key}`;
    const existing = byCohortRaceKey.get(dedupeKey);
    if (!existing || row.selectedEpoch >= existing.selectedEpoch) byCohortRaceKey.set(dedupeKey, row);
  }));
  return [...byCohortRaceKey.values()]
    .sort((a, b) => a.selectedEpoch - b.selectedEpoch || a.raceKey.localeCompare(b.raceKey));
}

function settleSide(side = {}, result = {}) {
  const practicalTickets = tickets(side?.practicalTickets);
  const skipped = side?.skipDecision === true;
  const resultTicket = ticket(result?.trifecta?.combination);
  const payout = Math.max(0, Number(result?.trifecta?.payout || 0));
  const stake = skipped ? 0 : practicalTickets.length * STAKE_PER_TICKET;
  const hit = Boolean(!skipped && resultTicket && practicalTickets.includes(resultTicket));
  const returned = hit ? payout : 0;
  return {
    skipped,
    ticketCount: practicalTickets.length,
    practicalTickets,
    hit,
    stake,
    return: returned,
    profit: returned - stake
  };
}

function settleRow(row, result) {
  if (!result?.resultAvailable || result?.status !== "finished" || !ticket(result?.trifecta?.combination)) return null;
  const a = settleSide(row.a, result);
  const b = settleSide(row.b, result);
  return {
    ...row,
    actualTicket: ticket(result.trifecta.combination),
    payout: Math.max(0, Number(result.trifecta.payout || 0)),
    a,
    b,
    aOnlyHit: a.hit && !b.hit,
    bOnlyHit: b.hit && !a.hit,
    bothHit: a.hit && b.hit,
    neitherHit: !a.hit && !b.hit,
    profitDelta: b.profit - a.profit,
    stakeDelta: b.stake - a.stake
  };
}

function summarize(rows = []) {
  const totals = rows.reduce((out, row) => {
    out.aHits += row.a.hit ? 1 : 0;
    out.bHits += row.b.hit ? 1 : 0;
    out.aOnlyHits += row.aOnlyHit ? 1 : 0;
    out.bOnlyHits += row.bOnlyHit ? 1 : 0;
    out.bothHits += row.bothHit ? 1 : 0;
    out.neitherHits += row.neitherHit ? 1 : 0;
    out.aStake += row.a.stake;
    out.bStake += row.b.stake;
    out.aReturn += row.a.return;
    out.bReturn += row.b.return;
    out.profitDelta += row.profitDelta;
    out.ticketContractViolations += row.ticketContractViolations;
    return out;
  }, {
    aHits: 0, bHits: 0, aOnlyHits: 0, bOnlyHits: 0, bothHits: 0, neitherHits: 0,
    aStake: 0, bStake: 0, aReturn: 0, bReturn: 0, profitDelta: 0, ticketContractViolations: 0
  });
  return {
    raceCount: rows.length,
    ...totals,
    aHitRate: pct(totals.aHits, rows.length),
    bHitRate: pct(totals.bHits, rows.length),
    aRecoveryRate: pct(totals.aReturn, totals.aStake),
    bRecoveryRate: pct(totals.bReturn, totals.bStake),
    aProfit: totals.aReturn - totals.aStake,
    bProfit: totals.bReturn - totals.bStake,
    netBOnlyHits: totals.bOnlyHits - totals.aOnlyHits
  };
}

function choose(n, k) {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let value = 1;
  for (let i = 1; i <= k; i += 1) value = value * (n - k + i) / i;
  return value;
}

function oneSidedExactPValue(bOnlyHits, aOnlyHits) {
  const discordant = bOnlyHits + aOnlyHits;
  if (!discordant) return 1;
  let probability = 0;
  for (let k = bOnlyHits; k <= discordant; k += 1) probability += choose(discordant, k) * (0.5 ** discordant);
  return Math.min(1, Math.round(probability * 1e12) / 1e12);
}

function seededRandom(seedText) {
  let seed = 2166136261;
  for (const char of String(seedText || "")) {
    seed ^= char.charCodeAt(0);
    seed = Math.imul(seed, 16777619) >>> 0;
  }
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

function pairedProfitBootstrap(rows = [], samples = BOOTSTRAP_SAMPLES) {
  if (!rows.length) return { samples, confidenceLevel: 0.95, mean: null, lowerBound: null, upperBound: null };
  const deltas = rows.map(row => row.profitDelta);
  const random = seededRandom(rows.map(row => row.raceKey).join("|"));
  const means = [];
  for (let sample = 0; sample < samples; sample += 1) {
    let total = 0;
    for (let i = 0; i < deltas.length; i += 1) total += deltas[Math.floor(random() * deltas.length)];
    means.push(total / deltas.length);
  }
  means.sort((a, b) => a - b);
  const at = q => means[Math.min(means.length - 1, Math.max(0, Math.floor(q * means.length)))];
  const observedMean = deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
  return {
    samples,
    confidenceLevel: 0.95,
    mean: Math.round(observedMean * 100) / 100,
    lowerBound: Math.round(at(0.025) * 100) / 100,
    upperBound: Math.round(at(0.975) * 100) / 100
  };
}

function build(predictionDocuments = [], resultDocuments = []) {
  const allEligible = comparableRows(predictionDocuments);
  const activeCohortKey = allEligible[0]?.cohortKey || "";
  const eligible = activeCohortKey
    ? allEligible.filter(row => row.cohortKey === activeCohortKey)
    : [];
  const fixedPool = eligible.slice(0, FIXED_COMPARABLE_RACES);
  const results = resultMap(resultDocuments);
  const settled = fixedPool
    .map(row => settleRow(row, results.get(row.raceKey)))
    .filter(Boolean);
  const fixedIndex = new Map(fixedPool.map((row, index) => [row.raceKey, index]));
  const firstHalfRows = settled.filter(row => Number(fixedIndex.get(row.raceKey)) < 50);
  const secondHalfRows = settled.filter(row => {
    const index = Number(fixedIndex.get(row.raceKey));
    return index >= 50 && index < 100;
  });
  const overall = summarize(settled);
  const firstHalf = summarize(firstHalfRows);
  const secondHalf = summarize(secondHalfRows);
  const exactPValue = oneSidedExactPValue(overall.bOnlyHits, overall.aOnlyHits);
  const bootstrap = pairedProfitBootstrap(settled);
  const fixedPoolComplete = fixedPool.length >= FIXED_COMPARABLE_RACES;
  const complete = fixedPoolComplete && settled.length >= FIXED_COMPARABLE_RACES;
  const checks = {
    fixed100Complete: complete,
    bothHalvesBOnlyHitsAtLeastAOnlyHits: complete && firstHalf.bOnlyHits >= firstHalf.aOnlyHits && secondHalf.bOnlyHits >= secondHalf.aOnlyHits,
    overallMinimumNetBOnlyHits: complete && overall.netBOnlyHits >= 5,
    pairedOutcomeExactTest: complete && exactPValue <= 0.05,
    bRecoveryRateMustExceedA: complete && Number(overall.bRecoveryRate || 0) > Number(overall.aRecoveryRate || 0),
    pairedProfitDeltaMustBePositive: complete && overall.profitDelta > 0,
    pairedProfitBootstrap: complete && Number(bootstrap.lowerBound || 0) > 0,
    bothHalvesProfitDeltaMustBeNonNegative: complete && firstHalf.profitDelta >= 0 && secondHalf.profitDelta >= 0,
    bStakeMustNotExceedA: complete && overall.bStake <= overall.aStake,
    ticketContractViolationsMustEqual: complete && overall.ticketContractViolations === 0
  };
  const allPassed = Object.values(checks).every(Boolean);
  return {
    schemaVersion: 1,
    version: VERSION,
    generatedAt: new Date().toISOString(),
    status: complete ? (allPassed ? "candidate-passes-fixed-100" : "candidate-fails-fixed-100") : "collecting-fixed-100-results",
    protocol: {
      fixedComparableRaces: FIXED_COMPARABLE_RACES,
      validationHalf: { start: 1, end: 50 },
      sealedConfirmationHalf: { start: 51, end: 100 },
      ordering: ["selectedAt", "raceKey"],
      poolSelection: "first-100-same-cohort-comparable-before-result-settlement",
      cohortFields: ["candidateId", "candidateSpecFingerprint", "implementationFingerprint", "cutoff"],
      stakePerTicket: STAKE_PER_TICKET,
      automaticWinnerSelection: false,
      finalHumanApprovalRequired: true
    },
    activeCohort: fixedPool[0] ? {
      cohortKey: activeCohortKey,
      candidateId: fixedPool[0].candidateId,
      candidateSpecFingerprint: fixedPool[0].candidateSpecFingerprint,
      implementationFingerprint: fixedPool[0].implementationFingerprint,
      cutoff: {
        selectedAtExclusiveLowerBound: fixedPool[0].cutoffSelectedAt,
        sourceCommit: fixedPool[0].cutoffSourceCommit,
        logicFingerprint: fixedPool[0].cutoffLogicFingerprint
      }
    } : null,
    observation: {
      rawComparableCount: allEligible.length,
      eligibleComparableCount: eligible.length,
      excludedOtherCohortCount: Math.max(0, allEligible.length - eligible.length),
      fixedPoolCount: fixedPool.length,
      settledComparableCount: settled.length,
      pendingFixedPoolResults: Math.max(0, fixedPool.length - settled.length),
      remainingComparableResults: Math.max(0, FIXED_COMPARABLE_RACES - settled.length)
    },
    overall,
    firstHalf,
    secondHalf,
    pairedOutcomeExactTest: {
      alternative: "B-better",
      discordantCount: overall.aOnlyHits + overall.bOnlyHits,
      pValue: exactPValue,
      maximumPValue: 0.05
    },
    pairedProfitBootstrap: bootstrap,
    adoptionChecks: checks,
    adoptionCandidate: allPassed,
    automaticApplication: false,
    usableForPrediction: false,
    rows: settled
  };
}

module.exports = {
  VERSION, FIXED_COMPARABLE_RACES, STAKE_PER_TICKET, ticket, tickets, resultKey,
  cohortKey, comparableRows, settleSide, settleRow, summarize, oneSidedExactPValue,
  pairedProfitBootstrap, build
};
