'use strict';

const path = require('node:path');
const input = require('./analysis-input-contract');
const expansion = require('./analyze-ticket-expansion-7-12-18-24.cjs');
const payoutAudit = require('./analyze-ticket-expansion-payout-v2.cjs');
const portable = require('./analyze-counter-hole-portable-conditions-v1.cjs');

const ROOT = path.resolve(__dirname, '..');
const STAKE = 100;
const BASE_LIMIT = 7;

function pct(numerator, denominator) {
  return denominator ? Number((100 * numerator / denominator).toFixed(1)) : 0;
}

function isNonRough(row) {
  return row.actualWaterBand === 'calm' || row.actualWaterBand === 'moderate';
}

function isSignalNotWorse(row) {
  return (row.stEdge !== null && row.stEdge >= -0.01)
    || (row.exhibitionEdge !== null && row.exhibitionEdge >= -0.01);
}

function isStNearEqual(row) {
  return row.stEdge !== null && Math.abs(row.stEdge) < 0.01;
}

const RULES = [
  {
    id: 'all_pair',
    theory: 'Current counter-hole-pair-9: retain both strongest counter and strongest hole additions.',
    test: () => true
  },
  {
    id: 'inner_head_1_3',
    theory: 'Retain pair-rule additions only when the added head is boat 1-3.',
    test: row => row.candidateHead <= 3
  },
  {
    id: 'signal_not_worse',
    theory: 'Retain an added head when either saved exhibition ST or exhibition time is no more than 0.01 worse than the main head.',
    test: isSignalNotWorse
  },
  {
    id: 'st_near_equal',
    theory: 'Retain only when saved exhibition ST is within 0.01 of the main head.',
    test: isStNearEqual
  },
  {
    id: 'inner_or_st_tie',
    theory: 'Retain boats 1-3; allow boats 4-6 only when saved exhibition ST is nearly tied with the main head.',
    test: row => row.candidateHead <= 3 || isStNearEqual(row)
  },
  {
    id: 'inner_plus_outer_st_tie_nonrough',
    theory: 'Retain boats 1-3; allow an outer head only with a near-equal exhibition ST under calm/moderate observed water.',
    test: row => row.candidateHead <= 3
      || (row.candidateHead >= 4 && isStNearEqual(row) && isNonRough(row))
  },
  {
    id: 'inner_plus_outer_signal_nonrough',
    theory: 'Retain boats 1-3; allow an outer head only when ST/time is not worse under calm/moderate observed water.',
    test: row => row.candidateHead <= 3
      || (row.candidateHead >= 4 && isSignalNotWorse(row) && isNonRough(row))
  },
  {
    id: 'inner_and_nonrough',
    theory: 'Retain boats 1-3 only under calm/moderate observed water.',
    test: row => row.candidateHead <= 3 && isNonRough(row)
  },
  {
    id: 'inner_and_signal_not_worse',
    theory: 'Retain boats 1-3 only when ST/time is not worse than the main head.',
    test: row => row.candidateHead <= 3 && isSignalNotWorse(row)
  }
];

function baselineMetric(records, payouts) {
  const metric = {
    raceCount: 0,
    ticketCount: 0,
    hitCount: 0,
    investmentYen: 0,
    returnYen: 0,
    profitYen: 0,
    roiPercent: 0,
    hitRatePercent: 0,
    averageTicketCount: 0
  };

  for (const record of records) {
    const actual = input.actualTicket(record.__officialResult);
    if (!actual) continue;
    const raceKey = record.__analysisRaceKey || input.raceKey(record);
    const tickets = new Set(
      expansion.collectTicketPool(record)
        .slice(0, BASE_LIMIT)
        .map(item => item.ticket)
        .filter(Boolean)
    );
    if (!tickets.size) continue;
    metric.raceCount += 1;
    metric.ticketCount += tickets.size;
    if (tickets.has(actual)) {
      metric.hitCount += 1;
      metric.returnYen += payouts.get(raceKey) || 0;
    }
  }

  metric.investmentYen = metric.ticketCount * STAKE;
  metric.profitYen = metric.returnYen - metric.investmentYen;
  metric.roiPercent = pct(metric.returnYen, metric.investmentYen);
  metric.hitRatePercent = pct(metric.hitCount, metric.raceCount);
  metric.averageTicketCount = metric.raceCount
    ? Number((metric.ticketCount / metric.raceCount).toFixed(2))
    : 0;
  return metric;
}

