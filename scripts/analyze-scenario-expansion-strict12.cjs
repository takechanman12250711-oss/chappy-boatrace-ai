'use strict';

const path = require('node:path');
const input = require('./analysis-input-contract');
const base = require('./analyze-ticket-expansion-7-12-18-24.cjs');
const payout = require('./analyze-ticket-expansion-payout-v2.cjs');

const ROOT = path.resolve(__dirname, '..');
const STAKE = 100;
const LIMIT = 12;

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isSupportScenario(text) {
  const s = String(text || '');
  return s.includes('残し') || s.includes('拾');
}

function candidateEligibility(item, baselineHeads) {
  const score = num(item.score);
  const newHead = !(baselineHeads.get(item.head) > 0);
  const support = isSupportScenario(item.scenario);
  const eligible = (newHead && score >= 85) || (support && score >= 90);
  let reason = 'none';
  if (newHead && score >= 85 && support && score >= 90) reason = 'new-head+support';
  else if (newHead && score >= 85) reason = 'new-head';
  else if (support && score >= 90) reason = 'support';
  return { eligible, reason, newHead, support, score };
}

function selectScenarioStrict12Detailed(record) {
  const pool = base.collectTicketPool(record).slice(0, 24);
  const selected = pool.slice(0, 7).map((item, index) => ({ ...item, __selectionReason: 'baseline', __poolRank: index + 1 }));
  const seen = new Set(selected.map(item => item.ticket));
  const heads = new Map();
  for (const item of selected) heads.set(item.head, (heads.get(item.head) || 0) + 1);
  const baselineHeads = new Map(heads);

  const extras = [];
  for (let index = 7; index < pool.length; index += 1) {
    const item = pool[index];
    const eligibility = candidateEligibility(item, baselineHeads);
    if (!eligibility.eligible) continue;
    const rank = (eligibility.newHead ? 3 : 0) + (eligibility.support ? 1 : 0) + eligibility.score / 1000;
    extras.push({ item, index, rank, ...eligibility });
  }

  extras.sort((a, b) => b.rank - a.rank || a.index - b.index || a.item.ticket.localeCompare(b.item.ticket));
  for (const entry of extras) {
    if (selected.length >= LIMIT) break;
    const item = entry.item;
    if (seen.has(item.ticket)) continue;
    selected.push({ ...item, __selectionReason: entry.reason, __poolRank: entry.index + 1 });
    seen.add(item.ticket);
    heads.set(item.head, (heads.get(item.head) || 0) + 1);
  }
  return { selected, pool, baselineCount: Math.min(7, pool.length) };
}

function selectScenarioStrict12(record) {
  return selectScenarioStrict12Detailed(record).selected;
}

function metric(rows, selector, payouts) {
  let hitCount = 0;
  let investmentYen = 0;
  let returnYen = 0;
  let totalTickets = 0;
  for (const record of rows) {
    const actual = input.actualTicket(record.__officialResult);
    const selected = selector(record);
    const count = selected.length;
    totalTickets += count;
    investmentYen += count * STAKE;
    const hit = selected.some(item => item.ticket === actual);
    if (hit) {
      hitCount += 1;
      returnYen += payouts.get(record.__analysisRaceKey || input.raceKey(record)) || 0;
    }
  }
  const raceCount = rows.length;
  return {
    raceCount,
    hitCount,
    hitRatePercent: raceCount ? Number((100 * hitCount / raceCount).toFixed(1)) : 0,
    averageTicketCount: raceCount ? Number((totalTickets / raceCount).toFixed(2)) : 0,
    investmentYen,
    returnYen,
    profitYen: returnYen - investmentYen,
    roiPercent: investmentYen ? Number((100 * returnYen / investmentYen).toFixed(1)) : 0
  };
}

function inc(obj, key, amount = 1) {
  obj[key] = (obj[key] || 0) + amount;
}

function payoutBand(yen) {
  if (yen >= 10000) return '10000+';
  if (yen >= 5000) return '5000-9990';
  if (yen >= 3000) return '3000-4990';
  if (yen >= 1000) return '1000-2990';
  return '0-990';
}

