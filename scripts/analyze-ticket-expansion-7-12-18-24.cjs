'use strict';

const path = require('node:path');
const input = require('./analysis-input-contract');

const ROOT = path.resolve(__dirname, '..');
const TIERS = [7, 12, 18, 24];
const STAKE_PER_TICKET = 100;

function normalizeTicket(value) {
  return input.normalizeTicket(value?.ticket || value?.combination || value?.boats || value);
}

function numeric(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function payoutOf(result) {
  const source = result?.__officialResult || result?.officialResult || result?.raceResult || result?.result || result || {};
  const candidates = [
    source?.trifectaPayout,
    source?.payout3t,
    source?.payout,
    source?.payoff,
    result?.trifectaPayout,
    result?.payout3t,
    result?.payout,
    result?.payoff
  ];
  for (const value of candidates) {
    const n = Number(String(value ?? '').replace(/[^0-9.]/g, ''));
    if (Number.isFinite(n) && n > 0) return n;
  }
  const lists = [source?.payouts, source?.payoffs, result?.payouts, result?.payoffs];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const row of list) {
      const kind = String(row?.type || row?.betType || row?.name || '').toLowerCase();
      if (!/(3連単|trifecta|3t)/i.test(kind)) continue;
      const n = Number(String(row?.payout ?? row?.amount ?? row?.payoff ?? '').replace(/[^0-9.]/g, ''));
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return 0;
}

function ticketScore(item, fallbackOrder) {
  return Math.max(
    numeric(item?.priorityScore, -Infinity),
    numeric(item?.score, -Infinity),
    numeric(item?.effectiveScore, -Infinity),
    numeric(item?.selectionScore, -Infinity),
    numeric(item?.candidateScore, -Infinity),
    -fallbackOrder
  );
}

function pushCandidate(target, seen, value, source, order, extra = {}) {
  const ticket = normalizeTicket(value);
  if (!ticket || seen.has(ticket)) return;
  seen.add(ticket);
  target.push({
    ticket,
    source,
    order,
    score: ticketScore(value, order),
    scenario: String(value?.scenarioSummary || value?.scenario || value?.reason || extra?.scenario || ''),
    head: Number(ticket[0])
  });
}

function collectTicketPool(record) {
  const prediction = record?.prediction || record || {};
  const selection = prediction?.practicalSelection || record?.practicalSelection || {};
  const target = [];
  const seen = new Set();
  let order = 0;

  // Current production-facing tickets first. This preserves the existing 7-point surface.
  const productionLists = [
    prediction?.practicalTickets,
    record?.practicalTickets,
    prediction?.tickets,
    prediction?.formations?.main,
    prediction?.formations?.mainline,
    prediction?.formations?.cover,
    prediction?.formations?.flow,
    prediction?.formations?.hole
  ];
  for (const list of productionLists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) pushCandidate(target, seen, item, 'production', order++);
  }

  // Saved pre-race candidates that were considered but may have been cut by final narrowing.
  const decisions = Array.isArray(selection?.targetDecisions) ? selection.targetDecisions : [];
  for (const decision of decisions) {
    const candidates = Array.isArray(decision?.candidateDecisions) ? decision.candidateDecisions : [];
    for (const item of candidates) pushCandidate(target, seen, item, 'candidateDecision', order++, { scenario: decision?.scenarioSummary });
    pushCandidate(target, seen, decision?.bestCandidateTicket, 'bestCandidateTicket', order++, { scenario: decision?.scenarioSummary });
  }

  const added = selection?.expansionSummary?.addedTickets;
  if (Array.isArray(added)) {
    for (const item of added) pushCandidate(target, seen, item, 'savedExpansion', order++);
  }

  // Stable ordering: production first, then saved candidates by pre-race score, then original order.
  return target.sort((a, b) => {
    const aProd = a.source === 'production' ? 1 : 0;
    const bProd = b.source === 'production' ? 1 : 0;
    return bProd - aProd || b.score - a.score || a.order - b.order || a.ticket.localeCompare(b.ticket);
  });
}

function emptyTier(limit) {
  return {
    limit,
    eligibleRaceCount: 0,
    hitCount: 0,
    hitRatePercent: 0,
    investmentYen: 0,
    returnYen: 0,
    profitYen: 0,
    roiPercent: 0,
    incrementalRescueCountVsPrevious: 0,
    incrementalReturnYenVsPrevious: 0
  };
}

function pct(a, b) {
  return b ? Number((100 * a / b).toFixed(1)) : 0;
}

function yen(value) {
  return Math.round(numeric(value));
}

