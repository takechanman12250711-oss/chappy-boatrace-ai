'use strict';

const path = require('node:path');
const input = require('./analysis-input-contract');
const expansion = require('./analyze-ticket-expansion-7-12-18-24.cjs');
const payoutAudit = require('./analyze-ticket-expansion-payout-v2.cjs');
const structured = require('./analyze-structured-formation-backtest-v1.cjs');
const marginal = require('./analyze-formation-marginal-roi-v1.cjs');

const ROOT = path.resolve(__dirname, '..');
const FREEZE_AT = '2026-09-01T05:05:00Z';
const FREEZE_MS = Date.parse(FREEZE_AT);
const STAKE = 100;
const RULE = 'counter-hole-pair-9';
const GATE_SIZES = [50, 100, 250];

function parts(ticket) {
  return String(ticket || '').split('-').map(Number);
}

function pct(numerator, denominator) {
  return denominator ? Number((100 * numerator / denominator).toFixed(1)) : 0;
}

function captureTime(record) {
  const raw = record?.selectedAt || record?.capturedAt || record?.createdAt || '';
  const timestamp = Date.parse(String(raw));
  return Number.isFinite(timestamp) ? timestamp : NaN;
}

function metricTemplate() {
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
    rescueByRole: { main: 0, counter: 0, hole: 0 }
  };
}

function finish(metric) {
  metric.averageTicketCount = metric.settledRaceCount
    ? Number((metric.ticketCount / metric.settledRaceCount).toFixed(2))
    : 0;
  metric.hitRatePercent = pct(metric.hitCount, metric.settledRaceCount);
  metric.investmentYen = metric.ticketCount * STAKE;
  metric.profitYen = metric.returnYen - metric.investmentYen;
  metric.roiPercent = pct(metric.returnYen, metric.investmentYen);
  metric.averageAddedTicketsPerTriggeredRace = metric.triggeredRaceCount
    ? Number((metric.addedTicketCount / metric.triggeredRaceCount).toFixed(2))
    : 0;
  metric.incrementalInvestmentYen = metric.addedTicketCount * STAKE;
  metric.incrementalProfitYen = metric.incrementalReturnYen - metric.incrementalInvestmentYen;
  metric.incrementalRoiPercent = pct(metric.incrementalReturnYen, metric.incrementalInvestmentYen);
}

function gateSummary(metric) {
  return Object.fromEntries(GATE_SIZES.map(size => {
    const reached = metric.triggeredRaceCount >= size;
    return [String(size), {
      requiredTriggeredRaces: size,
      status: reached ? 'review_required' : 'pending',
      currentTriggeredRaces: metric.triggeredRaceCount,
      incrementalRoiPercent: metric.incrementalRoiPercent,
      rescueCount: metric.rescueCount,
      manboatRescueCount: metric.manboatRescueCount,
      automaticAdoption: false
    }];
  }));
}

function build() {
  const cohort = input.buildDefaultCohort({ root: ROOT });
  const payouts = payoutAudit.payoutMap();
  const eligible = cohort.records.filter(record => captureTime(record) >= FREEZE_MS);
  const baseline = metricTemplate();
  const shadow = metricTemplate();
  const rows = [];

  for (const record of eligible) {
    const actual = input.actualTicket(record.__officialResult);
    if (!actual) continue;
    const raceKey = record.__analysisRaceKey || input.raceKey(record);
    const payout = payouts.get(raceKey) || 0;
    const pool = expansion.collectTicketPool(record).slice(0, 24);
    const base = pool.slice(0, 7);
    const selected = structured.select(record, RULE);
    const baseSet = new Set(base.map(item => item.ticket));
    const selectedSet = new Set(selected.map(item => item.ticket));
    const added = [...selectedSet].filter(ticket => !baseSet.has(ticket));
    const baseHit = baseSet.has(actual);
    const shadowHit = selectedSet.has(actual);
    const rescued = !baseHit && shadowHit;

    baseline.settledRaceCount += 1;
    baseline.ticketCount += baseSet.size;
    if (baseHit) {
      baseline.hitCount += 1;
      baseline.returnYen += payout;
    }

    shadow.settledRaceCount += 1;
    shadow.ticketCount += selectedSet.size;
    shadow.addedTicketCount += added.length;
    if (added.length) shadow.triggeredRaceCount += 1;
    if (shadowHit) {
      shadow.hitCount += 1;
      shadow.returnYen += payout;
    }
    if (rescued) {
      shadow.rescueCount += 1;
      shadow.incrementalReturnYen += payout;
      if (payout >= 10000) shadow.manboatRescueCount += 1;
      const role = marginal.headRoles(pool).map.get(parts(actual)[0]) || 'hole';
      shadow.rescueByRole[role] += 1;
    }

    rows.push({
      raceKey,
      capturedAt: record?.selectedAt || record?.capturedAt || record?.createdAt || '',
      baseTicketCount: baseSet.size,
      shadowTicketCount: selectedSet.size,
      addedTickets: added,
      baseHit,
      shadowHit,
      rescued,
      payoutYen: rescued ? payout : 0
    });
  }

  finish(baseline);
  finish(shadow);

  return {
    schemaVersion: 1,
    analysisId: 'counter-hole-pair-forward-shadow-v1',
    generatedAt: new Date().toISOString(),
    freezeAt: FREEZE_AT,
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    rule: {
      id: RULE,
      baseline: 'first 7 saved pre-race candidates',
      candidateWindow: 'saved candidate ranks 8-12',
      scoreThreshold: 85,
      allocation: 'at most one highest-score counter-head ticket plus one highest-score hole-head ticket',
      maximumTickets: 9,
      roleDefinition: 'main = first distinct head in saved rank order; counter = second; hole = third or later',
      resultUsedForSelection: false
    },
    methodology: {
      cohort: `only settled races captured at or after ${FREEZE_AT}`,
      resultAndPayoutUse: 'evaluation only',
      stake: `${STAKE} yen flat per selected ticket`,
      gates: '50, 100, and 250 triggered races require manual review; no automatic adoption'
    },
    diagnostics: {
      ...cohort.diagnostics,
      forwardEligibleSettledCount: eligible.length,
      excludedBeforeFreezeCount: cohort.records.length - eligible.length
    },
    baseline,
    shadow,
    deltaVsBaseline: {
      hitCount: shadow.hitCount - baseline.hitCount,
      hitRatePoints: Number((shadow.hitRatePercent - baseline.hitRatePercent).toFixed(1)),
      roiPoints: Number((shadow.roiPercent - baseline.roiPercent).toFixed(1)),
      profitYen: shadow.profitYen - baseline.profitYen,
      averageTicketCount: Number((shadow.averageTicketCount - baseline.averageTicketCount).toFixed(2))
    },
    gates: gateSummary(shadow),
    rows
  };
}

if (require.main === module) process.stdout.write(JSON.stringify(build(), null, 2) + '\n');
module.exports = { build, FREEZE_AT, RULE };
