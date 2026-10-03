'use strict';
// Research only. No production selector imports this module.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const POLICY = Object.freeze({ id: 'preserve-practical-same-count-v1', maximum: 24,
  discoveryEnd: '20260831', retrospectiveEnd: '20260920', prospectiveStart: '20260922',
  selection: 'stored practical tickets first, then stored display candidates in original order; retain original display count',
  productionChanged: false, automaticApplication: false });
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function values(list) {
  if (!Array.isArray(list)) return null;
  const out = list.map(x => typeof x === 'string' ? x : x?.ticket);
  if (!out.length || out.some(t => !/^[1-6]-[1-6]-[1-6]$/.test(t) || new Set(t.split('-')).size !== 3)) return null;
  return [...new Set(out)];
}
function select(pool, practical) {
  const a = values(pool), p = values(practical);
  if (!a || !p || a.length > 24 || p.length > 10 || p.length > a.length) return null;
  return [...new Set([...p, ...a])].slice(0, a.length);
}
function metrics(rows, side) {
  const tickets = rows.reduce((n,r) => n + r[side].length, 0);
  const hits = rows.filter(r => r[side].includes(r.actual));
  const returned = hits.reduce((n,r) => n + r.payout, 0);
  return { races: rows.length, hits: hits.length, tickets, stake: tickets * 100, returned,
    hitRate: rows.length ? 100 * hits.length / rows.length : null,
    recoveryRate: tickets ? returned / tickets : null };
}
function compare(rows) {
  const a = metrics(rows, 'a'), b = metrics(rows, 'b');
  const gains = rows.filter(r => !r.a.includes(r.actual) && r.b.includes(r.actual));
  const losses = rows.filter(r => r.a.includes(r.actual) && !r.b.includes(r.actual));
  const profitDelta = b.returned - a.returned;
  return { a, b, changed: rows.filter(r => r.a.join() !== r.b.join()).length,
    gains: gains.length, losses: losses.length, netHits: b.hits - a.hits,
    returnDelta: profitDelta, returnDeltaWithoutLargestGain: profitDelta - Math.max(0, ...gains.map(r => r.payout)),
    pairedRaceKeys: rows.map(r => r.raceKey), cohortFingerprint: hash(rows.map(r => [r.raceKey,r.a,r.b,r.actual,r.payout])) };
}
function build(records, getCandidates, gate) {
  const rows = [], excluded = {}, seen = new Set();
  const skip = reason => { excluded[reason] = (excluded[reason] || 0) + 1; };
  for (const r of records) {
    const p = r.prediction || {}, rr = r.__officialResult || {};
    const raceKey = r.__analysisRaceKey || r.raceKey;
    if (!raceKey || seen.has(raceKey)) { skip('missing-or-duplicate-race-key'); continue; }
    seen.add(raceKey);
    if (p.officialResultUsedForPrediction === true) { skip('result-used-for-prediction'); continue; }
    if (rr.void || rr.status === 'void' || rr.refund || rr.refunded || rr.refunds?.length ||
        rr.starts?.some(s => s.falseStart || s.lateStart) || (rr.finishers?.length && rr.finishers.length !== 6)) {
      skip('refund-or-void'); continue;
    }
    const actual = rr.trifecta?.combination, payout = rr.trifecta?.payout;
    if (!values([actual]) || !Number.isFinite(payout) || payout <= 0) { skip('missing-official-payout'); continue; }
    const stored = p.candidate24Tickets;
    const pool = stored || (p.confidence != null && p.manshuPower != null && p.mainSheet && p.manshuSheet
      ? getCandidates(p, p.practicalTickets) : null);
    const b = select(pool, p.practicalTickets), a = values(pool);
    if (!b) { skip('missing-or-invalid-saved-ticket-evidence'); continue; }
    const fingerprint = p.verificationEvidence?.generation?.logicFingerprint ||
      r.shadowV2Reference?.logicFingerprint || r.logicFingerprint;
    if (!fingerprint) { skip('missing-logic-fingerprint'); continue; }
    rows.push({ raceKey, date: raceKey.slice(0,8), fingerprint: String(fingerprint), a, b, actual, payout,
      candidateBasis: stored ? 'stored-candidate24' : 'reconstructed-from-stored-sheets-not-prospective-evidence' });
  }
  const cohorts = [...new Set(rows.map(r => r.fingerprint))].map(fingerprint => {
    const group = rows.filter(r => r.fingerprint === fingerprint);
    return { fingerprint, discovery: compare(group.filter(r => r.date <= POLICY.discoveryEnd)),
      retrospectiveCheck: compare(group.filter(r => r.date > POLICY.discoveryEnd && r.date <= POLICY.retrospectiveEnd)),
      laterDiagnostic: compare(group.filter(r => r.date > POLICY.retrospectiveEnd)) };
  });
  return { schemaVersion: 1, policy: POLICY, candidateFingerprint: hash(POLICY), generatedAt: new Date().toISOString(),
    sourceSha: process.env.GITHUB_SHA || null, productionChanged: false, automaticApplication: false,
    usableForPrediction: false, excluded, cohorts, rows,
    decision: gate({candidateId: POLICY.id}),
    limitations: ['Historical periods have previously been inspected: neither is an untouched holdout.',
      'No preregistered production gate for this new candidate: cannot adopt from this retrospective diagnostic.',
      'No new head or ticket is invented. Practical selection and its hit rate are unchanged.',
      'Research comparison only; current usual prediction count and UI are unchanged.'] };
}
function main() {
  const root = path.resolve(__dirname, '..');
  const { load } = require('./phase9-live-improvement-cycle.cjs');
  const { createDisplayCandidates } = require('../js/note-generator');
  const { decide } = require('./phase11-improvement-decision-gate.cjs');
  const out = build(load({root}), createDisplayCandidates, decide);
  const output = path.join(root, 'data/stats/preserve-practical-candidates-research.json');
  fs.mkdirSync(path.dirname(output), {recursive: true});
  const temporary = output + '.' + process.pid + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(out, null, 2) + '\n');
  fs.renameSync(temporary, output);
  console.log(JSON.stringify({...out, rows: undefined, cohorts: out.cohorts.map(c => ({...c,
    discovery: {...c.discovery, pairedRaceKeys: undefined},
    retrospectiveCheck: {...c.retrospectiveCheck, pairedRaceKeys: undefined},
    laterDiagnostic: {...c.laterDiagnostic, pairedRaceKeys: undefined}}))}));
}
if (require.main === module) main();
module.exports = { POLICY, select, compare, build };
