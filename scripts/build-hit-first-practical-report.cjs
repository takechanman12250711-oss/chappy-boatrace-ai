'use strict';
// Read-only evaluation. Never selects tickets, changes stakes, or approves a model.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const VERSION = 'hit-first-practical-v1';
const LABELS = Object.freeze({
  hit: '的中', headMissing: '1着艇の買い目なし',
  pairMissing: '1・2着の組なし', thirdMissing: '3着不足'
});
function tickets(value) {
  if (!Array.isArray(value) || !value.length || value.length > 10) throw Error('invalid-ticket-count');
  const out = value.map(x => typeof x === 'string' ? x : x?.ticket);
  if (out.some(x => typeof x !== 'string' || !/^[1-6]-[1-6]-[1-6]$/.test(x) || new Set(x.split('-')).size !== 3)) throw Error('invalid-ticket');
  if (new Set(out).size !== out.length) throw Error('duplicate-ticket');
  return out;
}
function pct(n, d) { return d ? Math.round(n / d * 10000) / 100 : null; }
function summary(rows, field = 'base') {
  let hits = 0, stakeYen = 0, returnYen = 0;
  for (const r of rows) {
    const ts = tickets(r[field]);
    if (ts.includes(r.actual)) { hits++; returnYen += r.payout; }
    stakeYen += ts.length * 100;
  }
  return { races: rows.length, hits, hitRate: pct(hits, rows.length), stakeYen, returnYen,
    profitYen: returnYen - stakeYen, roi: pct(returnYen, stakeYen) };
}
function classify(base, actual) {
  const ts = tickets(base); tickets([actual]);
  if (ts.includes(actual)) return 'hit';
  if (!ts.some(t => t[0] === actual[0])) return 'headMissing';
  return ts.some(t => t.slice(0, 3) === actual.slice(0, 3)) ? 'thirdMissing' : 'pairMissing';
}
function diagnose(rows) {
  const count = { hit: 0, headMissing: 0, pairMissing: 0, thirdMissing: 0 };
  const byWinningBoat = {}, byTicketCount = {}, seen = new Set();
  for (const r of rows) {
    if (!r.raceKey || seen.has(r.raceKey)) throw Error('duplicate-or-missing-race');
    seen.add(r.raceKey);
    const k = classify(r.base, r.actual), boat = r.actual[0], n = tickets(r.base).length;
    count[k]++;
    byWinningBoat[boat] ||= { races: 0, hit: 0, headMissing: 0, pairMissing: 0, thirdMissing: 0 };
    byWinningBoat[boat].races++; byWinningBoat[boat][k]++;
    byTicketCount[n] ||= { races: 0, hit: 0, headMissing: 0, pairMissing: 0, thirdMissing: 0 };
    byTicketCount[n].races++; byTicketCount[n][k]++;
  }
  return { races: rows.length, counts: count, byWinningBoat, byTicketCount,
    interpretation: 'Exact saved-ticket coverage, not a causal finding or a proposed winning-ticket rule.' };
}
function validatePairRows(rows) {
  const seen = new Set();
  for (const r of rows) {
    if (!r.raceKey || seen.has(r.raceKey)) throw Error('duplicate-or-missing-race');
    seen.add(r.raceKey);
    tickets([r.actual]);
    if (!Number.isSafeInteger(r.payout) || r.payout < 0) throw Error('invalid-payout');
    if (tickets(r.base).length !== tickets(r.candidate).length) throw Error('different-ticket-budget');
  }
}
function compare(rows) {
  validatePairRows(rows);
  let gains = 0, losses = 0, changedRaces = 0;
  for (const r of rows) {
    const left = tickets(r.base), right = tickets(r.candidate);
    const a = left.includes(r.actual), b = right.includes(r.actual);
    if (!a && b) gains++;
    if (a && !b) losses++;
    if ([...left].sort().join('|') !== [...right].sort().join('|')) changedRaces++;
  }
  const base = summary(rows), candidate = summary(rows, 'candidate'), netHits = gains - losses;
  const hitDecision = !rows.length ? 'UNSETTLED' : !changedRaces ? 'NO_CHANGED_TICKETS'
    : netHits > 0 ? 'OBSERVED_HIT_GAIN_ONLY' : netHits < 0 ? 'HIT_RATE_WORSE' : 'NO_HIT_RATE_GAIN';
  return {
    primary: { baseHits: base.hits, candidateHits: candidate.hits, races: rows.length,
      baseHitRate: base.hitRate, candidateHitRate: candidate.hitRate, gains, losses, netHits,
      hitRateDifferencePoints: pct(netHits, rows.length), changedRaces, hitDecision },
    secondary: { base: { stakeYen: base.stakeYen, returnYen: base.returnYen, profitYen: base.profitYen, roi: base.roi },
      candidate: { stakeYen: candidate.stakeYen, returnYen: candidate.returnYen, profitYen: candidate.profitYen, roi: candidate.roi },
      profitDifferenceYen: candidate.profitYen - base.profitYen,
      roiDifferencePoints: rows.length ? Math.round((candidate.roi - base.roi) * 100) / 100 : null },
    adoptionStatus: 'NOT_APPROVED', automaticApplication: false,
    interpretation: 'A positive historical or small-sample hit difference is not proof of future improvement. ROI never changes hitDecision.'
  };
}
function loadShadow(root, letter, file) {
  const full = path.join(root, 'data/stats', file);
  if (!fs.existsSync(full)) return { status: 'REPORT_UNAVAILABLE' };
  const s = JSON.parse(fs.readFileSync(full, 'utf8'));
  if (s.productionChanged !== false || s.automaticApplication !== false || s.adoptionStatus !== 'NOT_APPROVED' || s.sourceDiagnostics?.complete !== true) return { status: 'UNVERIFIED_SOURCE' };
  try {
    const rows = (s.rows || []).map(r => ({ raceKey: r.raceKey, base: r.base,
      candidate: r[letter], actual: r.actual, payout: r.payout }));
    const result = compare(rows);
    if (s.counts?.settledRaces !== rows.length || s.gains !== result.primary.gains || s.losses !== result.primary.losses) throw Error('shadow-count-mismatch');
    return { status: 'VERIFIED_EXISTING_REPORT', generatedAt: s.generatedAt,
      logicFingerprint: s.logicFingerprint, counts: s.counts, ...result };
  } catch (e) { return { status: 'UNVERIFIED_SOURCE', reason: e.message }; }
}
function build(root = path.resolve(__dirname, '..')) {
  const input = require('./analysis-input-contract');
  const source = require('./eight-ticket-promotion-report-source.cjs');
  const ledgerHelpers = require('./build-continuous-performance-ledger.cjs');
  const evaluator = require('./final-ticket-candidate-evaluator.cjs');
  const full = path.join(root, 'data/stats/continuous-performance-ledger.json');
  const bytes = fs.readFileSync(full), ledger = JSON.parse(bytes);
  if (ledger.analysisId !== 'continuous-performance-ledger-v1' || ledger.policy?.stakePerTicketYen !== 100 || !Array.isArray(ledger.rows)) throw Error('unsupported-ledger');
  // Keep precisely the saved ledger population. No cherry-picked race filter.
  const frozen = ledger.rows.slice(-100), keys = new Set(frozen.map(r => r.raceKey));
  if (keys.size !== frozen.length) throw Error('duplicate-ledger-race');
  const canonical = new Map(), sources = [], sourceErrors = [];
  for (const date of [...new Set(frozen.map(r => r.raceKey.slice(0, 8)))].sort()) {
    try {
      const d = source.readDay(root, date);
      for (const r of input.mergePredictionSources(d.data.predictions, d.data.verificationPredictions)) canonical.set(input.raceKey(r), r);
      sources.push({ date, source: d.source, updatedAt: d.data.updatedAt });
    } catch (e) { sourceErrors.push({ date, reason: e.message }); }
  }
  const official = input.collectOfficialResults(path.join(root, 'data/results'), keys);
  const details = [], failures = [];
  for (const r of frozen) {
    try {
      const p = canonical.get(r.raceKey), o = official.get(r.raceKey);
      if (!p || !o) throw Error('missing-source-or-official-result');
      const timingError = input.preDeadlineReason(p);
      if (timingError) throw Error(timingError);
      if ((p.selectedAt || p.capturedAt) !== r.selectedAt) throw Error('capture-mismatch');
      if (ledgerHelpers.generationOf(p) !== r.generationKey) throw Error('generation-mismatch');
      const base = tickets(ledgerHelpers.practicalTickets(p.prediction || p));
      const actual = input.actualTicket(o), payout = evaluator.payout(o);
      tickets([actual]);
      if (!Number.isSafeInteger(payout) || payout < 0) throw Error('invalid-payout');
      if (actual !== r.actualTicket || base.length !== r.ticketCount || base.includes(actual) !== r.hit || base.length * 100 !== r.stakeYen || (r.hit ? payout : 0) !== r.returnYen) throw Error('ledger-row-mismatch');
      const pool = (p.prediction || p).practicalSelection?.candidateOutcomes;
      const row = { raceKey: r.raceKey, selectedAt: r.selectedAt, generationKey: r.generationKey,
        base, actual, payout, missType: classify(base, actual),
        candidatePoolHasActual: Array.isArray(pool) ? pool.some(x => x?.ticket === actual) : null };
      details.push(row);
    } catch (e) { failures.push({ raceKey: r.raceKey, reason: e.message }); }
  }
  const allVerified = failures.length === 0 && sourceErrors.length === 0;
  const observed = summary(details);
  if (allVerified && ['races', 'hits', 'stakeYen', 'returnYen', 'profitYen', 'hitRate', 'roi'].some(k => observed[k] !== ledger.rolling100[k])) throw Error('rolling100-summary-mismatch');
  return { version: VERSION, generatedAt: new Date().toISOString(), productionChanged: false,
    automaticApplication: false, adoptionStatus: 'NOT_APPROVED',
    policy: { primary: 'race-hit-rate', secondary: 'roi-and-profit-separate',
      noOddsInSelection: true, sameRacePopulationRequired: true, sameTicketCountPerRaceRequired: true,
      maximumPracticalTickets: 10, stakePerTicketYen: 100, noNewPredictionRules: true },
    source: { ledgerGeneratedAt: ledger.generatedAt, ledgerSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      frozenRaceKeys: [...keys], sources, sourceErrors, failures, expectedRaces: frozen.length,
      verifiedRaces: details.length, complete: allVerified },
    baseline: { savedRolling100: ledger.rolling100, verified: observed,
      primary: { races: observed.races, hits: observed.hits, hitRate: observed.hitRate },
      secondary: { stakeYen: observed.stakeYen, returnYen: observed.returnYen, profitYen: observed.profitYen, roi: observed.roi } },
    diagnosis: diagnose(details),
    shadows: { A: loadShadow(root, 'A', 'eight-ticket-promotion-shadow-report.json'),
      C: loadShadow(root, 'C', 'eight-ticket-exhibition-shadow-report.json') }, details };
}
if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  const destination = process.argv[2] || path.join(root, 'data/stats/hit-first-practical-report.json');
  const report = build(root);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ file: destination, complete: report.source.complete,
    primary: report.baseline.primary, secondary: report.baseline.secondary, diagnosis: report.diagnosis.counts }));
  if (!report.source.complete) process.exitCode = 1;
}
module.exports = { VERSION, LABELS, tickets, pct, summary, classify, diagnose, compare, loadShadow, build };
