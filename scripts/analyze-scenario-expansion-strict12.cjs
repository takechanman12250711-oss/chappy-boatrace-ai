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

function selectScenarioStrict12(record) {
  const pool = base.collectTicketPool(record).slice(0, 24);
  const selected = pool.slice(0, 7);
  const seen = new Set(selected.map(item => item.ticket));
  const heads = new Map();
  for (const item of selected) heads.set(item.head, (heads.get(item.head) || 0) + 1);

  const extras = [];
  for (let index = 7; index < pool.length; index += 1) {
    const item = pool[index];
    const score = num(item.score);
    const newHead = !(heads.get(item.head) > 0);
    const support = isSupportScenario(item.scenario);
    const eligible = (newHead && score >= 85) || (support && score >= 90);
    if (!eligible) continue;
    const rank = (newHead ? 3 : 0) + (support ? 1 : 0) + score / 1000;
    extras.push({ item, index, rank });
  }

  extras.sort((a, b) => b.rank - a.rank || a.index - b.index || a.item.ticket.localeCompare(b.item.ticket));
  for (const entry of extras) {
    if (selected.length >= LIMIT) break;
    const item = entry.item;
    if (seen.has(item.ticket)) continue;
    selected.push(item);
    seen.add(item.ticket);
    heads.set(item.head, (heads.get(item.head) || 0) + 1);
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

function build() {
  const cohort = input.buildDefaultCohort({ root: ROOT });
  const payouts = payout.payoutMap();
  const baseline = metric(cohort.records, record => base.collectTicketPool(record).slice(0, 7), payouts);
  const scenarioStrict12 = metric(cohort.records, selectScenarioStrict12, payouts);
  return {
    schemaVersion: 1,
    analysisId: 'scenario-expansion-strict12-v1',
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    purpose: 'Exploratory retrospective test of scenario-aware variable expansion instead of blind 7→12 point widening.',
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
    caveat: 'Retrospective exploratory evidence only. Any production adoption requires a preregistered prospective shadow validation.'
  };
}

if (require.main === module) process.stdout.write(JSON.stringify(build(), null, 2) + '\n');
module.exports = { build, selectScenarioStrict12 };
