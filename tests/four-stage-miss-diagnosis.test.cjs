'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const input = require('../scripts/analysis-input-contract.js');
const exp = require('../scripts/analyze-ticket-expansion-7-12-18-24.cjs');
const mod = require('../scripts/build-four-stage-miss-diagnosis.cjs');
const f = require('./helpers/report-input-fixture.cjs');
const base = ['1-2-3', '1-2-4', '1-3-2', '1-3-4', '2-1-3', '2-1-4', '2-3-1'];
const tickets = [];
for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) {
  if (new Set([a, b, c]).size === 3) tickets.push(`${a}-${b}-${c}`);
}
function record(raceNo = 1, date) {
  const r = f.prediction(raceNo, date);
  r.prediction.practicalTickets = base;
  r.prediction.practicalSelection = { targetDecisions: [], expansionSummary: { addedTickets: [] } };
  return r;
}
function mutate(fn) { const r = record(); fn(r); return r; }
function outcome(fn) { try { return { value: fn() }; } catch (error) { return { error: error.name }; } }
function pool(record) { return exp.collectTicketPool(record); }

// Every miss stage, top-24 rescue, rank beyond 24, missing pool and official
// result exclusions, and primary-over-verification precedence remain unchanged.
f.withArchive(root => {
  const records = Array.from({ length: 9 }, (_, i) => record(i + 1));
  const actuals = ['1-2-3', '6-5-4', '1-6-5', '1-2-6', '6-5-4', '6-5-4', '1-2-3', '1-2-3', '1-2-3'];
  for (let i = 1; i <= 3; i++) records[i].prediction.practicalSelection.expansionSummary.addedTickets = [actuals[i]];
  records[5].prediction.practicalSelection.expansionSummary.addedTickets = [
    ...tickets.filter(t => !base.includes(t) && t !== actuals[5]).slice(0, 19), actuals[5]
  ];
  records[6].prediction.practicalTickets = [];
  records[7].selectedAt = records[7].deadlineAt;
  const results = records.map((r, i) => f.official(r, actuals[i]));
  results[8].source = 'untrusted';
  const verification = f.clone(records[0]); verification.prediction.practicalTickets = ['6-5-4'];
  f.saveDay(root, '20261003', records, [verification], results);
  const report = f.parity(mod, root);
  assert.deepEqual(report.summary, {
    races: 6, hits: 1, headMiss: 3, secondMiss: 1, thirdMiss: 1, narrowingMiss: 3, absentFrom24: 2,
    misses: 5, hitRatePercent: 16.67, missShare: { head: 60, second: 20, third: 20, narrowing: 60, absentFrom24: 40 }
  });
  assert.deepEqual(report.rows.map(r => r.reason), ['head_miss_but_in_top24', 'second_place_miss_but_in_top24', 'third_place_miss_but_in_top24', 'head_miss', 'head_miss']);
  assert.deepEqual(report.rows.map(r => r.actualRank), [8, 8, 8, null, 27]);
  assert.deepEqual(report.rows[0].baseTickets, base);
  assert.equal(report.productionChanged, false); assert.equal(report.automaticApplication, false); assert.equal(report.usableForPrediction, false);
});

