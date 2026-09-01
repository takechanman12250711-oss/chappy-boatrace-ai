'use strict';

const path = require('node:path');
const input = require('./analysis-input-contract');
const expansion = require('./analyze-ticket-expansion-7-12-18-24.cjs');
const payoutAudit = require('./analyze-ticket-expansion-payout-v2.cjs');
const variable = require('./analyze-variable-formation-v1.cjs');
const marginal = require('./analyze-formation-marginal-roi-v1.cjs');

const ROOT = path.resolve(__dirname, '..');
const STAKE = 100;
const BASE_LIMIT = 7;
const POOL_LIMIT = 24;

function parts(ticket) {
  return String(ticket || '').split('-').map(Number);
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pct(numerator, denominator) {
  return denominator ? Number((100 * numerator / denominator).toFixed(1)) : 0;
}

function ticketPool(record) {
  return expansion.collectTicketPool(record).slice(0, POOL_LIMIT);
}

function baseline(record) {
  return ticketPool(record).slice(0, BASE_LIMIT);
}

function rankedExtras(record) {
  const pool = ticketPool(record);
  const roles = marginal.headRoles(pool);
  return {
    pool,
    roles,
    extras: pool.slice(BASE_LIMIT).map((item, offset) => {
      const head = parts(item.ticket)[0];
      return {
        ...item,
        head,
        role: roles.map.get(head) || 'hole',
        poolRank: BASE_LIMIT + offset + 1
      };
    })
  };
}

function uniqueBase(record) {
  const selected = [];
  const seen = new Set();
  for (const item of baseline(record)) {
    if (!item?.ticket || seen.has(item.ticket)) continue;
    selected.push(item);
    seen.add(item.ticket);
  }
  return { selected, seen };
}

function appendCandidates(record, candidates, limit) {
  const { selected, seen } = uniqueBase(record);
  for (const item of candidates) {
    if (selected.length >= limit) break;
    if (!item?.ticket || seen.has(item.ticket)) continue;
    selected.push(item);
    seen.add(item.ticket);
  }
  return selected;
}

function scoreRankSort(left, right) {
  return number(right.score) - number(left.score)
    || left.poolRank - right.poolRank
    || String(left.ticket).localeCompare(String(right.ticket));
}

function roleScoreSort(left, right) {
  const priority = { counter: 0, hole: 1, main: 2 };
  return (priority[left.role] ?? 9) - (priority[right.role] ?? 9)
    || scoreRankSort(left, right);
}

function adaptiveLimit(candidates) {
  if (!candidates.length) return 7;
  const topScore = Math.max(...candidates.map(item => number(item.score)));
  const distinctHeads = new Set(candidates.map(item => item.head)).size;
  return topScore >= 95 || distinctHeads >= 2 ? 12 : 9;
}

function select(record, rule) {
  if (rule === 'baseline7') return baseline(record);
  if (rule === 'dynamic-score-7-9-12') {
    return variable.select(record, 'dynamic-score-7-9-12').selected;
  }

  const { extras } = rankedExtras(record);
  const early = extras.filter(item => item.poolRank <= 12);

  if (rule === 'counter-only-9') {
    const candidates = early
      .filter(item => item.role === 'counter' && number(item.score) >= 85)
      .sort(scoreRankSort);
    return appendCandidates(record, candidates, 9);
  }

  if (rule === 'counter-hole-score-9') {
    const candidates = early
      .filter(item => ['counter', 'hole'].includes(item.role) && number(item.score) >= 85)
      .sort(roleScoreSort);
    return appendCandidates(record, candidates, 9);
  }

  if (rule === 'counter-hole-pair-9') {
    const counter = early
      .filter(item => item.role === 'counter' && number(item.score) >= 85)
      .sort(scoreRankSort)[0];
    const hole = early
      .filter(item => item.role === 'hole' && number(item.score) >= 85)
      .sort(scoreRankSort)[0];
    const candidates = [counter, hole].filter(Boolean).sort(scoreRankSort);
    return appendCandidates(record, candidates, 9);
  }

  if (rule === 'nonmain-score-7-9-12') {
    const candidates = early
      .filter(item => item.role !== 'main' && number(item.score) >= 85)
      .sort(roleScoreSort);
    return appendCandidates(record, candidates, adaptiveLimit(candidates));
  }

  if (rule === 'new-head-structured-7-9-12') {
    const baseHeads = new Set(baseline(record).map(item => parts(item.ticket)[0]));
    const candidates = extras
      .filter(item => !baseHeads.has(item.head))
      .filter(item => [1, 2, 3].includes(item.head))
      .filter(item => number(item.score) >= 85)
      .sort(roleScoreSort);
    return appendCandidates(record, candidates, adaptiveLimit(candidates));
  }

  throw new Error(`Unknown rule: ${rule}`);
}

function emptyMetric() {
  return {
    raceCount: 0,
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

function evaluate(records, rule, payouts) {
  const metric = emptyMetric();

  for (const record of records) {
    const actual = input.actualTicket(record.__officialResult);
    if (!actual) continue;
    const raceKey = record.__analysisRaceKey || input.raceKey(record);
    const payout = payouts.get(raceKey) || 0;
    const pool = ticketPool(record);
    const base = pool.slice(0, BASE_LIMIT);
    const baseSet = new Set(base.map(item => item.ticket));
    const selected = select(record, rule);
    const selectedSet = new Set(selected.map(item => item.ticket));
    const added = [...selectedSet].filter(ticket => !baseSet.has(ticket));
    const roles = marginal.headRoles(pool);

    metric.raceCount += 1;
    metric.ticketCount += selectedSet.size;
    metric.investmentYen += selectedSet.size * STAKE;
    metric.addedTicketCount += added.length;
    metric.incrementalInvestmentYen += added.length * STAKE;
    metric.selectedCountDistribution[selectedSet.size] = (metric.selectedCountDistribution[selectedSet.size] || 0) + 1;
    if (added.length) metric.triggeredRaceCount += 1;

    const hit = selectedSet.has(actual);
    if (hit) {
      metric.hitCount += 1;
      metric.returnYen += payout;
    }

    if (!baseSet.has(actual) && hit) {
      metric.rescueCount += 1;
      metric.incrementalReturnYen += payout;
      if (payout >= 10000) metric.manboatRescueCount += 1;
      const actualHead = parts(actual)[0];
      const role = roles.map.get(actualHead) || 'hole';
      metric.rescueByRole[role] += 1;
    }
  }

  metric.averageTicketCount = metric.raceCount
    ? Number((metric.ticketCount / metric.raceCount).toFixed(2))
    : 0;
  metric.hitRatePercent = pct(metric.hitCount, metric.raceCount);
  metric.profitYen = metric.returnYen - metric.investmentYen;
  metric.roiPercent = pct(metric.returnYen, metric.investmentYen);
  metric.averageAddedTicketsPerTriggeredRace = metric.triggeredRaceCount
    ? Number((metric.addedTicketCount / metric.triggeredRaceCount).toFixed(2))
    : 0;
  metric.incrementalProfitYen = metric.incrementalReturnYen - metric.incrementalInvestmentYen;
  metric.incrementalRoiPercent = pct(metric.incrementalReturnYen, metric.incrementalInvestmentYen);
  return metric;
}

function build() {
  const cohort = input.buildDefaultCohort({ root: ROOT });
  const payouts = payoutAudit.payoutMap();
  const rules = [
    'baseline7',
    'dynamic-score-7-9-12',
    'counter-only-9',
    'counter-hole-score-9',
    'counter-hole-pair-9',
    'nonmain-score-7-9-12',
    'new-head-structured-7-9-12'
  ];
  const results = Object.fromEntries(rules.map(rule => [rule, evaluate(cohort.records, rule, payouts)]));
  const baselineMetric = results.baseline7;

  for (const [rule, metric] of Object.entries(results)) {
    if (rule === 'baseline7') continue;
    metric.deltaVs7 = {
      hitCount: metric.hitCount - baselineMetric.hitCount,
      hitRatePoints: Number((metric.hitRatePercent - baselineMetric.hitRatePercent).toFixed(1)),
      roiPoints: Number((metric.roiPercent - baselineMetric.roiPercent).toFixed(1)),
      profitYen: metric.profitYen - baselineMetric.profitYen,
      averageTicketCount: Number((metric.averageTicketCount - baselineMetric.averageTicketCount).toFixed(2))
    };
  }

  const ranking = Object.entries(results)
    .filter(([rule]) => rule !== 'baseline7')
    .sort((left, right) => right[1].roiPercent - left[1].roiPercent || right[1].hitCount - left[1].hitCount)
    .map(([rule, metric]) => ({
      rule,
      hitRatePercent: metric.hitRatePercent,
      roiPercent: metric.roiPercent,
      averageTicketCount: metric.averageTicketCount,
      rescueCount: metric.rescueCount,
      incrementalRoiPercent: metric.incrementalRoiPercent,
      profitDeltaVs7Yen: metric.deltaVs7.profitYen
    }));

  return {
    schemaVersion: 1,
    analysisId: 'structured-formation-backtest-v1',
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    purpose: 'Compare the prior dynamic 7-9-12 rule with counter-first and counter-plus-hole allocation structures using only saved pre-race candidate rank, score, head and stable scenario role.',
    methodology: {
      cohort: 'official pre-deadline predictions joined to official settled results',
      baseline: 'first 7 saved candidates',
      roleDefinition: 'main = first distinct head in saved candidate order; counter = second distinct head; hole = third or later distinct head',
      selectionUsesOutcome: false,
      resultAndPayoutUse: 'evaluation only',
      stake: `${STAKE} yen flat per selected ticket`,
      warning: 'Retrospective structure comparison only. Any winning rule must be frozen before forward validation.'
    },
    diagnostics: cohort.diagnostics,
    results,
    ranking
  };
}

if (require.main === module) process.stdout.write(JSON.stringify(build(), null, 2) + '\n');
module.exports = { build, select, rankedExtras, adaptiveLimit };
