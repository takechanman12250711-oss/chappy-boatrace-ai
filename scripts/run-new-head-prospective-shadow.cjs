'use strict';

const path = require('node:path');
const input = require('./analysis-input-contract');
const base = require('./analyze-ticket-expansion-7-12-18-24.cjs');
const payout = require('./analyze-ticket-expansion-payout-v2.cjs');
const newHead = require('./analyze-new-head-efficiency.cjs');

const ROOT = path.resolve(__dirname, '..');
const STAKE = 100;
const BASE_LIMIT = 7;
const FREEZE_DATE = '20260831';
const SHADOW_RULE = Object.freeze({
  minScore: 85,
  maxPoolRank: 24,
  allowedHeads: [1, 2, 3],
  maxTickets: 12
});

function pct(a, b) {
  return b ? Number((100 * a / b).toFixed(1)) : 0;
}

function raceDate(record) {
  const key = record.__analysisRaceKey || input.raceKey(record);
  return String(key || '').slice(0, 8);
}

function baselineSelection(record) {
  return base.collectTicketPool(record).slice(0, BASE_LIMIT);
}

function metric(rows, selector, payouts) {
  let hitCount = 0;
  let investmentYen = 0;
  let returnYen = 0;
  let ticketCount = 0;
  for (const record of rows) {
    const actual = input.actualTicket(record.__officialResult);
    if (!actual) continue;
    const selected = selector(record);
    ticketCount += selected.length;
    investmentYen += selected.length * STAKE;
    if (selected.some(item => item.ticket === actual)) {
      hitCount += 1;
      returnYen += payouts.get(record.__analysisRaceKey || input.raceKey(record)) || 0;
    }
  }
  return {
    raceCount: rows.length,
    hitCount,
    hitRatePercent: pct(hitCount, rows.length),
    averageTicketCount: rows.length ? Number((ticketCount / rows.length).toFixed(2)) : 0,
    investmentYen,
    returnYen,
    profitYen: returnYen - investmentYen,
    roiPercent: pct(returnYen, investmentYen)
  };
}

function addedEfficiency(rows, payouts) {
  let addedTicketCount = 0;
  let rescueCount = 0;
  let returnYen = 0;
  for (const record of rows) {
    const actual = input.actualTicket(record.__officialResult);
    if (!actual) continue;
    const baseline = baselineSelection(record);
    const baseSet = new Set(baseline.map(item => item.ticket));
    const shadow = newHead.selectStrategy(record, SHADOW_RULE);
    const extras = shadow.filter(item => !baseSet.has(item.ticket));
    const racePayout = payouts.get(record.__analysisRaceKey || input.raceKey(record)) || 0;
    addedTicketCount += extras.length;
    if (!baseSet.has(actual) && extras.some(item => item.ticket === actual)) {
      rescueCount += 1;
      returnYen += racePayout;
    }
  }
  const investmentYen = addedTicketCount * STAKE;
  return {
    addedTicketCount,
    rescueCount,
    investmentYen,
    returnYen,
    profitYen: returnYen - investmentYen,
    roiPercent: pct(returnYen, investmentYen),
    rescuePer1000Tickets: addedTicketCount ? Number((1000 * rescueCount / addedTicketCount).toFixed(2)) : 0
  };
}

function build() {
  const cohort = input.buildDefaultCohort({ root: ROOT });
  const prospective = cohort.records.filter(record => raceDate(record) > FREEZE_DATE);
  const payouts = payout.payoutMap();
  const baseline = metric(prospective, baselineSelection, payouts);
  const shadow = metric(prospective, record => newHead.selectStrategy(record, SHADOW_RULE), payouts);
  const added = addedEfficiency(prospective, payouts);

  return {
    schemaVersion: 1,
    analysisId: 'new-head-prospective-shadow-v1',
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    preregistration: {
      frozenAtJstDate: FREEZE_DATE,
      evaluationStartDate: '20260901',
      rule: SHADOW_RULE,
      ruleChangePolicy: 'Any rule change requires a new analysisId and a new prospective window. Do not retune this v1 rule from post-freeze outcomes.'
    },
    methodology: {
      cohort: 'official pre-deadline predictions joined to official settled results',
      prospectiveFilter: `race date strictly after ${FREEZE_DATE}`,
      baseline: 'first 7 saved pre-race candidates in stable production-first ordering',
      shadow: 'baseline plus only pre-race new-head candidates matching the preregistered fixed rule',
      evaluationOnly: 'official finish and trifecta payout',
      stake: `${STAKE} yen flat per trifecta ticket`
    },
    diagnostics: {
      ...cohort.diagnostics,
      prospectiveSettledRaceCount: prospective.length,
      earliestProspectiveRace: prospective.length ? prospective.map(raceDate).sort()[0] : null,
      latestProspectiveRace: prospective.length ? prospective.map(raceDate).sort().at(-1) : null
    },
    baseline7: baseline,
    shadow123: shadow,
    deltaVsBaseline: {
      hitCount: shadow.hitCount - baseline.hitCount,
      hitRatePoints: Number((shadow.hitRatePercent - baseline.hitRatePercent).toFixed(1)),
      averageTicketCount: Number((shadow.averageTicketCount - baseline.averageTicketCount).toFixed(2)),
      investmentYen: shadow.investmentYen - baseline.investmentYen,
      returnYen: shadow.returnYen - baseline.returnYen,
      profitYen: shadow.profitYen - baseline.profitYen,
      roiPoints: Number((shadow.roiPercent - baseline.roiPercent).toFixed(1))
    },
    addedEfficiency: added,
    status: prospective.length ? 'collecting' : 'waiting-for-post-freeze-settled-races',
    caveat: 'This is a shadow evaluation only. It must not alter displayed picks, purchased tickets, note output, or production prediction ranking.'
  };
}

if (require.main === module) process.stdout.write(JSON.stringify(build(), null, 2) + '\n');
module.exports = { build, SHADOW_RULE, FREEZE_DATE };
