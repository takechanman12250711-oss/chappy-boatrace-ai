'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const audit = require('../scripts/analyze-ticket-miss-attribution-v1.cjs');
const f = require('./helpers/report-input-fixture.cjs');
const baseline = ['1-2-3', '1-2-4', '1-2-5', '1-3-2', '1-3-4', '1-4-2', '1-4-3'];
const allTickets = [];
for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) {
  if (new Set([a, b, c]).size === 3) allTickets.push(`${a}-${b}-${c}`);
}
function record(raceNo = 1, actual = '2-1-3', rank = 8, date = '20261003') {
  const row = f.prediction(raceNo, date);
  const later = allTickets.filter(t => !baseline.includes(t) && t !== actual).slice(0, 19);
  if (rank !== null) later.splice(rank - 8, 0, actual);
  row.prediction.practicalTickets = [...baseline];
  row.prediction.practicalSelection = { targetDecisions: [{ scenarioSummary: 'saved scenario',
    candidateDecisions: later.map((ticket, i) => ({ ticket, score: 100 - i })) }] };
  return row;
}

// All three exclusive miss types, each search boundary, a candidate beyond 24,
// a missing candidate, hits, partial pools and empty pools through the full build.
f.withArchive(root => {
  const cases = [['2-1-3', 8], ['1-5-2', 12], ['1-2-6', 13], ['3-2-1', 18],
    ['1-6-3', 19], ['1-4-5', 24], ['6-5-4', 25], ['6-4-5', null]];
  const rows = cases.map(([actual, rank], i) => record(i + 1, actual, rank));
  rows.push(record(9), record(10), record(11));
  rows[9].prediction.practicalTickets = [baseline[0]];
  rows[9].prediction.practicalSelection = {};
  rows[10].prediction.practicalTickets = [];
  rows[10].prediction.practicalSelection = {};
  f.saveDay(root, '20261003', rows, [], rows.map((r, i) => f.official(r, cases[i]?.[0] || baseline[0])));
  const report = f.parity(audit, root);
  assert.equal(report.diagnostics.settledJoinCount, 11);
  assert.equal(report.diagnostics.eligibleRaceCount, 10);
  assert.equal(report.diagnostics.baselineHitCount, 2);
  assert.equal(report.diagnostics.missCount, 8);
  assert.deepEqual(report.rows.map(r => r.exactCandidateRankWithin24), [8, 12, 13, 18, 19, 24, null, null]);
  assert.deepEqual(report.exactCandidateRankBands, { '8-12': 2, '13-18': 2, '19-24': 2, 'not-in-first24': 2 });
  assert.deepEqual(Object.values(report.buckets).map(b => [b.missCount, b.exactCandidateWithin12,
    b.exactCandidateWithin18, b.exactCandidateWithin24, b.candidateGapCount, b.wrongOrderSameBoatsCount]),
  [[4, 1, 2, 2, 2, 2], [2, 1, 1, 2, 0, 1], [2, 0, 1, 2, 0, 0]]);
  for (const flag of ['productionChanged', 'automaticApplication', 'usableForPrediction']) assert.equal(report[flag], false);
});

