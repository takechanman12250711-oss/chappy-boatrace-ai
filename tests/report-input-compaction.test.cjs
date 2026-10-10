'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const input = require('../scripts/analysis-input-contract.js');
const shadow = require('../js/outer-attack-ticket-shadow.js');
const replay = require('../scripts/build-playful-manshu-20260923.cjs');
const f = require('./helpers/report-input-fixture.cjs');
const modules = [
  ['ledger', require('../scripts/build-continuous-performance-ledger.cjs'), 'build-continuous-performance-ledger.cjs'],
  ['outer', require('../scripts/build-outer-attack-gate-dropoff.cjs'), 'build-outer-attack-gate-dropoff.cjs'],
  ['playful', require('../scripts/build-playful-link-position-forward.cjs'), 'build-playful-link-position-forward.cjs']
];
const mutate = fn => { const r = f.prediction(); fn(r); return r; };
const eligibility = [
  ['', () => {}],
  ['source-timing-not-pre-deadline', r => { r.prediction.preRaceConditions.sourceTiming = 'post_deadline'; }],
  ['official-result-flag-not-false', r => { r.prediction.preRaceConditions.officialResultUsed = 'false'; }],
  ...['officialResultUsedForPrediction', 'officialResultUsedForEvaluation'].flatMap(key => [
    ['official-result-used', r => { r[key] = true; }], ['official-result-used', r => { r.prediction[key] = true; }]
  ]),
  ['retrospective-record', r => { r.isRetrospective = true; }],
  ['retrospective-record', r => { r.prediction.isRetrospective = true; }],
  ['retrospective-record', r => { r.verificationMode = 'RETROSPECTIVE'; }],
  ['retrospective-record', r => { r.prediction.predictionMode = 'retrospective-analysis'; }],
  ['timestamp-missing', r => { r.selectedAt = 'invalid'; r.capturedAt = '2026-10-03T05:00:00Z'; }],
  ['timestamp-missing', r => { r.deadlineAt = '2026-02-30T06:00:00Z'; }],
  ['timestamp-missing', r => { r.selectedAt = '2026-10-03T05:00:00'; }],
  ['schema-version-invalid', r => { r.prediction.preRaceConditions.schemaVersion = 'bogus'; }],
  ['source-label-missing', r => { delete r.prediction.preRaceConditions.source; }],
  ['unsupported-source', r => { r.prediction.preRaceConditions.source = 'untrusted-boatrace-official'; }],
  ['source-fetch-timestamp-missing', r => { delete r.prediction.preRaceConditions.sourceFetchedAt; }],
  ['source-fetched-at-or-after-deadline', r => { r.prediction.preRaceConditions.sourceFetchedAt = r.deadlineAt; }],
  ['source-fetched-after-capture', r => { r.prediction.preRaceConditions.sourceFetchedAt = '2026-10-03T05:30:00Z'; }],
  ['captured-at-or-after-deadline', r => { r.selectedAt = r.deadlineAt; }],
  ['', r => { r.capturedAt = r.selectedAt; r.selectedAt = ''; r.deadline = r.deadlineAt; r.deadlineAt = ''; r.prediction.preRaceConditions.dataSource = r.prediction.preRaceConditions.source; delete r.prediction.preRaceConditions.source; }],
  ['', r => { r.createdAt = r.selectedAt; delete r.selectedAt; r.preRaceConditions = r.prediction.preRaceConditions; delete r.prediction.preRaceConditions; }],
  ['', r => { r.prediction.preRaceConditions.schemaVersion = 3; delete r.prediction.preRaceConditions.source; delete r.prediction.preRaceConditions.sourceFetchedAt; }],
  ['retrospective-record', r => { Object.assign(r, r.prediction); delete r.prediction; r.predictionMode = 'retrospective'; }]
];
const identity = [
  f.prediction(), mutate(r => { r.raceNo = 2; }), mutate(r => { r.raceKey = 'legacy-raw-key'; }),
  mutate(r => { r.raceDate = r.date; r.placeCode = r.jcd; r.rno = r.raceNo; delete r.date; delete r.jcd; delete r.raceNo; delete r.raceKey; }),
  mutate(r => { r.targetDate = r.date; r.race = { placeCode: r.jcd, rno: r.raceNo }; delete r.date; delete r.jcd; delete r.raceNo; delete r.raceKey; }),
  mutate(r => { r.race = { date: r.date, jcd: r.jcd, raceNo: r.raceNo }; delete r.date; delete r.jcd; delete r.raceNo; delete r.raceKey; })
];
for (const [name, mod] of modules) {
  assert.equal(typeof mod.compactPredictionRecord, 'function', `${name} must expose its default projector`);
  for (const [reason, change] of eligibility) {
    const record = mutate(change), before = f.clone(record);
    assert.equal(input.preDeadlineReason(record), reason);
    assert.equal(input.preDeadlineReason(mod.compactPredictionRecord(record)), reason, `${name}: ${reason}`);
    assert.deepEqual(record, before);
  }
  for (const record of identity) assert.equal(input.raceKey(mod.compactPredictionRecord(record)), input.raceKey(record), name);
}

