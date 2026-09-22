'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const input = require('./analysis-input-contract');
const archive = require('./daily-prediction-source-archive');
const { decide } = require('./phase11-improvement-decision-gate.cjs');
const count = (obj, key) => { obj[key] = (obj[key] || 0) + 1; };
const tickets = rows => Array.isArray(rows)
  ? [...new Set(rows.map(input.normalizeTicket).filter(Boolean))] : [];
const boat = n => Number.isInteger(Number(n)) && Number(n) >= 1 && Number(n) <= 6 ? Number(n) : null;
function compact(record, source) {
  const p = record.prediction || {}, e = p.verificationEvidence || {};
  const selected = Array.isArray(p.practicalTickets) ? p.practicalTickets : p.practicalSelection?.tickets;
  const pool = Array.isArray(p.candidate24Tickets) ? p.candidate24Tickets : null;
  const escape = (e.scenarios || []).find(s => s.type === 'escape');
  const c = p.preRaceConditions || {};
  return {
    raceKey: input.raceKey(record), date: record.date, jcd: String(record.jcd).padStart(2, '0'),
    selectedAt: record.selectedAt || record.capturedAt || record.createdAt,
    source, sourceCommit: e.sourceCommit || '',
    generation: record.reviewEvidence?.method || [e.sourceCommit || 'unknown-commit', e.aiCoreVersion || '',
      JSON.stringify(e.generation || {})].join('|'),
    head: boat(e.marks?.honmei?.boatNo ?? p.mainSheet?.honmei?.boatNo),
    mainScenario: e.mainScenario?.type || 'unknown',
    mainScore: e.mainScenario?.score ?? null,
    escape: escape ? { head: boat(escape.headBoatNo ?? escape.attackerBoatNo ?? escape.attacker), score: escape.score } : null,
    selected: tickets(selected), selectedKnown: Array.isArray(selected), pool: tickets(pool), poolKnown: !!pool,
    mainTickets: tickets((selected || []).filter(t => t?.category === '本線' || t?.displayCategory === '本命')),
    historyCaptured: c.escapeEvaluationEvidence?.historyStatus === 'captured',
    skillCaptured: Array.isArray(c.escapeEvaluationEvidence?.racerSkillTheory?.roles),
    courseOne: c.boats?.filter(b => b.courseOfficial === true && Number(b.course) === 1).map(b => boat(b.boatNo)) || []
  };
}
function resultOf(r) {
  if (!r || !input.isOfficialResultSource(r)) return null;
  if (r.void || r.status === 'void' || r.refund || r.refunded || r.refunds?.length ||
      r.starts?.some(s => s.falseStart || s.lateStart) || (r.finishers?.length && r.finishers.length !== 6))
    return { excluded: 'refund-or-void' };
  if (r.resultAvailable !== true) return null;
  const actual = input.actualTicket(r), payout = Number(r.trifecta?.payout ?? r.payoutPer100 ?? r.payout);
  if (!actual) return null;
  if (!Number.isFinite(payout) || payout <= 0) return { excluded: 'unknown-payout' };
  return { actual, payout, winningMethod: input.winningMethod(r) };
}
function settle(row, result) {
  if (!result || result.excluded) return null;
  const escapeHead = row.escape?.head;
  const actual = result.actual, headOneWins = actual.startsWith('1-');
  const candidateHit = row.poolKnown ? row.pool.includes(actual) : null;
  const practicalHit = row.selected.includes(actual);
  let missingStage = 'not-a-missed-boat1-win';
  if (headOneWins && !practicalHit) {
    if (!row.poolKnown) missingStage = 'candidate-pool-unavailable';
    else if (candidateHit) missingStage = 'candidate-hit-practical-miss';
    else if (!row.pool.some(t => t.startsWith('1-'))) missingStage = 'candidate-head1-missing';
    else if (!row.pool.some(t => t.slice(0, 3) === actual.slice(0, 3))) missingStage = 'candidate-second-missing';
    else missingStage = 'candidate-third-missing';
  }
  return { ...row, ...result, practicalHit, candidateHit, headOneWins, missingStage,
    escapeInPractical: escapeHead ? row.selected.some(t => Number(t[0]) === escapeHead) : null,
    escapeInMain: escapeHead ? row.mainTickets.some(t => Number(t[0]) === escapeHead) : null,
    escapeTopButDifferentHead: !!row.escape && Number.isFinite(row.escape.score) &&
      Number.isFinite(row.mainScore) && row.escape.score > row.mainScore && row.head !== escapeHead };
}
function summarize(rows) {
  const mainHeads = {}, actualHeads = {}, missingStages = {};
  const n = rows.length, stake = rows.reduce((s, r) => s + 100 * r.selected.length, 0);
  const hits = rows.filter(r => r.practicalHit).length;
  const returned = rows.reduce((s, r) => s + (r.practicalHit ? r.payout : 0), 0);
  for (const r of rows) { count(mainHeads, r.head || 'unknown'); count(actualHeads, r.actual[0]); count(missingStages, r.missingStage); }
  return { races: n, mainHeads, actualHeads, missingStages, hits, stake, returned,
    hitRate: n ? hits / n * 100 : null, recoveryRate: stake ? returned / stake * 100 : null,
    boat1Wins: rows.filter(r => r.headOneWins).length,
    officialEscapeWins: rows.filter(r => r.winningMethod === '逃げ').length,
    missedBoat1Wins: rows.filter(r => r.headOneWins && !r.practicalHit).length,
    missedBoat1WinsWithoutAnyBoat1Ticket: rows.filter(r => r.headOneWins && !r.selected.some(t => t.startsWith('1-'))).length,
    historyCaptured: rows.filter(r => r.historyCaptured).length,
    skillCaptured: rows.filter(r => r.skillCaptured).length,
    escapeScenarioKnown: rows.filter(r => r.escape).length,
    escapeTopButDifferentHead: rows.filter(r => r.escapeTopButDifferentHead).length };
}
function build(rows, diagnostics = {}) {
  const groups = field => Object.fromEntries([...new Set(rows.map(r => r[field]))].sort().map(k => [k, summarize(rows.filter(r => r[field] === k))]));
  return { version: 'escape-main-audit-v1', generatedAt: new Date().toISOString(),
    sourceCommit: process.env.GITHUB_SHA || '', analysisInputContract: 'official-pre-deadline-cohort-v1',
    noteInputContract: 'existing-race-review-progress-assess: immutable audited pre-deadline exhibition-complete bundle',
    productionChanged: false, automaticProductionChange: false, usableForPrediction: false,
    unitYen: 100, stakeBasis: 'Hypothetical equal 100-yen stakes on saved practical tickets, not user purchases.', diagnostics, total: summarize(rows),
    byVenue: Array.from({ length: 24 }, (_, i) => { const jcd = String(i + 1).padStart(2, '0'); return { jcd, ...summarize(rows.filter(r => r.jcd === jcd)) }; }),
    bySource: groups('source'), byGeneration: groups('generation'), byScenario: groups('mainScenario'),
    decisionGate: decide({ evaluatedCount: rows.length }),
    limitation: 'Diagnostic only. Missing escape/boat1 tickets do not prove a replacement improves hit rate or ROI. Boat1 win is not synonymous with official escape. No retrospective input filling. No candidate or holdout performance claim.',
    rows };
}
function main(root = process.cwd()) {
  const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
  const chosen = new Map(), diagnostics = { excluded: {}, inputFiles: [], selectionSource: 'latest eligible pre-deadline snapshot per race; daily primary preferred over daily verification' };
  function ingest(r, source, assessedNote = false) {
    // Old note bundles have a different, already established evidence contract.
    // assess() validates those captures; do not invent conditions for missing fields.
    const reason = assessedNote && !r.prediction?.preRaceConditions ? '' : input.preDeadlineReason(r);
    const key = input.raceKey(r);
    if (reason || !key) { count(diagnostics.excluded, reason || 'invalid-identity'); return; }
    const row = compact(r, source);
    if (!row.selectedKnown || !row.selected.length) { count(diagnostics.excluded, 'no-saved-practical-tickets'); return; }
    const old = chosen.get(key);
    if (!old || Date.parse(row.selectedAt) > Date.parse(old.selectedAt)) chosen.set(key, row);
  }
  const dates = [...new Set([...archive.predictionSourceDates(root), ...archive.archivedSourceDates(root)])].sort();
  for (const date of dates) {
    archive.restorePredictionSource({ rootDirectory: root, date });
    const file = path.join(root, 'data/predictions', `${date}.json`), raw = fs.readFileSync(file), d = JSON.parse(raw);
    diagnostics.inputFiles.push({ path: `data/predictions/${date}.json`, sha256: crypto.createHash('sha256').update(raw).digest('hex'), updatedAt: d.updatedAt || '' });
    const primary = new Set((d.predictions || []).map(input.raceKey));
    for (const r of input.mergePredictionSources(d.predictions || [], d.verificationPredictions || []))
      ingest(r, primary.has(input.raceKey(r)) ? 'daily-primary' : 'daily-verification');
  }
  // Read immutable all-race bundles as well; automatic V2 selections alone are not all races.
  const dir = path.join(root, 'data/note-drafts');
  const assess = fs.existsSync(dir) ? require('./build-race-review-progress').assess : null;
  for (const date of fs.existsSync(dir) ? fs.readdirSync(dir).filter(x => /^\d{8}$/.test(x)).sort() : []) {
    for (const file of fs.readdirSync(path.join(dir, date)).filter(x => x.endsWith('.json')).sort()) {
      const b = read(path.join(dir, date, file)), a = assess(b);
      if (a.reason) { count(diagnostics.excluded, `note:${a.reason}`); continue; }
      ingest(b.record, 'all-race-note', true);
    }
  }
  // Retain official void records too; the cohort helper intentionally drops records
  // without a winning ticket, which would otherwise mislabel a void as pending.
  const results = new Map();
  for (const date of new Set([...chosen.keys()].map(key => key.slice(0, 8)))) {
    const file = path.join(root, 'data/results', `${date}.json`);
    if (!fs.existsSync(file)) continue;
    for (const r of read(file).races || []) {
      const key = input.raceKey(r, date);
      if (chosen.has(key) && input.isOfficialResultSource(r)) results.set(key, r);
    }
  }
  const ledgerPath = path.join(root, 'data/stats/race-review-results.json');
  if (fs.existsSync(ledgerPath)) for (const r of Object.values(read(ledgerPath).races || {})) {
    const key = input.raceKey(r);
    if (chosen.has(key) && !results.has(key) && input.isOfficialResultSource(r)) results.set(key, r);
  }
  const rows = [];
  for (const [key, row] of chosen) {
    const r = resultOf(results.get(key));
    if (!r || r.excluded) { count(diagnostics.excluded, r?.excluded || 'official-result-unavailable'); continue; }
    rows.push(settle(row, r));
  }
  rows.sort((a, b) => a.raceKey.localeCompare(b.raceKey));
  if (!rows.length) throw new Error('No eligible settled practical predictions; audit is not complete.');
  diagnostics.eligiblePredictions = chosen.size;
  const report = build(rows, diagnostics);
  const out = path.join(root, 'data/stats/escape-main-audit.json');
  archive.atomicWrite(out, JSON.stringify(report) + '\n');
  console.log(JSON.stringify({ total: report.total, bySource: report.bySource, decisionGate: report.decisionGate, exclusions: diagnostics.excluded }));
  return report;
}
if (require.main === module) main();
module.exports = { compact, resultOf, settle, summarize, build, main };