// Preserve reader fallback, score/source order, official eligibility and the
// canonical primary/last-row precedence. Full/raw build is the reference.
const changes = [
  r => { Object.assign(r, r.prediction); delete r.prediction; },
  ...[null, false, 0, '', [], {}].map(value => r => {
    r.preRaceConditions = r.prediction.preRaceConditions; r.practicalTickets = [...baseline]; r.prediction = value;
  }),
  r => { r.practicalSelection = r.prediction.practicalSelection; delete r.prediction.practicalSelection; },
  r => { r.practicalTickets = [{ ticket: '2-1-3', score: 999 }]; r.prediction.tickets = [{ boats: [6, 5, 4], effectiveScore: '88' }]; },
  r => { r.prediction.formations = Object.fromEntries(['main', 'mainline', 'cover', 'flow', 'hole'].map((key, i) => [key, [{ ticket: allTickets[30 + i], selectionScore: 400 }]])); },
  r => { r.prediction.practicalSelection.targetDecisions[0].candidateDecisions = [{ ticket: { combination: '2-1-3' }, priorityScore: null }, { combination: '1-5-2', candidateScore: 80 }, { ticket: baseline[0], score: 100000 }]; },
  r => { r.prediction.practicalSelection.targetDecisions[0].bestCandidateTicket = { ticket: '2-1-3', score: 200 }; r.prediction.practicalSelection.expansionSummary = { addedTickets: [{ ticket: '1-5-2', score: 200, reason: 'saved reason' }] }; },
  r => { r.capturedAt = r.selectedAt; r.selectedAt = ''; },
  r => { r.prediction.preRaceConditions.sourceFetchedAt = r.deadlineAt; },
  r => { r.raceKey = '20261003-21-1'; }
];
for (const change of changes) f.withArchive(root => {
  const r = record(); change(r);
  f.saveDay(root, '20261003', [r], [], [f.official(record(), '2-1-3')]);
  f.parity(audit, root);
});
f.withArchive(root => {
  const rows = Array.from({ length: 7 }, (_, i) => record(i + 1));
  const verification = f.clone(rows[1]);
  rows[0].selectedAt = rows[0].deadlineAt;
  rows[1].isRetrospective = true;
  rows[2].prediction.preRaceConditions.officialResultUsed = true;
  const results = rows.slice(0, 6).map(r => f.official(r, '2-1-3'));
  results[3].source = 'untrusted'; results[4].resultAvailable = false;
  const last = f.clone(rows[5]); last.prediction.practicalTickets = ['2-1-3'];
  f.saveDay(root, '20261003', [...rows, last], [verification], results);
  const report = f.parity(audit, root);
  assert.equal(report.diagnostics.canonicalPredictionCount, 7);
  assert.equal(report.diagnostics.preDeadlinePredictionCount, 4);
  assert.equal(report.diagnostics.settledJoinCount, 1);
  assert.equal(report.diagnostics.baselineHitCount, 1);
  assert.equal(report.diagnostics.missCount, 0);
});

// Each day fits under 96 MiB, but retaining 168 MiB of unused snapshots does not.
f.withArchive(root => {
  const payload = 'unused-snapshot-'.repeat(65536);
  for (let day = 1; day <= 28; day++) {
    const date = `202610${String(day).padStart(2, '0')}`;
    const rows = Array.from({ length: 6 }, (_, i) => {
      const r = record(i + 1, '2-1-3', 8, date); r.prediction.unusedSnapshot = payload; return r;
    });
    f.saveDay(root, date, rows, [], rows.map(r => f.official(r, '2-1-3')));
  }
  const src = `const audit = require(${JSON.stringify(path.resolve(__dirname, '../scripts/analyze-ticket-miss-attribution-v1.cjs'))});
    const options = {root: ${JSON.stringify(root)}};
    if (process.argv[1] === 'full') options.compactPredictionRecord = null;
    const r = audit.build(options);
    if (r.rows.length !== 168 || r.diagnostics.missCount !== 168 || r.buckets['head-miss'].exactCandidateWithin12 !== 168) throw Error('changed audit');
    process.stdout.write(JSON.stringify({rows:r.rows.length}));`;
  const run = mode => spawnSync(process.execPath, ['--max-old-space-size=96', '-e', src, mode], {
    cwd: root, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024, env: { ...process.env, NODE_OPTIONS: '' }
  });
  const compact = run('compact');
  assert.equal(compact.error, undefined); assert.equal(compact.status, 0, compact.stderr);
  assert.deepEqual(JSON.parse(compact.stdout), { rows: 168 });
  const full = run('full');
  assert.equal(full.error, undefined); assert.notEqual(full.status, 0, 'negative control must fail with unused full history');
  assert.match(full.stderr, /heap out of memory|Reached heap limit|Allocation failed/i);
});
console.log('ticket miss attribution: full report parity, miss/rank boundaries, canonical precedence, immutable input and 96 MiB/OOM negative control passed');