// Exercise all saved candidate paths together. Scores order only within the
// production/candidate groups; the first occurrence owns a duplicate's score.
const rich = record();
rich.practicalTickets = [{ ticket: '3-1-2', priorityScore: 4 }];
rich.practicalSelection = { targetDecisions: [{ candidateDecisions: ['6-4-2'] }] };
rich.prediction = { ...rich.prediction,
  practicalTickets: [{ ticket: '1-2-3', priorityScore: 3 }, { ticket: '1-3-2', score: 3 }],
  tickets: [{ combination: '2-1-3', effectiveScore: '6' }],
  formations: Object.fromEntries(['main', 'mainline', 'cover', 'flow', 'hole'].map((key, i) => [key, [{ boats: [4, i === 3 ? 5 : i + 1, 6], selectionScore: i }]])),
  practicalSelection: {
    targetDecisions: [{ scenarioSummary: 'saved scenario', candidateDecisions: [
      { ticket: '6-5-4', candidateScore: 900, reason: 'saved' },
      { ticket: '1-2-3', priorityScore: 99999 },
      { ticket: { combination: '6-4-3' }, score: null },
      { ticket: '6-3-2', score: 'bad', effectiveScore: '80' }
    ], bestCandidateTicket: { combination: '5-4-3', score: 80 } }],
    expansionSummary: { addedTickets: [{ ticket: '5-3-2', score: 80 }] }
  }
};
const variants = [rich, record(),
  ...[null, false, 0, '', [], {}].map(value => mutate(r => { r.prediction.practicalSelection = value; r.practicalSelection = rich.prediction.practicalSelection; })),
  ...[null, false, 0, '', [], {}].map(value => mutate(r => { r.prediction = value; r.preRaceConditions = f.prediction().prediction.preRaceConditions; r.practicalTickets = ['6-5-4']; })),
  mutate(r => { Object.assign(r, r.prediction); delete r.prediction; }),
  mutate(r => { r.prediction.practicalTickets = [null, false, 123, '', [], {}, [1, 2, 3, 4], { ticket: '', combination: '1-3-2' }, { ticket: { resultTicket: '4-3-2' } }]; }),
  mutate(r => { r.prediction.formations = { main: '1-2-3', mainline: [], cover: [null, '2-3-4'], flow: {}, hole: ['3-4-5'] }; }),
  mutate(r => { r.prediction.practicalSelection.targetDecisions = [null, false, 'bad', [], {}, { candidateDecisions: 'ignored', bestCandidateTicket: '4-3-2' }]; }),
  mutate(r => { r.prediction.practicalSelection = { expansionSummary: { addedTickets: [ { ticket: '6-5-4', score: [9], priorityScore: false, selectionScore: {}, scenario: { saved: true } } ] } }; })
];
for (const r of variants) {
  const before = f.clone(r), compact = mod.compactPredictionRecord(r);
  assert.deepEqual(outcome(() => pool(compact)), outcome(() => pool(r)), 'full candidate pool and saved ordering must match');
  assert.equal(input.raceKey(compact), input.raceKey(r));
  assert.equal(input.preDeadlineReason(compact), input.preDeadlineReason(r));
  assert.deepEqual(r, before, 'projection must not mutate nested inputs');
  f.withArchive(root => {
    f.saveDay(root, '20261003', [r], [], [f.official(record(), '6-5-4')]);
    f.parity(mod, root);
  });
}
assert.equal(pool(mod.compactPredictionRecord(rich))[0].ticket, '2-1-3');
assert.equal(pool(mod.compactPredictionRecord(rich)).find(x => x.ticket === '1-2-3').score, 3);

const eligibility = [
  r => { r.prediction.preRaceConditions.sourceTiming = 'post_deadline'; },
  r => { r.prediction.preRaceConditions.officialResultUsed = 'false'; },
  ...['officialResultUsedForPrediction', 'officialResultUsedForEvaluation', 'isRetrospective'].flatMap(key => [r => { r[key] = true; }, r => { r.prediction[key] = true; }]),
  r => { r.verificationMode = 'retrospective'; }, r => { r.prediction.predictionMode = 'retrospective'; },
  r => { r.selectedAt = 'invalid'; }, r => { r.deadlineAt = '2026-02-30T06:00:00Z'; },
  ...['schemaVersion', 'source', 'sourceFetchedAt'].map(key => r => { r.prediction.preRaceConditions[key] = 'invalid'; }),
  r => { delete r.prediction.preRaceConditions.source; }, r => { delete r.prediction.preRaceConditions.sourceFetchedAt; },
  r => { r.prediction.preRaceConditions.sourceFetchedAt = r.deadlineAt; },
  r => { r.prediction.preRaceConditions.sourceFetchedAt = '2026-10-03T05:30:00Z'; },
  r => { r.selectedAt = r.deadlineAt; },
  r => { r.capturedAt = r.selectedAt; r.selectedAt = ''; r.deadline = r.deadlineAt; r.deadlineAt = ''; },
  r => { r.createdAt = r.selectedAt; delete r.selectedAt; r.preRaceConditions = r.prediction.preRaceConditions; delete r.prediction.preRaceConditions; },
  r => { r.prediction.preRaceConditions.dataSource = r.prediction.preRaceConditions.source; delete r.prediction.preRaceConditions.source; },
  r => { r.race = { date: r.date, placeCode: r.jcd, rno: r.raceNo }; delete r.raceKey; delete r.date; delete r.jcd; delete r.raceNo; },
  r => { r.raceDate = r.date; r.placeCode = r.jcd; r.rno = r.raceNo; delete r.raceKey; delete r.date; delete r.jcd; delete r.raceNo; },
  r => { r.targetDate = r.date; delete r.date; delete r.raceKey; },
  r => { r.raceNo = 2; }
];
for (const change of eligibility) {
  const r = mutate(change), projected = mod.compactPredictionRecord(r);
  assert.equal(input.raceKey(projected), input.raceKey(r));
  assert.equal(input.preDeadlineReason(projected), input.preDeadlineReason(r));
  f.withArchive(root => { f.saveDay(root, '20261003', [r], [], [f.official(record())]); f.parity(mod, root); });
}
f.withArchive(root => {
  f.saveDay(root, '20261003', [null, false, 0, '', 'bad', [], {}, record()], [null], [f.official(record())]);
  assert.equal(f.parity(mod, root).summary.races, 1);
});
f.withArchive(root => {
  const excludedPrimary = record(); excludedPrimary.selectedAt = excludedPrimary.deadlineAt;
  f.saveDay(root, '20261003', [excludedPrimary], [record()], [f.official(record())]);
  assert.equal(f.parity(mod, root).summary.races, 0, 'excluded primary must still suppress eligible verification');
  const last = record(); last.prediction.practicalTickets = ['6-5-4'];
  f.saveDay(root, '20261003', [record(), last], [record()], [f.official(record())]);
  assert.deepEqual(f.parity(mod, root).rows[0].baseTickets, ['6-5-4'], 'last primary duplicate must win');
});

