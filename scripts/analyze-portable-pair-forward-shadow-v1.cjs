'use strict';

const path = require('node:path');
const input = require('./analysis-input-contract');
const expansion = require('./analyze-ticket-expansion-7-12-18-24.cjs');
const payoutAudit = require('./analyze-ticket-expansion-payout-v2.cjs');
const portable = require('./analyze-counter-hole-portable-conditions-v1.cjs');
const variants = require('./analyze-portable-formation-variants-v1.cjs');

const ROOT = path.resolve(__dirname, '..');
const STAKE = 100;
const BASE_LIMIT = 7;
const FREEZE_AT = '2026-09-01T08:45:00Z';
const FREEZE_MS = Date.parse(FREEZE_AT);

function pct(numerator, denominator) {
  return denominator ? Number((100 * numerator / denominator).toFixed(1)) : 0;
}

function parts(ticket) {
  return String(ticket || '').split('-').map(Number);
}

function captureMs(record) {
  const values = [
    record?.selectedAt,
    record?.capturedAt,
    record?.createdAt,
    record?.prediction?.selectedAt,
    record?.prediction?.capturedAt,
    record?.prediction?.createdAt
  ];
  for (const value of values) {
    const parsed = Date.parse(String(value || ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return NaN;
}

function baseTickets(record) {
  return new Set(
    expansion.collectTicketPool(record)
      .slice(0, BASE_LIMIT)
      .map(item => item.ticket)
      .filter(Boolean)
  );
}

function rowsByRace(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.raceKey)) map.set(row.raceKey, []);
    map.get(row.raceKey).push(row);
  }
  return map;
}

function portableRule(row) {
  if (row.candidateHead <= 3) return true;
  if (row.candidateHead < 4 || row.candidateHead > 6) return false;
  return variants.isNonRough(row) && variants.isSignalNotWorse(row);
}

function emptyMetric() {
  return {
    settledRaceCount: 0,
    triggeredRaceCount: 0,
    ticketCount: 0,
    averageTicketCount: 0,
    hitCount: 0,
    hitRatePercent: 0,
    investmentYen: 0,
    returnYen: 0,
    profitYen: 0,
    roiPercent: 0,
    addedTicketCount: 0,
    averageAddedTicketsPerTriggeredRace: 0,
    rescueCount: 0,
    incrementalInvestmentYen: 0,
    incrementalReturnYen: 0,
    incrementalProfitYen: 0,
    incrementalRoiPercent: 0,
    manboatRescueCount: 0,
    rescueByRole: { main: 0, counter: 0, hole: 0 },
    selectedCountDistribution: {}
  };
}

function evaluate(records, additionsMap, payouts) {
  const baseline = emptyMetric();
  const shadow = emptyMetric();

  for (const record of records) {
    const actual = input.actualTicket(record.__officialResult);
    if (!actual) continue;
    const raceKey = record.__analysisRaceKey || input.raceKey(record);
    const payout = payouts.get(raceKey) || 0;
    const base = baseTickets(record);
    if (!base.size) continue;
    const additionRows = additionsMap.get(raceKey) || [];
    const addedTickets = new Set(additionRows.map(row => row.ticket).filter(ticket => !base.has(ticket)));
    const selected = new Set([...base, ...addedTickets]);

    baseline.settledRaceCount += 1;
    baseline.ticketCount += base.size;
    baseline.investmentYen += base.size * STAKE;
    baseline.selectedCountDistribution[base.size] = (baseline.selectedCountDistribution[base.size] || 0) + 1;
    if (base.has(actual)) {
      baseline.hitCount += 1;
      baseline.returnYen += payout;
    }

    shadow.settledRaceCount += 1;
    shadow.ticketCount += selected.size;
    shadow.investmentYen += selected.size * STAKE;
    shadow.addedTicketCount += addedTickets.size;
    shadow.incrementalInvestmentYen += addedTickets.size * STAKE;
    shadow.selectedCountDistribution[selected.size] = (shadow.selectedCountDistribution[selected.size] || 0) + 1;
    if (addedTickets.size) shadow.triggeredRaceCount += 1;

    if (selected.has(actual)) {
      shadow.hitCount += 1;
      shadow.returnYen += payout;
    }
    if (!base.has(actual) && addedTickets.has(actual)) {
      shadow.rescueCount += 1;
      shadow.incrementalReturnYen += payout;
      if (payout >= 10000) shadow.manboatRescueCount += 1;
      const winningRow = additionRows.find(row => row.ticket === actual);
      const role = winningRow?.role || 'hole';
      shadow.rescueByRole[role] = (shadow.rescueByRole[role] || 0) + 1;
    }
  }

  for (const metric of [baseline, shadow]) {
    metric.averageTicketCount = metric.settledRaceCount
      ? Number((metric.ticketCount / metric.settledRaceCount).toFixed(2))
      : 0;
    metric.hitRatePercent = pct(metric.hitCount, metric.settledRaceCount);
    metric.profitYen = metric.returnYen - metric.investmentYen;
    metric.roiPercent = pct(metric.returnYen, metric.investmentYen);
    metric.averageAddedTicketsPerTriggeredRace = metric.triggeredRaceCount
      ? Number((metric.addedTicketCount / metric.triggeredRaceCount).toFixed(2))
      : 0;
    metric.incrementalProfitYen = metric.incrementalReturnYen - metric.incrementalInvestmentYen;
    metric.incrementalRoiPercent = pct(metric.incrementalReturnYen, metric.incrementalInvestmentYen);
  }
  return { baseline, shadow };
}

