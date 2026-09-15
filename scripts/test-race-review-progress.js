'use strict';
const assert = require('node:assert/strict');
const { exhibitionSnapshot } = require('./note-exhibition');
const { buildProgress } = require('./build-race-review-progress');
const method = 'a'.repeat(64);
function bundle(n, cohort = method) {
  const date = String(20300101 + Math.floor(n / 12)), raceNo = n % 12 + 1;
  const iso = `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`;
  const capturedAt = iso + 'T01:00:00Z', deadlineAt = iso + 'T02:00:00Z';
  const raw = { entries: [1,2,3,4,5,6].map(boat => ({ boat, exhibition: { displayTime: 6.8 } })),
    startExhibition: [1,2,3,4,5,6].map(boat => ({ boat, course: boat, st: 0.1, mappingSource: 'official-start-image' })) };
  const raceKey = `${date}-01-${raceNo}`;
  return { version: 'note-draft-bundle-v1', sourceCommit: 'b'.repeat(40),
    record: { raceKey, date, jcd: '01', raceNo, publicationPolicy: 'all-races-v1',
      selectedAt: capturedAt, deadlineAt, exhibitionSnapshot: exhibitionSnapshot(raw, capturedAt),
      reviewEvidence: { version: 'race-review-evidence-v1', method: cohort, predictionMode: 'server_pre_deadline', officialResultUsedForPrediction: false },
      prediction: { practicalTickets: ['1-2-3'], candidate24Tickets: ['1-2-3', '1-2-4'] } },
    generationAudit: { contentReady: true, auditedAt: capturedAt, raceKey }, baselinePracticalTickets: ['1-2-3'] };
}
function result(b, extra = {}) {
  return { date: b.record.date, jcd: '01', raceNo: b.record.raceNo, source: 'boatrace-official',
    resultAvailable: true, trifecta: { combination: '1-2-3', payout: 500 }, ...extra };
}
const original = bundle(0), before = JSON.stringify(original);
let report = buildProgress([original, original], [result(original)]);
assert.equal(report.captured, 1);
assert.equal(report.settled, 1);
assert.equal(report.cohorts[0].practical.hitRate, 100);
assert.equal(report.cohorts[0].practical.recoveryRate, 500);
assert.equal(report.cohorts[0].candidate24.recoveryRate, 250);
assert.equal(JSON.stringify(original), before, 'never rewrite a prediction');
for (const mutate of [b => delete b.record.exhibitionSnapshot,
  b => b.record.selectedAt = b.record.deadlineAt,
  b => b.generationAudit.auditedAt = b.record.deadlineAt,
  b => b.record.reviewEvidence.officialResultUsedForPrediction = true,
  b => b.record.prediction.practicalTickets = ['2-1-3'],
  b => b.record.raceKey = '20300101-02-1']) {
  const bad = structuredClone(original); mutate(bad);
  assert.equal(buildProgress([bad], [result(original)]).captured, 0);
}
const source = Array.from({ length: 105 }, (_, i) => bundle(i));
report = buildProgress(source, source.map(b => result(b)), { activeMethod: 'c'.repeat(64) });
assert.equal(report.cohorts[0].settled, 105, 'method changes do not delete historical results');
assert.equal(report.cohorts[0].completedWindows, 1);
assert.equal(report.cohorts[0].currentWindowCount, 5);
assert.equal(report.autoApply, false);
const next = bundle(106, 'c'.repeat(64));
report = buildProgress([...source, next], source.map(b => result(b)), { activeMethod: 'c'.repeat(64) });
assert.equal(report.cohorts.length, 2);
assert.equal(report.pending, 1);
assert.equal(report.settled, 105);
assert.equal(report.cohorts.find(g => g.active).practical.hitRate, null, 'pending is not a loss');
report = buildProgress([original], [result(original, { refund: true })]);
assert.equal(report.settled, 0);
assert.equal(report.cohorts[0].excludedRefundOrVoid, 1);
assert.equal(buildProgress([original], [result(original, { source: 'untrusted' })]).pending, 1);
report = buildProgress([original], [result(original, { trifecta: { combination: '1-2-3', payout: null } })]);
assert.equal(report.cohorts[0].unknownPayout, 1);
const legacy = structuredClone(original); delete legacy.record.reviewEvidence;
assert.equal(buildProgress([legacy], [result(legacy)]).cohorts[0].legacy, true);
const later = structuredClone(original); later.record.selectedAt = later.record.selectedAt.replace('01:00', '01:10');
later.record.prediction.practicalTickets = later.baselinePracticalTickets = ['1-2-4'];
report = buildProgress([original, later], [result(original)]);
assert.equal(report.settled, 1);
assert.equal(report.cohorts[0].practical.hits, 0, 'choose latest before deadline, not winning prediction');
console.log('race review: pre-race evidence, immutable tickets, deduplication, method retention, 100R boundaries, pending/refund/payout passed');
(async () => {
  const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
  const { refresh } = require('./refresh-race-review-results');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'race-review-'));
  try {
    const b = bundle(0), dir = path.join(root, 'data/note-drafts', b.record.date);
    fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'source.json'), JSON.stringify(b));
    const now = Date.parse(b.record.deadlineAt) + 3600000;
    let ledger = await refresh(root, { now, fetchResult: async () => ({ ...result(b), ok: true, jcd: '02' }) });
    assert.equal(Object.keys(ledger.races).length, 0, 'never settle another race');
    assert.equal(ledger.attempts[b.record.raceKey].status, 'retry');
    ledger = await refresh(root, { now, fetchResult: async () => ({ ...result(b), ok: true }) });
    assert.equal(Object.keys(ledger.races).length, 1);
    await refresh(root, { now, fetchResult: async () => { throw new Error('completed results must be reused'); } });
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'data/stats/race-review-results.json'))).races[b.record.raceKey].trifecta.payout, 500);
    console.log('independent official settlement: identity, retries, saved results and no repeated fetch passed');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