// Malformed source rows are ignored by canonical identity selection, not fatal.
for (const [name, mod] of modules) f.withArchive(root => {
  const valid = f.prediction();
  f.saveDay(root, '20261003', [null, false, 0, '', 'bad-record', [], {}, valid], [null], [f.official(valid)]);
  const report = f.parity(mod, root);
  assert.equal(report.rows.length, 1, `${name}: malformed rows must not suppress valid rows`);
});

// Preserve accessor-specific truthy fallbacks, empty arrays, ticket object precedence,
// numeric strings, score aliases, malformed values, and generation precedence.
const variants = [
  f.prediction(),
  ...[null, false, 0, '', [], {}].map(value => mutate(r => { r.prediction.practicalTickets = value; r.prediction.practicalSelection.tickets = ['1-4-3']; })),
  mutate(r => { r.prediction.practicalTickets = [null, 123, [1, 2, 3], {}, { combination: 0, ticket: '1-2-3' }, { combination: '1-3-2', ticket: '1-4-3', text: '1-5-2' }]; }),
  mutate(r => { r.prediction.practicalTickets = [{ ticket: '', text: '1-4-3' }, { combination: { ticket: '1-2-3' } }]; }),
  mutate(r => { r.prediction.verificationEvidence = null; r.prediction.practicalSelection.verificationEvidence = { generation: { logicFingerprint: 'fallback', confidenceDefinitionVersion: 'v2', ticketPolicyVersion: 'v2' } }; }),
  mutate(r => { r.prediction.verificationEvidence = {}; r.prediction.practicalSelection.verificationEvidence = { generation: { logicFingerprint: 'suppressed', confidenceDefinitionVersion: 'v2', ticketPolicyVersion: 'v2' } }; }),
  mutate(r => { r.prediction.verificationEvidence.generation = { logicFingerprint: '', confidenceDefinitionVersion: 0, ticketPolicyVersion: null }; }),
  mutate(r => { r.practicalSelection = { frameRiseFallReplayBasis: {} }; }),
  mutate(r => { r.frameRiseFallReplayBasis = r.prediction.practicalSelection.frameRiseFallReplayBasis; delete r.prediction.practicalSelection; }),
  mutate(r => { r.practicalSelection = { frameRiseFallReplayBasis: r.prediction.practicalSelection.frameRiseFallReplayBasis }; delete r.prediction.practicalSelection; }),
  mutate(r => { r.prediction.practicalSelection.frameRiseFallReplayBasis.analyses[2].indexes.st = '51'; }),
  mutate(r => { r.prediction.practicalSelection.frameRiseFallReplayBasis.analyses[2].indexes.st = 'invalid'; }),
  mutate(r => { r.prediction.practicalSelection.frameRiseFallReplayBasis.analyses = []; }),
  mutate(r => { r.prediction.boatEvaluation.evaluations = []; r.prediction.mainSheet.evaluations = [{ boatNo: 4, hold: 100 }]; }),
  mutate(r => { delete r.prediction.boatEvaluation; r.prediction.mainSheet.evaluations = [{ number: 4, hold: '65' }, { waku: 3, expected: 70 }, { boat: 5, hold: null }]; }),
  mutate(r => { r.prediction.mainSheet.honmei.boatNo = 0; r.prediction.verificationEvidence.marks = { honmei: { boatNo: '1' } }; }),
  mutate(r => { r.prediction.candidate24Tickets = [null, 123, [1, 4, 3], { combination: '1-3-2', ticket: '1-4-3' }, '1-3-2']; }),
  mutate(r => { r.prediction.preRaceConditions.boats = null; r.prediction.preRaceConditions.escapeEvaluationEvidence = { entries: [{ number: 2, registrationNumber: 123, name: 'saved' }] }; }),
  mutate(r => { Object.assign(r, r.prediction); delete r.prediction; })
];
function outcome(fn, record) {
  try { return { value: fn(record) }; } catch (error) { return { error: error.name }; }
}
for (const [name, mod] of modules) {
  for (const record of variants) {
    const before = f.clone(record), projected = mod.compactPredictionRecord(record);
    const accessor = name === 'ledger' ? r => mod.evaluate({ ...r, __analysisRaceKey: input.raceKey(r), __officialResult: f.official(f.prediction()) })
      : name === 'outer' ? shadow.detectSignal : replay.candidates;
    assert.deepEqual(outcome(accessor, projected), outcome(accessor, record), `${name} accessor parity`);
    assert.deepEqual(record, before, `${name} projector must not mutate nested input`);
    // Builders retain existing malformed-input errors as well as valid outputs.
    f.withArchive(root => {
      f.saveDay(root, '20261003', [record], [], [f.official(f.prediction())]);
      const build = options => outcome(() => f.comparable(mod.build(options)));
      assert.deepEqual(build({ root }), build({ root, compactPredictionRecord: null }), `${name} malformed/fallback report parity`);
    });
  }
  const large = f.prediction();
  const marker = 'UNUSED-LARGE-SNAPSHOT-'.repeat(1024);
  large.unused = marker; large.prediction.unused = marker;
  large.prediction.preRaceConditions.unused = marker;
  large.prediction.practicalSelection.unused = marker;
  large.prediction.verificationEvidence.unused = marker;
  large.prediction.mainSheet.unused = marker;
  large.prediction.boatEvaluation.unused = marker;
  const projected = mod.compactPredictionRecord(large);
  assert.equal(JSON.stringify(projected).includes('UNUSED-LARGE-SNAPSHOT'), false, name);
  assert.ok(JSON.stringify(projected).length < 8000, name);
  assert.equal(large.prediction.unused, marker);
}