function delta(left, right) {
  return {
    hitCount: left.hitCount - right.hitCount,
    hitRatePoints: Number((left.hitRatePercent - right.hitRatePercent).toFixed(1)),
    roiPoints: Number((left.roiPercent - right.roiPercent).toFixed(1)),
    profitYen: left.profitYen - right.profitYen,
    averageTicketCount: Number((left.averageTicketCount - right.averageTicketCount).toFixed(2)),
    addedTicketCount: left.addedTicketCount - right.addedTicketCount,
    rescueCount: left.rescueCount - right.rescueCount,
    manboatRescueCount: left.manboatRescueCount - right.manboatRescueCount
  };
}

function gates(metric) {
  return Object.fromEntries([50, 100, 250].map(required => [String(required), {
    requiredTriggeredRaces: required,
    status: metric.triggeredRaceCount >= required ? 'manual-review-required' : 'pending',
    currentTriggeredRaces: metric.triggeredRaceCount,
    incrementalRoiPercent: metric.incrementalRoiPercent,
    rescueCount: metric.rescueCount,
    manboatRescueCount: metric.manboatRescueCount,
    automaticAdoption: false
  }]));
}

function build() {
  const cohort = input.buildDefaultCohort({ root: ROOT });
  const payouts = payoutAudit.payoutMap();
  const portableAudit = portable.build();
  const eligibleRecords = cohort.records.filter(record => captureMs(record) >= FREEZE_MS);
  const eligibleKeys = new Set(eligibleRecords.map(record => record.__analysisRaceKey || input.raceKey(record)));
  const pairRows = portableAudit.rows.filter(row => eligibleKeys.has(row.raceKey));
  const challengerRows = pairRows.filter(portableRule);
  const pair = evaluate(eligibleRecords, rowsByRace(pairRows), payouts);
  const challenger = evaluate(eligibleRecords, rowsByRace(challengerRows), payouts);

  return {
    schemaVersion: 1,
    analysisId: 'portable-pair-forward-shadow-v1',
    generatedAt: new Date().toISOString(),
    freezeAt: FREEZE_AT,
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    purpose: 'Forward-validate a venue-independent refinement of counter-hole-pair-9 while retaining the original pair rule as a shadow comparator.',
    rule: {
      id: 'inner-plus-outer-signal-nonrough-9',
      baseline: 'first 7 saved candidates',
      sourcePair: 'at most one highest-score counter-head and one highest-score hole-head candidate from ranks 8-12, saved score >=85, maximum 9 tickets',
      innerHeads: 'retain selected additions with head boat 1-3',
      outerHeads: 'retain selected additions with head boat 4-6 only when observed pre-deadline water is calm/moderate and either exhibition ST or exhibition time is no more than 0.01 worse than the main head',
      missingOuterEvidence: 'fail closed: do not add the outer-head ticket',
      selectionUsesOutcome: false
    },
    methodology: {
      eligibility: `settled official-result races whose prediction capture timestamp is on or after ${FREEZE_AT}`,
      resultAndPayoutUse: 'evaluation only',
      stake: `${STAKE} yen per ticket`,
      reviewGates: '50, 100, and 250 triggered races; all require manual review',
      warning: 'Shadow only. It does not change prediction, note, purchase, ticket display, or UI behavior.'
    },
    diagnostics: {
      ...cohort.diagnostics,
      forwardEligibleSettledCount: eligibleRecords.length,
      excludedBeforeFreezeCount: cohort.records.length - eligibleRecords.length,
      sourcePairAddedTicketCount: pairRows.length,
      challengerAddedTicketCount: challengerRows.length
    },
    baseline: challenger.baseline,
    sourcePair: pair.shadow,
    challenger: challenger.shadow,
    challengerDeltaVsBaseline: delta(challenger.shadow, challenger.baseline),
    challengerDeltaVsSourcePair: delta(challenger.shadow, pair.shadow),
    gates: gates(challenger.shadow)
  };
}

if (require.main === module) process.stdout.write(`${JSON.stringify(build(), null, 2)}\n`);
module.exports = { build, portableRule, captureMs };
