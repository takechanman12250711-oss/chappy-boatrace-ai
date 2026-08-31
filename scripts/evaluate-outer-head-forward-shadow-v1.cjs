'use strict';

const fs = require('node:fs');
const path = require('node:path');
const overlay = require('./analyze-outer-head-signal-overlay.cjs');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config', 'outer-head-forward-shadow-v1.json');
const INPUT_PATH = path.join(ROOT, 'data', 'stats', 'local-water-priority-selector-shadow-replay.json');
const PREDICTION_DIR = path.join(ROOT, 'data', 'predictions');

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function raceKey(row = {}) {
  return `${String(row.date || '')}-${String(row.jcd || '').padStart(2, '0')}-${Number(row.raceNo || 0)}`;
}
function loadPredictions() {
  if (!fs.existsSync(PREDICTION_DIR)) return [];
  const rows = [];
  for (const name of fs.readdirSync(PREDICTION_DIR).filter(n => /^\d{8}\.json$/.test(n)).sort()) {
    const doc = loadJson(path.join(PREDICTION_DIR, name));
    for (const source of ['predictions', 'verificationPredictions']) {
      for (const row of Array.isArray(doc?.[source]) ? doc[source] : []) rows.push(row);
    }
  }
  return rows;
}
function inRange(value, band) {
  if (!band) return true;
  const n = Number(value);
  if (!Number.isFinite(n)) return false;
  if (Number.isFinite(Number(band.minimum)) && n < Number(band.minimum)) return false;
  if (Number.isFinite(Number(band.maximum)) && n > Number(band.maximum)) return false;
  return true;
}
function structuralEligible(row, rule) {
  const current = Number(row.currentHead), outer = Number(row.shadowHead), improvement = Number(row.scoreImprovement);
  return rule.currentHeadBoatNos.includes(current) &&
    rule.outerHeadBoatNos.includes(outer) &&
    Number.isFinite(improvement) &&
    improvement >= rule.minimumScoreImprovement && improvement <= rule.maximumScoreImprovement &&
    !rule.excludedConditionBands.includes(String(row.conditionBand || 'unknown'));
}
function eligible(row, rule) {
  return structuralEligible(row, rule) &&
    inRange(row.attackComposite, rule.attackComposite) &&
    inRange(row.supportComposite, rule.supportComposite);
}
function pct(n, d) { return d ? Number((100 * n / d).toFixed(2)) : 0; }
function summarize(rows) {
  const activations = rows.length;
  const rescues = rows.filter(r => Number(r.actualHead) === Number(r.shadowHead)).length;
  const falseActivations = activations - rescues;
  return {
    eligibleRaceCount: activations,
    actualOuterHeadWinnerCount: rescues,
    rescuedOuterHeadWinnerCount: rescues,
    falseActivationCount: falseActivations,
    rescueRatePercent: pct(rescues, activations),
    falseActivationsPerRescue: rescues ? Number((falseActivations / rescues).toFixed(2)) : null,
    activationRatePercent: null
  };
}
function breakdown(rows, field) {
  const out = {};
  for (const row of rows) {
    const key = String(row[field] ?? 'unknown');
    if (!out[key]) out[key] = { eligibleRaceCount: 0, rescuedOuterHeadWinnerCount: 0, falseActivationCount: 0 };
    out[key].eligibleRaceCount += 1;
    if (Number(row.actualHead) === Number(row.shadowHead)) out[key].rescuedOuterHeadWinnerCount += 1;
    else out[key].falseActivationCount += 1;
  }
  return out;
}
function gateFor(summary, cfg, observedRaceCount, observedDays) {
  const result = { status: 'collecting', observedRaceCount, observedDays, nextMilestone: cfg.evaluation.milestones.find(n => observedRaceCount < n) || null };
  if (observedRaceCount >= 50 && summary.falseActivationsPerRescue !== null && summary.falseActivationsPerRescue > cfg.decisionGate.earlyHarmAt50.maximumFalseActivationsPerRescue) return { ...result, status: 'early-harm' };
  if (observedRaceCount >= 250 && observedDays >= cfg.evaluation.minimumDaysAt250) {
    const g = cfg.decisionGate.candidateAt250;
    const ok = summary.rescuedOuterHeadWinnerCount >= g.minimumRescuedOuterHeadWinnerCount && summary.falseActivationsPerRescue !== null && summary.falseActivationsPerRescue <= g.maximumFalseActivationsPerRescue;
    return { ...result, status: ok ? 'candidate-at-250' : 'reject-at-250' };
  }
  if (observedRaceCount >= 100 && observedDays >= cfg.evaluation.minimumDaysAt100) {
    const g = cfg.decisionGate.candidateAt100;
    const ok = summary.rescuedOuterHeadWinnerCount >= g.minimumRescuedOuterHeadWinnerCount && summary.falseActivationsPerRescue !== null && summary.falseActivationsPerRescue <= g.maximumFalseActivationsPerRescue;
    return { ...result, status: ok ? 'candidate-at-100' : 'continue-or-reject-at-100' };
  }
  return result;
}
function main() {
  const cfg = loadJson(CONFIG_PATH);
  const replay = loadJson(INPUT_PATH);
  const predictions = loadPredictions();
  const joined = overlay.build(replay, predictions).rows
    .filter(r => String(r.date || '') >= cfg.prospectiveStartDate);
  const dateSet = new Set(joined.map(r => String(r.date || '')).filter(Boolean));
  const observedDays = dateSet.size;
  const totalForwardPromotionRows = joined.length;
  const rules = {};
  for (const rule of cfg.candidateRules) {
    const rows = joined.filter(r => eligible(r, rule));
    const summary = summarize(rows);
    summary.activationRatePercent = pct(rows.length, totalForwardPromotionRows);
    rules[rule.id] = {
      rule,
      summary,
      gate: gateFor(summary, cfg, rows.length, observedDays),
      breakdown: {
        currentHeadBandBreakdown: breakdown(rows, 'currentHead'),
        outerHeadBandBreakdown: breakdown(rows, 'shadowHead'),
        conditionBandBreakdown: breakdown(rows, 'conditionBand')
      },
      rows
    };
  }
  const report = {
    schemaVersion: 1,
    analysisId: cfg.id,
    generatedAt: new Date().toISOString(),
    prospectiveStartDate: cfg.prospectiveStartDate,
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    source: 'saved pre-race predictions + local-water-priority-selector shadow replay',
    totalForwardPromotionRows,
    observedDays,
    rules,
    note: totalForwardPromotionRows === 0 ? 'No post-start matched promotion rows are available yet; this is expected before the prospective start produces completed races.' : 'Forward-only evaluation; frozen config is applied without retrospective retuning.'
  };
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}
if (require.main === module) main();
