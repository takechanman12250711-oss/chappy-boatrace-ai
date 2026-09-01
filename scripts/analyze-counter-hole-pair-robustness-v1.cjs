'use strict';

const path = require('node:path');
const input = require('./analysis-input-contract');
const expansion = require('./analyze-ticket-expansion-7-12-18-24.cjs');
const payoutAudit = require('./analyze-ticket-expansion-payout-v2.cjs');
const structured = require('./analyze-structured-formation-backtest-v1.cjs');

const ROOT = path.resolve(__dirname, '..');
const RULE = 'counter-hole-pair-9';
const STAKE = 100;
const BASE_LIMIT = 7;
const FOLD_COUNT = 4;

function pct(numerator, denominator) {
  return denominator ? Number((100 * numerator / denominator).toFixed(1)) : 0;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(1));
}

function raceKey(record) {
  return record.__analysisRaceKey || input.raceKey(record);
}

function keyParts(record) {
  const key = raceKey(record);
  const match = String(key || '').match(/^(\d{8})-(\d{2})-([1-9]|1[0-2])$/);
  return match ? { key, date: match[1], venue: match[2], raceNo: Number(match[3]) } : { key, date: '', venue: '', raceNo: 0 };
}

function uniqueTickets(items) {
  return [...new Set((items || []).map(item => item?.ticket).filter(Boolean))];
}

function evaluate(records, payouts) {
  const metric = {
    raceCount: 0,
    triggeredRaceCount: 0,
    baselineTicketCount: 0,
    shadowTicketCount: 0,
    addedTicketCount: 0,
    baselineHitCount: 0,
    shadowHitCount: 0,
    rescueCount: 0,
    manboatRescueCount: 0,
    baselineInvestmentYen: 0,
    shadowInvestmentYen: 0,
    incrementalInvestmentYen: 0,
    baselineReturnYen: 0,
    shadowReturnYen: 0,
    incrementalReturnYen: 0,
    baselineProfitYen: 0,
    shadowProfitYen: 0,
    incrementalProfitYen: 0,
    baselineRoiPercent: 0,
    shadowRoiPercent: 0,
    incrementalRoiPercent: 0,
    baselineHitRatePercent: 0,
    shadowHitRatePercent: 0,
    hitRateDeltaPoints: 0,
    roiDeltaPoints: 0,
    profitDeltaYen: 0,
    averageBaselineTickets: 0,
    averageShadowTickets: 0,
    averageAddedTicketsPerTriggeredRace: 0,
    rescuePayouts: []
  };

  for (const record of records) {
    const actual = input.actualTicket(record.__officialResult);
    if (!actual) continue;
    const key = raceKey(record);
    const payout = payouts.get(key) || 0;
    const pool = expansion.collectTicketPool(record);
    const baseline = uniqueTickets(pool.slice(0, BASE_LIMIT));
    const shadow = uniqueTickets(structured.select(record, RULE));
    const baselineSet = new Set(baseline);
    const shadowSet = new Set(shadow);
    const added = shadow.filter(ticket => !baselineSet.has(ticket));
    const baselineHit = baselineSet.has(actual);
    const shadowHit = shadowSet.has(actual);

    metric.raceCount += 1;
    metric.baselineTicketCount += baseline.length;
    metric.shadowTicketCount += shadow.length;
    metric.addedTicketCount += added.length;
    metric.baselineInvestmentYen += baseline.length * STAKE;
    metric.shadowInvestmentYen += shadow.length * STAKE;
    metric.incrementalInvestmentYen += added.length * STAKE;
    if (added.length) metric.triggeredRaceCount += 1;

    if (baselineHit) {
      metric.baselineHitCount += 1;
      metric.baselineReturnYen += payout;
    }
    if (shadowHit) {
      metric.shadowHitCount += 1;
      metric.shadowReturnYen += payout;
    }
    if (!baselineHit && shadowHit) {
      metric.rescueCount += 1;
      metric.incrementalReturnYen += payout;
      metric.rescuePayouts.push({ raceKey: key, payoutYen: payout });
      if (payout >= 10000) metric.manboatRescueCount += 1;
    }
  }

  metric.baselineProfitYen = metric.baselineReturnYen - metric.baselineInvestmentYen;
  metric.shadowProfitYen = metric.shadowReturnYen - metric.shadowInvestmentYen;
  metric.incrementalProfitYen = metric.incrementalReturnYen - metric.incrementalInvestmentYen;
  metric.baselineRoiPercent = pct(metric.baselineReturnYen, metric.baselineInvestmentYen);
  metric.shadowRoiPercent = pct(metric.shadowReturnYen, metric.shadowInvestmentYen);
  metric.incrementalRoiPercent = pct(metric.incrementalReturnYen, metric.incrementalInvestmentYen);
  metric.baselineHitRatePercent = pct(metric.baselineHitCount, metric.raceCount);
  metric.shadowHitRatePercent = pct(metric.shadowHitCount, metric.raceCount);
  metric.hitRateDeltaPoints = Number((metric.shadowHitRatePercent - metric.baselineHitRatePercent).toFixed(1));
  metric.roiDeltaPoints = Number((metric.shadowRoiPercent - metric.baselineRoiPercent).toFixed(1));
  metric.profitDeltaYen = metric.shadowProfitYen - metric.baselineProfitYen;
  metric.averageBaselineTickets = metric.raceCount ? Number((metric.baselineTicketCount / metric.raceCount).toFixed(2)) : 0;
  metric.averageShadowTickets = metric.raceCount ? Number((metric.shadowTicketCount / metric.raceCount).toFixed(2)) : 0;
  metric.averageAddedTicketsPerTriggeredRace = metric.triggeredRaceCount
    ? Number((metric.addedTicketCount / metric.triggeredRaceCount).toFixed(2))
    : 0;
  return metric;
}