function rescueBreakdown(rows, payouts) {
  const out = {
    rescueCount: 0,
    rescueReturnYen: 0,
    byReason: {},
    byHeadBoat: {},
    byPoolRank: {},
    byPayoutBand: {},
    bySource: {},
    addedTicketCountByReason: {},
    addedTicketCountTotal: 0,
    racesWithAnyAddition: 0,
    details: []
  };

  for (const record of rows) {
    const actual = input.actualTicket(record.__officialResult);
    const raceKey = record.__analysisRaceKey || input.raceKey(record);
    const { selected, baselineCount } = selectScenarioStrict12Detailed(record);
    const baseline = selected.slice(0, baselineCount);
    const extras = selected.slice(baselineCount);
    if (extras.length) out.racesWithAnyAddition += 1;
    for (const item of extras) {
      out.addedTicketCountTotal += 1;
      inc(out.addedTicketCountByReason, item.__selectionReason);
    }

    const baselineHit = baseline.some(item => item.ticket === actual);
    if (baselineHit) continue;
    const rescue = extras.find(item => item.ticket === actual);
    if (!rescue) continue;

    const payoutYen = payouts.get(raceKey) || 0;
    out.rescueCount += 1;
    out.rescueReturnYen += payoutYen;
    inc(out.byReason, rescue.__selectionReason);
    inc(out.byHeadBoat, String(rescue.head));
    inc(out.byPoolRank, String(rescue.__poolRank));
    inc(out.byPayoutBand, payoutBand(payoutYen));
    inc(out.bySource, rescue.source || 'unknown');
    out.details.push({
      raceKey,
      actual,
      payoutYen,
      head: rescue.head,
      score: rescue.score,
      scenario: rescue.scenario,
      source: rescue.source,
      poolRank: rescue.__poolRank,
      selectionReason: rescue.__selectionReason,
      selectedTicketCount: selected.length
    });
  }

  out.rescueReturnYen = Math.round(out.rescueReturnYen);
  out.details.sort((a, b) => b.payoutYen - a.payoutYen || a.raceKey.localeCompare(b.raceKey));
  return out;
}

function build() {
  const cohort = input.buildDefaultCohort({ root: ROOT });
  const payouts = payout.payoutMap();
  const baseline = metric(cohort.records, record => base.collectTicketPool(record).slice(0, 7), payouts);
  const scenarioStrict12 = metric(cohort.records, selectScenarioStrict12, payouts);
  const rescued = rescueBreakdown(cohort.records, payouts);
  return {
    schemaVersion: 2,
    analysisId: 'scenario-expansion-strict12-v2',
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    purpose: 'Exploratory retrospective test of scenario-aware variable expansion instead of blind 7→12 point widening, with rescue attribution.',
    rule: {
      baseline: 'first 7 saved pre-race candidates in the existing stable ordering',
      maxTickets: LIMIT,
      addIf: [
        'candidate introduces a head boat not present in the baseline 7 and saved pre-race score >= 85',
        'or scenario text contains 残し/拾い and saved pre-race score >= 90'
      ],
      ordering: 'new-head priority + support-scenario priority + saved pre-race score; no result or payout used for selection',
      stake: `${STAKE} yen flat per selected trifecta ticket`
    },
    diagnostics: cohort.diagnostics,
    baseline7: baseline,
    scenarioStrict12,
    delta: {
      hitCount: scenarioStrict12.hitCount - baseline.hitCount,
      hitRatePoints: Number((scenarioStrict12.hitRatePercent - baseline.hitRatePercent).toFixed(1)),
      averageTicketCount: Number((scenarioStrict12.averageTicketCount - baseline.averageTicketCount).toFixed(2)),
      investmentYen: scenarioStrict12.investmentYen - baseline.investmentYen,
      returnYen: scenarioStrict12.returnYen - baseline.returnYen,
      profitYen: scenarioStrict12.profitYen - baseline.profitYen,
      roiPoints: Number((scenarioStrict12.roiPercent - baseline.roiPercent).toFixed(1))
    },
    rescueBreakdown: rescued,
    caveat: 'Retrospective exploratory evidence only. Any production adoption requires a preregistered prospective shadow validation.'
  };
}

if (require.main === module) process.stdout.write(JSON.stringify(build(), null, 2) + '\n');
module.exports = { build, selectScenarioStrict12, selectScenarioStrict12Detailed, rescueBreakdown };
