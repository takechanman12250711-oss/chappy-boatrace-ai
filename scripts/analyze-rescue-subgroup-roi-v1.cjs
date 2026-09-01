'use strict';

const path = require('node:path');
const input = require('./analysis-input-contract');
const expansion = require('./analyze-ticket-expansion-7-12-18-24.cjs');
const payoutAudit = require('./analyze-ticket-expansion-payout-v2.cjs');
const attribution = require('./analyze-rescue-scenario-attribution-v1.cjs');

const ROOT = path.resolve(__dirname, '..');
const BASE_LIMIT = 7;
const MAX_LIMIT = 18;
const STAKE = 100;
const TYPES = ['alternateHead', 'secondPlaceExpansion', 'thirdPlacePickup'];

function parts(ticket) { return String(ticket || '').split('-').map(Number); }
function pct(n, d) { return d ? Number((100 * n / d).toFixed(1)) : 0; }
function scoreBand(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 'unknown';
  if (n >= 98) return '98-100';
  if (n >= 95) return '95-97';
  if (n >= 90) return '90-94';
  if (n >= 85) return '85-89';
  if (n >= 80) return '80-84';
  return '<80';
}
function rankBand(rank) {
  if (rank <= 10) return '8-10';
  if (rank <= 12) return '11-12';
  return '13-18';
}
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
function scenarioTag(text) { return attribution.scenarioTag(text); }
function empty() { return { addedTicketCount: 0, rescueCount: 0, investmentYen: 0, returnYen: 0, profitYen: 0, roiPercent: 0, manboatRescueCount: 0, rescuesPer1000AddedTickets: 0 }; }
function key(parts) { return parts.join('|'); }
function addMetric(map, k, rescued, payout) {
  const m = map[k] || empty();
  m.addedTicketCount += 1;
  m.investmentYen += STAKE;
  if (rescued) {
    m.rescueCount += 1;
    m.returnYen += payout;
    if (payout >= 10000) m.manboatRescueCount += 1;
  }
  map[k] = m;
}
function finish(map) {
  for (const m of Object.values(map)) {
    m.profitYen = m.returnYen - m.investmentYen;
    m.roiPercent = pct(m.returnYen, m.investmentYen);
    m.rescuesPer1000AddedTickets = m.addedTicketCount ? Number((1000 * m.rescueCount / m.addedTicketCount).toFixed(1)) : 0;
  }
}

function build() {
  const cohort = input.buildDefaultCohort({ root: ROOT });
  const payouts = payoutAudit.payoutMap();
  const byTypeRank = {};
  const byTypeScore = {};
  const byTypeTag = {};
  const byTypeHead = {};
  const byTypeRankScore = {};
  const byTypeRankTag = {};
  const byTypeScoreTag = {};
  const byFullCombo = {};

  for (const record of cohort.records) {
    const actual = input.actualTicket(record.__officialResult);
    if (!actual) continue;
    const raceKey = record.__analysisRaceKey || input.raceKey(record);
    const payout = payouts.get(raceKey) || 0;
    const pool = expansion.collectTicketPool(record).slice(0, MAX_LIMIT);
    const baseline = pool.slice(0, BASE_LIMIT);
    if (!baseline.length) continue;
    const baselineHit = baseline.some(item => item.ticket === actual);

    pool.slice(BASE_LIMIT).forEach((item, offset) => {
      const type = candidateType(item, baseline);
      if (!TYPES.includes(type)) return;
      const rank = BASE_LIMIT + offset + 1;
      const rb = rankBand(rank);
      const sb = scoreBand(item.score);
      const tag = scenarioTag(item.scenario);
      const head = String(parts(item.ticket)[0] || 'unknown');
      const rescued = !baselineHit && item.ticket === actual;

      addMetric(byTypeRank, key([type, rb]), rescued, payout);
      addMetric(byTypeScore, key([type, sb]), rescued, payout);
      addMetric(byTypeTag, key([type, tag]), rescued, payout);
      addMetric(byTypeHead, key([type, head]), rescued, payout);
      addMetric(byTypeRankScore, key([type, rb, sb]), rescued, payout);
      addMetric(byTypeRankTag, key([type, rb, tag]), rescued, payout);
      addMetric(byTypeScoreTag, key([type, sb, tag]), rescued, payout);
      addMetric(byFullCombo, key([type, rb, sb, tag, head]), rescued, payout);
    });
  }

  [byTypeRank, byTypeScore, byTypeTag, byTypeHead, byTypeRankScore, byTypeRankTag, byTypeScoreTag, byFullCombo].forEach(finish);
  const profitableCombos = Object.entries(byFullCombo)
    .filter(([, m]) => m.roiPercent >= 100 && m.addedTicketCount >= 20)
    .sort((a, b) => b[1].roiPercent - a[1].roiPercent || b[1].rescueCount - a[1].rescueCount)
    .slice(0, 50)
    .map(([group, metrics]) => ({ group, ...metrics }));

  return {
    schemaVersion: 1,
    analysisId: 'rescue-subgroup-roi-v1',
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    purpose: 'Find retrospective ROI concentration inside alternate-head, second-place, and third-place rescue candidates using only saved pre-race rank, score, scenario tag, and head boat dimensions.',
    methodology: {
      cohort: 'official pre-deadline predictions joined to official settled results',
      baseline: 'first 7 saved candidates',
      candidateWindow: 'saved pre-race candidates ranked 8-18',
      stake: `${STAKE} yen per added ticket`,
      selectionUsesOutcome: false,
      payoutSource: 'settled trifecta payout map used by ticket-expansion payout audit',
      warning: 'Retrospective subgroup discovery only. ROI>=100 groups are hypotheses, not adoption rules; freeze selected hypotheses before forward validation.'
    },
    diagnostics: cohort.diagnostics,
    byTypeRank,
    byTypeScore,
    byTypeTag,
    byTypeHead,
    byTypeRankScore,
    byTypeRankTag,
    byTypeScoreTag,
    byFullCombo,
    profitableCombos
  };
}

if (require.main === module) process.stdout.write(JSON.stringify(build(), null, 2) + '\n');
module.exports = { build, candidateType, scoreBand, rankBand };