function publicMetric(metric) {
  const { rescuePayouts, ...publicFields } = metric;
  return publicFields;
}

function chronologicalFolds(records, payouts) {
  const sorted = records.slice().sort((left, right) => raceKey(left).localeCompare(raceKey(right)));
  const folds = Array.from({ length: FOLD_COUNT }, () => []);
  sorted.forEach((record, index) => {
    const foldIndex = Math.min(FOLD_COUNT - 1, Math.floor(index * FOLD_COUNT / Math.max(sorted.length, 1)));
    folds[foldIndex].push(record);
  });
  return folds.map((rows, index) => {
    const keys = rows.map(raceKey).filter(Boolean).sort();
    return {
      fold: index + 1,
      startRaceKey: keys[0] || '',
      endRaceKey: keys[keys.length - 1] || '',
      ...publicMetric(evaluate(rows, payouts))
    };
  });
}

function venueBreakdown(records, payouts) {
  const groups = new Map();
  for (const record of records) {
    const venue = keyParts(record).venue || 'unknown';
    if (!groups.has(venue)) groups.set(venue, []);
    groups.get(venue).push(record);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([venue, rows]) => ({ venue, ...publicMetric(evaluate(rows, payouts)) }));
}

function concentration(metric) {
  const rescues = metric.rescuePayouts.slice().sort((left, right) => right.payoutYen - left.payoutYen);
  const totalReturn = metric.incrementalReturnYen;
  const investment = metric.incrementalInvestmentYen;
  const sumTop = count => rescues.slice(0, count).reduce((sum, row) => sum + row.payoutYen, 0);
  const cappedReturn = cap => rescues.reduce((sum, row) => sum + Math.min(row.payoutYen, cap), 0);
  return {
    rescueCount: rescues.length,
    largestRescues: rescues.slice(0, 10),
    top1ReturnSharePercent: pct(sumTop(1), totalReturn),
    top3ReturnSharePercent: pct(sumTop(3), totalReturn),
    top5ReturnSharePercent: pct(sumTop(5), totalReturn),
    incrementalRoiWithoutTop1Percent: pct(Math.max(0, totalReturn - sumTop(1)), investment),
    incrementalRoiWithoutTop3Percent: pct(Math.max(0, totalReturn - sumTop(3)), investment),
    incrementalRoiWithoutTop5Percent: pct(Math.max(0, totalReturn - sumTop(5)), investment),
    incrementalRoiWith10000YenPayoutCapPercent: pct(cappedReturn(10000), investment),
    incrementalRoiWith20000YenPayoutCapPercent: pct(cappedReturn(20000), investment),
    medianRescuePayoutYen: median(rescues.map(row => row.payoutYen)),
    averageRescuePayoutYen: rescues.length ? Math.round(totalReturn / rescues.length) : 0
  };
}

