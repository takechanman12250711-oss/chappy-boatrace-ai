'use strict';

const path = require('node:path');
const input = require('./analysis-input-contract');
const expansion = require('./analyze-ticket-expansion-7-12-18-24.cjs');
const payoutAudit = require('./analyze-ticket-expansion-payout-v2.cjs');

const ROOT = path.resolve(__dirname, '..');
const STAKE = 100;
const MAX_LIMIT = 18;
const ROLES = ['main', 'counter', 'hole'];
const BANDS = [
  { id: '8-9', start: 7, end: 9, previousCap: 7 },
  { id: '10-12', start: 9, end: 12, previousCap: 9 },
  { id: '13-18', start: 12, end: 18, previousCap: 12 }
];

function parts(ticket) {
  return String(ticket || '').split('-').map(Number);
}

function pct(numerator, denominator) {
  return denominator ? Number((100 * numerator / denominator).toFixed(1)) : 0;
}

function emptyMetric() {
  return {
    settledRaceCount: 0,
    triggeredRaceCount: 0,
    addedTicketCount: 0,
    rescueCount: 0,
    investmentYen: 0,
    returnYen: 0,
    profitYen: 0,
    roiPercent: 0,
    marginalHitRatePoints: 0,
    manboatRescueCount: 0,
    rescuesPer1000AddedTickets: 0,
    averageAddedTicketsPerTriggeredRace: 0
  };
}

function headRoles(pool) {
  const orderedHeads = [];
  for (const item of pool.slice(0, MAX_LIMIT)) {
    const head = parts(item.ticket)[0];
    if (head && !orderedHeads.includes(head)) orderedHeads.push(head);
  }
  const map = new Map();
  orderedHeads.forEach((head, index) => {
    map.set(head, index === 0 ? 'main' : index === 1 ? 'counter' : 'hole');
  });
  return { orderedHeads, map };
}

function finish(metric) {
  metric.investmentYen = metric.addedTicketCount * STAKE;
  metric.profitYen = metric.returnYen - metric.investmentYen;
  metric.roiPercent = pct(metric.returnYen, metric.investmentYen);
  metric.marginalHitRatePoints = pct(metric.rescueCount, metric.settledRaceCount);
  metric.rescuesPer1000AddedTickets = metric.addedTicketCount
    ? Number((1000 * metric.rescueCount / metric.addedTicketCount).toFixed(1))
    : 0;
  metric.averageAddedTicketsPerTriggeredRace = metric.triggeredRaceCount
    ? Number((metric.addedTicketCount / metric.triggeredRaceCount).toFixed(2))
    : 0;
}

function build() {
  const cohort = input.buildDefaultCohort({ root: ROOT });
  const payouts = payoutAudit.payoutMap();
  const byBand = {};
  const byBandRole = {};
  const byRole = Object.fromEntries(ROLES.map(role => [role, emptyMetric()]));
  const rows = [];

  for (const band of BANDS) {
    byBand[band.id] = emptyMetric();
    byBand[band.id].settledRaceCount = cohort.records.length;
    for (const role of ROLES) {
      const key = `${band.id}|${role}`;
      byBandRole[key] = emptyMetric();
      byBandRole[key].settledRaceCount = cohort.records.length;
    }
  }
  for (const metric of Object.values(byRole)) metric.settledRaceCount = cohort.records.length;

  for (const record of cohort.records) {
    const actual = input.actualTicket(record.__officialResult);
    if (!actual) continue;
    const raceKey = record.__analysisRaceKey || input.raceKey(record);
    const payout = payouts.get(raceKey) || 0;
    const pool = expansion.collectTicketPool(record).slice(0, MAX_LIMIT);
    if (!pool.length) continue;
    const roles = headRoles(pool);

    for (const band of BANDS) {
      const added = pool.slice(band.start, band.end);
      if (!added.length) continue;
      const previous = pool.slice(0, band.start);
      const previousHit = previous.some(item => item.ticket === actual);
      const winningAdded = previousHit ? null : added.find(item => item.ticket === actual) || null;
      const rolePresence = new Set();

      byBand[band.id].triggeredRaceCount += 1;
      byBand[band.id].addedTicketCount += added.length;

      for (const item of added) {
        const head = parts(item.ticket)[0];
        const role = roles.map.get(head) || 'hole';
        rolePresence.add(role);
        byBandRole[`${band.id}|${role}`].addedTicketCount += 1;
        byRole[role].addedTicketCount += 1;
      }

      for (const role of rolePresence) {
        byBandRole[`${band.id}|${role}`].triggeredRaceCount += 1;
        byRole[role].triggeredRaceCount += 1;
      }

      if (winningAdded) {
        const head = parts(winningAdded.ticket)[0];
        const role = roles.map.get(head) || 'hole';
        byBand[band.id].rescueCount += 1;
        byBand[band.id].returnYen += payout;
        byBandRole[`${band.id}|${role}`].rescueCount += 1;
        byBandRole[`${band.id}|${role}`].returnYen += payout;
        byRole[role].rescueCount += 1;
        byRole[role].returnYen += payout;
        if (payout >= 10000) {
          byBand[band.id].manboatRescueCount += 1;
          byBandRole[`${band.id}|${role}`].manboatRescueCount += 1;
          byRole[role].manboatRescueCount += 1;
        }
        rows.push({
          raceKey,
          band: band.id,
          role,
          ticket: winningAdded.ticket,
          payoutYen: payout,
          candidateRank: band.start + added.indexOf(winningAdded) + 1,
          orderedHeads: roles.orderedHeads
        });
      }
    }
  }

  Object.values(byBand).forEach(finish);
  Object.values(byBandRole).forEach(finish);
  Object.values(byRole).forEach(finish);

  const efficientCells = Object.entries(byBandRole)
    .filter(([, metric]) => metric.addedTicketCount >= 100 && metric.roiPercent >= 100)
    .sort((a, b) => b[1].roiPercent - a[1].roiPercent || b[1].rescueCount - a[1].rescueCount)
    .map(([group, metric]) => ({ group, ...metric }));

  return {
    schemaVersion: 1,
    analysisId: 'formation-marginal-roi-v1',
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    purpose: 'Measure the marginal flat-stake ROI of ranks 8-9, 10-12, and 13-18 after assigning each saved pre-race head scenario to main, counter, or hole by first appearance in candidate rank order.',
    methodology: {
      cohort: 'official pre-deadline predictions joined to official settled results',
      roleDefinition: 'main = first distinct head in saved candidate order; counter = second distinct head; hole = third or later distinct head',
      marginalBands: '8-9 are evaluated after cap 7, 10-12 after cap 9, and 13-18 after cap 12',
      stake: `${STAKE} yen per added ticket`,
      selectionUsesOutcome: false,
      resultAndPayoutUse: 'evaluation only',
      warning: 'Retrospective descriptive audit only. Efficient cells are hypotheses and require frozen forward validation.'
    },
    diagnostics: cohort.diagnostics,
    byBand,
    byBandRole,
    byRole,
    efficientCells,
    rescueRows: rows
  };
}

if (require.main === module) process.stdout.write(JSON.stringify(build(), null, 2) + '\n');
module.exports = { build, headRoles };
