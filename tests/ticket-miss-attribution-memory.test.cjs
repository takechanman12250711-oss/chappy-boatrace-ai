'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const miss = require('../scripts/analyze-ticket-miss-attribution-v1.cjs');
const expansion = require('../scripts/analyze-ticket-expansion-7-12-18-24.cjs');
const { compactFourStageRecord } = require('../scripts/report-input-projection.cjs');
const f = require('./helpers/report-input-fixture.cjs');
const tickets = [];
for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) {
  if (new Set([a, b, c]).size === 3) tickets.push(`${a}-${b}-${c}`);
}
const baseline = tickets.slice(0, 7);
function record(raceNo = 1, date = '20261003', actual = '2-1-3', rank = 8) {
  const r = f.prediction(raceNo, date);
  const candidates = tickets.filter(t => !baseline.includes(t) && t !== actual).slice(0, 19);
  if (rank > 7) candidates.splice(rank - 8, 0, actual);
  r.prediction.practicalTickets = baseline;
  r.prediction.practicalSelection = { targetDecisions: [{ scenarioSummary: 'saved scenario',
    candidateDecisions: candidates.map((ticket, i) => ({ ticket, score: 100 - i, reason: `saved reason ${i}` })) }] };
  return r;
}
function poolParity(r) {
  assert.deepEqual(expansion.collectTicketPool(compactFourStageRecord(r)), expansion.collectTicketPool(r),
    'the entire saved candidate order, scores and explanations must survive projection');
}

// Independently expected exclusive attribution, exact boundary ranks, wrong
// permutations, absent candidates, empty pools and deadline exclusion.
f.withArchive(root => {
  const cases = [
    [baseline[6], 7], ['2-1-3', 8], ['1-4-2', 12], ['1-3-6', 13],
    ['2-1-4', 18], ['1-5-4', 19], ['1-3-6', 24], ['1-4-3', 25], ['6-5-4', null],
    ['1-2-4', null], ['1-2-3', null], ['1-2-3', 1]
  ];
  const rows = cases.map(([actual, rank], i) => record(i + 1, '20261003', actual, rank));
  rows[9].prediction.practicalTickets = ['1-2-3']; rows[9].prediction.practicalSelection = {};
  rows[10].prediction.practicalTickets = []; rows[10].prediction.practicalSelection = {};
  rows[11].selectedAt = rows[11].deadlineAt;
  rows.forEach(poolParity);
  f.saveDay(root, '20261003', rows, [], rows.map((r, i) => f.official(r, cases[i][0], 1200)));
  const report = f.parity(miss, root);
  const orderedRows = [...report.rows].sort((a, b) => Number(a.raceKey.split('-')[2]) - Number(b.raceKey.split('-')[2]));
  assert.equal(report.diagnostics.canonicalPredictionCount, 12);
  assert.equal(report.diagnostics.preDeadlinePredictionCount, 11);
  assert.equal(report.diagnostics.settledJoinCount, 11);
  assert.equal(report.diagnostics.eligibleRaceCount, 10);
  assert.equal(report.diagnostics.baselineHitCount, 1);
  assert.equal(report.diagnostics.missCount, 9);
  assert.deepEqual(orderedRows.map(r => r.exactCandidateRankWithin24), [8, 12, 13, 18, 19, 24, null, null, null]);
  assert.deepEqual(orderedRows.map(r => r.missType), ['head-miss', 'second-miss', 'third-miss', 'head-miss', 'second-miss', 'third-miss', 'second-miss', 'head-miss', 'third-miss']);
  assert.deepEqual(report.exactCandidateRankBands, { '8-12': 2, '13-18': 2, '19-24': 2, 'not-in-first24': 3 });
  assert.deepEqual(Object.values(report.buckets).map(b => b.missCount), [3, 3, 3]);
  assert.deepEqual(Object.values(report.buckets).map(b => b.exactCandidateWithin12), [1, 1, 0]);
  assert.deepEqual(Object.values(report.buckets).map(b => b.exactCandidateWithin18), [2, 1, 1]);
  assert.deepEqual(Object.values(report.buckets).map(b => b.exactCandidateWithin24), [2, 2, 2]);
  assert.deepEqual(orderedRows.map(r => r.wrongOrderSameBoats), [true, true, false, true, false, false, true, false, false]);
  assert.deepEqual(report.improvementPriorityByRecoverableWithin12.map(p => p.missType), ['head-miss', 'second-miss', 'third-miss']);
  for (const flag of ['productionChanged', 'automaticApplication', 'usableForPrediction']) assert.equal(report[flag], false);
});