// One day fits, but 168 MiB of retained snapshots cannot fit in this 96 MiB heap.
// Same build path and fixtures, with only projection disabled in the negative control.
f.withArchive(root => {
  const days = 28, rowsPerDay = 6, payload = 'unused-snapshot-'.repeat(65536);
  for (let day = 1; day <= days; day++) {
    const date = `202610${String(day).padStart(2, '0')}`;
    const records = Array.from({ length: rowsPerDay }, (_, i) => {
      const record = f.prediction(i + 1, date); record.prediction.unusedSnapshot = payload; return record;
    });
    f.saveDay(root, date, records);
  }
  for (const [name, , filename] of modules) {
    const source = `
      const mod = require(${JSON.stringify(path.resolve(__dirname, '../scripts'))} + '/' + ${JSON.stringify(filename)});
      const options = { root: ${JSON.stringify(root)} };
      if (process.argv[1] === 'uncompacted') options.compactPredictionRecord = null;
      const report = mod.build(options);
      if (report.rows.length !== ${days * rowsPerDay}) throw new Error('lost report rows');
      if (${JSON.stringify(name)} === 'ledger' && report.cumulative.returnYen !== ${days * rowsPerDay * 1200}) throw new Error('changed accounting');
      if (${JSON.stringify(name)} === 'outer' && report.counts.active !== ${days * rowsPerDay}) throw new Error('changed gates');
      if (${JSON.stringify(name)} === 'playful' && report.candidate.tickets !== ${days * rowsPerDay * 4}) throw new Error('changed candidate count');
      process.stdout.write(JSON.stringify({ rows: report.rows.length }));
    `;
    const run = mode => spawnSync(process.execPath, ['--max-old-space-size=96', '-e', source, mode], {
      cwd: root, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024,
      env: { ...process.env, NODE_OPTIONS: '' }
    });
    const compact = run('compacted');
    assert.equal(compact.error, undefined, name); assert.equal(compact.status, 0, `${name}: ${compact.stderr}`);
    assert.deepEqual(JSON.parse(compact.stdout.trim()), { rows: days * rowsPerDay });
    const full = run('uncompacted');
    assert.equal(full.error, undefined, name); assert.notEqual(full.status, 0, `${name}: fixture must detect full-corpus retention`);
    assert.match(full.stderr, /heap out of memory|Reached heap limit|Allocation failed/i, `${name}: negative control must exhaust JavaScript heap`);
  }
});
console.log('report input compaction: three projectors, eligibility, identity, fallback parity, no mutation, 96 MiB heap controls passed');
