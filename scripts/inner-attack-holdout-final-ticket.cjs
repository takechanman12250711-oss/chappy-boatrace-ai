'use strict';

const input = require('./analysis-input-contract');
const evaluator = require('./final-ticket-candidate-evaluator.cjs');
const scoreAb = require('../js/effective-score-weight-ab');
const missReport = require('./build-effective-score-miss-attribution-report');

const HOLDOUT_START = '20260819';
const CANDIDATE = Object.freeze({ st: 0.75, roleAttack: 0.5, exhibition: 0, maxCourseGap: null, penalty: 4 });

function predictionOf(record) { return record?.prediction || record || {}; }
function raceDate(record) { return String(record?.__analysisRaceKey || input.raceKey(record) || '').slice(0, 8); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function analysesOf(record) {
  const p = predictionOf(record);
  const candidates = [record?.analyses, p?.analyses, record?.effectiveScore?.analyses, p?.effectiveScore?.analyses, record?.effectiveScoreBasis?.analyses, p?.effectiveScoreBasis?.analyses];
  return candidates.find(rows => Array.isArray(rows) && rows.length === 6) || null;
}
function pairFeatures(inner, challenger) {
  if (!inner || !challenger) return null;
  return {
    st: Number(inner.components.st) - Number(challenger.components.st),
    roleAttack: Number(challenger.components.roleAttack) - Number(inner.components.roleAttack),
    exhibition: Number(inner.components.exhibition) - Number(challenger.components.exhibition)
  };
}
function matches(features) {
  return Boolean(features && Number.isFinite(features.st) && Number.isFinite(features.roleAttack) && Number.isFinite(features.exhibition) && features.st >= CANDIDATE.st && features.roleAttack >= CANDIDATE.roleAttack && features.exhibition >= CANDIDATE.exhibition);
}
function replayRanking(record, baseline, weightConfig) {
  const analyses = analysesOf(record);
  if (!analyses) return null;
  try { return scoreAb.rankAnalyses(analyses, baseline, weightConfig); }
  catch { return null; }
}
function applyCandidate(record, baseline, weightConfig) {
  const basePrediction = predictionOf(record);
  const ranked = replayRanking(record, baseline, weightConfig);
  if (!ranked) return { prediction: clone(basePrediction), triggered: false, reason: 'frozen-analyses-missing' };
  const base = ranked[0];
  if (base.boatNo !== 1) return { prediction: clone(basePrediction), triggered: false, reason: 'baseline-top-not-1' };
  const inner = ranked.find(x => x.boatNo === 1);
  let challengerNo = null;
  for (const no of [3, 4]) {
    const challenger = ranked.find(x => x.boatNo === no);
    if (matches(pairFeatures(inner, challenger))) { challengerNo = no; break; }
  }
  if (challengerNo === null) return { prediction: clone(basePrediction), triggered: false, reason: 'candidate-condition-not-met' };
  const adjusted = ranked.map(item => ({...item, adjustedTotal: item.total - (item.boatNo === 1 ? CANDIDATE.penalty : 0)}))
    .sort((a,b) => b.adjustedTotal - a.adjustedTotal || b.roleAttack - a.roleAttack || a.boatNo - b.boatNo);
  const candidate = clone(basePrediction);
  candidate.ranking = adjusted.map(item => ({boatNo:item.boatNo, total:item.adjustedTotal, roleAttack:item.roleAttack, components:item.components}));
  return { prediction: candidate, triggered: true, challengerBoatNo: challengerNo, baselineTopBoatNo: base.boatNo, candidateTopBoatNo: adjusted[0].boatNo };
}
function build() {
  const cohort = input.buildDefaultCohort();
  const {weightConfig} = missReport.loadDiscovery();
  const baseline = scoreAb.baselineProfile(weightConfig);
  const holdout = cohort.records.filter(record => raceDate(record) >= HOLDOUT_START);
  const rows = [];
  const diagnostics = { eligible: holdout.length, replayable: 0, triggered: 0, excludedMissingFrozenFeatures: 0 };
  for (const record of holdout) {
    const replayed = replayRanking(record, baseline, weightConfig);
    if (replayed) diagnostics.replayable++; else diagnostics.excludedMissingFrozenFeatures++;
    const applied = applyCandidate(record, baseline, weightConfig);
    if (applied.triggered) diagnostics.triggered++;
    rows.push(evaluator.evaluatePair({ baseline: predictionOf(record), candidate: applied.prediction, result: record.__officialResult }));
  }
  return { schemaVersion:1, analysisId:'inner-attack-holdout-final-ticket-v2', scope:{holdoutStart:HOLDOUT_START,holdoutUsed:true,productionChanged:false,candidate:CANDIDATE}, diagnostics:{...cohort.diagnostics,...diagnostics}, result:evaluator.aggregate(rows) };
}

if (require.main === module) process.stdout.write(JSON.stringify(build(), null, 2) + '\n');
module.exports = { HOLDOUT_START, CANDIDATE, analysesOf, pairFeatures, matches, replayRanking, applyCandidate, build };