const large = f.clone(rich), marker = 'UNUSED-LARGE-SNAPSHOT-'.repeat(1024);
for (const object of [large, large.prediction, large.prediction.preRaceConditions, large.prediction.practicalSelection,
  large.prediction.formations, large.prediction.practicalSelection.targetDecisions[0],
  large.prediction.practicalSelection.targetDecisions[0].candidateDecisions[0]]) object.unusedSnapshot = marker;
assert.equal(JSON.stringify(mod.compactPredictionRecord(large)).includes('UNUSED-LARGE-SNAPSHOT'), false);
assert.deepEqual(pool(mod.compactPredictionRecord(large)), pool(rich));

// The exact same build and corpus run with projection on/off. A single day fits
// in 96 MiB; retaining all 168 MiB of irrelevant snapshots must exhaust it.
f.withArchive(root => {
  const days = 28, rowsPerDay = 6, payload = 'unused-snapshot-'.repeat(65536);
  for (let day = 1; day <= days; day++) {
    const date = `202610${String(day).padStart(2, '0')}`;
    const records = Array.from({ length: rowsPerDay }, (_, i) => {
      const r = record(i + 1, date); r.prediction.unusedSnapshot = payload; return r;
    });
    f.saveDay(root, date, records, [], records.map(r => f.official(r, '6-5-4')));
  }
  const source = `
    const mod = require(${JSON.stringify(path.resolve(__dirname, '../scripts/build-four-stage-miss-diagnosis.cjs'))});
    const options = { root: ${JSON.stringify(root)} };
    if (process.argv[1] === 'uncompacted') options.compactPredictionRecord = null;
    const report = mod.build(options);
    if (report.rows.length !== ${days * rowsPerDay} || report.summary.headMiss !== ${days * rowsPerDay}) throw new Error('changed diagnosis');
    process.stdout.write(JSON.stringify({ rows: report.rows.length }));
  `;
  const run = mode => spawnSync(process.execPath, ['--max-old-space-size=96', '-e', source, mode], {
    cwd: root, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024, env: { ...process.env, NODE_OPTIONS: '' }
  });
  const compact = run('compacted');
  assert.equal(compact.error, undefined); assert.equal(compact.status, 0, compact.stderr);
  assert.deepEqual(JSON.parse(compact.stdout.trim()), { rows: days * rowsPerDay });
  const full = run('uncompacted');
  assert.equal(full.error, undefined); assert.notEqual(full.status, 0, 'negative control must detect full-corpus retention');
  assert.match(full.stderr, /heap out of memory|Reached heap limit|Allocation failed/i);
});
console.log('four-stage: all miss stages, saved pool ordering, fallback/cohort parity, no source mutation, 96 MiB heap controls passed');