function robustnessGate(overall, folds, venues, payoutConcentration) {
  const eligibleVenues = venues.filter(row => row.triggeredRaceCount >= 20);
  const criteria = {
    sampleSize: {
      threshold: 'addedTicketCount >= 1000',
      passed: overall.addedTicketCount >= 1000,
      value: overall.addedTicketCount
    },
    overallIncrementalRoi: {
      threshold: 'incrementalRoiPercent >= 110',
      passed: overall.incrementalRoiPercent >= 110,
      value: overall.incrementalRoiPercent
    },
    chronologicalBreadth: {
      threshold: 'at least 2 of 4 chronological folds have incremental ROI >= 100%',
      passed: folds.filter(row => row.incrementalRoiPercent >= 100).length >= 2,
      value: folds.filter(row => row.incrementalRoiPercent >= 100).length
    },
    noCollapsedFold: {
      threshold: 'all chronological folds have incremental ROI >= 50%',
      passed: folds.every(row => row.incrementalRoiPercent >= 50),
      value: folds.map(row => row.incrementalRoiPercent)
    },
    jackpotStress: {
      threshold: 'incremental ROI remains >= 90% after removing the largest rescue payout',
      passed: payoutConcentration.incrementalRoiWithoutTop1Percent >= 90,
      value: payoutConcentration.incrementalRoiWithoutTop1Percent
    },
    payoutConcentration: {
      threshold: 'largest rescue contributes <= 35% of incremental return',
      passed: payoutConcentration.top1ReturnSharePercent <= 35,
      value: payoutConcentration.top1ReturnSharePercent
    },
    venueCoverage: {
      threshold: 'at least 12 venues have 20 or more triggered races',
      passed: eligibleVenues.length >= 12,
      value: eligibleVenues.length
    }
  };
  const passedCount = Object.values(criteria).filter(item => item.passed).length;
  return {
    status: passedCount === Object.keys(criteria).length ? 'robustness-candidate' : 'forward-validation-required',
    passedCount,
    totalCriteria: Object.keys(criteria).length,
    automaticAdoption: false,
    criteria,
    venueSummary: {
      eligibleVenueCount: eligibleVenues.length,
      profitableIncrementalVenueCount: eligibleVenues.filter(row => row.incrementalRoiPercent >= 100).length,
      medianIncrementalRoiPercent: median(eligibleVenues.map(row => row.incrementalRoiPercent)),
      positiveProfitDeltaVenueCount: eligibleVenues.filter(row => row.profitDeltaYen > 0).length
    }
  };
}

function build() {
  const cohort = input.buildDefaultCohort({ root: ROOT });
  const payouts = payoutAudit.payoutMap();
  const overallRaw = evaluate(cohort.records, payouts);
  const folds = chronologicalFolds(cohort.records, payouts);
  const venues = venueBreakdown(cohort.records, payouts);
  const payoutConcentration = concentration(overallRaw);
  const overall = publicMetric(overallRaw);
  const gate = robustnessGate(overall, folds, venues, payoutConcentration);

  return {
    schemaVersion: 1,
    analysisId: 'counter-hole-pair-robustness-v1',
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    purpose: 'Stress-test the retrospective counter-hole-pair-9 result across chronological folds, venues, and payout-concentration scenarios before relying on forward shadow results.',
    methodology: {
      rule: RULE,
      baseline: 'first 7 saved pre-race candidates',
      shadow: 'baseline plus at most one counter-head and one hole-head candidate from saved ranks 8-12 with score >=85; maximum 9 tickets',
      chronologicalSplit: `${FOLD_COUNT} contiguous equal-count folds after sorting by race key`,
      venueEligibilityForSummary: '20 or more triggered races',
      stake: `${STAKE} yen flat per ticket`,
      selectionUsesOutcome: false,
      resultAndPayoutUse: 'evaluation and stress testing only',
      warning: 'Retrospective robustness audit only. Passing the manual gate does not authorize production adoption; frozen forward validation remains mandatory.'
    },
    diagnostics: cohort.diagnostics,
    overall,
    chronologicalFolds: folds,
    venueBreakdown: venues,
    payoutConcentration,
    robustnessGate: gate
  };
}

if (require.main === module) process.stdout.write(JSON.stringify(build(), null, 2) + '\n');
module.exports = { build, evaluate, chronologicalFolds, venueBreakdown, concentration, robustnessGate };
