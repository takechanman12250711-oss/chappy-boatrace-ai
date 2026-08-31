'use strict';

const path = require('node:path');
const input = require('./analysis-input-contract');
const base = require('./analyze-ticket-expansion-7-12-18-24.cjs');
const payout = require('./analyze-ticket-expansion-payout-v2.cjs');

const ROOT = path.resolve(__dirname, '..');
const STAKE = 100;
const BASE_LIMIT = 7;
const MAX_LIMIT = 12;

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pct(a, b) {
  return b ? Number((100 * a / b).toFixed(1)) : 0;
}

function strategyId(strategy) {
  return [
    `score${strategy.minScore}`,
    `rank${strategy.maxPoolRank || 'any'}`,
    `heads${strategy.allowedHeads.join('')}`,
    `max${strategy.maxTickets}`
  ].join('-');
}

function baselineSelection(record) {
  return base.collectTicketPool(record).slice(0, BASE_LIMIT);
}

function newHeadCandidates(record) {
  const pool = base.collectTicketPool(record).slice(0, 24);
  const baseline = pool.slice(0, BASE_LIMIT);
  const baselineHeads = new Set(baseline.map(item => item.head));
  return pool.slice(BASE_LIMIT).map((item, offset) => ({
    ...item,
    poolRank: BASE_LIMIT + offset + 1
  })).filter(item => !baselineHeads.has(item.head));
}

function selectStrategy(record, strategy) {
  const baseline = baselineSelection(record);
  const seen = new Set(baseline.map(item => item.ticket));
  const extras = newHeadCandidates(record)
    .filter(item => num(item.score) >= strategy.minScore)
    .filter(item => !strategy.maxPoolRank || item.poolRank <= strategy.maxPoolRank)
    .filter(item => strategy.allowedHeads.includes(item.head))
    .sort((a, b) => num(b.score) - num(a.score) || a.poolRank - b.poolRank || a.ticket.localeCompare(b.ticket));

  const selected = [...baseline];
  for (const item of extras) {
    if (selected.length >= strategy.maxTickets) break;
    if (seen.has(item.ticket)) continue;
    selected.push(item);
    seen.add(item.ticket);
  }
  return selected;
}

function metric(rows, selector, payouts) {
  let hitCount = 0;
  let investmentYen = 0;
  let returnYen = 0;
  let totalTickets = 0;
  for (const record of rows) {
    const actual = input.actualTicket(record.__officialResult);
    if (!actual) continue;
    const selected = selector(record);
    totalTickets += selected.length;
    investmentYen += selected.length * STAKE;
    if (selected.some(item => item.ticket === actual)) {
      hitCount += 1;
      returnYen += payouts.get(record.__analysisRaceKey || input.raceKey(record)) || 0;
    }
  }
  const raceCount = rows.length;
  return {
    raceCount,
    hitCount,
    hitRatePercent: pct(hitCount, raceCount),
    averageTicketCount: raceCount ? Number((totalTickets / raceCount).toFixed(2)) : 0,
    investmentYen,
    returnYen,
    profitYen: returnYen - investmentYen,
    roiPercent: pct(returnYen, investmentYen)
  };
}

function addedEfficiency(rows, strategy, payouts) {
  const byHead = Object.fromEntries([1,2,3,4,5,6].map(head => [head, { addedTicketCount: 0, rescueCount: 0, investmentYen: 0, returnYen: 0 }]));
  const byScoreBand = {};
  const byRankBand = {};
  let addedTicketCount = 0;
  let rescueCount = 0;
  let returnYen = 0;

  const scoreBand = score => score >= 98 ? '98-100' : score >= 95 ? '95-97' : score >= 92 ? '92-94' : score >= 90 ? '90-91' : score >= 85 ? '85-89' : '<85';
  const rankBand = rank => rank <= 10 ? '8-10' : rank <= 12 ? '11-12' : rank <= 14 ? '13-14' : rank <= 16 ? '15-16' : '17-24';

  for (const record of rows) {
    const actual = input.actualTicket(record.__officialResult);
    if (!actual) continue;
    const baseSelected = baselineSelection(record);
    const baseSet = new Set(baseSelected.map(item => item.ticket));
    const selected = selectStrategy(record, strategy);
    const extras = selected.filter(item => !baseSet.has(item.ticket));
    const racePayout = payouts.get(record.__analysisRaceKey || input.raceKey(record)) || 0;

    for (const item of extras) {
      addedTicketCount += 1;
      const headRow = byHead[item.head];
      headRow.addedTicketCount += 1;
      headRow.investmentYen += STAKE;

      const sb = scoreBand(num(item.score));
      if (!byScoreBand[sb]) byScoreBand[sb] = { addedTicketCount: 0, rescueCount: 0, investmentYen: 0, returnYen: 0 };
      byScoreBand[sb].addedTicketCount += 1;
      byScoreBand[sb].investmentYen += STAKE;

      const original = newHeadCandidates(record).find(candidate => candidate.ticket === item.ticket);
      const rb = rankBand(original?.poolRank || 24);
      if (!byRankBand[rb]) byRankBand[rb] = { addedTicketCount: 0, rescueCount: 0, investmentYen: 0, returnYen: 0 };
      byRankBand[rb].addedTicketCount += 1;
      byRankBand[rb].investmentYen += STAKE;

      if (item.ticket === actual && !baseSet.has(actual)) {
        rescueCount += 1;
        returnYen += racePayout;
        headRow.rescueCount += 1;
        headRow.returnYen += racePayout;
        byScoreBand[sb].rescueCount += 1;
        byScoreBand[sb].returnYen += racePayout;
        byRankBand[rb].rescueCount += 1;
        byRankBand[rb].returnYen += racePayout;
      }
    }
  }

  const finalize = obj => Object.fromEntries(Object.entries(obj).map(([key, row]) => [key, {
    ...row,
    profitYen: row.returnYen - row.investmentYen,
    roiPercent: pct(row.returnYen, row.investmentYen),
    rescuePer1000Tickets: row.addedTicketCount ? Number((1000 * row.rescueCount / row.addedTicketCount).toFixed(2)) : 0
  }]));

  const investmentYen = addedTicketCount * STAKE;
  return {
    addedTicketCount,
    rescueCount,
    investmentYen,
    returnYen,
    profitYen: returnYen - investmentYen,
    roiPercent: pct(returnYen, investmentYen),
    rescuePer1000Tickets: addedTicketCount ? Number((1000 * rescueCount / addedTicketCount).toFixed(2)) : 0,
    byHead: finalize(byHead),
    byScoreBand: finalize(byScoreBand),
    byRankBand: finalize(byRankBand)
  };
}