function gateFor(incremental, allIncremental) {
  const rescueRetentionPercent = pct(incremental.rescueCount, allIncremental.rescueCount);
  const criteria = {
    sampleSize: {
      threshold: 'addedTicketCount >= 500',
      value: incremental.addedTicketCount,
      passed: incremental.addedTicketCount >= 500
    },
    rescueCount: {
      threshold: 'rescueCount >= 15',
      value: incremental.rescueCount,
      passed: incremental.rescueCount >= 15
    },
    venueBreadth: {
      threshold: 'distinctVenueCount >= 20',
      value: incremental.distinctVenueCount,
      passed: incremental.distinctVenueCount >= 20
    },
    chronologicalBreadth: {
      threshold: 'at least 3 of 4 folds have ROI >= 100%',
      value: incremental.profitableFoldCount,
      passed: incremental.profitableFoldCount >= 3
    },
    noSevereFoldCollapse: {
      threshold: 'minimum fold ROI >= 75%',
      value: incremental.minimumFoldRoiPercent,
      passed: incremental.minimumFoldRoiPercent >= 75
    },
    incrementalRoi: {
      threshold: 'incremental ROI >= 120%',
      value: incremental.roiPercent,
      passed: incremental.roiPercent >= 120
    },
    payoutConcentration: {
      threshold: 'largest rescue <= 40% of incremental return',
      value: incremental.top1ReturnSharePercent,
      passed: incremental.top1ReturnSharePercent <= 40
    },
    rescueRetention: {
      threshold: 'retain >= 60% of pair-rule rescues',
      value: rescueRetentionPercent,
      passed: rescueRetentionPercent >= 60
    }
  };
  const passedCount = Object.values(criteria).filter(item => item.passed).length;
  return {
    status: passedCount === Object.keys(criteria).length ? 'robustness-candidate' : 'research-only',
    passedCount,
    totalCriteria: Object.keys(criteria).length,
    rescueRetentionPercent,
    automaticAdoption: false,
    criteria
  };
}

function evaluateRule(rule, allRows, baseline, allIncremental) {
  const rows = allRows.filter(rule.test);
  const incremental = portable.summarizeRows(rows);
  const total = {
    raceCount: baseline.raceCount,
    ticketCount: baseline.ticketCount + incremental.addedTicketCount,
    hitCount: baseline.hitCount + incremental.rescueCount,
    investmentYen: baseline.investmentYen + incremental.investmentYen,
    returnYen: baseline.returnYen + incremental.returnYen
  };
  total.profitYen = total.returnYen - total.investmentYen;
  total.roiPercent = pct(total.returnYen, total.investmentYen);
  total.hitRatePercent = pct(total.hitCount, total.raceCount);
  total.averageTicketCount = total.raceCount
    ? Number((total.ticketCount / total.raceCount).toFixed(2))
    : 0;

  return {
    id: rule.id,
    theory: rule.theory,
    total,
    incremental,
    retention: {
      addedTicketPercent: pct(incremental.addedTicketCount, allIncremental.addedTicketCount),
      rescuePercent: pct(incremental.rescueCount, allIncremental.rescueCount),
      manboatPercent: pct(incremental.manboatRescueCount, allIncremental.manboatRescueCount)
    },
    deltaVsBaseline: {
      hitCount: incremental.rescueCount,
      hitRatePoints: Number((total.hitRatePercent - baseline.hitRatePercent).toFixed(1)),
      roiPoints: Number((total.roiPercent - baseline.roiPercent).toFixed(1)),
      profitYen: total.profitYen - baseline.profitYen,
      averageTicketCount: Number((total.averageTicketCount - baseline.averageTicketCount).toFixed(2))
    },
    gate: gateFor(incremental, allIncremental)
  };
}

function build() {
  const cohort = input.buildDefaultCohort({ root: ROOT });
  const payouts = payoutAudit.payoutMap();
  const portableAudit = portable.build();
  const allRows = portableAudit.rows;
  const baseline = baselineMetric(cohort.records, payouts);
  const allIncremental = portable.summarizeRows(allRows);
  const results = RULES.map(rule => evaluateRule(rule, allRows, baseline, allIncremental));
  const ranking = results.slice().sort((left, right) =>
    right.gate.passedCount - left.gate.passedCount
      || right.total.profitYen - left.total.profitYen
      || right.total.roiPercent - left.total.roiPercent
  ).map(result => ({
    id: result.id,
    gateStatus: result.gate.status,
    passedCriteria: `${result.gate.passedCount}/${result.gate.totalCriteria}`,
    totalHitRatePercent: result.total.hitRatePercent,
    totalRoiPercent: result.total.roiPercent,
    averageTicketCount: result.total.averageTicketCount,
    rescueCount: result.incremental.rescueCount,
    manboatRescueCount: result.incremental.manboatRescueCount,
    incrementalRoiPercent: result.incremental.roiPercent,
    incrementalProfitYen: result.incremental.profitYen,
    minimumFoldRoiPercent: result.incremental.minimumFoldRoiPercent,
    profitableFoldCount: result.incremental.profitableFoldCount,
    rescueRetentionPercent: result.retention.rescuePercent
  }));

  return {
    schemaVersion: 1,
    analysisId: 'portable-formation-variants-v1',
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    purpose: 'Compare a small, pre-specified family of portable counter/hole allocation rules before freezing a challenger against counter-hole-pair-9.',
    methodology: {
      cohort: 'official pre-deadline predictions joined to official settled results',
      baseline: 'first 7 saved candidates',
      candidateSurface: 'only the at-most-two additions selected by counter-hole-pair-9; each challenger can only remove additions, never invent or reorder them',
      portableSignals: 'added-head boat number, observed pre-deadline wind/wave class, saved exhibition ST, and saved exhibition time',
      selectionUsesOutcome: false,
      resultAndPayoutUse: 'evaluation only',
      stake: `${STAKE} yen per ticket`,
      warning: 'Retrospective challenger comparison only. Any winner requires a new frozen forward shadow; no automatic adoption.'
    },
    diagnostics: cohort.diagnostics,
    sourceCoverage: portableAudit.coverage,
    baseline,
    ranking,
    results
  };
}

if (require.main === module) process.stdout.write(`${JSON.stringify(build(), null, 2)}\n`);
module.exports = { build, RULES, isNonRough, isSignalNotWorse, isStNearEqual };