// Legacy envelopes, ticket aliases, source precedence, stable score ties,
// eligibility and official-result formats remain unchanged through the report.
const changes = [
  r => { Object.assign(r, r.prediction); delete r.prediction; },
  ...[null, false, 0, '', [], {}].map(value => r => { r.preRaceConditions = r.prediction.preRaceConditions; r.practicalTickets = baseline; r.prediction = value; }),
  r => { r.practicalSelection = r.prediction.practicalSelection; delete r.prediction.practicalSelection; },
  r => { r.practicalTickets = [{ ticket: '2-1-3', score: 999 }]; r.prediction.tickets = [{ boats: [6, 5, 4], effectiveScore: '88' }]; },
  r => { r.prediction.formations = Object.fromEntries(['main', 'mainline', 'cover', 'flow', 'hole'].map((key, i) => [key, [{ ticket: tickets[30 + i], selectionScore: 400, scenario: key }]])); },
  r => { r.prediction.practicalSelection.targetDecisions[0].candidateDecisions = [{ ticket: { combination: '2-1-3' }, priorityScore: null }, { combination: '2-1-4', candidateScore: 80 }, { ticket: baseline[0], score: 100000 }, { boats: [2, 1, 5], score: 80 }]; },
  r => { r.prediction.practicalSelection.targetDecisions[0].bestCandidateTicket = { ticket: '2-1-3', score: 200 }; r.prediction.practicalSelection.expansionSummary = { addedTickets: [{ ticket: '2-1-4', score: 200, reason: 'saved reason' }] }; },
  r => { r.capturedAt = r.selectedAt; r.selectedAt = ''; },
  r => { r.createdAt = r.selectedAt; r.selectedAt = null; },
  r => { r.prediction.preRaceConditions.sourceFetchedAt = r.deadlineAt; },
  r => { r.prediction.preRaceConditions.schemaVersion = 3; delete r.prediction.preRaceConditions.sourceFetchedAt; },
  r => { r.prediction.preRaceConditions.source = 'untrusted'; },
  r => { r.prediction.officialResultUsedForPrediction = true; },
  r => { r.isRetrospective = true; },
  r => { r.raceKey = '20261003-21-1'; }
];
for (const change of changes) f.withArchive(root => {
  const r = record(); change(r); poolParity(r);
  f.saveDay(root, '20261003', [r], [], [f.official(record(), '2-1-3', 4800)]);
  f.parity(miss, root);
});
for (const resultChange of [
  r => { r.source = 'untrusted'; }, r => { r.resultAvailable = false; },
  r => { delete r.trifecta; r.officialResult = { resultTicket: '2-1-3', payout3t: '4,800円' }; },
  r => { delete r.trifecta; r.finishers = [{ rank: 3, boat: 3 }, { rank: 1, boat: 2 }, { rank: 2, boat: 1 }]; }
]) f.withArchive(root => {
  const r = record(), result = f.official(r, '2-1-3'); resultChange(result);
  f.saveDay(root, '20261003', [r], [], [result]); f.parity(miss, root);
});
f.withArchive(root => {
  const first = record(), last = record(); last.prediction.practicalTickets = ['6-5-4']; last.prediction.practicalSelection = {};
  const excluded = record(2); excluded.isRetrospective = true;
  f.saveDay(root, '20261003', [first, last, excluded], [first, record(2), record(3)], [f.official(first, '2-1-3'), f.official(record(2)), f.official(record(3), '2-1-3')]);
  const report = f.parity(miss, root);
  assert.equal(report.diagnostics.canonicalPredictionCount, 3);
  assert.equal(report.diagnostics.preDeadlinePredictionCount, 2);
  assert.deepEqual(report.rows[0].baselineTickets, ['6-5-4']);
  assert.deepEqual(report.rows.map(r => r.raceKey), [first.raceKey, record(3).raceKey]);
});
f.withArchive(root => { assert.equal(f.parity(miss, root).diagnostics.eligibleRaceCount, 0); });

// Each daily JSON fits in 96 MiB. Retaining all 168 MiB of unused history must
// fail, while the same real build path with the default projection completes.
f.withArchive(root => {
  const payload = 'unused-snapshot-'.repeat(65536);
  for (let day = 1; day <= 28; day++) {
    const date = `202610${String(day).padStart(2, '0')}`;
    const rows = Array.from({ length: 6 }, (_, i) => { const r = record(i + 1, date); r.prediction.unusedSnapshot = payload; return r; });
    f.saveDay(root, date, rows, [], rows.map(r => f.official(r, '2-1-3')));
  }
  const src = `const mod = require(${JSON.stringify(path.resolve(__dirname, '../scripts/analyze-ticket-miss-attribution-v1.cjs'))});
    const options = { root: ${JSON.stringify(root)} };
    if (process.argv[1] === 'full') options.compactPredictionRecord = null;
    const r = mod.build(options);
    if (r.rows.length !== 168 || r.diagnostics.baselineHitCount !== 0 || r.buckets['head-miss'].exactCandidateWithin12 !== 168 || r.exactCandidateRankBands['8-12'] !== 168) throw Error('changed attribution');
    process.stdout.write(JSON.stringify({ rows: r.rows.length }));`;
  const run = mode => spawnSync(process.execPath, ['--max-old-space-size=96', '-e', src, mode], {
    cwd: root, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024, env: { ...process.env, NODE_OPTIONS: '' }
  });
  const compact = run('compact');
  assert.equal(compact.error, undefined); assert.equal(compact.status, 0, compact.stderr);
  assert.deepEqual(JSON.parse(compact.stdout), { rows: 168 });
  const full = run('full');
  assert.equal(full.error, undefined); assert.notEqual(full.status, 0, 'negative control must detect retained full history');
  assert.match(full.stderr, /heap out of memory|Reached heap limit|Allocation failed/i);
});
console.log('ticket miss attribution: full report parity, attribution/rank boundaries, complete pool, source precedence, immutable input and 96 MiB negative control passed');