function buildStrategies() {
  const allHeads = [1,2,3,4,5,6];
  const strategies = [];
  for (const minScore of [85, 88, 90, 92, 95, 98]) {
    strategies.push({ minScore, maxPoolRank: 24, allowedHeads: allHeads, maxTickets: 12 });
  }
  for (const maxPoolRank of [10, 12, 14, 16]) {
    strategies.push({ minScore: 85, maxPoolRank, allowedHeads: allHeads, maxTickets: 12 });
  }
  strategies.push({ minScore: 85, maxPoolRank: 24, allowedHeads: [1,2,3], maxTickets: 12 });
  strategies.push({ minScore: 85, maxPoolRank: 24, allowedHeads: [2,3,4,5,6], maxTickets: 12 });
  strategies.push({ minScore: 85, maxPoolRank: 24, allowedHeads: [1], maxTickets: 12 });
  strategies.push({ minScore: 85, maxPoolRank: 24, allowedHeads: [2,3], maxTickets: 12 });
  strategies.push({ minScore: 85, maxPoolRank: 24, allowedHeads: [4,5,6], maxTickets: 12 });
  for (const maxTickets of [8,9,10,11]) {
    strategies.push({ minScore: 85, maxPoolRank: 24, allowedHeads: allHeads, maxTickets });
  }
  return strategies;
}

function build() {
  const cohort = input.buildDefaultCohort({ root: ROOT });
  const payouts = payout.payoutMap();
  const baseline = metric(cohort.records, baselineSelection, payouts);
  const strategies = buildStrategies().map(strategy => {
    const result = metric(cohort.records, record => selectStrategy(record, strategy), payouts);
    const efficiency = addedEfficiency(cohort.records, strategy, payouts);
    return {
      id: strategyId(strategy),
      rule: strategy,
      ...result,
      deltaVsBaseline: {
        hitCount: result.hitCount - baseline.hitCount,
        hitRatePoints: Number((result.hitRatePercent - baseline.hitRatePercent).toFixed(1)),
        averageTicketCount: Number((result.averageTicketCount - baseline.averageTicketCount).toFixed(2)),
        investmentYen: result.investmentYen - baseline.investmentYen,
        returnYen: result.returnYen - baseline.returnYen,
        profitYen: result.profitYen - baseline.profitYen,
        roiPoints: Number((result.roiPercent - baseline.roiPercent).toFixed(1))
      },
      addedEfficiency: efficiency
    };
  });

  strategies.sort((a, b) => b.roiPercent - a.roiPercent || b.hitRatePercent - a.hitRatePercent || a.averageTicketCount - b.averageTicketCount);

  const reference = strategies.find(row => row.id === 'score85-rank24-heads123456-max12');
  return {
    schemaVersion: 1,
    analysisId: 'new-head-efficiency-audit-v1',
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    purpose: 'Measure which pre-race new-head restoration conditions retain rescue value with less ticket waste than broad strict12 expansion.',
    methodology: {
      cohort: 'official pre-deadline predictions joined to official settled results',
      baseline: 'first 7 saved pre-race candidates in stable production-first ordering',
      candidateDefinition: 'tickets ranked 8-24 whose head boat is absent from baseline 7',
      selectionInputs: 'saved pre-race score, saved pool rank and head boat only',
      evaluationOnly: 'official finish and trifecta payout',
      stake: `${STAKE} yen flat per trifecta ticket`,
      warning: 'Exploratory retrospective strategy sweep. Do not choose a production rule from the best historical row without preregistered prospective shadow validation.'
    },
    diagnostics: cohort.diagnostics,
    baseline7: baseline,
    strictNewHead85Reference: reference,
    strategies,
    caveat: 'This audit is for hypothesis generation only; historical tuning can overfit.'
  };
}

if (require.main === module) process.stdout.write(JSON.stringify(build(), null, 2) + '\n');
module.exports = { build, selectStrategy, newHeadCandidates };
