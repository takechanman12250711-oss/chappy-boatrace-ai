'use strict';

const path = require('node:path');
const input = require('./analysis-input-contract');
const expansion = require('./analyze-ticket-expansion-7-12-18-24.cjs');
const payoutAudit = require('./analyze-ticket-expansion-payout-v2.cjs');
const subgroup = require('./analyze-rescue-subgroup-roi-v1.cjs');
const attribution = require('./analyze-rescue-scenario-attribution-v1.cjs');

const ROOT = path.resolve(__dirname, '..');
const BASE_LIMIT = 7;
const MAX_LIMIT = 18;
const STAKE = 100;
const FREEZE_AT = '2026-09-01T03:10:00Z';
const FREEZE_MS = Date.parse(FREEZE_AT);

function parts(ticket) { return String(ticket || '').split('-').map(Number); }
function pct(n, d) { return d ? Number((100 * n / d).toFixed(1)) : 0; }
function captureMs(record) {
  const raw = record?.selectedAt || record?.capturedAt || record?.createdAt || '';
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : NaN;
}
function rankBand(rank) { return subgroup.rankBand(rank); }
function scoreBand(score) { return subgroup.scoreBand(score); }
function candidateType(item, baseline) { return subgroup.candidateType(item, baseline); }
function scenarioTag(text) { return attribution.scenarioTag(text); }

const RULES = {
  alternate_head_rank_11_12: {
    rationale: 'Retrospective broad group: alternateHead rank 11-12, 811 added tickets, ROI 132.2%, 14 rescues.',
    match: x => x.type === 'alternateHead' && x.rankBand === '11-12'
  },
  alternate_head_score_95_97: {
    rationale: 'Retrospective broad group: alternateHead score 95-97, 478 added tickets, ROI 157.5%, 10 rescues.',
    match: x => x.type === 'alternateHead' && x.scoreBand === '95-97'
  },
  second_place_score_80_84: {
    rationale: 'Retrospective broad group: secondPlaceExpansion score 80-84, 441 added tickets, ROI 134.9%, 6 rescues.',
    match: x => x.type === 'secondPlaceExpansion' && x.scoreBand === '80-84'
  },
  third_place_attack: {
    rationale: 'Retrospective broad group: thirdPlacePickup attack tag, 230 added tickets, ROI 120.1%, 4 rescues.',
    match: x => x.type === 'thirdPlacePickup' && x.tag === 'attack'
  },
  second_place_head_2: {
    rationale: 'Retrospective benchmark: secondPlaceExpansion head 2, 839 added tickets, ROI 100.8%, 6 rescues.',
    match: x => x.type === 'secondPlaceExpansion' && x.head === 2
  }
};

function empty() {
  return { settledRaceCount: 0, triggeredRaceCount: 0, addedTicketCount: 0, rescueCount: 0, investmentYen: 0, returnYen: 0, profitYen: 0, roiPercent: 0, manboatRescueCount: 0, rescuesPer1000AddedTickets: 0 };
}

function build() {
  const cohort = input.buildDefaultCohort({ root: ROOT });
  const payouts = payoutAudit.payoutMap();
  const metrics = Object.fromEntries(Object.keys(RULES).map(k => [k, empty()]));
  const union = empty();
  const eligible = cohort.records.filter(record => captureMs(record) >= FREEZE_MS);

  for (const record of eligible) {
    const actual = input.actualTicket(record.__officialResult);
    if (!actual) continue;
    const raceKey = record.__analysisRaceKey || input.raceKey(record);
    const payout = payouts.get(raceKey) || 0;
    const pool = expansion.collectTicketPool(record).slice(0, MAX_LIMIT);
    const baseline = pool.slice(0, BASE_LIMIT);
    if (!baseline.length) continue;
    const baselineHit = baseline.some(item => item.ticket === actual);
    const candidates = pool.slice(BASE_LIMIT).map((item, offset) => {
      const rank = BASE_LIMIT + offset + 1;
      return {
        item,
        type: candidateType(item, baseline),
        rank,
        rankBand: rankBand(rank),
        scoreBand: scoreBand(item.score),
        tag: scenarioTag(item.scenario),
        head: parts(item.ticket)[0]
      };
    });

    const unionTickets = new Map();
    for (const [ruleName, rule] of Object.entries(RULES)) {
      const m = metrics[ruleName];
      m.settledRaceCount += 1;
      const added = candidates.filter(rule.match);
      if (!added.length) continue;
      m.triggeredRaceCount += 1;
      m.addedTicketCount += added.length;
      m.investmentYen += added.length * STAKE;
      for (const x of added) unionTickets.set(x.item.ticket, x.item);
      const rescued = !baselineHit && added.some(x => x.item.ticket === actual);
      if (rescued) {
        m.rescueCount += 1;
        m.returnYen += payout;
        if (payout >= 10000) m.manboatRescueCount += 1;
      }
    }

    union.settledRaceCount += 1;
    const unionAdded = [...unionTickets.values()];
    if (unionAdded.length) {
      union.triggeredRaceCount += 1;
      union.addedTicketCount += unionAdded.length;
      union.investmentYen += unionAdded.length * STAKE;
      const rescued = !baselineHit && unionAdded.some(item => item.ticket === actual);
      if (rescued) {
        union.rescueCount += 1;
        union.returnYen += payout;
        if (payout >= 10000) union.manboatRescueCount += 1;
      }
    }
  }

  for (const m of [...Object.values(metrics), union]) {
    m.profitYen = m.returnYen - m.investmentYen;
    m.roiPercent = pct(m.returnYen, m.investmentYen);
    m.rescuesPer1000AddedTickets = m.addedTicketCount ? Number((1000 * m.rescueCount / m.addedTicketCount).toFixed(1)) : 0;
  }

  return {
    schemaVersion: 1,
    analysisId: 'rescue-subgroup-forward-shadow-v1',
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    freezeAt: FREEZE_AT,
    ruleSelectionSource: 'retrospective rescue-subgroup-roi-v1 broad groups only',
    rules: Object.fromEntries(Object.entries(RULES).map(([k,v]) => [k, v.rationale])),
    methodology: {
      forwardEligibility: 'prediction capture timestamp must be on or after freezeAt and official result must be settled',
      baseline: 'first 7 saved pre-race candidates',
      candidateWindow: 'saved pre-race candidates ranked 8-18',
      stake: `${STAKE} yen per added ticket`,
      resultUsedForSelection: false,
      note: 'Rules are frozen before forward observations. No threshold edits are allowed based on forward outcomes.'
    },
    diagnostics: { ...cohort.diagnostics, forwardEligibleSettledCount: eligible.length },
    metrics,
    union
  };
}

if (require.main === module) process.stdout.write(JSON.stringify(build(), null, 2) + '\n');
module.exports = { build, RULES, FREEZE_AT };
