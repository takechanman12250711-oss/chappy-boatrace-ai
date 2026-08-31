'use strict';

const fs = require('node:fs');
const path = require('node:path');
const outerAttack = require('../js/outer-attack-ticket-shadow.js');

const ROOT = path.resolve(__dirname, '..');
const PROMOTION_INPUT = path.join(ROOT, 'data', 'stats', 'local-water-priority-selector-shadow-replay.json');
const PREDICTION_DIR = path.join(ROOT, 'data', 'predictions');

const WEIGHTS = outerAttack.BASELINE_PROFILE?.weights || {
  raceFlow: 0.25, courseIndex: 0.24, roleAttack: 0.11, st: 0.1,
  exhibition: 0.09, roleHold: 0.08, rolePickup: 0.03, local: 0.05,
  turn: 0.025, national: 0.02, motor: 0.005
};

function raceKey(row = {}) {
  return `${String(row.date || '')}-${String(row.jcd || '').padStart(2, '0')}-${Number(row.raceNo || 0)}`;
}
function loadDaily() {
  if (!fs.existsSync(PREDICTION_DIR)) return [];
  const out = [];
  for (const name of fs.readdirSync(PREDICTION_DIR).filter(n => /^\d{8}\.json$/.test(n)).sort()) {
    const doc = JSON.parse(fs.readFileSync(path.join(PREDICTION_DIR, name), 'utf8'));
    for (const source of ['predictions', 'verificationPredictions']) {
      for (const row of Array.isArray(doc?.[source]) ? doc[source] : []) out.push(row);
    }
  }
  return out;
}
function replayBasis(record = {}) {
  return record.practicalSelection?.frameRiseFallReplayBasis ||
    record.prediction?.practicalSelection?.frameRiseFallReplayBasis ||
    record.frameRiseFallReplayBasis || null;
}
function components(analysis = {}) {
  const indexes = analysis.indexes || {};
  const roles = analysis.roleScores || {};
  return {
    raceFlow: Number(indexes.raceFlow),
    courseIndex: Number(analysis.courseStructureTheory?.appliedIndex),
    roleAttack: Number(roles.attack),
    st: Number(indexes.st),
    exhibition: Number(indexes.exhibition),
    roleHold: Number(roles.hold),
    rolePickup: Number(roles.pickup),
    local: Number(indexes.local),
    turn: Number(indexes.turn),
    national: Number(indexes.national),
    motor: Number(indexes.motor)
  };
}
function finiteObject(row) {
  return Object.values(row).every(Number.isFinite);
}
function gapBand(value) {
  if (!Number.isFinite(value)) return 'unknown';
  if (value <= 0) return '<=0';
  if (value <= 0.5) return '0-0.5';
  if (value <= 1.5) return '0.5-1.5';
  if (value <= 3) return '1.5-3';
  return '3+';
}
function summarize(rows, fn) {
  const map = new Map();
  for (const row of rows) {
    const key = String(fn(row));
    const cur = map.get(key) || { total: 0, rescue: 0, falsePromotion: 0 };
    cur.total++;
    if (row.rescuedOuterWinner) cur.rescue++; else cur.falsePromotion++;
    map.set(key, cur);
  }
  for (const value of map.values()) value.rescueRate = Number((100 * value.rescue / value.total).toFixed(1));
  return Object.fromEntries([...map.entries()].sort((a,b) => b[1].total-a[1].total || a[0].localeCompare(b[0])));
}
function build(report, predictions) {
  const byKey = new Map();
  for (const row of predictions) if (!byKey.has(raceKey(row))) byKey.set(raceKey(row), row);
  const rows = [];
  for (const promoted of (report?.switchedRaces || []).filter(r => r?.shadowOuterPromotion === true)) {
    const source = byKey.get(raceKey(promoted));
    const analyses = replayBasis(source)?.analyses;
    if (!Array.isArray(analyses)) continue;
    const outer = analyses.find(a => Number(a?.boatNo) === Number(promoted.shadowHead));
    const current = analyses.find(a => Number(a?.boatNo) === Number(promoted.currentHead));
    if (!outer || !current) continue;
    const oc = components(outer), cc = components(current);
    if (!finiteObject(oc) || !finiteObject(cc)) continue;
    const gaps = {};
    const weighted = {};
    for (const key of Object.keys(WEIGHTS)) {
      gaps[key] = Number((oc[key] - cc[key]).toFixed(3));
      weighted[key] = Number((gaps[key] * WEIGHTS[key]).toFixed(4));
    }
    const attackComposite = Number((weighted.st + weighted.roleAttack + weighted.exhibition).toFixed(4));
    const supportComposite = Number((weighted.roleHold + weighted.rolePickup + weighted.local + weighted.turn).toFixed(4));
    const flowCourseComposite = Number((weighted.raceFlow + weighted.courseIndex).toFixed(4));
    rows.push({
      date: promoted.date, jcd: promoted.jcd, raceNo: promoted.raceNo, venue: promoted.venue,
      conditionBand: promoted.conditionBand, currentHead: promoted.currentHead, shadowHead: promoted.shadowHead,
      actualHead: promoted.actualHead, rescuedOuterWinner: promoted.rescuedOuterWinner === true,
      scoreImprovement: promoted.scoreImprovement, gaps, weighted,
      attackComposite, supportComposite, flowCourseComposite,
      attackCompositeBand: gapBand(attackComposite),
      supportCompositeBand: gapBand(supportComposite),
      flowCourseCompositeBand: gapBand(flowCourseComposite)
    });
  }
  return {
    schemaVersion: 1,
    analysisId: 'outer-head-signal-overlay-v1',
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    usableForPrediction: false,
    warning: 'Retrospective hypothesis-generation only. No subgroup may be adopted without a preregistered forward shadow test.',
    totals: { matchedPromotionRows: rows.length, rescue: rows.filter(r => r.rescuedOuterWinner).length, falsePromotion: rows.filter(r => !r.rescuedOuterWinner).length },
    byAttackCompositeBand: summarize(rows, r => r.attackCompositeBand),
    bySupportCompositeBand: summarize(rows, r => r.supportCompositeBand),
    byFlowCourseCompositeBand: summarize(rows, r => r.flowCourseCompositeBand),
    byCurrentHead: summarize(rows, r => r.currentHead),
    byOuterHead: summarize(rows, r => r.shadowHead),
    byConditionBand: summarize(rows, r => r.conditionBand),
    rows
  };
}
function main() {
  const report = JSON.parse(fs.readFileSync(PROMOTION_INPUT, 'utf8'));
  process.stdout.write(JSON.stringify(build(report, loadDaily()), null, 2) + '\n');
}
if (require.main === module) main();
module.exports = { build, gapBand, summarize };
