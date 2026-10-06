'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const phase9 = require('../scripts/phase9-live-improvement-cycle.cjs');
const inputContract = require('../scripts/analysis-input-contract.js');

const clone = value => JSON.parse(JSON.stringify(value));
const compact = phase9.compactPredictionRecord;
const comparable = records => {
  const report = phase9.build(records, { phase8Report: { phaseComplete: true } });
  return { ...report, generatedAt: '' };
};
function prediction(raceNo = 1, date = '20261003') {
  const isoDate = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
  return {
    raceKey: `${date}-20-${raceNo}`, date, jcd: '20', raceNo,
    selectedAt: `${isoDate}T05:00:00Z`, deadlineAt: `${isoDate}T06:00:00Z`,
    prediction: {
      practicalTickets: [{ ticket: '1-2-3', unusedTicketExplanation: 'omit' }],
      preRaceConditions: {
        schemaVersion: 4, source: 'boatrace-official', sourceTiming: 'pre_deadline',
        sourceFetchedAt: `${isoDate}T05:00:00Z`, officialResultUsed: false
      },
      verificationEvidence: {
        mainScenario: { headBoatNo: 1 }, generation: { logicFingerprint: 'generation-1' },
        theoryClaims: [{ theoryKey: 'flow' }, { theoryKey: 'hold' }]
      }
    }
  };
}
function official(raceNo = 1, date = '20261003', ticket = '1-2-3') {
  return {
    date, jcd: '20', raceNo, source: 'boatrace-official', resultAvailable: true,
    status: 'finished', trifecta: { combination: ticket, payout: 1200 }
  };
}
function mutate(fn) { const record = prediction(); fn(record); return record; }
function withArchive(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase9-compaction-'));
  fs.mkdirSync(path.join(root, 'data', 'predictions'), { recursive: true });
  fs.mkdirSync(path.join(root, 'data', 'results'), { recursive: true });
  try { return run(root); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
}
function saveDay(root, date, predictions, verificationPredictions, races) {
  fs.writeFileSync(path.join(root, 'data', 'predictions', `${date}.json`),
    JSON.stringify({ predictions, verificationPredictions }));
  fs.writeFileSync(path.join(root, 'data', 'results', `${date}.json`),
    JSON.stringify({ date, races }));
}

// Projection occurs before the shared pre-deadline check. It must preserve
// exclusions, including falsey fallback behavior and top-level legacy fields.
const eligibilityCases = [
  ['', () => {}],
  ['source-timing-not-pre-deadline', r => { r.prediction.preRaceConditions.sourceTiming = 'post_deadline'; }],
  ['official-result-flag-not-false', r => { r.prediction.preRaceConditions.officialResultUsed = 'false'; }],
  ['official-result-used', r => { r.officialResultUsedForPrediction = true; }],
  ['official-result-used', r => { r.officialResultUsedForEvaluation = true; }],
  ['official-result-used', r => { r.prediction.officialResultUsedForPrediction = true; }],
  ['official-result-used', r => { r.prediction.officialResultUsedForEvaluation = true; }],
  ['retrospective-record', r => { r.isRetrospective = true; }],
  ['retrospective-record', r => { r.prediction.isRetrospective = true; }],
  ['retrospective-record', r => { r.verificationMode = 'RETROSPECTIVE'; }],
  ['retrospective-record', r => { r.prediction.predictionMode = 'retrospective-analysis'; }],
  ['retrospective-record', r => {
    r.preRaceConditions = r.prediction.preRaceConditions;
    delete r.prediction;
    r.predictionMode = 'retrospective';
  }],
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
  ['', r => {
    r.capturedAt = r.selectedAt; r.selectedAt = '';
    r.deadline = r.deadlineAt; r.deadlineAt = '';
    r.prediction.preRaceConditions.dataSource = r.prediction.preRaceConditions.source;
    delete r.prediction.preRaceConditions.source;
  }],
  ['', r => {
    r.createdAt = r.selectedAt; delete r.selectedAt;
    r.preRaceConditions = r.prediction.preRaceConditions;
    delete r.prediction.preRaceConditions;
  }],
  ['', r => {
    r.prediction.preRaceConditions.schemaVersion = 3;
    delete r.prediction.preRaceConditions.source;
    delete r.prediction.preRaceConditions.sourceFetchedAt;
  }]
];
for (const [expected, change] of eligibilityCases) {
  const record = mutate(change);
  assert.equal(inputContract.preDeadlineReason(record), expected);
  assert.equal(inputContract.preDeadlineReason(compact(record)), expected,
    `compaction must preserve eligibility: ${expected || 'eligible'}`);
}

const keyCases = [
  prediction(),
  mutate(r => { r.raceNo = 2; }),
  mutate(r => { r.raceKey = 'unformatted-key'; }),
  mutate(r => { r.raceDate = r.date; r.placeCode = r.jcd; r.rno = r.raceNo;
    delete r.date; delete r.jcd; delete r.raceNo; delete r.raceKey; }),
  mutate(r => { r.targetDate = r.date; r.race = { placeCode: r.jcd, rno: r.raceNo };
    delete r.date; delete r.jcd; delete r.raceNo; delete r.raceKey; }),
  mutate(r => { r.race = { date: r.date, jcd: r.jcd, raceNo: r.raceNo };
    delete r.date; delete r.jcd; delete r.raceNo; delete r.raceKey; })
];
for (const record of keyCases) {
  assert.equal(inputContract.raceKey(compact(record)), inputContract.raceKey(record));
}

// Ticket/fingerprint/head/theory precedence must be resolved by the existing
// accessors, including authoritative empty arrays and strict 0/true comparisons.
const accessorCases = [
  mutate(r => { r.finalTickets = ['2-3-4']; r.tickets = ['3-4-5']; }),
  mutate(r => { r.finalTickets = []; r.tickets = ['3-4-5']; }),
  mutate(r => { r.tickets = [{ combination: '2-3-4', ticket: '3-4-5' }]; }),
  mutate(r => { r.prediction.tickets = ['2-3-4']; r.prediction.finalTickets = ['3-4-5']; }),
  mutate(r => { r.prediction.finalTickets = ['2-3-4']; }),
  prediction(),
  mutate(r => { delete r.prediction.practicalTickets; r.prediction.practicalSelection = { tickets: ['4-5-6'] }; }),
  mutate(r => { r.prediction.practicalTickets = []; r.prediction.practicalSelection = { tickets: ['4-5-6'] }; }),
  mutate(r => { r.logicFingerprint = 'direct'; r.cohortFingerprint = 'cohort';
    r.shadowV2Reference = { logicFingerprint: 'shadow' }; }),
  mutate(r => { r.cohortFingerprint = 'cohort'; r.shadowV2Reference = { logicFingerprint: 'shadow' }; }),
  mutate(r => { r.shadowV2Reference = { logicFingerprint: 'shadow' }; }),
  mutate(r => { r.predictedHead = 2; r.prediction.head = 3; r.marks = { head: 4 }; }),
  mutate(r => { r.prediction.head = 3; r.marks = { head: 4 }; }),
  mutate(r => { r.marks = { head: 4 }; }),
  mutate(r => { r.theoryIds = [12, 'direct']; r.theories = ['legacy']; }),
  mutate(r => { r.theories = ['legacy']; }),
  mutate(r => { r.theoryIds = []; r.theories = ['suppressed']; }),
  mutate(r => { r.theoryIds = 'not-an-array'; r.theories = ['suppressed']; }),
  mutate(r => { r.finalTickets = [{ combination: 123, ticket: '4-5-6' }]; }),
  mutate(r => { r.finalTickets = [{ combination: [1, 2, 3], ticket: '4-5-6' }]; }),
  mutate(r => { r.finalTickets = [{ combination: { ticket: '1-2-3' } }]; }),
  mutate(r => { r.finalTickets = [null, 123, [1, 2, 3], {}, { combination: 0, ticket: '1-2-3' }]; })
];
for (const record of accessorCases) {
  const projected = compact(record);
  for (const accessor of ['tickets', 'logicFingerprint', 'predictedHead', 'theoryIds']) {
    assert.deepEqual(phase9[accessor](projected), phase9[accessor](record), accessor);
  }
  const settled = { ...record, __officialResult: official() };
  const compactSettled = { ...projected, __officialResult: official() };
  assert.deepEqual(comparable([compactSettled]), comparable([settled]),
    'ticket projection must preserve malformed saved values without normalizing twice');
}
assert.deepEqual(phase9.tickets(compact(accessorCases[1])), []);
assert.deepEqual(phase9.theoryIds(compact(accessorCases[16])), ['flow', 'hold']);

const classifications = [
  ['HIT', { result: { trifecta: '1-2-3' }, missingRequiredData: true, ticketCapDropped: true }],
  ['MISSING_REQUIRED_DATA', { missingRequiredData: true, ticketCapDropped: true }],
  ['TICKET_CAP_DROP', { ticketCapDropped: true, ratedBoatNotPropagated: true }],
  ['TICKET_CAP_DROP', { propagation: { ticketCapDropped: true } }],
  ['RATED_BOAT_NOT_PROPAGATED', { ratedBoatNotPropagated: true, theoryTriggered: true, ticketsChanged: 0 }],
  ['RATED_BOAT_NOT_PROPAGATED', { propagation: { ratedBoatNotPropagated: true } }],
  ['THEORY_TRIGGERED_TICKETS_UNCHANGED', { theoryTriggered: true, ticketsChanged: 0 }],
  ['THEORY_TRIGGERED_TICKETS_UNCHANGED', { theoryTriggered: true, propagation: { ticketsChanged: 0 } }],
  ['HEAD_MISS', { theoryTriggered: true, ticketsChanged: '0' }],
  ['HEAD_MISS', { theoryTriggered: 'true', ticketsChanged: 0, ticketCapDropped: 'true' }],
  ['PARTNER_MISS', { missCause: { code: 'PARTNER_MISS', reason: 'saved evidence' } }],
  ['HEAD_MISS', { missCause: { code: 'UNKNOWN', reason: 'not accepted' } }],
  ['OTHER_WITH_REASON', { predictedHead: '2' }],
  ['OTHER_WITH_REASON', { result: {}, resultMatched: true, predictedHead: '' }]
];
const classificationRows = classifications.map(([expected, fields], index) => {
  const record = { ...prediction(), raceKey: `row-${index}`, result: { trifecta: '2-1-3' }, ...fields };
  assert.equal(phase9.classify(record).code, expected);
  assert.deepEqual(phase9.classify(compact(record)), phase9.classify(record));
  return record;
});
for (const code of phase9.TAXONOMY) {
  const record = { ...prediction(), raceKey: code, result: { trifecta: '2-1-3' }, missCause: { code } };
  assert.deepEqual(phase9.classify(compact(record)), phase9.classify(record));
  classificationRows.push(record);
}
const unmatched = { ...prediction(), resultMatched: false };
assert.equal(phase9.classify(unmatched), null);
assert.equal(phase9.classify(compact(unmatched)), null);
assert.deepEqual(comparable(classificationRows.map(compact)), comparable(classificationRows));

withArchive(root => {
  const primary = Array.from({ length: 12 }, (_, i) => prediction(i + 1));
  const verification = [prediction(1), prediction(2), prediction(3)];
  primary[0].finalTickets = [];
  primary[1].selectedAt = primary[1].deadlineAt;
  primary[2].finalTickets = ['2-1-3'];
  primary[2].result = { confirmed: true, trifecta: '6-5-4', review: { unused: 'discard' } };
  primary[2].__officialResult = { trifecta: '6-5-4' };
  primary[3].raceNo = 5; // Conflicting direct key must not become valid during projection.
  primary[4].recordKey = 'duplicate-report-key';
  primary[5].recordKey = 'duplicate-report-key';
  primary[6].id = 'id-report-key'; delete primary[6].raceKey;
  delete primary[7].raceKey; // Fall back to the joined canonical key.
  primary[8].raceKey = 'legacy-raw-key'; // Preserve raw report key, derive canonical join key.
  const races = Array.from({ length: 12 }, (_, i) => official(i + 1));
  races[2].trifecta.combination = '2-1-3';
  races[9].source = 'untrusted';
  races[10].resultAvailable = false;
  races.pop();
  saveDay(root, '20261003', primary, verification, races);
  const before = fs.readFileSync(path.join(root, 'data', 'predictions', '20261003.json'), 'utf8');
  const full = inputContract.buildDefaultCohort({ root });
  const projected = inputContract.buildDefaultCohort({ root, compactPredictionRecord: compact });
  assert.deepEqual(projected.diagnostics, full.diagnostics);
  const fullTicketed = full.records.filter(record => phase9.tickets(record).length);
  const loaded = phase9.load({ root });
  assert.deepEqual(comparable(loaded), comparable(fullTicketed));
  const report = comparable(loaded);
  assert.equal(report.summary.duplicates, 1);
  assert.equal(loaded.some(record => record.raceNo === 1 || record.raceNo === 2), false,
    'empty/invalid primary records must suppress verification records');
  assert.equal(phase9.resultCombo(loaded.find(record => record.raceNo === 3)), '213',
    'independent official results must override embedded result claims');
  assert.ok(report.rows.some(row => row.raceKey === 'id-report-key'));
  assert.ok(report.rows.some(row => row.raceKey === '20261003-20-8'));
  assert.ok(report.rows.some(row => row.raceKey === 'legacy-raw-key'));
  assert.equal(fs.readFileSync(path.join(root, 'data', 'predictions', '20261003.json'), 'utf8'), before,
    'loading must leave stored prediction bytes unchanged');
});

const large = prediction();
const marker = 'UNUSED-LARGE-SNAPSHOT-'.repeat(1024);
large.unused = marker;
large.race = { unused: marker };
large.prediction.unused = marker;
large.prediction.preRaceConditions.boats = [{ unused: marker }];
large.prediction.verificationEvidence.unused = marker;
large.prediction.verificationEvidence.theoryClaims[0].unused = marker;
large.prediction.practicalTickets[0].unused = marker;
large.prediction.practicalSelection = { tickets: ['4-5-6'], unused: marker };
large.propagation = { unused: marker };
large.result = { trifecta: '2-1-3', review: { unused: marker } };
const compactLarge = compact(large);
assert.equal(JSON.stringify(compactLarge).includes('UNUSED-LARGE-SNAPSHOT'), false);
assert.ok(JSON.stringify(compactLarge).length < 2000);
assert.deepEqual(comparable([compactLarge]), comparable([large]));
assert.equal(large.prediction.unused, marker, 'projection must not mutate the source');

// A single day fits comfortably; retaining all 28 days cannot fit the same heap.
// The negative control executes the same load(), removing only the projector.
// No production data or report generation is needed for this regression.
withArchive(root => {
  const days = 28;
  const rowsPerDay = 6;
  const payload = 'unused-snapshot-'.repeat(65536); // 1 MiB per prediction.
  for (let day = 1; day <= days; day++) {
    const date = `202609${String(day).padStart(2, '0')}`;
    const records = Array.from({ length: rowsPerDay }, (_, index) => {
      const record = prediction(index + 1, date);
      record.prediction.unusedSnapshot = payload;
      return record;
    });
    saveDay(root, date, records, [], records.map(record => official(record.raceNo, date)));
  }
  const phase9Path = require.resolve('../scripts/phase9-live-improvement-cycle.cjs');
  const contractPath = require.resolve('../scripts/analysis-input-contract.js');
  const childSource = `
    const phase9 = require(${JSON.stringify(phase9Path)});
    const contract = require(${JSON.stringify(contractPath)});
    if (process.argv[1] === 'uncompacted') {
      const original = contract.buildDefaultCohort;
      contract.buildDefaultCohort = options => original({ ...options, compactPredictionRecord: undefined });
    }
    const records = phase9.load({ root: ${JSON.stringify(root)} });
    if (records.length !== ${days * rowsPerDay}) throw new Error('lost prediction rows');
    if (records.some(record => phase9.resultCombo(record) !== '123')) throw new Error('changed official joins');
    process.stdout.write(JSON.stringify({ rows: records.length }));
  `;
  const runChild = mode => spawnSync(process.execPath,
    ['--max-old-space-size=96', '-e', childSource, mode], {
      cwd: root, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024,
      env: { ...process.env, NODE_OPTIONS: '' }
    });
  const compactRun = runChild('compacted');
  assert.equal(compactRun.error, undefined);
  assert.equal(compactRun.status, 0, compactRun.stderr);
  assert.deepEqual(JSON.parse(compactRun.stdout.trim().split('\n').at(-1)),
    { rows: days * rowsPerDay });
  const fullRun = runChild('uncompacted');
  assert.equal(fullRun.error, undefined);
  assert.notEqual(fullRun.status, 0, 'fixture must detect full-corpus retention');
  assert.match(fullRun.stderr, /heap out of memory|Reached heap limit|Allocation failed/i,
    'negative control must fail specifically from JavaScript heap exhaustion');
});

console.log('phase9 input compaction: eligibility, report parity, canonical precedence, payload drops, 96 MiB heap passed');
