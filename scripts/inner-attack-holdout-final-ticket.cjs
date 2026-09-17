'use strict';

const input = require('./analysis-input-contract');
const evaluator = require('./final-ticket-candidate-evaluator.cjs');

const HOLDOUT_START = '20260819';
const CANDIDATE = Object.freeze({ st: 0.75, roleAttack: 0.5, exhibition: 0, maxCourseGap: null, penalty: 4 });

function predictionOf(record) { return record?.prediction || record || {}; }
function raceDate(record) { return String(record?.__analysisRaceKey || input.raceKey(record) || '').slice(0, 8); }
function num(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function boatNo(item) { return num(item?.boatNo ?? item?.boat ?? item?.frameNo ?? item?.number); }
function score(item) { return num(item?.total ?? item?.score ?? item?.effectiveScore ?? item?.aiScore); }
function roleAttack(item) { return num(item?.roleAttack ?? item?.role?.attack ?? item?.attackScore); }
function st(item) { return num(item?.st ?? item?.startTiming ?? item?.features?.st); }
function exhibition(item) { return num(item?.exhibition ?? item?.exhibitionTime ?? item?.features?.exhibition); }

function ranking(prediction) {
  const p = predictionOf(prediction);
  const rows = p?.ranking || p?.aiCore?.ranking || p?.scores || p?.boatScores || [];
  return Array.isArray(rows) ? rows.map(x => ({...x, boatNo: boatNo(x)})).filter(x => x.boatNo) : [];
}

function pairFeatures(inner, challenger) {
  const innerSt = st(inner), challengerSt = st(challenger);
  const innerRole = roleAttack(inner), challengerRole = roleAttack(challenger);
  const innerEx = exhibition(inner), challengerEx = exhibition(challenger);
  if ([innerSt, challengerSt, innerRole, challengerRole, innerEx, challengerEx].some(v => v === null)) return null;
  return {
    st: innerSt - challengerSt,
    roleAttack: challengerRole - innerRole,
    exhibition: innerEx - challengerEx
  };
}

function matches(features) {
  return Boolean(features && features.st >= CANDIDATE.st && features.roleAttack >= CANDIDATE.roleAttack && features.exhibition >= CANDIDATE.exhibition);
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function applyCandidate(record) {
  const base = predictionOf(record);
  const ranked = ranking(base);
  if (!ranked.length || ranked[0].boatNo !== 1) return { prediction: clone(base), triggered: false, reason: 'baseline-top-not-1' };
  const inner = ranked.find(x => x.boatNo === 1);
  let challenger = null;
  for (const no of [3, 4]) {
    const row = ranked.find(x => x.boatNo === no);
    if (row && matches(pairFeatures(inner, row))) { challenger = row; break; }
  }
  if (!challenger) return { prediction: clone(base), triggered: false, reason: 'candidate-condition-not-met' };
  const candidate = clone(base);
  const targetRanking = candidate?.ranking || candidate?.aiCore?.ranking || candidate?.scores || candidate?.boatScores;
  if (!Array.isArray(targetRanking)) return { prediction: candidate, triggered: false, reason: 'ranking-not-rewritable' };
  const adjusted = targetRanking.map(item => {
    const copy = {...item};
    if (boatNo(copy) === 1) {
      for (const key of ['total','score','effectiveScore','aiScore']) if (Number.isFinite(Number(copy[key]))) { copy[key] = Number(copy[key]) - CANDIDATE.penalty; break; }
    }
    return copy;
  }).sort((a,b) => (score(b) ?? -Infinity) - (score(a) ?? -Infinity) || (boatNo(a) ?? 99) - (boatNo(b) ?? 99));
  targetRanking.splice(0, targetRanking.length, ...adjusted);
  return { prediction: candidate, triggered: true, challengerBoatNo: challenger.boatNo };
}

function build() {
  const cohort = input.buildDefaultCohort();
  const holdout = cohort.records.filter(record => raceDate(record) >= HOLDOUT_START);
  const rows = [];
  const diagnostics = { eligible: holdout.length, triggered: 0, excludedMissingFrozenFeatures: 0 };
  for (const record of holdout) {
    const baseline = predictionOf(record);
    const applied = applyCandidate(record);
    if (!applied.triggered && applied.reason === 'candidate-condition-not-met' && ranking(baseline)[0]?.boatNo === 1) {
      const inner = ranking(baseline).find(x => x.boatNo === 1);
      const hasFrozen = [3,4].some(no => pairFeatures(inner, ranking(baseline).find(x => x.boatNo === no)) !== null);
      if (!hasFrozen) diagnostics.excludedMissingFrozenFeatures++;
    }
    if (applied.triggered) diagnostics.triggered++;
    rows.push(evaluator.evaluatePair({ baseline, candidate: applied.prediction, result: record.__officialResult }));
  }
  return { schemaVersion: 1, analysisId: 'inner-attack-holdout-final-ticket-v1', scope: { holdoutStart: HOLDOUT_START, holdoutUsed: true, productionChanged: false, candidate: CANDIDATE }, diagnostics: {...cohort.diagnostics, ...diagnostics}, result: evaluator.aggregate(rows) };
}

if (require.main === module) process.stdout.write(JSON.stringify(build(), null, 2) + '\n');
module.exports = { HOLDOUT_START, CANDIDATE, pairFeatures, matches, applyCandidate, build };
