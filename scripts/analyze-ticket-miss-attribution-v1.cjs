'use strict';

const path = require('node:path');
const input = require('./analysis-input-contract');
const expansion = require('./analyze-ticket-expansion-7-12-18-24.cjs');

const ROOT = path.resolve(__dirname, '..');
const BASE_LIMIT = 7;
const SEARCH_LIMIT = 24;

function boats(ticket) {
  const normalized = input.normalizeTicket(ticket);
  if (!normalized) return null;
  const p = String(normalized).split('-').map(Number);
  return p.length === 3 && p.every(Number.isFinite) ? p : null;
}

function pct(a,b){ return b ? Number((100*a/b).toFixed(1)) : 0; }

function exactRank(pool, actual) {
  const index = pool.findIndex(x => x.ticket === actual);
  return index >= 0 ? index + 1 : null;
}

function rankBand(rank) {
  if (rank === null) return 'not-in-first24';
  if (rank <= 7) return '1-7';
  if (rank <= 12) return '8-12';
  if (rank <= 18) return '13-18';
  if (rank <= 24) return '19-24';
  return '25+';
}

function classifyMiss(selected, actual) {
  const a = boats(actual);
  if (!a) return 'invalid-actual';
  const triples = selected.map(x => boats(x.ticket)).filter(Boolean);
  const headCovered = triples.some(t => t[0] === a[0]);
  if (!headCovered) return 'head-miss';
  const firstSecondCovered = triples.some(t => t[0] === a[0] && t[1] === a[1]);
  if (!firstSecondCovered) return 'second-miss';
  return 'third-miss';
}

function wrongOrderSameBoats(selected, actual) {
  const a = boats(actual);
  if (!a) return false;
  const key = [...a].sort((x,y)=>x-y).join('-');
  return selected.some(item => {
    const t = boats(item.ticket);
    return t && t.join('-') !== a.join('-') && [...t].sort((x,y)=>x-y).join('-') === key;
  });
}

function emptyBucket(name) {
  return { name, missCount:0, shareOfMissesPercent:0, exactCandidateWithin12:0, exactCandidateWithin18:0, exactCandidateWithin24:0, candidateGapCount:0, wrongOrderSameBoatsCount:0 };
}

function build() {
  const cohort = input.buildDefaultCohort({ root: ROOT });
  const buckets = {
    'head-miss': emptyBucket('head-miss'),
    'second-miss': emptyBucket('second-miss'),
    'third-miss': emptyBucket('third-miss')
  };
  const rankBands = {'8-12':0,'13-18':0,'19-24':0,'not-in-first24':0};
  const rows=[];
  let eligibleRaceCount=0;
  let baselineHitCount=0;
  let missCount=0;

  for (const record of cohort.records) {
    const actual = input.actualTicket(record.__officialResult);
    if (!actual) continue;
    const pool = expansion.collectTicketPool(record);
    if (!pool.length) continue;
    const selected = pool.slice(0, BASE_LIMIT);
    if (!selected.length) continue;
    eligibleRaceCount++;
    if (selected.some(x => x.ticket === actual)) { baselineHitCount++; continue; }

    missCount++;
    const missType = classifyMiss(selected, actual);
    if (!buckets[missType]) continue;
    const rank = exactRank(pool.slice(0, SEARCH_LIMIT), actual);
    const band = rankBand(rank);
    const bucket = buckets[missType];
    bucket.missCount++;
    if (rank !== null && rank <= 12) bucket.exactCandidateWithin12++;
    if (rank !== null && rank <= 18) bucket.exactCandidateWithin18++;
    if (rank !== null && rank <= 24) bucket.exactCandidateWithin24++;
    if (rank === null) bucket.candidateGapCount++;
    const wrongOrder = wrongOrderSameBoats(selected, actual);
    if (wrongOrder) bucket.wrongOrderSameBoatsCount++;
    if (band !== '1-7' && rankBands[band] !== undefined) rankBands[band]++;

    rows.push({
      raceKey: record.__analysisRaceKey || input.raceKey(record),
      actual,
      missType,
      exactCandidateRankWithin24: rank,
      exactCandidateRankBand: band,
      wrongOrderSameBoats: wrongOrder,
      baselineTickets: selected.map(x=>x.ticket)
    });
  }

  for (const bucket of Object.values(buckets)) bucket.shareOfMissesPercent = pct(bucket.missCount, missCount);

  const priority = Object.values(buckets).map(b => ({
    missType:b.name,
    missCount:b.missCount,
    shareOfMissesPercent:b.shareOfMissesPercent,
    recoverableWithin12:b.exactCandidateWithin12,
    recoverableWithin24:b.exactCandidateWithin24,
    candidateGapCount:b.candidateGapCount,
    potentialHitRatePointGainIfAllWithin12Recovered: eligibleRaceCount ? Number((100*b.exactCandidateWithin12/eligibleRaceCount).toFixed(2)) : 0
  })).sort((a,b)=>b.recoverableWithin12-a.recoverableWithin12 || b.missCount-a.missCount);

  return {
    schemaVersion:1,
    analysisId:'ticket-miss-attribution-v1',
    generatedAt:new Date().toISOString(),
    productionChanged:false,
    automaticApplication:false,
    usableForPrediction:false,
    purpose:'Decompose misses of the existing first seven saved pre-race tickets into head, second-place, and third-place coverage failures, then measure whether the exact official ticket was still present later in the saved candidate pool.',
    methodology:{
      baseline:'first 7 tickets from the same saved pre-race pool/order used by ticket-expansion audits',
      exclusiveAttribution:['head-miss: official winner absent from all seven heads','second-miss: official head covered, but official head-second pair absent','third-miss: official head and second pair covered, but exact third missing'],
      candidateGap:'exact official trifecta absent from first 24 saved pre-race candidates; this is reported as candidate-generation/flow-coverage gap, not proof of a specific racing-theory error',
      wrongOrderSameBoats:'all three official boats appeared as a different permutation in the baseline seven',
      noOutcomeBasedSelection:true
    },
    diagnostics:{...cohort.diagnostics,eligibleRaceCount,baselineHitCount,baselineHitRatePercent:pct(baselineHitCount,eligibleRaceCount),missCount},
    buckets,
    exactCandidateRankBands:rankBands,
    improvementPriorityByRecoverableWithin12:priority,
    rows
  };
}

if(require.main===module) process.stdout.write(JSON.stringify(build(),null,2)+'\n');
module.exports={build,classifyMiss,wrongOrderSameBoats,rankBand};
