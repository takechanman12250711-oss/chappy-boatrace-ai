'use strict';

const path = require('node:path');
const input = require('./analysis-input-contract');
const expansion = require('./analyze-ticket-expansion-7-12-18-24.cjs');

const ROOT = path.resolve(__dirname, '..');
const BASE_LIMIT = 7;
const MAX_LIMIT = 18;

function parts(ticket) {
  return String(ticket || '').split('-').map(Number);
}

function scenarioTag(text) {
  const s = String(text || '');
  if (/残し|hold/i.test(s)) return 'hold';
  if (/拾い|pickup/i.test(s)) return 'pickup';
  if (/攻め|attack/i.test(s)) return 'attack';
  if (/穴|万舟|hole/i.test(s)) return 'hole';
  if (/展開|flow|scenario/i.test(s)) return 'flow';
  return 'other';
}

function structuralType(actual, baseline) {
  const [h, s, t] = parts(actual);
  const parsed = baseline.map(item => parts(item.ticket));
  const sameHead = parsed.filter(row => row[0] === h);
  if (!sameHead.length) return 'alternateHead';
  const sameSecond = sameHead.filter(row => row[1] === s);
  if (!sameSecond.length) return 'secondPlaceExpansion';
  if (!sameSecond.some(row => row[2] === t)) return 'thirdPlacePickup';
  return 'orderingOther';
}

function inc(map, key, payout) {
  const row = map[key] || { rescueCount: 0, payoutYen: 0, manboatCount: 0 };
  row.rescueCount += 1;
  row.payoutYen += payout;
  if (payout >= 10000) row.manboatCount += 1;
  map[key] = row;
}

function build() {
  const cohort = input.buildDefaultCohort({ root: ROOT });
  const byStructuralType = {};
  const byScenarioTag = {};
  const bySource = {};
  const byRankBand = {};
  const byHead = {};
  const rows = [];

  for (const record of cohort.records) {
    const actual = input.actualTicket(record.__officialResult);
    if (!actual) continue;
    const pool = expansion.collectTicketPool(record).slice(0, MAX_LIMIT);
    const baseline = pool.slice(0, BASE_LIMIT);
    if (!baseline.length || baseline.some(item => item.ticket === actual)) continue;
    const idx = pool.findIndex(item => item.ticket === actual);
    if (idx < BASE_LIMIT || idx < 0) continue;

    const item = pool[idx];
    const payout = expansion.payoutOf(record.__officialResult);
    const rank = idx + 1;
    const structural = structuralType(actual, baseline);
    const tag = scenarioTag(item.scenario);
    const rankBand = rank <= 10 ? '8-10' : rank <= 12 ? '11-12' : '13-18';
    const head = String(parts(actual)[0] || 'unknown');

    inc(byStructuralType, structural, payout);
    inc(byScenarioTag, tag, payout);
    inc(bySource, item.source || 'unknown', payout);
    inc(byRankBand, rankBand, payout);
    inc(byHead, head, payout);

    rows.push({
      raceKey: record.__analysisRaceKey || input.raceKey(record),
      actual,
      payoutYen: payout,
      candidateRank: rank,
      candidateSource: item.source,
      candidateScore: item.score,
      scenario: item.scenario,
      scenarioTag: tag,
      structuralType: structural,
      head: Number(head)
    });
  }

  const payoutTotal = rows.reduce((sum, row) => sum + row.payoutYen, 0);
  return {
    schemaVersion: 1,
    analysisId: 'rescue-scenario-attribution-v1',
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    purpose: 'Explain which saved pre-race scenario dimensions account for tickets rescued between ranks 8 and 18 after the baseline 7 misses.',
    methodology: {
      cohort: 'official pre-deadline predictions joined to official settled results',
      baseline: 'first 7 saved candidates',
      rescueWindow: 'actual winning ticket ranked 8-18 in the saved pre-race candidate pool',
      outcomeUsedForSelection: false,
      resultAndPayoutUse: 'evaluation and attribution only',
      structuralTypes: {
        alternateHead: 'winning head absent from baseline heads',
        secondPlaceExpansion: 'winning head present but winning second absent under that head',
        thirdPlacePickup: 'winning head+second present but winning third absent',
        orderingOther: 'fallback classification'
      },
      warning: 'Retrospective attribution only. Do not adopt a rule directly from these subgroups.'
    },
    diagnostics: cohort.diagnostics,
    totals: {
      rescueCount: rows.length,
      payoutYen: payoutTotal,
      manboatCount: rows.filter(row => row.payoutYen >= 10000).length
    },
    byStructuralType,
    byScenarioTag,
    bySource,
    byRankBand,
    byHead,
    rows
  };
}

if (require.main === module) process.stdout.write(JSON.stringify(build(), null, 2) + '\n');
module.exports = { build, structuralType, scenarioTag };
