'use strict';

const path = require('node:path');
const input = require('./analysis-input-contract');
const expansion = require('./analyze-ticket-expansion-7-12-18-24.cjs');
const attribution = require('./analyze-rescue-scenario-attribution-v1.cjs');

const ROOT = path.resolve(__dirname, '..');
const BASE_LIMIT = 7;
const MAX_LIMIT = 18;
const STAKE = 100;
const TYPES = ['alternateHead', 'secondPlaceExpansion', 'thirdPlacePickup'];

function parts(ticket) { return String(ticket || '').split('-').map(Number); }
function pct(n, d) { return d ? Number((100 * n / d).toFixed(1)) : 0; }
function empty() { return { raceCount: 0, addedTicketCount: 0, rescueCount: 0, investmentYen: 0, returnYen: 0, profitYen: 0, roiPercent: 0, manboatRescueCount: 0 }; }

function candidateType(candidate, baseline) {
  const [h, s, t] = parts(candidate.ticket);
  const rows = baseline.map(item => parts(item.ticket));
  const sameHead = rows.filter(row => row[0] === h);
  if (!sameHead.length) return 'alternateHead';
  const sameSecond = sameHead.filter(row => row[1] === s);
  if (!sameSecond.length) return 'secondPlaceExpansion';
  if (!sameSecond.some(row => row[2] === t)) return 'thirdPlacePickup';
  return 'orderingOther';
}

function build() {
  const cohort = input.buildDefaultCohort({ root: ROOT });
  const metrics = Object.fromEntries(TYPES.map(type => [type, empty()]));
  const rows = [];

  for (const record of cohort.records) {
    const actual = input.actualTicket(record.__officialResult);
    if (!actual) continue;
    const pool = expansion.collectTicketPool(record).slice(0, MAX_LIMIT);
    const baseline = pool.slice(0, BASE_LIMIT);
    if (!baseline.length) continue;
    const payout = expansion.payoutOf(record.__officialResult);

    for (const type of TYPES) {
      const added = pool.slice(BASE_LIMIT).filter(item => candidateType(item, baseline) === type);
      if (!added.length) continue;
      const metric = metrics[type];
      metric.raceCount += 1;
      metric.addedTicketCount += added.length;
      metric.investmentYen += added.length * STAKE;
      const rescued = !baseline.some(item => item.ticket === actual) && added.some(item => item.ticket === actual);
      if (rescued) {
        metric.rescueCount += 1;
        metric.returnYen += payout;
        if (payout >= 10000) metric.manboatRescueCount += 1;
      }
      rows.push({ raceKey: record.__analysisRaceKey || input.raceKey(record), type, addedTicketCount: added.length, rescued, payoutYen: rescued ? payout : 0 });
    }
  }

  for (const metric of Object.values(metrics)) {
    metric.profitYen = metric.returnYen - metric.investmentYen;
    metric.roiPercent = pct(metric.returnYen, metric.investmentYen);
    metric.rescuesPer1000AddedTickets = metric.addedTicketCount ? Number((1000 * metric.rescueCount / metric.addedTicketCount).toFixed(1)) : 0;
  }

  return {
    schemaVersion: 1,
    analysisId: 'rescue-dimension-roi-v1',
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    purpose: 'Measure incremental flat-stake ROI of adding only alternate-head, second-place-expansion, or third-place-pickup candidates from saved pre-race ranks 8-18.',
    methodology: {
      cohort: 'official pre-deadline predictions joined to official settled results',
      baseline: 'first 7 saved candidates',
      candidateWindow: 'saved pre-race candidates ranked 8-18',
      stake: `${STAKE} yen per added ticket`,
      selectionUsesOutcome: false,
      resultAndPayoutUse: 'evaluation only',
      structuralClassification: attribution.build ? 'same structural definitions as rescue-scenario-attribution-v1' : 'embedded equivalent',
      warning: 'Retrospective efficiency audit only; subgroup ROI must not be directly adopted without forward validation.'
    },
    diagnostics: cohort.diagnostics,
    metrics,
    rows
  };
}

if (require.main === module) process.stdout.write(JSON.stringify(build(), null, 2) + '\n');
module.exports = { build, candidateType };