function build() {
  const cohort = input.buildDefaultCohort({ root: ROOT });
  const tiers = Object.fromEntries(TIERS.map(limit => [limit, emptyTier(limit)]));
  const rows = [];
  const sourceCounts = {};
  let candidatePoolRaceCount = 0;
  let insufficientPoolRaceCount = 0;
  let payoutMissingHitCount = 0;

  for (const record of cohort.records) {
    const actual = input.actualTicket(record.__officialResult);
    if (!actual) continue;
    const pool = collectTicketPool(record);
    if (!pool.length) continue;
    candidatePoolRaceCount += 1;
    if (pool.length < 24) insufficientPoolRaceCount += 1;
    for (const item of pool) sourceCounts[item.source] = (sourceCounts[item.source] || 0) + 1;

    const payout = payoutOf(record.__officialResult);
    const tierRows = {};
    let priorHit = false;
    let priorReturn = 0;

    for (const limit of TIERS) {
      const selected = pool.slice(0, limit);
      if (!selected.length) continue;
      const metric = tiers[limit];
      metric.eligibleRaceCount += 1;
      metric.investmentYen += selected.length * STAKE_PER_TICKET;
      const hit = selected.some(item => item.ticket === actual);
      let returned = 0;
      if (hit) {
        metric.hitCount += 1;
        if (payout > 0) returned = payout;
        else payoutMissingHitCount += 1;
      }
      metric.returnYen += returned;
      if (limit !== TIERS[0] && hit && !priorHit) metric.incrementalRescueCountVsPrevious += 1;
      if (limit !== TIERS[0]) metric.incrementalReturnYenVsPrevious += returned - priorReturn;
      priorHit = hit;
      priorReturn = returned;
      tierRows[limit] = {
        ticketCount: selected.length,
        hit,
        returnYen: returned,
        addedTickets: limit === TIERS[0] ? selected.map(item => item.ticket) : selected.slice(TIERS[TIERS.indexOf(limit) - 1]).map(item => item.ticket)
      };
    }

    rows.push({
      raceKey: record.__analysisRaceKey || input.raceKey(record),
      actual,
      payoutYen: payout,
      candidatePoolCount: pool.length,
      finalProductionLikeTickets: pool.filter(item => item.source === 'production').slice(0, 7).map(item => item.ticket),
      first24Candidates: pool.slice(0, 24),
      tiers: tierRows
    });
  }

  for (const limit of TIERS) {
    const metric = tiers[limit];
    metric.hitRatePercent = pct(metric.hitCount, metric.eligibleRaceCount);
    metric.investmentYen = yen(metric.investmentYen);
    metric.returnYen = yen(metric.returnYen);
    metric.profitYen = metric.returnYen - metric.investmentYen;
    metric.roiPercent = pct(metric.returnYen, metric.investmentYen);
    metric.incrementalReturnYenVsPrevious = yen(metric.incrementalReturnYenVsPrevious);
  }

  const comparisons = [];
  for (let index = 1; index < TIERS.length; index += 1) {
    const previous = tiers[TIERS[index - 1]];
    const current = tiers[TIERS[index]];
    comparisons.push({
      from: previous.limit,
      to: current.limit,
      additionalTicketsPerFullRace: current.limit - previous.limit,
      hitCountDelta: current.hitCount - previous.hitCount,
      hitRatePointDelta: Number((current.hitRatePercent - previous.hitRatePercent).toFixed(1)),
      investmentDeltaYen: current.investmentYen - previous.investmentYen,
      returnDeltaYen: current.returnYen - previous.returnYen,
      profitDeltaYen: current.profitYen - previous.profitYen,
      roiPointDelta: Number((current.roiPercent - previous.roiPercent).toFixed(1))
    });
  }

  return {
    schemaVersion: 1,
    analysisId: 'ticket-expansion-7-12-18-24-v1',
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    purpose: 'Measure whether saved pre-race candidates cut from the narrow ticket surface rescue enough winners and payout to justify 7→12→18→24 expansion.',
    methodology: {
      cohort: 'official pre-deadline predictions joined to official settled results via analysis-input-contract',
      noOutcomeBasedCandidateSelection: true,
      candidateSources: ['production-facing saved tickets', 'targetDecisions.candidateDecisions', 'targetDecisions.bestCandidateTicket', 'expansionSummary.addedTickets'],
      ordering: 'production-facing tickets first; remaining candidates by saved pre-race score then saved order',
      stakeModel: `${STAKE_PER_TICKET} yen flat per selected trifecta ticket`,
      caveat: 'This is a retrospective audit. It may justify a preregistered shadow test, not direct production expansion.'
    },
    diagnostics: {
      ...cohort.diagnostics,
      candidatePoolRaceCount,
      insufficientPoolRaceCount,
      payoutMissingHitCount,
      sourceCounts
    },
    tiers,
    comparisons,
    rows
  };
}

if (require.main === module) process.stdout.write(JSON.stringify(build(), null, 2) + '\n');
module.exports = { build, collectTicketPool, payoutOf };
