'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const report = require('./head-forward-report.cjs');

const PH = '1'.repeat(64), OTHER = '2'.repeat(64);
const json = value => JSON.stringify(value) + '\n';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const A = ['1-2-3', '1-3-2'], B = ['2-1-3', '1-3-2'];

function start(rno = 1) {
  const raceKey = `20301021-01-${rno}`, sourceHash = hash(raceKey);
  return { version: 'independent-head-forward-attempt-v2', stage: 'started',
    candidateId: 'qualified-unrepresented-head-one-swap-v2-options-forwarded', protocolHash: PH,
    raceKey, date: '20301021', attemptId: hash(`attempt:${raceKey}`),
    startedAt: '2030-10-21T00:02:00.000Z', completedAt: null, startedHash: null,
    selectedAt: '2030-10-21T00:01:00.000Z', deadlineAt: '2030-10-21T00:10:00.000Z',
    outcome: { status: 'started', reason: 'AWAITING_GENERATION', snapshot: null },
    source: { path: `data/note-drafts/20301021/${raceKey}-${sourceHash}.json`, sha256: sourceHash },
    registration: { mergedAt: '2030-10-21T00:00:00.000Z' },
    runId: '123', runAttempt: '1', workflowHead: 'a'.repeat(40), codeCommit: 'b'.repeat(40),
    productionChanged: false, usableForPrediction: false, automaticApplication: false, adoptionGate: null };
}
function completed(claim, { status = 'generated', reason = 'ONE_QUALIFIED_NEW_HEAD_SWAP', baseline = A, candidate = B } = {}) {
  return { ...clone(claim), stage: 'completed', completedAt: '2030-10-21T00:03:00.000Z', startedHash: hash(json(claim)),
    outcome: { status, reason, snapshot: status === 'generated' ? {
      baseline: { tickets: [...baseline], head: 1 }, candidate: { tickets: [...candidate], head: 1 },
      guard: { changed: json(baseline) !== json(candidate), reason }
    } : null } };
}
function seal(attempt, { status = 'eligible', confirmedAt = '2030-10-21T00:05:00.000Z' } = {}) {
  return { version: 'independent-head-forward-seal-v2', candidateId: attempt.candidateId, protocolHash: attempt.protocolHash,
    attemptHash: hash(json(attempt)), attempt: clone(attempt),
    artifact: { id: 456, digest: 'sha256:' + 'c'.repeat(64), name: 'independent-head-v2-123-1',
      runId: attempt.runId, runAttempt: attempt.runAttempt, workflowHead: attempt.workflowHead,
      createdAt: '2030-10-21T00:04:00.000Z', confirmedAt },
    batchSha256: 'd'.repeat(64), remoteBytesVerified: true,
    status, forwardEligible: status === 'eligible', productionChanged: false,
    usableForPrediction: false, automaticApplication: false, adoptionGate: null };
}
function pair(rno, options) { const claim = start(rno), attempt = completed(claim, options); return { claim, attempt, receipt: seal(attempt) }; }
function summarize(pairs, officialResults = new Map(), extra = {}) {
  return report.summarize({ attempts: pairs.flatMap(value => [value.claim, value.attempt]),
    seals: pairs.map(value => value.receipt), officialResults, protocolHash: PH, ...extra });
}
function temp(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'head-forward-report-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root;
}
function saveRecord(root, record, bytes = json(record)) {
  const key = record.raceKey || record.attempt.raceKey;
  const file = path.join(root, report.RECORD_DIR, key.slice(0, 8), `${key}-${hash(bytes)}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes); return file;
}
function write(root, relative, value) {
  const file = path.join(root, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, json(value));
}
const testContract = {
  readProtocol() { return { value: { candidateId: start().candidateId }, digest: PH }; },
  validAttempt(record) { return record.version === 'independent-head-forward-attempt-v2' && !record.invalidForTest; },
  validSeal(record) { return record.version === 'independent-head-forward-seal-v2' && !record.invalidForTest; }
};
function official(key, actual, payout, extra = {}) {
  return { raceKey: key, resultSource: 'boatrace-official', resultAvailable: true,
    actualTicket: actual, trifecta: { combination: actual, payout }, ...extra };
}

test('same-race equal-budget results count gained, lost, net and money separately', () => {
  const pairs = [pair(1), pair(2), pair(3)];
  const results = new Map([
    [pairs[0].claim.raceKey, { actual: '2-1-3', payout: 2500 }],
    [pairs[1].claim.raceKey, { actual: '1-2-3', payout: 1000 }],
    [pairs[2].claim.raceKey, { actual: '1-3-2', payout: 500 }]
  ]);
  const value = summarize(pairs, results);
  assert.equal(value.collectionStatus, 'COMPARISON_AVAILABLE');
  assert.equal(value.coverage.startedRaces, 3); assert.equal(value.coverage.eligibleSealedRaces, 3);
  assert.equal(value.comparison.gainedHits, 1); assert.equal(value.comparison.lostHits, 1);
  assert.equal(value.comparison.netHits, 0); assert.equal(value.comparison.hitRateDelta, 0);
  assert.equal(value.stats.baseline.hits, 2); assert.equal(value.stats.candidate.hits, 2);
  assert.equal(value.stats.baseline.stake, 600); assert.equal(value.stats.candidate.stake, 600);
  assert.equal(value.stats.baseline.returned, 1500); assert.equal(value.stats.candidate.returned, 3000);
  assert.equal(value.stats.baseline.recoveryRate, 250); assert.equal(value.stats.candidate.recoveryRate, 500);
});

test('pending, refund and missing payout do not turn into zero-percent settled races', () => {
  const pairs = [pair(1), pair(2), pair(3)];
  const value = summarize(pairs, new Map([
    [pairs[1].claim.raceKey, { excluded: 'refund-or-void' }],
    [pairs[2].claim.raceKey, { actual: '2-1-3', payout: null }]
  ]));
  assert.equal(value.coverage.pendingResultRaces, 1); assert.equal(value.coverage.resultExcludedRaces, 2);
  assert.equal(value.coverage.settledRaces, 0); assert.equal(value.stats.baseline.races, 0);
  assert.equal(value.stats.baseline.hitRate, null); assert.equal(value.stats.candidate.recoveryRate, null);
  assert.equal(report.summarize({ protocolHash: PH }).collectionStatus, 'NO_ATTEMPTS');
  assert.equal(report.summarize({ protocolHash: PH }).comparison.baseline.hitRate, null);
});

test('generation pending, missing, failed, unsealed and late all remain in the stored-start denominator', () => {
  const claims = Array.from({ length: 6 }, (_, i) => start(i + 1));
  const done = [completed(claims[1], { status: 'missing', reason: 'SNAPSHOT_MISSING' }),
    completed(claims[2], { status: 'failed', reason: 'SOURCE_CHANGED' }), completed(claims[3]),
    completed(claims[4]), completed(claims[5])];
  const value = report.summarize({ protocolHash: PH, attempts: [...claims, ...done],
    seals: [seal(done[0], { status: 'generation-missing' }), seal(done[1], { status: 'generation-failed' }),
      seal(done[3], { status: 'late', confirmedAt: claims[4].deadlineAt }), seal(done[4])],
    officialResults: new Map([[claims[5].raceKey, { actual: '2-1-3', payout: 1000 }]]) });
  assert.equal(value.coverage.startedRaces, 6); assert.equal(value.coverage.completedRaces, 5);
  assert.deepEqual(value.coverage.states, { 'generation-pending': 1, 'generation-missing': 1,
    'generation-failed': 1, unsealed: 1, late: 1, 'eligible-sealed': 1 });
  assert.equal(value.comparison.evaluatedRaces, 1); assert.equal(value.comparison.gainedHits, 1);
});

test('contradictory starts or completions cannot replace a first attempt with a winning later one', () => {
  const value = pair(1), next = clone(value.claim); next.runId = '124'; next.startedAt = '2030-10-21T00:04:00.000Z';
  const nextDone = completed(next), duplicateStart = summarize([value], new Map(), {
    attempts: [next, nextDone, value.claim, value.attempt], seals: [value.receipt, seal(nextDone)]
  });
  assert.equal(duplicateStart.rows[0].status, 'ambiguous');
  assert.equal(duplicateStart.rows[0].startedHash, hash(json(value.claim)));
  assert.equal(duplicateStart.coverage.eligibleSealedRaces, 0);
  const otherDone = completed(value.claim, { candidate: A });
  const duplicateDone = summarize([value], new Map(), { attempts: [value.claim, value.attempt, otherDone] });
  assert.equal(duplicateDone.rows[0].reason, 'CONFLICTING_COMPLETIONS');
  const exact = summarize([value], new Map(), { attempts: [value.claim, value.claim, value.attempt, value.attempt],
    seals: [value.receipt, value.receipt] });
  assert.equal(exact.coverage.startedRaces, 1); assert.equal(exact.coverage.eligibleSealedRaces, 1);
});

test('a completion or seal without its start is diagnostic only, and common-field mismatch fails closed', () => {
  const value = pair(1);
  const orphan = report.summarize({ protocolHash: PH, attempts: [value.attempt], seals: [value.receipt] });
  assert.equal(orphan.rows[0].status, 'unclaimed'); assert.equal(orphan.coverage.startedRaces, 0);
  assert.equal(orphan.coverage.orphanCompletionRecords, 1); assert.equal(orphan.coverage.orphanSealRecords, 1);
  const changed = clone(value.attempt); changed.source.sha256 = 'f'.repeat(64);
  const mismatch = report.summarize({ protocolHash: PH, attempts: [value.claim, changed], seals: [seal(changed)] });
  assert.equal(mismatch.rows[0].status, 'ambiguous'); assert.equal(mismatch.comparison.evaluatedRaces, 0);
});

test('first confirmation of the same artifact is stable, while conflicting artifact contents block the race', () => {
  const value = pair(1), later = seal(value.attempt, { status: 'late', confirmedAt: value.claim.deadlineAt });
  const earliest = summarize([value], new Map(), { seals: [later, value.receipt] });
  assert.equal(earliest.rows[0].confirmedAt, value.receipt.artifact.confirmedAt);
  assert.equal(earliest.coverage.eligibleSealedRaces, 1);
  const conflicting = clone(value.receipt); conflicting.batchSha256 = 'e'.repeat(64);
  const blocked = summarize([value], new Map(), { seals: [value.receipt, conflicting] });
  assert.equal(blocked.rows[0].reason, 'CONFLICTING_ARTIFACTS'); assert.equal(blocked.coverage.eligibleSealedRaces, 0);
});

test('a pending unequal budget blocks all hit and money metrics before settlement can hide the mismatch', () => {
  const pairs = [pair(1), pair(2, { candidate: [...B, '3-1-2'] })];
  const value = summarize(pairs, new Map([[pairs[0].claim.raceKey, { actual: '2-1-3', payout: 1000 }]]));
  assert.equal(value.comparison.status, 'POINT_BUDGET_MISMATCH'); assert.equal(value.comparison.budgetMismatchCount, 1);
  assert.equal(value.comparison.netHits, null); assert.equal(value.stats.candidate.returned, null);
  assert.equal(value.stats.baseline.stake, null); assert.equal(value.coverage.pendingResultRaces, 1);
});

test('immutable loading checks path bytes and the current protocol without merging archived records', t => {
  const root = temp(t), claim = start(), old = { ...start(2), protocolHash: OTHER };
  saveRecord(root, claim); saveRecord(root, old);
  saveRecord(root, { ...start(3), invalidForTest: true });
  saveRecord(root, start(4), JSON.stringify(start(4), null, 2) + '\n');
  const file = saveRecord(root, start(5)); fs.writeFileSync(file, json({ ...start(5), changed: true }));
  const loaded = report.loadEvidence(root, testContract.readProtocol(), testContract);
  assert.equal(loaded.attempts.length, 1); assert.equal(loaded.invalid.length, 3);
  assert.deepEqual(loaded.otherProtocols, { [OTHER]: 1 });
  assert.equal(report.summarize({ attempts: [claim, old], protocolHash: PH }).coverage.startedRaces, 1);
  assert.throws(() => report.summarize({ attempts: [], protocolHash: 'bad' }), /protocol_hash/);
});

test('official settlement prefers a verified settled ledger result over a pending daily result', t => {
  const root = temp(t), key = start().raceKey;
  write(root, 'data/results/20301021.json', { races: [{ raceKey: key, resultSource: 'boatrace-official', resultAvailable: false },
    official('20301021-01-2', '2-1-3', 1000, { resultSource: 'untrusted-site' })] });
  write(root, 'data/stats/race-review-results.json', { races: { [key]: official(key, '2-1-3', 2500),
    '20301021-01-2': official('20301021-01-2', '1-2-3', 900, { refund: true }) } });
  const results = report.loadResults(root, new Set([key, '20301021-01-2']));
  assert.equal(results.officialResults.get(key).actual, '2-1-3');
  assert.equal(results.officialResults.get(key).payout, 2500);
  assert.equal(results.officialResults.get('20301021-01-2').excluded, 'refund-or-void');
});

test('report saves only derived research output and leaves every synthetic immutable input unchanged', t => {
  const root = temp(t), value = pair(1), originals = [];
  for (const record of [value.claim, value.attempt, value.receipt]) {
    const file = saveRecord(root, record); originals.push([file, fs.readFileSync(file, 'utf8')]);
  }
  write(root, 'data/results/20301021.json', { races: [official(value.claim.raceKey, '2-1-3', 1000)] });
  const data = report.report(root, { contract: testContract, now: () => Date.parse('2030-10-21T02:00:00.000Z'), sourceCommit: 'e'.repeat(40) });
  assert.equal(data.comparison.gainedHits, 1); assert.equal(data.input.invalidRecords, 0);
  assert.equal(data.sourceCommit, 'e'.repeat(40)); assert.equal(data.version, 'independent-head-forward-v2-report-v1');
  assert.equal(data.productionChanged, false); assert.equal(data.usableForPrediction, false);
  assert.equal(data.automaticApplication, false); assert.equal(data.adoptionGate, null);
  assert.equal(data.decisionGate.status, 'INSUFFICIENT_EVIDENCE');
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, report.REPORT_PATH), 'utf8')).comparison.netHits, 1);
  for (const [file, bytes] of originals) assert.equal(fs.readFileSync(file, 'utf8'), bytes);
  assert.deepEqual(fs.readdirSync(path.dirname(path.join(root, report.REPORT_PATH))).sort(), ['independent-head-forward-v2-report.json']);
});

test('invalid stored evidence blocks performance numbers instead of silently shrinking the denominator', t => {
  const root = temp(t), value = pair(1);
  for (const record of [value.claim, value.attempt, value.receipt]) saveRecord(root, record);
  saveRecord(root, { ...start(2), invalidForTest: true });
  write(root, 'data/results/20301021.json', { races: [official(value.claim.raceKey, '2-1-3', 1000)] });
  const data = report.report(root, { contract: testContract });
  assert.equal(data.input.invalidRecords, 1); assert.equal(data.input.storedRecordsValid, false);
  assert.equal(data.collectionStatus, 'INVALID_STORED_EVIDENCE');
  assert.equal(data.comparison.status, 'INVALID_STORED_EVIDENCE'); assert.equal(data.comparison.netHits, null);
  assert.equal(data.stats.baseline.stake, null); assert.equal(data.stats.candidate.returned, null);
  assert.equal(data.coverage.startedRaces, 1, 'valid-record coverage remains diagnostic only');
});

test('the real receipt contract admits a stored missing-generation attempt without treating it as a forecast', t => {
  const real = require('./head-forward-contract.cjs'), root = temp(t);
  const protocol = { root: path.resolve(__dirname, '..'),
    value: { candidateId: start().candidateId, registrationPullRequest: 999 }, digest: PH,
    rawSha256: '3'.repeat(64), configBlobSha: '4'.repeat(40), generatorProtocols: new Map() };
  const claim = start();
  Object.assign(claim.source, { recordJsonSha256: '5'.repeat(64), inputSha256: null, fileHashVerified: true });
  claim.attemptId = real.attemptId(PH, claim.raceKey, claim.source.sha256);
  claim.registration = { repository: real.REPOSITORY, pullRequest: 999,
    headSha: '6'.repeat(40), mergeCommitSha: '7'.repeat(40), configSha256: protocol.rawSha256,
    configBlobSha: protocol.configBlobSha, mergedAt: '2030-10-21T00:00:00.000Z',
    verifiedAt: '2030-10-21T00:00:45.000Z', runCreatedAt: '2030-10-21T00:00:30.000Z',
    runId: claim.runId, runAttempt: claim.runAttempt, workflowHead: claim.workflowHead,
    sourceManifestVerified: true, workflowRunVerified: true };
  const attempt = completed(claim, { status: 'missing', reason: 'SNAPSHOT_FROZEN_HISTORY_UNAVAILABLE' });
  const receipt = seal(attempt, { status: 'generation-missing' });
  assert.equal(real.validAttempt(claim, protocol), true);
  assert.equal(real.validAttempt(attempt, protocol), true);
  assert.equal(real.validSeal(receipt, protocol), true);
  for (const record of [claim, attempt, receipt]) real.saveRecord(root, record);
  const data = report.report(root, { contract: { ...real, readProtocol: () => protocol } });
  assert.equal(data.input.invalidRecords, 0); assert.equal(data.coverage.startedRaces, 1);
  assert.equal(data.coverage.states['generation-missing'], 1);
  assert.equal(data.coverage.eligibleSealedRaces, 0); assert.equal(data.comparison.evaluatedRaces, 0);
  assert.equal(data.stats.baseline.hitRate, null);
});
